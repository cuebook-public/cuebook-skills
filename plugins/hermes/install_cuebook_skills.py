#!/usr/bin/env python3
"""Install Cuebook bundles through Hermes' pinned well-known adapter."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import inspect
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlparse


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[2]
PUBLIC_SKILLS = (
    "query-cuebook",
    "create-cuebook-content",
    "author-cuebook-skill",
)
INDEX_SCHEMA = "cuebook-hermes-skills-index-v1"
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
MAX_INDEX_BYTES = 2_000_000
INSTALLER_LOCK_NAME = "cuebook-installer.lock"
OFFICIAL_SKILLS_BASE_URLS = frozenset(
    {
        "https://cuebook.app/.well-known/skills",
        "https://cuebook.xyz/.well-known/skills",
    }
)


class InstallError(RuntimeError):
    pass


@dataclass(frozen=True)
class HermesApi:
    do_install: Callable[..., None]
    uninstall_skill: Callable[[str], tuple[bool, str]]
    lock_factory: Callable[[], Any]
    skills_dir: pathlib.Path


def _load_hermes_api() -> HermesApi:
    try:
        from hermes_cli.skills_hub import do_install
        from tools.skills_hub import HubLockFile, SKILLS_DIR, uninstall_skill
    except ImportError as exc:
        raise InstallError(
            "Run this file with the Python interpreter from the Hermes virtual environment."
        ) from exc

    required = {"force", "skip_confirm", "source_id"}
    missing = required - set(inspect.signature(do_install).parameters)
    if missing:
        raise InstallError(
            "This Hermes build has no safe source-pinned install API "
            f"(missing: {', '.join(sorted(missing))})."
        )
    if "skill_name" not in inspect.signature(uninstall_skill).parameters:
        raise InstallError("This Hermes build has no compatible native uninstall API.")
    return HermesApi(do_install, uninstall_skill, HubLockFile, pathlib.Path(SKILLS_DIR))


def _read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise InstallError(f"Cannot read {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise InstallError(f"Expected a JSON object in {path}.")
    return value


def _fetch_index(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "cuebook-hermes-installer/1"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            final = urlparse(response.geturl())
            if final.scheme != "https" or final.hostname not in {
                "cuebook.app",
                "cuebook.xyz",
                "raw.githubusercontent.com",
            }:
                raise InstallError(f"Unexpected Skill index redirect: {response.geturl()}")
            raw = response.read(MAX_INDEX_BYTES + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise InstallError(f"Cannot fetch the Cuebook Skill index: {exc}") from exc
    if len(raw) > MAX_INDEX_BYTES:
        raise InstallError("Cuebook Skill index exceeds the size limit.")
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise InstallError("Cuebook Skill index is not valid JSON.") from exc
    if not isinstance(value, dict):
        raise InstallError("Cuebook Skill index must be a JSON object.")
    return value


def _release_entries(index: dict[str, Any]) -> dict[str, dict[str, Any]]:
    if index.get("schema_version") != INDEX_SCHEMA:
        raise InstallError("Cuebook Skill index has an unsupported schema version.")
    skills = index.get("skills")
    if not isinstance(skills, list):
        raise InstallError("Cuebook Skill index has no skills list.")
    entries = {
        item.get("name"): item
        for item in skills
        if isinstance(item, dict) and isinstance(item.get("name"), str)
    }
    if set(entries) != set(PUBLIC_SKILLS):
        raise InstallError("Cuebook Skill index must contain exactly the three public Skills.")
    for name, entry in entries.items():
        files = entry.get("files")
        digest = entry.get("content_sha256")
        if (
            not isinstance(files, list)
            or not files
            or any(not isinstance(item, str) or not item for item in files)
            or len(files) != len(set(files))
            or not isinstance(digest, str)
            or not SHA256_PATTERN.fullmatch(digest)
        ):
            raise InstallError(f"Cuebook Skill index entry is invalid: {name}.")
    return entries


def _content_digest(root: pathlib.Path, expected_files: list[str]) -> str:
    actual = []
    for path in root.rglob("*"):
        if path.is_symlink():
            raise InstallError(f"Installed Skill contains a symlink: {path}")
        if path.is_file():
            actual.append(path.relative_to(root).as_posix())
    actual.sort()
    if actual != sorted(expected_files):
        raise InstallError(f"Installed file inventory does not match the release index: {root.name}.")
    digest = hashlib.sha256()
    for relative in actual:
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update((root / relative).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _verify_installed(
    api: HermesApi,
    name: str,
    identifier: str,
    release: dict[str, Any],
) -> None:
    entry = api.lock_factory().get_installed(name)
    if not isinstance(entry, dict):
        raise InstallError(f"Hermes did not record the installed Skill: {name}.")
    if entry.get("source") != "well-known" or entry.get("identifier") != identifier:
        raise InstallError(f"Installed Skill has unexpected provenance: {name}.")
    if entry.get("scan_verdict") != "safe":
        raise InstallError(f"Hermes did not record a SAFE scan verdict: {name}.")
    expected_files = release["files"]
    if sorted(entry.get("files", [])) != sorted(expected_files):
        raise InstallError(f"Hermes lock inventory does not match the release index: {name}.")
    install_path = str(entry.get("install_path", ""))
    unresolved_root = api.skills_dir / install_path
    if install_path != name or unresolved_root.is_symlink():
        raise InstallError(f"Hermes recorded an invalid install path: {name}.")
    root = unresolved_root.resolve()
    skills_root = api.skills_dir.resolve()
    if root.parent != skills_root or not root.is_dir():
        raise InstallError(f"Hermes recorded an invalid install path: {name}.")
    if _content_digest(root, expected_files) != release["content_sha256"]:
        raise InstallError(f"Installed Skill digest does not match the release index: {name}.")


@contextlib.contextmanager
def _installer_lock(api: HermesApi):
    parent = api.skills_dir / ".hub"
    if parent.exists() and (parent.is_symlink() or not parent.is_dir()):
        raise InstallError(f"Invalid Hermes Hub state directory: {parent}.")
    parent.mkdir(parents=True, exist_ok=True)
    path = parent / INSTALLER_LOCK_NAME
    if path.is_symlink():
        raise InstallError(f"Invalid Cuebook installer lock path: {path}.")
    flags = os.O_CREAT | os.O_RDWR
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags, 0o600)
    except OSError as exc:
        raise InstallError(f"Cannot open the Cuebook installer lock: {exc}") from exc
    locked = False
    try:
        if os.name == "nt":
            import msvcrt

            if os.fstat(descriptor).st_size == 0:
                os.write(descriptor, b"\0")
            os.lseek(descriptor, 0, os.SEEK_SET)
            try:
                msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                raise InstallError("Another Cuebook installer is already running.") from exc
        else:
            import fcntl

            try:
                fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise InstallError("Another Cuebook installer is already running.") from exc
        locked = True
        yield
    finally:
        if locked:
            if os.name == "nt":
                import msvcrt

                os.lseek(descriptor, 0, os.SEEK_SET)
                msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def _migrate_official_channel(
    api: HermesApi,
    base_url: str,
    releases: dict[str, dict[str, Any]],
) -> list[str]:
    if base_url not in OFFICIAL_SKILLS_BASE_URLS:
        raise InstallError("Channel migration requires an official Cuebook Skill endpoint.")

    queued: dict[str, dict[str, Any]] = {}
    for name in PUBLIC_SKILLS:
        existing = api.lock_factory().get_installed(name)
        if existing is None:
            install_path = api.skills_dir / name
            if install_path.exists() or install_path.is_symlink():
                raise InstallError(
                    f"Skill directory exists without a Hermes Hub lock: {install_path}."
                )
            continue
        target_identifier = f"well-known:{base_url}/{name}"
        if existing.get("source") == "well-known" and existing.get("identifier") == target_identifier:
            _verify_installed(api, name, target_identifier, releases[name])
            continue

        official_identifiers = {
            f"well-known:{official_base_url}/{name}"
            for official_base_url in OFFICIAL_SKILLS_BASE_URLS
            if official_base_url != base_url
        }
        if (
            existing.get("source") != "well-known"
            or existing.get("identifier") not in official_identifiers
            or existing.get("scan_verdict") != "safe"
            or existing.get("install_path") != name
        ):
            raise InstallError(
                f"Refusing to migrate a non-official or unexpected existing Skill: {name}."
            )
        install_path = api.skills_dir / name
        if (
            install_path.is_symlink()
            or (install_path.exists() and not install_path.is_dir())
        ):
            raise InstallError(f"Existing official Skill has an invalid install path: {name}.")
        queued[name] = existing

    for name, expected in queued.items():
        if api.lock_factory().get_installed(name) != expected:
            raise InstallError(f"Skill provenance changed during migration: {name}.")
        try:
            success, message = api.uninstall_skill(name)
        except Exception as exc:
            raise InstallError(f"Hermes failed to uninstall {name}: {exc}") from exc
        if not success:
            raise InstallError(f"Hermes could not uninstall {name}: {message}")
        install_path = api.skills_dir / name
        if (
            api.lock_factory().get_installed(name) is not None
            or install_path.exists()
            or install_path.is_symlink()
        ):
            raise InstallError(f"Hermes did not completely uninstall the previous Skill: {name}.")
    return list(queued)


def _install_verified(
    hermes: HermesApi,
    base_url: str,
    remote: dict[str, dict[str, Any]],
    migrate_official_channel: bool,
) -> list[str]:
    if migrate_official_channel:
        _migrate_official_channel(hermes, base_url, remote)
    completed: list[str] = []
    for name in PUBLIC_SKILLS:
        identifier = f"well-known:{base_url}/{name}"
        existing = hermes.lock_factory().get_installed(name)
        if existing is not None:
            try:
                _verify_installed(hermes, name, identifier, remote[name])
            except InstallError as exc:
                raise InstallError(
                    f"{exc} Refusing to replace an existing Skill; review its source and use the native update path."
                ) from exc
            completed.append(name)
            continue
        install_path = hermes.skills_dir / name
        if install_path.exists() or install_path.is_symlink():
            raise InstallError(
                f"Skill directory exists without a Hermes Hub lock: {install_path}. "
                "Refusing to replace it; review or remove it explicitly."
            )
        try:
            hermes.do_install(
                identifier,
                force=False,
                skip_confirm=True,
                source_id="well-known",
            )
        except Exception as exc:
            raise InstallError(f"Hermes failed to install {name}: {exc}") from exc
        try:
            _verify_installed(hermes, name, identifier, remote[name])
        except InstallError as exc:
            suffix = f" Installed before failure: {', '.join(completed)}." if completed else ""
            raise InstallError(f"{exc}{suffix}") from exc
        completed.append(name)
    return completed


def install_all(
    repository_root: pathlib.Path = REPOSITORY_ROOT,
    api: HermesApi | None = None,
    fetch_index: Callable[[str], dict[str, Any]] = _fetch_index,
    migrate_official_channel: bool = False,
) -> list[str]:
    distribution = _read_json(repository_root / "plugins/cuebook/distribution-channel-v1.json")
    base_url = distribution.get("skills_base_url")
    if not isinstance(base_url, str) or not base_url.startswith("https://"):
        raise InstallError("Cuebook distribution manifest has no HTTPS Skill endpoint.")
    local = _release_entries(_read_json(repository_root / "skills/index.json"))
    remote = _release_entries(fetch_index(f"{base_url}/index.json"))
    for name in PUBLIC_SKILLS:
        if local[name]["files"] != remote[name]["files"] or local[name]["content_sha256"] != remote[name]["content_sha256"]:
            raise InstallError(f"The published Skill snapshot does not match this checkout: {name}.")

    hermes = api or _load_hermes_api()
    with _installer_lock(hermes):
        return _install_verified(hermes, base_url, remote, migrate_official_channel)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Install the three verified Cuebook Skill bundles through Hermes."
    )
    parser.add_argument(
        "--migrate-official-channel",
        action="store_true",
        help="replace only Skills recorded from Cuebook's other official distribution channel",
    )
    args = parser.parse_args(argv)
    try:
        installed = install_all(migrate_official_channel=args.migrate_official_channel)
    except InstallError as exc:
        print(f"Cuebook Skill installation failed: {exc}", file=sys.stderr)
        return 1
    print(f"Verified {len(installed)} Cuebook Skills: {', '.join(installed)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
