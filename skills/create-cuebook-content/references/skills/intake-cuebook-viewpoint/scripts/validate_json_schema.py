#!/usr/bin/env python3
"""Small dependency-free validator for the JSON Schema features used by Cuebook."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any


def issue(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "null":
        return value is None
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    return False


def _valid_datetime(value: str) -> bool:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _resolve_ref(root_schema: dict[str, Any], ref: str) -> dict[str, Any] | None:
    if not ref.startswith("#/"):
        return None
    node: Any = root_schema
    for raw_part in ref[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node if isinstance(node, dict) else None


def validate_instance(
    instance: Any,
    schema: dict[str, Any],
    path: str = "$",
    root_schema: dict[str, Any] | None = None,
) -> list[dict[str, str]]:
    """Validate one instance without requiring the third-party jsonschema package."""

    errors: list[dict[str, str]] = []
    root_schema = root_schema or schema
    if isinstance(schema.get("$ref"), str):
        resolved = _resolve_ref(root_schema, schema["$ref"])
        if resolved is None:
            return [issue("SCHEMA_REF", path, f"Cannot resolve {schema['$ref']!r}.")]
        return validate_instance(instance, resolved, path, root_schema)
    expected = schema.get("type")
    expected_types = [expected] if isinstance(expected, str) else expected
    if isinstance(expected_types, list) and not any(_matches_type(instance, item) for item in expected_types):
        errors.append(issue("SCHEMA_TYPE", path, f"Expected type {expected_types!r}."))
        return errors

    if "const" in schema and instance != schema["const"]:
        errors.append(issue("SCHEMA_CONST", path, f"Expected constant {schema['const']!r}."))
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(issue("SCHEMA_ENUM", path, f"Value must be one of {schema['enum']!r}."))

    if isinstance(instance, dict):
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        for key in required:
            if key not in instance:
                errors.append(issue("SCHEMA_REQUIRED", f"{path}.{key}", "Required field is missing."))
        if schema.get("additionalProperties") is False:
            for key in instance.keys() - properties.keys():
                errors.append(issue("SCHEMA_ADDITIONAL_PROPERTY", f"{path}.{key}", "Unknown field is not allowed."))
        for key, value in instance.items():
            child_schema = properties.get(key)
            if isinstance(child_schema, dict):
                errors.extend(validate_instance(value, child_schema, f"{path}.{key}", root_schema))

    if isinstance(instance, list):
        if isinstance(schema.get("minItems"), int) and len(instance) < schema["minItems"]:
            errors.append(issue("SCHEMA_MIN_ITEMS", path, f"At least {schema['minItems']} items are required."))
        if isinstance(schema.get("maxItems"), int) and len(instance) > schema["maxItems"]:
            errors.append(issue("SCHEMA_MAX_ITEMS", path, f"At most {schema['maxItems']} items are allowed."))
        if schema.get("uniqueItems"):
            frozen = [json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")) for item in instance]
            if len(frozen) != len(set(frozen)):
                errors.append(issue("SCHEMA_UNIQUE_ITEMS", path, "Array items must be unique."))
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for index, value in enumerate(instance):
                errors.extend(validate_instance(value, item_schema, f"{path}[{index}]", root_schema))

    if isinstance(instance, str):
        if isinstance(schema.get("minLength"), int) and len(instance) < schema["minLength"]:
            errors.append(issue("SCHEMA_MIN_LENGTH", path, f"String must contain at least {schema['minLength']} characters."))
        if isinstance(schema.get("pattern"), str) and re.search(schema["pattern"], instance) is None:
            errors.append(issue("SCHEMA_PATTERN", path, f"String does not match {schema['pattern']!r}."))
        if schema.get("format") == "date-time" and not _valid_datetime(instance):
            errors.append(issue("SCHEMA_DATETIME", path, "Timezone-aware ISO date-time required."))

    return errors
