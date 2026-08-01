from __future__ import annotations

import asyncio
import importlib.util
import os
import pathlib
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
from unittest.mock import Mock, patch
from urllib.parse import urlencode


PLUGIN_PATH = pathlib.Path(__file__).parents[1] / "cuebook-auth" / "__init__.py"
SPEC = importlib.util.spec_from_file_location("cuebook_auth_plugin", PLUGIN_PATH)
assert SPEC is not None and SPEC.loader is not None
plugin = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = plugin
SPEC.loader.exec_module(plugin)


TOKEN = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-0123456789"
PUBLIC_URL = "https://hermes.example.com"
MCP_URL = plugin._OFFICIAL_MCP_URL
AUTHORIZATION_ORIGIN = f"https://{plugin._AUTHORIZATION_HOST}"
OTHER_MCP_URL = (
    "https://cuebook.app/mcp"
    if MCP_URL == "https://cuebook.xyz/mcp"
    else "https://cuebook.xyz/mcp"
)
CALLBACK_URL = f"{PUBLIC_URL}/api/mcp/oauth/callback/cuebook"
FLOW_ID = "abcdefghijklmnopqrstuvwxyzABCDEFGH"


def authorization_url(**overrides: str) -> str:
    params = {
        "client_id": "cbmcp_test_client",
        "redirect_uri": CALLBACK_URL,
        "response_type": "code",
        "scope": "read:public",
        "state": "opaque-state-value-1234567890",
        "code_challenge": "A" * 43,
        "code_challenge_method": "S256",
        "resource": MCP_URL,
    }
    params.update(overrides)
    return f"{AUTHORIZATION_ORIGIN}/mcp/authorize?{urlencode(params)}"


def server_inventory() -> dict:
    return {
        "servers": [
            {
                "name": "cuebook",
                "transport": "http",
                "url": MCP_URL,
                "auth": "oauth",
                "enabled": True,
            }
        ]
    }


def local_server_config(*, connect_timeout: object = 5) -> dict:
    return {
        "url": MCP_URL,
        "auth": "oauth",
        "timeout": 20,
        "connect_timeout": connect_timeout,
        "supports_parallel_tool_calls": False,
        "future_option": {"preserve": True},
    }


def start_payload() -> dict:
    return {
        "flow_id": FLOW_ID,
        "server_name": "cuebook",
        "status": "authorization_required",
        "authorization_url": authorization_url(),
    }


def auth_required_payload() -> dict:
    return {
        "ok": False,
        "error": (
            "MCP OAuth for 'cuebook': non-interactive environment and no cached "
            "tokens found."
        ),
        "tools": [],
    }


class FakeContext:
    def __init__(self) -> None:
        self.hooks = {}
        self.commands = {}

    def register_hook(self, name, handler) -> None:
        self.hooks[name] = handler

    def register_command(self, name, handler, description="") -> None:
        self.commands[name] = (handler, description)


class FakeResponse:
    def __init__(self, body: bytes) -> None:
        self.body = body
        self.headers = SimpleNamespace(get_content_type=lambda: "application/json")

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def read(self, _limit: int) -> bytes:
        return self.body


class CuebookAuthTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        plugin._active_flow = None
        plugin._invocation.set(None)
        self.env = patch.dict(
            os.environ,
            {
                "HERMES_DASHBOARD_SESSION_TOKEN": TOKEN,
                "HERMES_DASHBOARD_PUBLIC_URL": PUBLIC_URL,
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self) -> None:
        self.env.stop()
        plugin._active_flow = None
        plugin._invocation.set(None)

    def capture(self, platform="telegram", chat_type="dm") -> None:
        source = SimpleNamespace(
            platform=SimpleNamespace(value=platform),
            chat_type=chat_type,
        )
        plugin._capture_gateway_context(event=SimpleNamespace(source=source))

    def test_registers_one_explicit_command_and_gateway_context_hook(self) -> None:
        context = FakeContext()
        plugin.register(context)
        self.assertEqual(set(context.hooks), {"pre_gateway_dispatch"})
        self.assertEqual(set(context.commands), {"cuebook-auth"})
        self.assertEqual(context.commands["cuebook-auth"][1], "Connect Cuebook")

    async def test_command_is_telegram_dm_only(self) -> None:
        for platform, chat_type in (("telegram", "group"), ("discord", "dm")):
            self.capture(platform, chat_type)
            response = await plugin._handle_cuebook_auth("")
            self.assertIn("only in a private Telegram chat", response)

    async def test_command_rejects_arguments(self) -> None:
        self.capture()
        self.assertEqual(
            await plugin._handle_cuebook_auth("again"),
            "Usage: `/cuebook_auth`",
        )

    async def test_command_returns_validated_native_flow(self) -> None:
        self.capture()
        flow = plugin._ActiveFlow(FLOW_ID, authorization_url(), time.monotonic() + 60)
        with patch.object(plugin, "_get_or_start_flow", return_value=flow):
            response = await plugin._handle_cuebook_auth("")
        self.assertIn(
            f"[Open Cuebook to authorize]({authorization_url()})",
            response,
        )
        self.assertIn("reuses the same authorization flow", response)

    def test_requires_a_strong_shared_session_token(self) -> None:
        with patch.dict(os.environ, {"HERMES_DASHBOARD_SESSION_TOKEN": "a" * 80}):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "256-bit"):
                plugin._session_token()

    def test_callback_is_derived_from_the_declared_public_https_base(self) -> None:
        self.assertEqual(plugin._expected_callback_url(), CALLBACK_URL)
        with patch.dict(os.environ, {"HERMES_DASHBOARD_PUBLIC_URL": "http://public.example"}):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "public HTTPS URL"):
                plugin._expected_callback_url()
        with patch.dict(
            os.environ,
            {"HERMES_DASHBOARD_PUBLIC_URL": "https://public.example/%0aheader"},
        ):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "public HTTPS URL"):
                plugin._expected_callback_url()

    def test_server_inventory_is_fail_closed(self) -> None:
        with patch.object(plugin, "_request_json", return_value=server_inventory()):
            self.assertEqual(plugin._configured_mcp_url(), MCP_URL)
        invalid = server_inventory()
        invalid["servers"][0]["url"] = "https://evil.example/mcp"
        with patch.object(plugin, "_request_json", return_value=invalid):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "official Cuebook endpoint"):
                plugin._configured_mcp_url()

    def test_short_oauth_connect_timeout_is_migrated_with_native_config_api(self) -> None:
        other_server = {"url": "https://example.com/mcp", "enabled": False}
        servers = {
            "cuebook": local_server_config(),
            "other": other_server,
        }
        saved = []

        def save(name: str, config: dict) -> bool:
            saved.append((name, config))
            servers[name] = config
            return True

        with patch.object(
            plugin,
            "_load_mcp_config_api",
            return_value=(lambda: servers, save),
        ):
            plugin._ensure_oauth_connect_timeout(MCP_URL)

        self.assertEqual(servers["cuebook"]["connect_timeout"], 315)
        self.assertEqual(saved[0][0], "cuebook")
        self.assertEqual(saved[0][1]["timeout"], 20)
        self.assertFalse(saved[0][1]["supports_parallel_tool_calls"])
        self.assertEqual(saved[0][1]["future_option"], {"preserve": True})
        self.assertIs(servers["other"], other_server)

    def test_missing_oauth_connect_timeout_is_migrated(self) -> None:
        cuebook = local_server_config()
        cuebook.pop("connect_timeout")
        servers = {"cuebook": cuebook}

        def save(name: str, config: dict) -> bool:
            servers[name] = config
            return True

        with patch.object(
            plugin,
            "_load_mcp_config_api",
            return_value=(lambda: servers, save),
        ):
            plugin._ensure_oauth_connect_timeout(MCP_URL)
        self.assertEqual(servers["cuebook"]["connect_timeout"], 315)

    def test_sufficient_oauth_connect_timeout_is_preserved(self) -> None:
        servers = {"cuebook": local_server_config(connect_timeout=400)}
        save = Mock()
        with patch.object(
            plugin,
            "_load_mcp_config_api",
            return_value=(lambda: servers, save),
        ):
            plugin._ensure_oauth_connect_timeout(MCP_URL)
        save.assert_not_called()
        self.assertEqual(servers["cuebook"]["connect_timeout"], 400)

    def test_oauth_timeout_migration_fails_closed(self) -> None:
        cases = [
            ({}, "not available"),
            ({"cuebook": local_server_config(connect_timeout="invalid")}, "invalid connect_timeout"),
            ({"cuebook": local_server_config(connect_timeout=0)}, "invalid connect_timeout"),
            ({"cuebook": local_server_config(connect_timeout=True)}, "invalid connect_timeout"),
        ]
        for servers, message in cases:
            with self.subTest(message=message):
                with patch.object(
                    plugin,
                    "_load_mcp_config_api",
                    return_value=(lambda: servers, lambda _name, _config: True),
                ):
                    with self.assertRaisesRegex(plugin.CuebookAuthError, message):
                        plugin._ensure_oauth_connect_timeout(MCP_URL)

        servers = {"cuebook": local_server_config()}
        with patch.object(
            plugin,
            "_load_mcp_config_api",
            return_value=(lambda: servers, lambda _name, _config: False),
        ):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "could not save"):
                plugin._ensure_oauth_connect_timeout(MCP_URL)

        with patch.object(
            plugin,
            "_load_mcp_config_api",
            return_value=(lambda: servers, lambda _name, _config: True),
        ):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "could not verify"):
                plugin._ensure_oauth_connect_timeout(MCP_URL)

    def test_authorization_url_contract_is_strict(self) -> None:
        self.assertEqual(
            plugin._validate_authorization_url(
                authorization_url(),
                mcp_url=MCP_URL,
                callback_url=CALLBACK_URL,
            ),
            authorization_url(),
        )
        invalid_urls = [
            authorization_url(redirect_uri="https://evil.example/callback"),
            authorization_url(resource=OTHER_MCP_URL),
            authorization_url(code_challenge_method="plain"),
            authorization_url().replace(AUTHORIZATION_ORIGIN, "https://evil.example", 1),
            f"{authorization_url()}&state=duplicate",
            f"{authorization_url()}&unexpected=value",
        ]
        for candidate in invalid_urls:
            with self.subTest(candidate=candidate):
                with self.assertRaises(plugin.CuebookAuthError):
                    plugin._validate_authorization_url(
                        candidate,
                        mcp_url=MCP_URL,
                        callback_url=CALLBACK_URL,
                    )

    def test_concurrent_commands_reuse_one_dashboard_flow(self) -> None:
        calls = []
        first_request_started = threading.Event()

        def request(url, method="GET"):
            calls.append((url, method))
            if url == plugin._SERVER_LIST_URL:
                first_request_started.set()
                time.sleep(0.05)
                return server_inventory()
            if url == plugin._SERVER_TEST_URL:
                return auth_required_payload()
            return start_payload()

        with (
            patch.object(plugin, "_request_json", side_effect=request),
            patch.object(plugin, "_ensure_oauth_connect_timeout") as ensure_timeout,
            patch.object(plugin, "_monitor_flow"),
        ):
            with ThreadPoolExecutor(max_workers=2) as pool:
                first = pool.submit(plugin._get_or_start_flow)
                self.assertTrue(first_request_started.wait(1))
                second = pool.submit(plugin._get_or_start_flow)
                self.assertEqual(first.result(), second.result())
        self.assertEqual(calls.count((plugin._AUTH_START_URL, "POST")), 1)
        ensure_timeout.assert_called_once_with(MCP_URL)

    def test_already_connected_refreshes_tools_without_starting_oauth(self) -> None:
        calls = []

        def request(url, method="GET"):
            calls.append((url, method))
            if url == plugin._SERVER_LIST_URL:
                return server_inventory()
            if url == plugin._SERVER_TEST_URL:
                return {"ok": True, "tools": [{"name": "get_frame_capabilities"}]}
            self.fail(f"unexpected request: {method} {url}")

        with (
            patch.object(plugin, "_request_json", side_effect=request),
            patch.object(plugin, "_ensure_oauth_connect_timeout") as ensure_timeout,
            patch.object(plugin, "_refresh_mcp_discovery") as discover,
        ):
            self.assertIsNone(plugin._get_or_start_flow())
        discover.assert_called_once_with()
        ensure_timeout.assert_not_called()
        self.assertNotIn((plugin._AUTH_START_URL, "POST"), calls)

    def test_missing_token_starts_the_native_oauth_flow(self) -> None:
        calls = []

        def request(url, method="GET"):
            calls.append((url, method))
            if url == plugin._SERVER_LIST_URL:
                return server_inventory()
            if url == plugin._SERVER_TEST_URL:
                return auth_required_payload()
            return start_payload()

        def ensure_timeout(mcp_url: str) -> None:
            self.assertEqual(mcp_url, MCP_URL)
            calls.append(("ensure_timeout", "LOCAL"))

        with (
            patch.object(plugin, "_request_json", side_effect=request),
            patch.object(plugin, "_ensure_oauth_connect_timeout", side_effect=ensure_timeout),
            patch.object(plugin, "_monitor_flow"),
        ):
            flow = plugin._get_or_start_flow()
        self.assertIsInstance(flow, plugin._ActiveFlow)
        self.assertEqual(calls.count((plugin._AUTH_START_URL, "POST")), 1)
        self.assertEqual(
            calls,
            [
                (plugin._SERVER_LIST_URL, "GET"),
                (plugin._SERVER_TEST_URL, "POST"),
                ("ensure_timeout", "LOCAL"),
                (plugin._AUTH_START_URL, "POST"),
            ],
        )

    def test_timeout_migration_failure_never_starts_oauth(self) -> None:
        calls = []

        def request(url, method="GET"):
            calls.append((url, method))
            if url == plugin._SERVER_LIST_URL:
                return server_inventory()
            if url == plugin._SERVER_TEST_URL:
                return auth_required_payload()
            self.fail(f"unexpected request: {method} {url}")

        with (
            patch.object(plugin, "_request_json", side_effect=request),
            patch.object(
                plugin,
                "_ensure_oauth_connect_timeout",
                side_effect=plugin.CuebookAuthError("could not save"),
            ),
        ):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "could not save"):
                plugin._get_or_start_flow()
        self.assertNotIn((plugin._AUTH_START_URL, "POST"), calls)

    def test_flow_ttl_starts_after_authorization_url_is_ready(self) -> None:
        def request(url, method="GET"):
            if url == plugin._SERVER_LIST_URL:
                return server_inventory()
            if url == plugin._SERVER_TEST_URL:
                return auth_required_payload()
            return start_payload()

        with (
            patch.object(plugin, "_request_json", side_effect=request),
            patch.object(plugin, "_ensure_oauth_connect_timeout"),
            patch.object(plugin, "_monitor_flow"),
            patch.object(plugin.time, "monotonic", side_effect=[100.0, 160.0]),
        ):
            flow = plugin._get_or_start_flow()
        self.assertIsNotNone(flow)
        assert flow is not None
        self.assertEqual(flow.expires_at, 160.0 + plugin._FLOW_TTL_SECONDS)

    def test_non_auth_probe_failure_never_starts_oauth(self) -> None:
        calls = []

        def request(url, method="GET"):
            calls.append((url, method))
            if url == plugin._SERVER_LIST_URL:
                return server_inventory()
            if url == plugin._SERVER_TEST_URL:
                return {"ok": False, "error": "TLS certificate verification failed", "tools": []}
            self.fail(f"unexpected request: {method} {url}")

        with (
            patch.object(plugin, "_request_json", side_effect=request),
            patch.object(plugin, "_ensure_oauth_connect_timeout"),
        ):
            with self.assertRaisesRegex(plugin.CuebookAuthError, "without an OAuth challenge"):
                plugin._get_or_start_flow()
        self.assertNotIn((plugin._AUTH_START_URL, "POST"), calls)

    def test_approved_flow_refreshes_mcp_discovery(self) -> None:
        flow = plugin._ActiveFlow(FLOW_ID, authorization_url(), time.monotonic() + 60)
        plugin._active_flow = flow
        approved = {
            "flow_id": FLOW_ID,
            "server_name": "cuebook",
            "status": "approved",
        }
        with (
            patch.object(plugin.time, "sleep"),
            patch.object(plugin, "_request_json", return_value=approved),
            patch.object(plugin, "_discover_after_approval") as discover,
        ):
            plugin._monitor_flow(flow)
        discover.assert_called_once_with()
        self.assertIsNone(plugin._active_flow)

    def test_redirect_handler_never_follows_dashboard_redirects(self) -> None:
        handler = plugin._RejectRedirects()
        request = SimpleNamespace(full_url=plugin._AUTH_START_URL)
        with self.assertRaises(urllib.error.HTTPError) as raised:
            handler.redirect_request(request, None, 307, "redirect", {}, "https://evil.example")
        raised.exception.close()

    def test_dashboard_request_uses_only_the_fixed_loopback_api_and_shared_header(self) -> None:
        captured = {}

        class FakeOpener:
            def open(self, request, timeout):
                captured["url"] = request.full_url
                captured["method"] = request.method
                captured["token"] = request.get_header("X-hermes-session-token")
                captured["timeout"] = timeout
                return FakeResponse(b'{"servers": []}')

        def opener(*handlers):
            captured["handlers"] = handlers
            return FakeOpener()

        with patch.object(plugin.urllib.request, "build_opener", side_effect=opener):
            self.assertEqual(plugin._request_json(plugin._SERVER_LIST_URL), {"servers": []})
        self.assertEqual(captured["url"], "http://127.0.0.1:9119/api/mcp/servers")
        self.assertEqual(captured["method"], "GET")
        self.assertEqual(captured["token"], TOKEN)
        self.assertEqual(captured["timeout"], plugin._HTTP_TIMEOUT_SECONDS)
        self.assertTrue(any(isinstance(item, urllib.request.ProxyHandler) for item in captured["handlers"]))

        with self.assertRaisesRegex(plugin.CuebookAuthError, "unexpected local URL"):
            plugin._request_json("http://127.0.0.1:9119/api/config")
        with self.assertRaisesRegex(plugin.CuebookAuthError, "unexpected local URL"):
            plugin._request_json(plugin._AUTH_START_URL)
        with self.assertRaisesRegex(plugin.CuebookAuthError, "unexpected local URL"):
            plugin._request_json(plugin._SERVER_TEST_URL)


if __name__ == "__main__":
    unittest.main()
