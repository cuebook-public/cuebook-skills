#!/usr/bin/env python3
"""Validate no-side-effect ReleaseBundleV1 artifacts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REQUIRED = {"schema_version", "release_id", "prepared_at", "operation", "program_ref", "items", "quality_report", "release_state"}
EXECUTION_MODES = {"manual_handoff", "platform_draft", "api_direct", "api_scheduled"}
SECRET_KEYS = {"token", "access_token", "refresh_token", "cookie", "cookies", "password", "secret", "api_key", "app_secret", "client_secret", "authorization"}
RECEIPT_KEYS = {"external_id", "external_url", "published_at", "platform_receipt", "post_id"}
OFFICIAL_HOSTS = {
    "x": {"docs.x.com", "developer.x.com"},
    "telegram": {"core.telegram.org"},
    "reddit": {"reddit.com", "www.reddit.com", "redditinc.com", "support.reddithelp.com"},
    "douyin": {"open.douyin.com", "95152.douyin.com"},
    "xiaohongshu": {"xiaohongshu.com", "www.xiaohongshu.com", "school.xiaohongshu.com", "open.xiaohongshu.com"},
}
HASH_PATTERN = re.compile(r"sha256:[a-f0-9]{64}")


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    candidate = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def host_is_official(platform: str, url: Any) -> bool:
    if not isinstance(url, str) or not url.startswith(("https://", "http://")):
        return False
    host = (urlparse(url).hostname or "").lower()
    return host in OFFICIAL_HOSTS.get(platform, set())


def walk_keys(value: Any, path: str = "$") -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    if isinstance(value, dict):
        for key, entry in value.items():
            child = f"{path}.{key}"
            found.append((str(key).lower(), child))
            found.extend(walk_keys(entry, child))
    elif isinstance(value, list):
        for index, entry in enumerate(value):
            found.extend(walk_keys(entry, f"{path}[{index}]"))
    return found


def find_cycle(nodes: set[str], edges: dict[str, set[str]]) -> list[str] | None:
    state = {node: 0 for node in nodes}
    stack: list[str] = []

    def visit(node: str) -> list[str] | None:
        state[node] = 1
        stack.append(node)
        for dependency in edges.get(node, set()):
            if dependency not in state:
                continue
            if state[dependency] == 1:
                start = stack.index(dependency)
                return stack[start:] + [dependency]
            if state[dependency] == 0:
                cycle = visit(dependency)
                if cycle:
                    return cycle
        stack.pop()
        state[node] = 2
        return None

    for node in sorted(nodes):
        if state[node] == 0:
            cycle = visit(node)
            if cycle:
                return cycle
    return None


def validate_approval(value: Any, path: str, errors: list[dict[str, str]]) -> tuple[str | None, datetime | None]:
    if not isinstance(value, dict):
        errors.append(issue("APPROVAL_TYPE", path, "Approval must be an object."))
        return None, None
    status = value.get("status")
    if status not in {"pending", "approved", "rejected", "not_required"}:
        errors.append(issue("APPROVAL_STATUS", f"{path}.status", "Unsupported approval status."))
    approver = value.get("approved_by")
    approved_at = parse_time(value.get("approved_at"))
    if status == "approved":
        if not str(approver or "").strip():
            errors.append(issue("APPROVER_REQUIRED", f"{path}.approved_by", "Approved state requires an approver reference."))
        if approved_at is None:
            errors.append(issue("APPROVAL_TIME", f"{path}.approved_at", "Approved state requires a parseable timestamp."))
    elif approver is not None or value.get("approved_at") is not None:
        errors.append(issue("APPROVAL_METADATA", path, "Only approved state may carry approver and approval time."))
    return status, approved_at


def validate(item: Any) -> dict[str, Any]:
    errors: list[dict[str, str]] = []
    warnings: list[dict[str, str]] = []
    blockers: list[dict[str, str]] = []
    if not isinstance(item, dict):
        return {"valid": False, "errors": [issue("ROOT_TYPE", "$", "ReleaseBundleV1 must be an object.")], "warnings": []}

    for key in sorted(REQUIRED - set(item)):
        errors.append(issue("MISSING_FIELD", f"$.{key}", "Required field is missing."))
    if item.get("schema_version") != "release-bundle.v1":
        errors.append(issue("SCHEMA_VERSION", "$.schema_version", "Expected release-bundle.v1."))
    if not re.fullmatch(r"release_[a-f0-9]{16}", str(item.get("release_id") or "")):
        errors.append(issue("RELEASE_ID", "$.release_id", "release_id must contain a stable 16-character lowercase hex suffix."))
    prepared_at = parse_time(item.get("prepared_at"))
    if prepared_at is None:
        errors.append(issue("PREPARED_AT", "$.prepared_at", "prepared_at must be a parseable timestamp."))
    if item.get("operation") != "prepare_only":
        errors.append(issue("OPERATION", "$.operation", "This skill may only prepare; operation must be prepare_only."))

    for key, path in walk_keys(item):
        if key in SECRET_KEYS:
            errors.append(issue("SECRET_FIELD", path, "Credentials and private signing material cannot enter a release bundle."))
        if key in RECEIPT_KEYS:
            errors.append(issue("FAKE_RECEIPT", path, "Publication receipt fields cannot appear before external execution."))

    items_raw = item.get("items")
    if not isinstance(items_raw, list) or not items_raw:
        errors.append(issue("ITEMS", "$.items", "items must be a non-empty array."))
        items_raw = []

    entries: dict[str, dict[str, Any]] = {}
    edges: dict[str, set[str]] = {}
    idempotency_keys: set[str] = set()
    has_blocker = False
    has_pending = False

    for index, entry in enumerate(items_raw):
        path = f"$.items[{index}]"
        item_blocker = False
        if not isinstance(entry, dict):
            errors.append(issue("ITEM_TYPE", path, "Release item must be an object."))
            has_blocker = True
            continue
        item_id = str(entry.get("release_item_id") or "").strip()
        if not re.fullmatch(r"release_item_[A-Za-z0-9_-]+", item_id):
            errors.append(issue("ITEM_ID", f"{path}.release_item_id", "release_item_id must use the release_item_ prefix."))
        elif item_id in entries:
            errors.append(issue("DUPLICATE_ITEM_ID", f"{path}.release_item_id", f"Duplicate release item ID {item_id}."))
        entries[item_id] = entry

        artifact = entry.get("artifact")
        if not isinstance(artifact, dict):
            errors.append(issue("ARTIFACT", f"{path}.artifact", "artifact must be an object."))
            artifact = {}
        if not HASH_PATTERN.fullmatch(str(artifact.get("content_hash") or "")):
            errors.append(issue("ARTIFACT_HASH", f"{path}.artifact.content_hash", "Artifact requires a SHA-256 hash."))
        if artifact.get("publication_state") != "ready":
            blockers.append(issue("ARTIFACT_NOT_READY", f"{path}.artifact.publication_state", "Only ready artifacts may enter an executable release."))
            item_blocker = True
        settlement_claim = artifact.get("settlement_claim")
        if settlement_claim is not None:
            if not isinstance(settlement_claim, dict):
                errors.append(issue("SETTLEMENT_CLAIM_REF", f"{path}.artifact.settlement_claim", "settlement_claim must be an object or null."))
                item_blocker = True
            else:
                if not re.fullmatch(r"SETTLE_[A-Za-z0-9_-]{8,}", str(settlement_claim.get("ref") or "")):
                    errors.append(issue("SETTLEMENT_CLAIM_REF", f"{path}.artifact.settlement_claim.ref", "Settlement claim reference is invalid."))
                    item_blocker = True
                if settlement_claim.get("schema_version") != "settlement-claim-v1":
                    errors.append(issue("SETTLEMENT_CLAIM_SCHEMA", f"{path}.artifact.settlement_claim.schema_version", "Expected settlement-claim-v1."))
                    item_blocker = True
                if not re.fullmatch(r"[a-f0-9]{64}", str(settlement_claim.get("canonical_hash") or "")):
                    blockers.append(issue("SETTLEMENT_CLAIM_HASH", f"{path}.artifact.settlement_claim.canonical_hash", "A frozen settlement claim requires its canonical hash."))
                    item_blocker = True
                if settlement_claim.get("state") != "frozen":
                    blockers.append(issue("SETTLEMENT_CLAIM_NOT_FROZEN", f"{path}.artifact.settlement_claim.state", "A release can bind only a frozen settlement claim."))
                    item_blocker = True
        settlement_formula = artifact.get("settlement_formula")
        if settlement_claim is not None and settlement_formula is None:
            blockers.append(issue("SETTLEMENT_FORMULA_REQUIRED", f"{path}.artifact.settlement_formula", "A settlement claim must ship with its frozen executable formula."))
            item_blocker = True
        if settlement_formula is not None and settlement_claim is None:
            errors.append(issue("SETTLEMENT_CLAIM_REQUIRED", f"{path}.artifact.settlement_claim", "A settlement formula must remain linked to its human-readable claim."))
            item_blocker = True
        if settlement_formula is not None:
            if not isinstance(settlement_formula, dict):
                errors.append(issue("SETTLEMENT_FORMULA_REF", f"{path}.artifact.settlement_formula", "settlement_formula must be an object or null."))
                item_blocker = True
            else:
                if not re.fullmatch(r"FORMULA_[A-Za-z0-9_-]{8,}", str(settlement_formula.get("ref") or "")):
                    errors.append(issue("SETTLEMENT_FORMULA_REF", f"{path}.artifact.settlement_formula.ref", "Settlement formula reference is invalid."))
                    item_blocker = True
                if settlement_formula.get("schema_version") != "settlement-formula-v1":
                    errors.append(issue("SETTLEMENT_FORMULA_SCHEMA", f"{path}.artifact.settlement_formula.schema_version", "Expected settlement-formula-v1."))
                    item_blocker = True
                if not re.fullmatch(r"[a-f0-9]{64}", str(settlement_formula.get("canonical_hash") or "")):
                    blockers.append(issue("SETTLEMENT_FORMULA_HASH", f"{path}.artifact.settlement_formula.canonical_hash", "A frozen settlement formula requires its canonical hash."))
                    item_blocker = True
                if settlement_formula.get("state") != "frozen":
                    blockers.append(issue("SETTLEMENT_FORMULA_NOT_FROZEN", f"{path}.artifact.settlement_formula.state", "A release can bind only a frozen settlement formula."))
                    item_blocker = True
                if isinstance(settlement_claim, dict):
                    if settlement_formula.get("claim_ref") != settlement_claim.get("ref"):
                        errors.append(issue("SETTLEMENT_PROTOCOL_REF_MISMATCH", f"{path}.artifact.settlement_formula.claim_ref", "Formula claim_ref must match the bound settlement claim."))
                        item_blocker = True
                    if settlement_formula.get("claim_hash") != settlement_claim.get("canonical_hash"):
                        errors.append(issue("SETTLEMENT_PROTOCOL_HASH_MISMATCH", f"{path}.artifact.settlement_formula.claim_hash", "Formula claim_hash must match the bound settlement claim hash."))
                        item_blocker = True

        payload = entry.get("payload")
        if not isinstance(payload, dict):
            errors.append(issue("PAYLOAD", f"{path}.payload", "payload must be an object."))
            payload = {}
        if not HASH_PATTERN.fullmatch(str(payload.get("payload_hash") or "")):
            errors.append(issue("PAYLOAD_HASH", f"{path}.payload.payload_hash", "Frozen payload requires a SHA-256 hash."))
        if not str(payload.get("preview_ref") or "").strip():
            errors.append(issue("PREVIEW_REF", f"{path}.payload.preview_ref", "A human-reviewable preview reference is required."))
        asset_refs = payload.get("asset_refs")
        if not isinstance(asset_refs, list):
            errors.append(issue("ASSET_REFS", f"{path}.payload.asset_refs", "asset_refs must be an array."))
            asset_refs = []
        asset_ids: set[str] = set()
        for asset_index, asset in enumerate(asset_refs):
            asset_path = f"{path}.payload.asset_refs[{asset_index}]"
            if not isinstance(asset, dict):
                errors.append(issue("ASSET_REF", asset_path, "Asset reference must be an object."))
                item_blocker = True
                continue
            asset_id = str(asset.get("asset_id") or "")
            if not asset_id or asset_id in asset_ids:
                errors.append(issue("ASSET_ID", f"{asset_path}.asset_id", "Asset IDs must be non-empty and unique per item."))
            asset_ids.add(asset_id)
            if asset.get("rights") != "reusable":
                blockers.append(issue("ASSET_RIGHTS", f"{asset_path}.rights", "Release assets require explicit reusable rights."))
                item_blocker = True
            if not HASH_PATTERN.fullmatch(str(asset.get("content_hash") or "")):
                blockers.append(issue("ASSET_HASH", f"{asset_path}.content_hash", "Release assets require a SHA-256 hash."))
                item_blocker = True

        platform = str(entry.get("platform") or "")
        mode = entry.get("execution_mode")
        if mode not in EXECUTION_MODES:
            errors.append(issue("EXECUTION_MODE", f"{path}.execution_mode", "Unsupported execution mode."))
            item_blocker = True

        capability = entry.get("capability")
        if not isinstance(capability, dict):
            errors.append(issue("CAPABILITY", f"{path}.capability", "capability must be an object."))
            capability = {}
        capability_status = capability.get("status")
        capability_time = parse_time(capability.get("checked_at"))
        capability_url = capability.get("official_source_url")
        adapter_id = str(capability.get("adapter_id") or "").strip()
        supports = capability.get("supports") if isinstance(capability.get("supports"), dict) else {}
        automated = mode in {"platform_draft", "api_direct", "api_scheduled"}
        if platform == "website":
            discovery = entry.get("web_discovery_gate")
            if not isinstance(discovery, dict):
                blockers.append(issue("WEB_DISCOVERY_GATE", f"{path}.web_discovery_gate", "Owned-web release requires Cuebook SEO and optional GEO preflight references."))
                item_blocker = True
            else:
                if discovery.get("seo_state") != "pass" or not re.fullmatch(r"seo_pack_[a-f0-9]{16}", str(discovery.get("seo_pack_ref") or "")):
                    blockers.append(issue("WEBSITE_SEO_PREFLIGHT", f"{path}.web_discovery_gate", "Owned-web release requires a passing MarketSEOPackV1 preflight."))
                    item_blocker = True
                geo_state = discovery.get("geo_state")
                geo_ref = discovery.get("geo_pack_ref")
                if geo_state == "pass" and not re.fullmatch(r"geo_pack_[a-f0-9]{16}", str(geo_ref or "")):
                    errors.append(issue("WEBSITE_GEO_REF", f"{path}.web_discovery_gate.geo_pack_ref", "A passing GEO state requires a MarketGEOPackV1 reference."))
                    item_blocker = True
                if geo_state == "not_requested" and geo_ref is not None:
                    errors.append(issue("WEBSITE_GEO_UNUSED_REF", f"{path}.web_discovery_gate.geo_pack_ref", "geo_pack_ref must be null when GEO was not requested."))
                    item_blocker = True
                if geo_state in {"conditional", "blocked"}:
                    blockers.append(issue("WEBSITE_GEO_PREFLIGHT", f"{path}.web_discovery_gate.geo_state", "A requested GEO module must pass before release readiness."))
                    item_blocker = True
            if automated:
                blockers.append(issue("WEBSITE_MANUAL_DEFAULT", f"{path}.execution_mode", "Website and CMS execution defaults to manual handoff until an owned adapter and its official capability are modeled."))
                item_blocker = True
        elif "web_discovery_gate" in entry:
            errors.append(issue("WEB_DISCOVERY_SCOPE", f"{path}.web_discovery_gate", "web_discovery_gate applies only to owned-web releases."))
            item_blocker = True
        if automated:
            if capability_status != "verified":
                blockers.append(issue("CAPABILITY_UNVERIFIED", f"{path}.capability.status", "Automated execution requires verified account capability."))
                item_blocker = True
            if capability_time is None:
                blockers.append(issue("CAPABILITY_TIME", f"{path}.capability.checked_at", "Automated execution requires a capability check timestamp."))
                item_blocker = True
            elif prepared_at and (prepared_at - capability_time).total_seconds() > 30 * 86400:
                blockers.append(issue("CAPABILITY_STALE", f"{path}.capability.checked_at", "Capability check older than 30 days cannot support release."))
                item_blocker = True
            if not host_is_official(platform, capability_url):
                blockers.append(issue("CAPABILITY_SOURCE", f"{path}.capability.official_source_url", "Automated execution requires current official platform documentation."))
                item_blocker = True
            if not adapter_id:
                blockers.append(issue("ADAPTER_REQUIRED", f"{path}.capability.adapter_id", "Automated execution requires a named adapter."))
                item_blocker = True
            required_support = "draft" if mode == "platform_draft" else "schedule" if mode == "api_scheduled" else "create"
            if supports.get(required_support) is not True:
                blockers.append(issue("CAPABILITY_OPERATION", f"{path}.capability.supports.{required_support}", f"Capability does not support {required_support}."))
                item_blocker = True
            if mode == "api_scheduled" and supports.get("create") is not True:
                blockers.append(issue("CAPABILITY_CREATE", f"{path}.capability.supports.create", "Scheduled execution also requires create support."))
                item_blocker = True
        if platform == "seeking_alpha" and mode != "manual_handoff":
            blockers.append(issue("SEEKING_ALPHA_MODE", f"{path}.execution_mode", "Seeking Alpha cannot use an automated release mode for AI-assisted content."))
            item_blocker = True
        if platform == "xiaohongshu" and automated and not host_is_official("xiaohongshu", capability_url):
            blockers.append(issue("XHS_MANUAL_DEFAULT", f"{path}.execution_mode", "Xiaohongshu defaults to manual handoff until an official account-specific publishing capability is verified."))
            item_blocker = True

        policy = entry.get("policy")
        if not isinstance(policy, dict):
            errors.append(issue("POLICY", f"{path}.policy", "policy must be an object."))
            policy = {}
        if policy.get("decision") != "ready":
            blockers.append(issue("POLICY_NOT_READY", f"{path}.policy.decision", "Conditional or blocked policy cannot support release."))
            item_blocker = True
        policy_time = parse_time(policy.get("checked_at"))
        if policy_time is None:
            blockers.append(issue("POLICY_TIME", f"{path}.policy.checked_at", "A policy check timestamp is required."))
            item_blocker = True
        elif prepared_at and (prepared_at - policy_time).total_seconds() > 30 * 86400:
            blockers.append(issue("POLICY_STALE", f"{path}.policy.checked_at", "Policy check older than 30 days cannot support release."))
            item_blocker = True
        source_urls = policy.get("source_urls")
        if not isinstance(source_urls, list) or not source_urls or any(not str(url).startswith(("https://", "http://")) for url in source_urls):
            blockers.append(issue("POLICY_SOURCES", f"{path}.policy.source_urls", "Policy snapshot requires at least one source URL."))
            item_blocker = True

        approvals = entry.get("approvals")
        if not isinstance(approvals, dict):
            errors.append(issue("APPROVALS", f"{path}.approvals", "approvals must contain content and release approval."))
            approvals = {}
        content_status, content_time = validate_approval(approvals.get("content"), f"{path}.approvals.content", errors)
        release_status, release_time = validate_approval(approvals.get("release"), f"{path}.approvals.release", errors)
        if content_status == "rejected" or release_status == "rejected":
            blockers.append(issue("APPROVAL_REJECTED", f"{path}.approvals", "Rejected content or release approval blocks execution."))
            item_blocker = True
        elif content_status != "approved" or release_status != "approved":
            has_pending = True
        if content_time and release_time and release_time < content_time:
            errors.append(issue("APPROVAL_ORDER", f"{path}.approvals.release.approved_at", "Release approval cannot precede content approval."))
            item_blocker = True

        schedule = entry.get("schedule")
        if not isinstance(schedule, dict):
            errors.append(issue("SCHEDULE", f"{path}.schedule", "schedule must be an object."))
            schedule = {}
        publish_at = parse_time(schedule.get("publish_at"))
        embargo_until = parse_time(schedule.get("embargo_until"))
        expires_at = parse_time(schedule.get("expires_at"))
        has_schedule_value = any(schedule.get(key) is not None for key in ("publish_at", "embargo_until", "expires_at"))
        if has_schedule_value and not str(schedule.get("timezone") or "").strip():
            errors.append(issue("SCHEDULE_TIMEZONE", f"{path}.schedule.timezone", "Scheduled or expiring items require a timezone."))
            item_blocker = True
        for field, parsed in (("publish_at", publish_at), ("embargo_until", embargo_until), ("expires_at", expires_at)):
            if schedule.get(field) is not None and parsed is None:
                errors.append(issue("SCHEDULE_TIME", f"{path}.schedule.{field}", f"{field} must be parseable or null."))
                item_blocker = True
        if mode == "api_scheduled" and publish_at is None:
            errors.append(issue("PUBLISH_AT_REQUIRED", f"{path}.schedule.publish_at", "api_scheduled requires publish_at."))
            item_blocker = True
        if publish_at and prepared_at and publish_at <= prepared_at:
            blockers.append(issue("PUBLISH_IN_PAST", f"{path}.schedule.publish_at", "publish_at must follow prepared_at."))
            item_blocker = True
        if publish_at and embargo_until and publish_at < embargo_until:
            blockers.append(issue("EMBARGO_ORDER", f"{path}.schedule.publish_at", "publish_at cannot precede embargo_until."))
            item_blocker = True
        if publish_at and expires_at and publish_at >= expires_at:
            blockers.append(issue("EXPIRY_ORDER", f"{path}.schedule.expires_at", "Content must publish before it expires."))
            item_blocker = True

        idempotency = entry.get("idempotency_key")
        if automated:
            if not isinstance(idempotency, str) or len(idempotency.strip()) < 12:
                blockers.append(issue("IDEMPOTENCY_REQUIRED", f"{path}.idempotency_key", "Automated execution requires a stable idempotency key of at least 12 characters."))
                item_blocker = True
            elif idempotency in idempotency_keys:
                errors.append(issue("DUPLICATE_IDEMPOTENCY", f"{path}.idempotency_key", "Idempotency keys must be unique within a bundle."))
                item_blocker = True
            else:
                idempotency_keys.add(idempotency)
        elif idempotency is not None:
            warnings.append(issue("UNUSED_IDEMPOTENCY", f"{path}.idempotency_key", "Manual handoff does not require an API idempotency key."))

        handoff = entry.get("manual_handoff")
        if not isinstance(handoff, dict):
            errors.append(issue("MANUAL_HANDOFF", f"{path}.manual_handoff", "manual_handoff must be an object."))
            handoff = {}
        if mode == "manual_handoff":
            if handoff.get("required") is not True or not str(handoff.get("handoff_ref") or "").strip() or not handoff.get("checklist"):
                blockers.append(issue("HANDOFF_PACKAGE", f"{path}.manual_handoff", "Manual mode requires a handoff reference and checklist."))
                item_blocker = True
        elif handoff.get("required") is not False:
            errors.append(issue("HANDOFF_MODE", f"{path}.manual_handoff.required", "Automated modes must set manual_handoff.required to false."))

        rollback = entry.get("rollback")
        if not isinstance(rollback, dict):
            errors.append(issue("ROLLBACK", f"{path}.rollback", "rollback must be an object."))
            rollback = {}
        if mode == "manual_handoff" and rollback.get("mode") not in {"manual", "none"}:
            errors.append(issue("ROLLBACK_MODE", f"{path}.rollback.mode", "Manual handoff cannot claim API rollback."))
            item_blocker = True
        if automated and rollback.get("mode") == "api":
            if rollback.get("edit_supported") and supports.get("edit") is not True:
                errors.append(issue("ROLLBACK_EDIT", f"{path}.rollback.edit_supported", "Rollback claims edit support that capability does not provide."))
                item_blocker = True
            if rollback.get("delete_supported") and supports.get("delete") is not True:
                errors.append(issue("ROLLBACK_DELETE", f"{path}.rollback.delete_supported", "Rollback claims delete support that capability does not provide."))
                item_blocker = True

        preflight = entry.get("preflight")
        if not isinstance(preflight, dict) or preflight.get("status") not in {"pass", "caution", "block"}:
            errors.append(issue("PREFLIGHT", f"{path}.preflight", "preflight must have pass, caution, or block status."))
            item_blocker = True
        elif preflight.get("status") != "pass":
            blockers.append(issue("PREFLIGHT_NOT_READY", f"{path}.preflight.status", "Only passing preflight can support release."))
            item_blocker = True
        elif item_blocker:
            errors.append(issue("PREFLIGHT_INCONSISTENT", f"{path}.preflight.status", "Preflight cannot pass while another release blocker is present."))

        dependencies = entry.get("depends_on")
        if not isinstance(dependencies, list):
            errors.append(issue("DEPENDENCIES", f"{path}.depends_on", "depends_on must be an array."))
            dependencies = []
        edges[item_id] = {value for value in dependencies if isinstance(value, str)}
        has_blocker = has_blocker or item_blocker

    item_ids = set(entries)
    for item_id, dependencies in edges.items():
        unknown = dependencies - item_ids
        if unknown:
            errors.append(issue("UNKNOWN_DEPENDENCY", f"$.items[{item_id}].depends_on", f"Unknown dependencies: {sorted(unknown)}."))
            has_blocker = True
        if item_id in dependencies:
            errors.append(issue("SELF_DEPENDENCY", f"$.items[{item_id}].depends_on", "A release item cannot depend on itself."))
            has_blocker = True
    cycle = find_cycle(item_ids, edges)
    if cycle:
        errors.append(issue("DEPENDENCY_CYCLE", "$.items", "Dependency cycle: " + " -> ".join(cycle)))
        has_blocker = True

    quality = item.get("quality_report")
    if not isinstance(quality, dict) or not {"scores", "hard_failures", "revisions"}.issubset(quality):
        errors.append(issue("QUALITY_REPORT", "$.quality_report", "quality_report is incomplete."))
    elif quality.get("hard_failures"):
        blockers.append(issue("QUALITY_HARD_FAILURE", "$.quality_report.hard_failures", "Quality hard failures block release."))
        has_blocker = True

    expected_state = "blocked" if has_blocker else "needs_approval" if has_pending else "ready"
    if item.get("release_state") != expected_state:
        errors.append(issue("RELEASE_STATE", "$.release_state", f"Bundle conditions require {expected_state}."))

    return {"valid": not errors, "errors": errors, "blockers": blockers, "warnings": warnings, "computed_release_state": expected_state}


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate ReleaseBundleV1 artifacts")
    parser.add_argument("json_file", nargs="?", help="ReleaseBundleV1 JSON or array; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else sys.stdin.read()
    payload = json.loads(raw)
    output = [validate(entry) for entry in payload] if isinstance(payload, list) else validate(payload)
    print(json.dumps(output, ensure_ascii=False, indent=2))
    results = output if isinstance(output, list) else [output]
    raise SystemExit(0 if all(result["valid"] for result in results) else 1)


if __name__ == "__main__":
    main()
