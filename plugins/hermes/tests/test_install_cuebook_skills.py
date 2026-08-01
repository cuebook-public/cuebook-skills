from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock


INSTALLER_PATH = pathlib.Path(__file__).parents[1] / "install_cuebook_skills.py"
SPEC = importlib.util.spec_from_file_location("cuebook_skills_installer", INSTALLER_PATH)
assert SPEC is not None and SPEC.loader is not None
installer = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = installer
SPEC.loader.exec_module(installer)


def digest(files: dict[str, bytes]) -> str:
    value = hashlib.sha256()
    for relative, content in sorted(files.items()):
        value.update(relative.encode("utf-8"))
        value.update(b"\0")
        value.update(content)
        value.update(b"\0")
    return value.hexdigest()


class FakeLock:
    def __init__(self, installed: dict[str, dict]) -> None:
        self.installed = installed

    def get_installed(self, name: str):
        return self.installed.get(name)


class InstallerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.skills_dir = self.root / "hermes-skills"
        self.skills_dir.mkdir()
        self.repository = self.root / "repository"
        (self.repository / "plugins/cuebook").mkdir(parents=True)
        (self.repository / "skills").mkdir()
        self.base_url = "https://cuebook.xyz/.well-known/skills"
        (self.repository / "plugins/cuebook/distribution-channel-v1.json").write_text(
            json.dumps({"skills_base_url": self.base_url}),
            encoding="utf-8",
        )
        self.files = {
            name: {
                "SKILL.md": f"---\nname: {name}\n---\n".encode(),
                "references/contract.json": f'{{"skill":"{name}"}}\n'.encode(),
            }
            for name in installer.PUBLIC_SKILLS
        }
        self.index = {
            "schema_version": installer.INDEX_SCHEMA,
            "skills": [
                {
                    "name": name,
                    "files": sorted(self.files[name]),
                    "content_sha256": digest(self.files[name]),
                }
                for name in installer.PUBLIC_SKILLS
            ],
        }
        (self.repository / "skills/index.json").write_text(
            json.dumps(self.index),
            encoding="utf-8",
        )
        self.installed: dict[str, dict] = {}
        self.calls: list[tuple[str, dict]] = []
        self.uninstall_calls: list[str] = []
        self.fail_name: str | None = None
        self.corrupt_name: str | None = None
        self.raise_name: str | None = None
        self.uninstall_raise_name: str | None = None

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def api(self):
        def do_install(identifier: str, **kwargs) -> None:
            self.calls.append((identifier, kwargs))
            name = identifier.rsplit("/", 1)[-1]
            if name == self.fail_name:
                return
            root = self.skills_dir / name
            for relative, content in self.files[name].items():
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            if name == self.raise_name:
                raise RuntimeError("interrupted after writing files")
            self.installed[name] = {
                "source": "well-known",
                "identifier": identifier,
                "install_path": name,
                "scan_verdict": "safe",
                "files": sorted(self.files[name]),
            }
            if name == self.corrupt_name:
                (root / "SKILL.md").write_text("corrupt", encoding="utf-8")

        def uninstall_skill(name: str) -> tuple[bool, str]:
            self.uninstall_calls.append(name)
            entry = self.installed.get(name)
            if entry is None:
                return False, "not installed"
            install_path = self.skills_dir / entry["install_path"]
            if install_path.exists():
                shutil.rmtree(install_path)
            if name == self.uninstall_raise_name:
                raise RuntimeError("interrupted before removing lock")
            self.installed.pop(name)
            return True, f"uninstalled {name}"

        return installer.HermesApi(
            do_install=do_install,
            uninstall_skill=uninstall_skill,
            lock_factory=lambda: FakeLock(self.installed),
            skills_dir=self.skills_dir,
        )

    def fetch(self, _url: str):
        return self.index

    def _fetch_response(self, final_url: str):
        response = mock.MagicMock()
        response.__enter__.return_value = response
        response.geturl.return_value = final_url
        response.read.return_value = json.dumps(self.index).encode()
        return response

    def _fetch_with_final_url(self, request_url: str, final_url: str):
        opener = mock.MagicMock()
        opener.open.return_value = self._fetch_response(final_url)
        with mock.patch.object(installer.urllib.request, "build_opener", return_value=opener):
            return installer._fetch_index(request_url)

    def _follow_redirects(self, urls: list[str]):
        handler = installer._IndexRedirectHandler(
            installer.urlparse(urls[0]).hostname
        )
        request = installer.urllib.request.Request(urls[0])
        for target in urls[1:]:
            request = handler.redirect_request(
                request,
                None,
                307,
                "redirect",
                {},
                target,
            )
        return request

    def test_fetch_index_rejects_production_redirect_to_development(self) -> None:
        with self.assertRaisesRegex(installer.InstallError, "Unexpected Skill index redirect"):
            self._follow_redirects(
                [
                    "https://cuebook.app/.well-known/skills/index.json",
                    "https://cuebook.xyz/.well-known/skills/index.json",
                    "https://raw.githubusercontent.com/cuebook-public/"
                    "cuebook-skills/main/skills/index.json",
                ]
            )

    def test_fetch_index_rejects_development_redirect_to_production(self) -> None:
        with self.assertRaisesRegex(installer.InstallError, "Unexpected Skill index redirect"):
            self._follow_redirects(
                [
                    "https://cuebook.xyz/.well-known/skills/index.json",
                    "https://cuebook.app/.well-known/skills/index.json",
                    "https://raw.githubusercontent.com/cuebook-public/"
                    "cuebook-skills/0123456789abcdef0123456789abcdef01234567/skills/index.json",
                ]
            )

    def test_fetch_index_rejects_the_other_channel_raw_ref(self) -> None:
        with self.assertRaisesRegex(installer.InstallError, "Unexpected Skill index redirect"):
            self._follow_redirects(
                [
                    "https://cuebook.app/.well-known/skills/index.json",
                    "https://raw.githubusercontent.com/cuebook-public/"
                    "cuebook-skills/dev/skills/index.json",
                ]
            )
        with self.assertRaisesRegex(installer.InstallError, "Unexpected Skill index redirect"):
            self._follow_redirects(
                [
                    "https://cuebook.xyz/.well-known/skills/index.json",
                    "https://raw.githubusercontent.com/cuebook-public/"
                    "cuebook-skills/main/skills/index.json",
                ]
            )

    def test_fetch_index_accepts_the_pinned_official_repository(self) -> None:
        request_url = "https://cuebook.app/.well-known/skills/index.json"
        final_url = (
            "https://raw.githubusercontent.com/cuebook-public/"
            "cuebook-skills/main/skills/index.json"
        )
        self.assertEqual(self._follow_redirects([request_url, final_url]).full_url, final_url)
        self.assertEqual(self._fetch_with_final_url(request_url, final_url), self.index)

    def test_fetch_index_accepts_the_pinned_development_release(self) -> None:
        request_url = "https://cuebook.xyz/.well-known/skills/index.json"
        final_url = (
            "https://raw.githubusercontent.com/cuebook-public/"
            "cuebook-skills/0123456789abcdef0123456789abcdef01234567/skills/index.json"
        )
        self.assertEqual(self._follow_redirects([request_url, final_url]).full_url, final_url)
        self.assertEqual(self._fetch_with_final_url(request_url, final_url), self.index)

    def test_installs_only_through_the_pinned_well_known_source(self) -> None:
        result = installer.install_all(self.repository, self.api(), self.fetch)

        self.assertEqual(result, list(installer.PUBLIC_SKILLS))
        self.assertEqual(len(self.calls), 3)
        for name, (identifier, kwargs) in zip(installer.PUBLIC_SKILLS, self.calls):
            self.assertEqual(identifier, f"well-known:{self.base_url}/{name}")
            self.assertEqual(
                kwargs,
                {"force": False, "skip_confirm": True, "source_id": "well-known"},
            )

    def test_verified_install_is_idempotent_without_reinstall(self) -> None:
        api = self.api()
        installer.install_all(self.repository, api, self.fetch)
        self.calls.clear()

        result = installer.install_all(self.repository, api, self.fetch)

        self.assertEqual(result, list(installer.PUBLIC_SKILLS))
        self.assertEqual(self.calls, [])

    def test_existing_different_source_is_never_replaced(self) -> None:
        name = installer.PUBLIC_SKILLS[0]
        self.installed[name] = {
            "source": "github",
            "identifier": "github:other/repository",
            "install_path": name,
            "scan_verdict": "safe",
            "files": [],
        }

        with self.assertRaisesRegex(installer.InstallError, "Refusing to replace"):
            installer.install_all(self.repository, self.api(), self.fetch)
        self.assertEqual(self.calls, [])

    def _seed_official_channel(self, base_url: str) -> None:
        for name in installer.PUBLIC_SKILLS:
            root = self.skills_dir / name
            for relative, content in self.files[name].items():
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            self.installed[name] = {
                "source": "well-known",
                "identifier": f"well-known:{base_url}/{name}",
                "install_path": name,
                "scan_verdict": "safe",
                "files": sorted(self.files[name]),
            }

    def test_other_official_channel_requires_explicit_migration(self) -> None:
        self._seed_official_channel("https://cuebook.app/.well-known/skills")

        api = self.api()
        with self.assertRaisesRegex(installer.InstallError, "Refusing to replace"):
            installer.install_all(self.repository, api, self.fetch)
        self.assertEqual(self.uninstall_calls, [])
        self.assertEqual(self.calls, [])

        result = installer.install_all(
            self.repository,
            api,
            self.fetch,
            migrate_official_channel=True,
        )

        self.assertEqual(result, list(installer.PUBLIC_SKILLS))
        self.assertEqual(self.uninstall_calls, list(installer.PUBLIC_SKILLS))
        self.assertEqual(len(self.calls), 3)
        for name in installer.PUBLIC_SKILLS:
            self.assertEqual(
                self.installed[name]["identifier"],
                f"well-known:{self.base_url}/{name}",
            )

        self.calls.clear()
        self.uninstall_calls.clear()
        rerun = installer.install_all(
            self.repository,
            api,
            self.fetch,
            migrate_official_channel=True,
        )
        self.assertEqual(rerun, list(installer.PUBLIC_SKILLS))
        self.assertEqual(self.uninstall_calls, [])
        self.assertEqual(self.calls, [])

    def test_official_channel_migration_accepts_development_to_production(self) -> None:
        self.base_url = "https://cuebook.app/.well-known/skills"
        (self.repository / "plugins/cuebook/distribution-channel-v1.json").write_text(
            json.dumps({"skills_base_url": self.base_url}),
            encoding="utf-8",
        )
        self._seed_official_channel("https://cuebook.xyz/.well-known/skills")

        result = installer.install_all(
            self.repository,
            self.api(),
            self.fetch,
            migrate_official_channel=True,
        )

        self.assertEqual(result, list(installer.PUBLIC_SKILLS))
        self.assertEqual(self.uninstall_calls, list(installer.PUBLIC_SKILLS))
        self.assertTrue(
            all(
                entry["identifier"]
                == f"well-known:https://cuebook.app/.well-known/skills/{name}"
                for name, entry in self.installed.items()
            )
        )

    def test_explicit_migration_never_replaces_an_unknown_source(self) -> None:
        official_name, unknown_name = installer.PUBLIC_SKILLS[:2]
        official_root = self.skills_dir / official_name
        for relative, content in self.files[official_name].items():
            target = official_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        self.installed[official_name] = {
            "source": "well-known",
            "identifier": (
                "well-known:https://cuebook.app/.well-known/skills/"
                f"{official_name}"
            ),
            "install_path": official_name,
            "scan_verdict": "safe",
            "files": sorted(self.files[official_name]),
        }
        unknown_root = self.skills_dir / unknown_name
        unknown_root.mkdir()
        self.installed[unknown_name] = {
            "source": "github",
            "identifier": "github:other/repository",
            "install_path": unknown_name,
            "scan_verdict": "safe",
            "files": [],
        }

        with self.assertRaisesRegex(installer.InstallError, "non-official or unexpected"):
            installer.install_all(
                self.repository,
                self.api(),
                self.fetch,
                migrate_official_channel=True,
            )
        self.assertEqual(self.uninstall_calls, [])
        self.assertEqual(self.calls, [])

    def test_migration_preflights_an_unlocked_directory_before_uninstall(self) -> None:
        first_name, orphan_name, last_name = installer.PUBLIC_SKILLS
        self._seed_official_channel("https://cuebook.app/.well-known/skills")
        self.installed.pop(orphan_name)
        orphan_marker = self.skills_dir / orphan_name / "local-only.txt"
        shutil.rmtree(self.skills_dir / orphan_name)
        orphan_marker.parent.mkdir()
        orphan_marker.write_text("preserve me", encoding="utf-8")

        with self.assertRaisesRegex(installer.InstallError, "without a Hermes Hub lock"):
            installer.install_all(
                self.repository,
                self.api(),
                self.fetch,
                migrate_official_channel=True,
            )

        self.assertEqual(set(self.installed), {first_name, last_name})
        self.assertEqual(self.uninstall_calls, [])
        self.assertEqual(self.calls, [])
        self.assertEqual(orphan_marker.read_text(encoding="utf-8"), "preserve me")

    def test_failed_target_verification_stops_for_explicit_review(self) -> None:
        self._seed_official_channel("https://cuebook.app/.well-known/skills")
        failed_name = installer.PUBLIC_SKILLS[1]
        self.corrupt_name = failed_name
        api = self.api()

        with self.assertRaisesRegex(installer.InstallError, "digest does not match"):
            installer.install_all(
                self.repository,
                api,
                self.fetch,
                migrate_official_channel=True,
            )

        self.corrupt_name = None
        uninstall_count = len(self.uninstall_calls)
        install_count = len(self.calls)
        with self.assertRaisesRegex(installer.InstallError, "digest does not match"):
            installer.install_all(
                self.repository,
                api,
                self.fetch,
                migrate_official_channel=True,
            )
        self.assertEqual(len(self.uninstall_calls), uninstall_count)
        self.assertEqual(len(self.calls), install_count)

    def test_invalid_target_is_never_replaced_by_the_migration_flag(self) -> None:
        self._seed_official_channel(self.base_url)
        name = installer.PUBLIC_SKILLS[0]
        (self.skills_dir / name / "SKILL.md").write_text("corrupt", encoding="utf-8")
        api = self.api()

        with self.assertRaisesRegex(installer.InstallError, "digest does not match"):
            installer.install_all(
                self.repository,
                api,
                self.fetch,
                migrate_official_channel=True,
            )

        self.assertEqual(self.uninstall_calls, [])
        self.assertEqual(self.calls, [])

    def test_interrupted_unlocked_target_stops_without_deleting_it(self) -> None:
        self._seed_official_channel("https://cuebook.app/.well-known/skills")
        failed_name = installer.PUBLIC_SKILLS[1]
        self.raise_name = failed_name
        api = self.api()

        with self.assertRaisesRegex(installer.InstallError, "interrupted after writing files"):
            installer.install_all(
                self.repository,
                api,
                self.fetch,
                migrate_official_channel=True,
            )
        self.assertIsNone(self.installed.get(failed_name))
        marker = self.skills_dir / failed_name / "SKILL.md"
        self.assertTrue(marker.is_file())

        self.raise_name = None
        with self.assertRaisesRegex(installer.InstallError, "without a Hermes Hub lock"):
            installer.install_all(
                self.repository,
                api,
                self.fetch,
                migrate_official_channel=True,
            )
        self.assertTrue(marker.is_file())

    def test_interrupted_native_uninstall_can_clear_its_stale_official_lock(self) -> None:
        self._seed_official_channel("https://cuebook.app/.well-known/skills")
        failed_name = installer.PUBLIC_SKILLS[0]
        self.uninstall_raise_name = failed_name
        api = self.api()

        with self.assertRaisesRegex(installer.InstallError, "interrupted before removing lock"):
            installer.install_all(
                self.repository,
                api,
                self.fetch,
                migrate_official_channel=True,
            )
        self.assertIsNotNone(self.installed.get(failed_name))
        self.assertFalse((self.skills_dir / failed_name).exists())

        self.uninstall_raise_name = None
        result = installer.install_all(
            self.repository,
            api,
            self.fetch,
            migrate_official_channel=True,
        )

        self.assertEqual(result, list(installer.PUBLIC_SKILLS))

    def test_a_second_installer_cannot_enter_the_mutation_boundary(self) -> None:
        api = self.api()

        with installer._installer_lock(api):
            with self.assertRaisesRegex(installer.InstallError, "already running"):
                installer.install_all(self.repository, api, self.fetch)

        self.assertEqual(self.calls, [])
        self.assertEqual(self.uninstall_calls, [])

    def test_unlocked_skill_directory_is_never_replaced(self) -> None:
        name = installer.PUBLIC_SKILLS[0]
        root = self.skills_dir / name
        root.mkdir()
        marker = root / "local-only.txt"
        marker.write_text("preserve me", encoding="utf-8")

        with self.assertRaisesRegex(installer.InstallError, "without a Hermes Hub lock"):
            installer.install_all(self.repository, self.api(), self.fetch)

        self.assertEqual(self.calls, [])
        self.assertEqual(marker.read_text(encoding="utf-8"), "preserve me")

    def test_partial_failure_is_reported_without_force_or_fallback(self) -> None:
        self.fail_name = installer.PUBLIC_SKILLS[1]

        with self.assertRaisesRegex(
            installer.InstallError,
            f"Installed before failure: {installer.PUBLIC_SKILLS[0]}",
        ):
            installer.install_all(self.repository, self.api(), self.fetch)

        self.assertEqual(set(self.installed), {installer.PUBLIC_SKILLS[0]})
        self.assertEqual(len(self.calls), 2)
        self.assertTrue(all(call[1]["force"] is False for call in self.calls))
        self.assertTrue(all(call[1]["source_id"] == "well-known" for call in self.calls))

    def test_published_snapshot_drift_stops_before_install(self) -> None:
        remote = json.loads(json.dumps(self.index))
        remote["skills"][0]["content_sha256"] = "0" * 64

        with self.assertRaisesRegex(installer.InstallError, "does not match this checkout"):
            installer.install_all(self.repository, self.api(), lambda _url: remote)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
