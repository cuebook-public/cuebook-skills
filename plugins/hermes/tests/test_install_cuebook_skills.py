from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest


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
        self.fail_name: str | None = None

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
            self.installed[name] = {
                "source": "well-known",
                "identifier": identifier,
                "install_path": name,
                "scan_verdict": "safe",
                "files": sorted(self.files[name]),
            }

        return installer.HermesApi(
            do_install=do_install,
            lock_factory=lambda: FakeLock(self.installed),
            skills_dir=self.skills_dir,
        )

    def fetch(self, _url: str):
        return self.index

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
