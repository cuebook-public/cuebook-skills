#!/usr/bin/env node
// Validate the single end-of-task memory proposal: candidate-only semantics,
// grounded sources or one bounded attestation, and no instruction payloads.

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateInstance } from "../../../scripts/validate_json_schema.mjs";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../references/memory-proposal-v1.schema.json", import.meta.url), "utf8"),
);

export function validate(proposal) {
  const errors = validateInstance(proposal, SCHEMA).map((issue) => ({
    code: "SCHEMA",
    message: issue,
  }));
  if (errors.length === 0) {
    if (/```|~~~|<\/?[a-z][^>]*>/iu.test(proposal.summary)) {
      errors.push({
        code: "SUMMARY_CONTAINS_MARKUP",
        message: "the summary must be one plain sentence: no fenced blocks, no HTML/instruction markup",
      });
    }
    const refs = proposal.source_refs ?? [];
    if (refs.length === 0 && !proposal.client_attestation) {
      errors.push({
        code: "MISSING_EVIDENCE",
        message: "a proposal needs at least one cuebook:// source ref or one client attestation",
      });
    }
    if (new Set(refs).size !== refs.length) {
      errors.push({ code: "DUPLICATE_SOURCE_REF", message: "source refs must be unique" });
    }
    if (
      proposal.kind === "decision_pattern" &&
      proposal.client_observed_user_intent !== "explicit"
    ) {
      errors.push({
        code: "PATTERN_NEEDS_EXPLICIT_INTENT",
        message:
          "a decision_pattern claim from one task is not proposable unless the creator explicitly asked; patterns normally come from the server-side multi-episode compiler",
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

function main(argv) {
  const input = argv[0];
  if (!input) {
    process.stderr.write("Usage: validate_memory_proposal.mjs memory-proposal-v1.json\n");
    process.exitCode = 1;
    return;
  }
  const result = validate(JSON.parse(readFileSync(input, "utf8")));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
