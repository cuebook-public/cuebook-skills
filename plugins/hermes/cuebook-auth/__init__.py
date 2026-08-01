"""Hermes slash-command bridge for Cuebook MCP OAuth."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import math
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


_LOG = logging.getLogger(__name__)

_DASHBOARD_ORIGIN = "http://127.0.0.1:9119"
_SERVER_LIST_URL = f"{_DASHBOARD_ORIGIN}/api/mcp/servers"
_SERVER_TEST_URL = f"{_DASHBOARD_ORIGIN}/api/mcp/servers/cuebook/test"
_AUTH_START_URL = f"{_DASHBOARD_ORIGIN}/api/mcp/servers/cuebook/auth"
_FLOW_STATUS_PREFIX = f"{_DASHBOARD_ORIGIN}/api/mcp/oauth/flows/"
_SESSION_HEADER = "X-Hermes-Session-Token"

_OFFICIAL_MCP_URL = "https://cuebook.app/mcp"
_AUTHORIZATION_HOST = "cuebook.app"
_AUTHORIZATION_QUERY_KEYS = frozenset(
    {
        "client_id",
        "redirect_uri",
        "response_type",
        "scope",
        "state",
        "code_challenge",
        "code_challenge_method",
        "resource",
    }
)
_REQUIRED_AUTHORIZATION_QUERY_KEYS = frozenset(
    {
        "client_id",
        "redirect_uri",
        "response_type",
        "state",
        "code_challenge",
        "code_challenge_method",
        "resource",
    }
)
_FLOW_ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{20,128}$")
_PKCE_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43,128}$")
_SESSION_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43,4096}$")

_MIN_OAUTH_CONNECT_TIMEOUT_SECONDS = 315
_FLOW_TTL_SECONDS = 5 * 60
_POLL_INTERVAL_SECONDS = 2.0
_MAX_RESPONSE_BYTES = 64 * 1024
_HTTP_TIMEOUT_SECONDS = 35.0
_REQUIRED_DISCOVERY_TOOL = "get_frame_capabilities"
_AUTH_REQUIRED_MARKERS = (
    "no cached tokens found",
    "no token found",
    "invalid_token",
    "mcp oauth requires browser authorization but no interactive session is available",
)


class CuebookAuthError(RuntimeError):
    """Safe, user-displayable bridge error."""


class DashboardConflictError(CuebookAuthError):
    """Another process already owns the native OAuth flow."""


@dataclass(frozen=True)
class _Invocation:
    platform: str
    chat_type: str


@dataclass(frozen=True)
class _ActiveFlow:
    flow_id: str
    authorization_url: str
    expires_at: float


_invocation: contextvars.ContextVar[_Invocation | None] = contextvars.ContextVar(
    "cuebook_auth_invocation",
    default=None,
)
_flow_lock = threading.Lock()
_active_flow: _ActiveFlow | None = None


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, "Redirect refused", headers, fp)


def _session_token() -> str:
    token = os.environ.get("HERMES_DASHBOARD_SESSION_TOKEN", "")
    if not _SESSION_TOKEN_PATTERN.fullmatch(token) or len(set(token)) < 16:
        raise CuebookAuthError(
            "HERMES_DASHBOARD_SESSION_TOKEN must be one shared 256-bit URL-safe "
            "secret in both the Hermes Gateway and Dashboard processes."
        )
    return token


def _expected_callback_url() -> str:
    raw = os.environ.get("HERMES_DASHBOARD_PUBLIC_URL", "").strip()
    try:
        parsed = urllib.parse.urlsplit(raw)
        port = parsed.port
    except ValueError as exc:
        raise CuebookAuthError(
            "HERMES_DASHBOARD_PUBLIC_URL must be a valid public HTTPS URL."
        ) from exc

    decoded_path = urllib.parse.unquote(parsed.path)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
        or parsed.query
        or parsed.fragment
        or "//" in decoded_path
        or any(part in {".", ".."} for part in decoded_path.split("/"))
        or any(ord(char) < 0x21 or char in {'"', "'", "<", ">", "\\"} for char in raw)
        or any(ord(char) < 0x21 for char in decoded_path)
    ):
        raise CuebookAuthError(
            "HERMES_DASHBOARD_PUBLIC_URL must be a valid public HTTPS URL."
        )

    base_path = parsed.path.rstrip("/")
    base = urllib.parse.urlunsplit(("https", parsed.netloc, base_path, "", ""))
    return f"{base}/api/mcp/oauth/callback/cuebook"


def _request_json(url: str, *, method: str = "GET") -> dict[str, Any]:
    flow_id = url.removeprefix(_FLOW_STATUS_PREFIX) if url.startswith(_FLOW_STATUS_PREFIX) else ""
    allowed = (
        (url == _SERVER_LIST_URL and method == "GET")
        or (url == _SERVER_TEST_URL and method == "POST")
        or (url == _AUTH_START_URL and method == "POST")
        or (bool(_FLOW_ID_PATTERN.fullmatch(flow_id)) and method == "GET")
    )
    if not allowed:
        raise CuebookAuthError("The Cuebook OAuth bridge refused an unexpected local URL.")

    request = urllib.request.Request(
        url,
        data=b"" if method == "POST" else None,
        method=method,
        headers={
            "Accept": "application/json",
            _SESSION_HEADER: _session_token(),
        },
    )
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        _RejectRedirects(),
    )
    try:
        with opener.open(request, timeout=_HTTP_TIMEOUT_SECONDS) as response:
            content_type = response.headers.get_content_type()
            body = response.read(_MAX_RESPONSE_BYTES + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        exc.close()
        if status == 409:
            raise DashboardConflictError(
                "A Cuebook authorization flow is already running. Finish it before trying again."
            ) from None
        raise CuebookAuthError(
            "The loopback Hermes Dashboard rejected the Cuebook authorization request."
        ) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise CuebookAuthError(
            "The loopback Hermes Dashboard is unavailable on 127.0.0.1:9119."
        ) from None

    if content_type != "application/json" or len(body) > _MAX_RESPONSE_BYTES:
        raise CuebookAuthError("The Hermes Dashboard returned an invalid OAuth response.")
    try:
        payload = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CuebookAuthError("The Hermes Dashboard returned an invalid OAuth response.") from None
    if not isinstance(payload, dict):
        raise CuebookAuthError("The Hermes Dashboard returned an invalid OAuth response.")
    return payload


def _configured_mcp_url() -> str:
    payload = _request_json(_SERVER_LIST_URL)
    servers = payload.get("servers")
    if not isinstance(servers, list):
        raise CuebookAuthError("The Hermes Dashboard returned an invalid MCP inventory.")

    cuebook_servers = [
        server
        for server in servers
        if isinstance(server, dict) and server.get("name") == "cuebook"
    ]
    if len(cuebook_servers) != 1:
        raise CuebookAuthError(
            "Configure exactly one enabled Hermes MCP server named cuebook before authorizing."
        )
    server = cuebook_servers[0]
    mcp_url = server.get("url")
    if (
        mcp_url != _OFFICIAL_MCP_URL
        or server.get("transport") != "http"
        or server.get("auth") != "oauth"
        or server.get("enabled") is not True
    ):
        raise CuebookAuthError(
            "The cuebook MCP entry must be enabled, use OAuth, and point to an official Cuebook endpoint."
        )
    return str(mcp_url)


def _load_mcp_config_api():
    try:
        from hermes_cli.mcp_config import _get_mcp_servers, _save_mcp_server
    except ImportError as exc:
        raise CuebookAuthError(
            "This Hermes build cannot apply Cuebook's OAuth wait configuration. "
            "Use the source-pinned Hermes 0.19.1 build described in the Cuebook guide."
        ) from exc
    return _get_mcp_servers, _save_mcp_server


def _connect_timeout_seconds(server: dict[str, Any]) -> float | None:
    raw = server.get("connect_timeout")
    if raw is None:
        return None
    if isinstance(raw, bool):
        raise CuebookAuthError("The local cuebook MCP entry has an invalid connect_timeout.")
    try:
        value = float(raw)
    except (TypeError, ValueError) as exc:
        raise CuebookAuthError(
            "The local cuebook MCP entry has an invalid connect_timeout."
        ) from exc
    if not math.isfinite(value) or value <= 0:
        raise CuebookAuthError("The local cuebook MCP entry has an invalid connect_timeout.")
    return value


def _ensure_oauth_connect_timeout(mcp_url: str) -> None:
    get_servers, save_server = _load_mcp_config_api()
    try:
        servers = get_servers()
    except Exception as exc:
        raise CuebookAuthError("The local Hermes MCP configuration is unavailable.") from exc
    server = servers.get("cuebook") if isinstance(servers, dict) else None
    if (
        not isinstance(server, dict)
        or server.get("url") != mcp_url
        or server.get("auth") != "oauth"
        or server.get("enabled", True) is False
    ):
        raise CuebookAuthError("The local cuebook MCP configuration is not available.")

    current = _connect_timeout_seconds(server)
    if current is not None and current >= _MIN_OAUTH_CONNECT_TIMEOUT_SECONDS:
        return

    updated = dict(server)
    updated["connect_timeout"] = _MIN_OAUTH_CONNECT_TIMEOUT_SECONDS
    try:
        saved = save_server("cuebook", updated)
    except Exception as exc:
        raise CuebookAuthError(
            "Hermes could not save Cuebook's OAuth wait configuration."
        ) from exc
    if saved is not True:
        raise CuebookAuthError("Hermes could not save Cuebook's OAuth wait configuration.")

    try:
        persisted_servers = get_servers()
    except Exception as exc:
        raise CuebookAuthError(
            "Hermes could not verify Cuebook's OAuth wait configuration."
        ) from exc
    persisted = (
        persisted_servers.get("cuebook") if isinstance(persisted_servers, dict) else None
    )
    if not isinstance(persisted, dict):
        raise CuebookAuthError("Hermes could not verify Cuebook's OAuth wait configuration.")
    persisted_timeout = _connect_timeout_seconds(persisted)
    if (
        persisted.get("url") != mcp_url
        or persisted.get("auth") != "oauth"
        or persisted_timeout is None
        or persisted_timeout < _MIN_OAUTH_CONNECT_TIMEOUT_SECONDS
    ):
        raise CuebookAuthError("Hermes could not verify Cuebook's OAuth wait configuration.")
    _LOG.info(
        "Raised Cuebook MCP connect_timeout to %s seconds for browser authorization",
        _MIN_OAUTH_CONNECT_TIMEOUT_SECONDS,
    )


def _mcp_is_ready() -> bool:
    payload = _request_json(_SERVER_TEST_URL, method="POST")
    if payload.get("ok") is True:
        tools = payload.get("tools")
        if (
            not isinstance(tools, list)
            or not any(
                isinstance(tool, dict) and tool.get("name") == _REQUIRED_DISCOVERY_TOOL
                for tool in tools
            )
        ):
            raise CuebookAuthError("The Hermes Dashboard returned an invalid MCP test result.")
        return True
    error = payload.get("error")
    if payload.get("ok") is False and isinstance(error, str):
        normalized = error.lower()
        if (
            any(marker in normalized for marker in _AUTH_REQUIRED_MARKERS)
            or ("401" in normalized and "unauthorized" in normalized)
        ):
            return False
        raise CuebookAuthError(
            "Cuebook MCP is configured but its connection test failed without an OAuth "
            "challenge. Fix the MCP connection error in the Hermes Dashboard before retrying."
        )
    raise CuebookAuthError("The Hermes Dashboard returned an invalid MCP test result.")


def _validate_authorization_url(
    authorization_url: object,
    *,
    mcp_url: str,
    callback_url: str,
) -> str:
    if not isinstance(authorization_url, str) or len(authorization_url) > 8192:
        raise CuebookAuthError("The Hermes Dashboard returned an invalid authorization URL.")
    try:
        parsed = urllib.parse.urlsplit(authorization_url)
        pairs = urllib.parse.parse_qsl(
            parsed.query,
            keep_blank_values=True,
            strict_parsing=True,
        )
    except ValueError as exc:
        raise CuebookAuthError(
            "The Hermes Dashboard returned an invalid authorization URL."
        ) from exc

    expected_host = urllib.parse.urlsplit(mcp_url).hostname
    if (
        parsed.scheme != "https"
        or parsed.netloc != _AUTHORIZATION_HOST
        or parsed.hostname != expected_host
        or parsed.path != "/mcp/authorize"
        or parsed.fragment
    ):
        raise CuebookAuthError(
            "The Hermes Dashboard returned an untrusted authorization URL."
        )

    values: dict[str, str] = {}
    for key, value in pairs:
        if key in values or key not in _AUTHORIZATION_QUERY_KEYS:
            raise CuebookAuthError(
                "The Hermes Dashboard returned an invalid authorization URL."
            )
        values[key] = value
    if not _REQUIRED_AUTHORIZATION_QUERY_KEYS.issubset(values):
        raise CuebookAuthError("The Hermes Dashboard returned an incomplete authorization URL.")
    if (
        not 1 <= len(values["client_id"]) <= 512
        or not 16 <= len(values["state"]) <= 1024
        or values["response_type"] != "code"
        or values["redirect_uri"] != callback_url
        or values["code_challenge_method"] != "S256"
        or not _PKCE_PATTERN.fullmatch(values["code_challenge"])
        or values["resource"] != mcp_url
        or any(ord(char) < 0x20 for value in values.values() for char in value)
    ):
        raise CuebookAuthError("The Hermes Dashboard returned an invalid authorization URL.")
    return authorization_url


def _clear_active_flow(flow: _ActiveFlow) -> None:
    global _active_flow
    with _flow_lock:
        if _active_flow == flow:
            _active_flow = None


def _refresh_mcp_discovery() -> None:
    from tools.mcp_tool import discover_mcp_tools

    tool_names = discover_mcp_tools()
    if _REQUIRED_DISCOVERY_TOOL not in tool_names:
        raise CuebookAuthError("Cuebook MCP Tool discovery did not become ready.")


def _discover_after_approval() -> None:
    try:
        _refresh_mcp_discovery()
    except Exception:
        _LOG.warning("Cuebook MCP Tool discovery failed after OAuth approval")


def _monitor_flow(flow: _ActiveFlow) -> None:
    while time.monotonic() < flow.expires_at:
        time.sleep(_POLL_INTERVAL_SECONDS)
        try:
            snapshot = _request_json(f"{_FLOW_STATUS_PREFIX}{flow.flow_id}")
        except CuebookAuthError:
            continue
        if snapshot.get("flow_id") != flow.flow_id or snapshot.get("server_name") != "cuebook":
            _clear_active_flow(flow)
            return
        status = snapshot.get("status")
        if status == "approved":
            _discover_after_approval()
            _clear_active_flow(flow)
            return
        if status == "error":
            _clear_active_flow(flow)
            return
        if status not in {"starting", "authorization_required"}:
            _clear_active_flow(flow)
            return
    _clear_active_flow(flow)


def _get_or_start_flow() -> _ActiveFlow | None:
    global _active_flow
    with _flow_lock:
        now = time.monotonic()
        if _active_flow is not None and _active_flow.expires_at > now:
            return _active_flow
        _active_flow = None

        mcp_url = _configured_mcp_url()
        if _mcp_is_ready():
            try:
                _refresh_mcp_discovery()
            except Exception as exc:
                raise CuebookAuthError(
                    "Cuebook MCP is authorized, but Hermes could not refresh its Tools."
                ) from exc
            return None
        _ensure_oauth_connect_timeout(mcp_url)
        callback_url = _expected_callback_url()
        payload = _request_json(_AUTH_START_URL, method="POST")
        flow_id = payload.get("flow_id")
        if (
            not isinstance(flow_id, str)
            or not _FLOW_ID_PATTERN.fullmatch(flow_id)
            or payload.get("server_name") != "cuebook"
            or payload.get("status") != "authorization_required"
        ):
            raise CuebookAuthError("Hermes could not start Cuebook authorization.")
        authorization_url = _validate_authorization_url(
            payload.get("authorization_url"),
            mcp_url=mcp_url,
            callback_url=callback_url,
        )
        flow = _ActiveFlow(
            flow_id=flow_id,
            authorization_url=authorization_url,
            expires_at=time.monotonic() + _FLOW_TTL_SECONDS,
        )
        _active_flow = flow
        threading.Thread(
            target=_monitor_flow,
            args=(flow,),
            daemon=True,
            name="cuebook-oauth-monitor",
        ).start()
        return flow


def _capture_gateway_context(*, event, **_kwargs) -> None:
    source = getattr(event, "source", None)
    platform_value = getattr(getattr(source, "platform", None), "value", "")
    _invocation.set(
        _Invocation(
            platform=str(platform_value).lower(),
            chat_type=str(getattr(source, "chat_type", "")).lower(),
        )
    )


async def _handle_cuebook_auth(raw_args: str) -> str:
    current = _invocation.get()
    if current is None or current.platform != "telegram" or current.chat_type != "dm":
        return "`/cuebook_auth` is available only in a private Telegram chat with this Hermes bot."
    if raw_args.strip():
        return "Usage: `/cuebook_auth`"
    try:
        flow = await asyncio.to_thread(_get_or_start_flow)
    except CuebookAuthError as exc:
        return str(exc)
    if flow is None:
        return "Cuebook MCP is already authorized and connected; Hermes Tools are ready."
    return (
        "Cuebook is ready.\n\n"
        f"[Open Cuebook to authorize]({flow.authorization_url})\n\n"
        "On mobile, this HTTPS link can open the installed Cuebook app. If Telegram keeps it in a "
        "browser, complete approval there. On desktop, it opens the browser.\n\n"
        "Approve once within five minutes, then return here. Tapping Connect Cuebook again while "
        "this link is active reuses the same authorization flow."
    )


def register(ctx) -> None:
    ctx.register_hook("pre_gateway_dispatch", _capture_gateway_context)
    ctx.register_command(
        "cuebook-auth",
        handler=_handle_cuebook_auth,
        description="Connect Cuebook",
    )
