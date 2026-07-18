#!/usr/bin/env node
// Small dependency-free validator for the JSON Schema features used by Cuebook.
// Port of validate_json_schema.py; error codes, paths, and message formats are
// contract and must stay byte-compatible with the Python originals (pyrepr
// reproduces Python's !r formatting for interpolated values).

export function issue(code, path, message) {
  return { code, path, message };
}

// Reproduce Python repr() for the JSON value types that appear in messages.
export function pyrepr(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  if (typeof value === "string") {
    const hasSingle = value.includes("'");
    const hasDouble = value.includes('"');
    const quote = hasSingle && !hasDouble ? '"' : "'";
    let out = quote;
    for (const ch of value) {
      const code = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += `\\${quote}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return out + quote;
  }
  if (Array.isArray(value)) return `[${value.map(pyrepr).join(", ")}]`;
  if (typeof value === "object") {
    const parts = Object.entries(value).map(([k, v]) => `${pyrepr(k)}: ${pyrepr(v)}`);
    return `{${parts.join(", ")}}`;
  }
  return String(value);
}

// json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"))
export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

function matchesType(value, expected) {
  if (expected === "null") return value === null;
  if (expected === "boolean") return typeof value === "boolean";
  if (expected === "integer") return typeof value === "number" && Number.isInteger(value);
  if (expected === "number") return typeof value === "number";
  if (expected === "string") return typeof value === "string";
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return false;
}

const DATETIME_PATTERN = new RegExp(
  "^\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d{1,6})?)?" +
  "(Z|[+-]\\d{2}:\\d{2}(:\\d{2})?)$",
);

function validDatetime(value) {
  const normalized = value.replace("Z", "+00:00");
  if (!DATETIME_PATTERN.test(value)) return false;
  const probe = normalized.replace(" ", "T");
  const time = Date.parse(probe);
  return Number.isFinite(time);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a && b && typeof a === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
  }
  return false;
}

function resolveRef(rootSchema, ref) {
  if (!ref.startsWith("#/")) return null;
  let node = rootSchema;
  for (const rawPart of ref.slice(2).split("/")) {
    const part = rawPart.replaceAll("~1", "/").replaceAll("~0", "~");
    if (node === null || typeof node !== "object" || Array.isArray(node) || !Object.hasOwn(node, part)) return null;
    node = node[part];
  }
  return node !== null && typeof node === "object" && !Array.isArray(node) ? node : null;
}

export function validateInstance(instance, schema, path = "$", rootSchema = null) {
  const errors = [];
  const root = rootSchema || schema;
  if (typeof schema.$ref === "string") {
    const resolved = resolveRef(root, schema.$ref);
    if (resolved === null) {
      return [issue("SCHEMA_REF", path, `Cannot resolve ${pyrepr(schema.$ref)}.`)];
    }
    return validateInstance(instance, resolved, path, root);
  }
  const expected = schema.type;
  const expectedTypes = typeof expected === "string" ? [expected] : expected;
  if (Array.isArray(expectedTypes) && !expectedTypes.some((item) => matchesType(instance, item))) {
    errors.push(issue("SCHEMA_TYPE", path, `Expected type ${pyrepr(expectedTypes)}.`));
    return errors;
  }

  if (Object.hasOwn(schema, "const") && !deepEqual(instance, schema.const)) {
    errors.push(issue("SCHEMA_CONST", path, `Expected constant ${pyrepr(schema.const)}.`));
  }
  if (Object.hasOwn(schema, "enum") && !schema.enum.some((item) => deepEqual(instance, item))) {
    errors.push(issue("SCHEMA_ENUM", path, `Value must be one of ${pyrepr(schema.enum)}.`));
  }

  if (instance !== null && typeof instance === "object" && !Array.isArray(instance)) {
    const properties = schema.properties || {};
    const required = schema.required || [];
    for (const key of required) {
      if (!Object.hasOwn(instance, key)) {
        errors.push(issue("SCHEMA_REQUIRED", `${path}.${key}`, "Required field is missing."));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(instance)) {
        if (!Object.hasOwn(properties, key)) {
          errors.push(issue("SCHEMA_ADDITIONAL_PROPERTY", `${path}.${key}`, "Unknown field is not allowed."));
        }
      }
    }
    for (const [key, value] of Object.entries(instance)) {
      const childSchema = properties[key];
      if (childSchema !== null && typeof childSchema === "object" && !Array.isArray(childSchema)) {
        errors.push(...validateInstance(value, childSchema, `${path}.${key}`, root));
      }
    }
  }

  if (Array.isArray(instance)) {
    if (Number.isInteger(schema.minItems) && instance.length < schema.minItems) {
      errors.push(issue("SCHEMA_MIN_ITEMS", path, `At least ${schema.minItems} items are required.`));
    }
    if (Number.isInteger(schema.maxItems) && instance.length > schema.maxItems) {
      errors.push(issue("SCHEMA_MAX_ITEMS", path, `At most ${schema.maxItems} items are allowed.`));
    }
    if (schema.uniqueItems) {
      const frozen = instance.map((item) => canonicalJson(item));
      if (new Set(frozen).size !== frozen.length) {
        errors.push(issue("SCHEMA_UNIQUE_ITEMS", path, "Array items must be unique."));
      }
    }
    const itemSchema = schema.items;
    if (itemSchema !== null && typeof itemSchema === "object" && !Array.isArray(itemSchema)) {
      instance.forEach((value, index) => {
        errors.push(...validateInstance(value, itemSchema, `${path}[${index}]`, root));
      });
    }
  }

  if (typeof instance === "string") {
    if (Number.isInteger(schema.minLength) && [...instance].length < schema.minLength) {
      errors.push(issue("SCHEMA_MIN_LENGTH", path, `String must contain at least ${schema.minLength} characters.`));
    }
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(instance)) {
      errors.push(issue("SCHEMA_PATTERN", path, `String does not match ${pyrepr(schema.pattern)}.`));
    }
    if (schema.format === "date-time" && !validDatetime(instance)) {
      errors.push(issue("SCHEMA_DATETIME", path, "Timezone-aware ISO date-time required."));
    }
  }

  return errors;
}
