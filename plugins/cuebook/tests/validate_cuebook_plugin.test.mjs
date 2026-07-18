import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validate } from "../scripts/validate_cuebook_plugin.mjs";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function codes(result) {
  return new Set(result.errors.map((error) => error.code));
}

function withTmpPath(fn) {
  const tmpPath = fs.mkdtempSync(path.join(os.tmpdir(), "cuebook-plugin-test-"));
  try {
    return fn(tmpPath);
  } finally {
    fs.rmSync(tmpPath, { recursive: true, force: true });
  }
}

function copiedPlugin(tmpPath) {
  const target = path.join(tmpPath, "cuebook");
  fs.cpSync(PLUGIN_ROOT, target, { recursive: true });
  return target;
}

function rewrite(filePath, mutate) {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  mutate(payload);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + "\n");
}

test("valid plugin package", () => {
  const result = validate(PLUGIN_ROOT);
  assert.ok(result.valid, JSON.stringify(result));
  assert.deepEqual(result.stats.module_skill_counts, { create: 27, query: 11 });
  assert.equal(result.stats.public_skill_count, 2);
  assert.ok(result.stats.discovery_reduction_percent >= 60);
  assert.ok(result.stats.frame_fast_preview_bytes < 150_000);
  const modules = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "cuebook-modules-v1.json"), "utf-8"),
  );
  assert.ok(modules.routing_rules.query_deliverables.includes("factual_chart"));
  assert.ok(modules.routing_rules.create_deliverables.includes("creator_viewpoint_graphic"));
});

test("plugin discovery points only at the two generated public Skills", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, ".codex-plugin", "plugin.json"), "utf-8"),
  );
  assert.equal(manifest.skills, "./public-skills/");
  const publicRoot = path.join(PLUGIN_ROOT, "public-skills");
  const skillDocs = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === "SKILL.md") skillDocs.push(path.relative(publicRoot, target));
    }
  };
  walk(publicRoot);
  assert.deepEqual(skillDocs.sort(), [
    "create-cuebook-content/SKILL.md",
    "query-cuebook/SKILL.md",
  ]);
});

test("active, planned, and superseded tool surfaces stay separate", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const active = new Set([...payload.available_tools, ...payload.required_tools].map((item) => item.tool));
  assert.equal(payload.required_tools.length, 17);
  assert.deepEqual(new Set(payload.planned_tools.map((item) => item.tool)), new Set([
    "get_creator_feed",
    "compute_market_metrics",
    "publish_release",
    "get_publication_receipt",
  ]));
  for (const tool of payload.planned_tools) assert.ok(!active.has(tool.tool));
  for (const tool of ["resolve_settlement_binding", "save_creator_artifact", "register_settlement_claim"]) {
    assert.ok(!active.has(tool));
    assert.ok(!payload.planned_tools.some((item) => item.tool === tool));
  }
});

test("creator fast policy keeps graph deep and Web fallback bounded", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const policy = payload.skill_tool_policy;
  assert.ok(!policy.creator_fast_allowlist.includes("get_reasoning_graph"));
  assert.ok(policy.deep_only.includes("get_reasoning_graph"));
  assert.deepEqual(policy.web_fallback, {
    trigger: "material_gap_after_cuebook_batch",
    max_batches: 1,
    max_queries: 3,
    max_sources: 3,
    source_preference: "primary_or_authoritative",
    required_lineage_fields: ["retrieved_via", "retrieved_at", "locator"],
    unsupported_claim_policy: "creator_hypothesis_or_omit",
  });
});

test("query cannot invoke create", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "cuebook-modules-v1.json");
    rewrite(filePath, (payload) => {
      payload.modules[0].may_invoke = ["create"];
    });
    assert.ok(codes(validate(root)).has("QUERY_DEPENDENCY"));
  });
});

test("query menu rejects write tool", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "query-menu-v1.json");
    rewrite(filePath, (payload) => {
      payload.queries[0].mcp_tools.push("publish_frame");
    });
    assert.ok(codes(validate(root)).has("QUERY_WRITE_TOOL"));
  });
});

test("search_news and paper preview scopes match the backend", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const active = new Map([...payload.available_tools, ...payload.required_tools].map((item) => [item.tool, item]));
  assert.equal(active.get("search_news").authorization_scope, "read:public");
  assert.equal(active.get("preview_paper_order").authorization_scope, "cuebook.paper.trade");
});

test("skills cannot belong to both modules", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "cuebook-modules-v1.json");
    rewrite(filePath, (payload) => {
      payload.modules[0].skill_refs.push("create-cuebook-content");
    });
    assert.ok(codes(validate(root)).has("MODULE_SKILL_OVERLAP"));
  });
});

test("query skill cannot invoke create skill", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "query-cuebook", "SKILL.md");
    fs.writeFileSync(filePath, fs.readFileSync(filePath, "utf-8") + "\nInvoke $create-cuebook-content.\n");
    assert.ok(codes(validate(root)).has("QUERY_SKILL_EDGE"));
  });
});

test("Frame MCP tool set cannot lose a frozen operation", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.required_tools = payload.required_tools.filter((item) => item.tool !== "publish_frame");
    });
    assert.ok(codes(validate(root)).has("FRAME_TOOL_SET"));
  });
});

test("Frame MCP contract rejects independent media retrieval", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      const status = payload.required_tools.find((item) => ["get_frame_media", "get_frame_media_status"].includes(item.tool));
      status.tool = "get_frame_media";
    });
    assert.ok(codes(validate(root)).has("FRAME_MEDIA_TOOL"));
  });
});

test("Frame MCP tools retain their least-privilege scopes", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.required_tools.find((item) => item.tool === "publish_frame").authorization_scope = "cuebook.frame.write";
    });
    assert.ok(codes(validate(root)).has("FRAME_TOOL_SCOPE"));
  });
});

test("create_frame_draft requires assembly plus registered binding", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.required_tools.find((item) => item.tool === "create_frame_draft").input_contract = "FrameDraftV1";
    });
    assert.ok(codes(validate(root)).has("FRAME_DRAFT_INPUT"));
  });
});

test("Frame publication flow cannot become pull-based", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.frame_publication_flow = {
        ...(payload.frame_publication_flow ?? {}),
        image_transport: "download_then_publish",
      };
    });
    assert.ok(codes(validate(root)).has("FRAME_FLOW_CONTRACT"));
  });
});

test("initial and correction publish skip separate consent while withdrawal retains it", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const flow = payload.frame_publication_flow;
  assert.deepEqual(flow.initial_publish_sequence.slice(-3), [
    "prepare_frame_publish",
    "publish_frame",
    "get_frame",
  ]);
  assert.deepEqual(flow.correction_publish_sequence, [
    "prepare_frame_correction_publish",
    "publish_frame_correction",
    "get_frame",
  ]);
  assert.deepEqual(flow.withdraw_sequence, [
    "prepare_frame_withdraw",
    "first_party_consent",
    "get_frame_action_consent",
    "withdraw_frame",
  ]);
  assert.equal(flow.action_consent_usage, "withdrawal_only");
});

test("Frame publish contract pins consentless prepared and input fields", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  const flow = payload.frame_publication_flow;
  assert.deepEqual(flow.prepared_publish_required_fields, [
    "prepared_hash",
    "publish_token",
    "publish_token_expires_at",
    "preview",
  ]);
  assert.deepEqual(flow.prepared_correction_publish_required_fields, [
    "prepared_hash",
    "publish_token",
    "publish_token_expires_at",
    "preview",
    "base_release_id",
    "expected_economic_hash",
  ]);
  assert.deepEqual(flow.prepared_publish_omitted_fields, [
    "consent_request_id",
    "consent_url",
    "consent_expires_at",
  ]);
  assert.deepEqual(flow.publish_input_omitted_fields, ["consent_request_id"]);
});

test("Frame capability map pins the current backend wire goldens", () => {
  const payload = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "mcp-capability-map-v1.json"), "utf-8"),
  );
  assert.deepEqual(payload.frame_publication_flow.wire_golden, {
    tool_manifest_sha256: "bf4464c25623d9d44dd16f08dbb51a9cbb91e3062c813ed1c3941403d65289a2",
    schema_catalog_sha256: "ba0729ca77e4b44864850a1fed1346f2fa758c646e4e6c63993cae26c326e4fa",
  });
});

test("Frame flow rejects reintroduced publish consent", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      const sequence = payload.frame_publication_flow.initial_publish_sequence;
      sequence.splice(sequence.indexOf("publish_frame"), 0, "get_frame_action_consent");
    });
    assert.ok(codes(validate(root)).has("FRAME_FLOW_CONTRACT"));
  });
});

test("Frame flow rejects withdrawal without action consent", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "assets", "mcp-capability-map-v1.json");
    rewrite(filePath, (payload) => {
      payload.frame_publication_flow.withdraw_sequence = [
        "prepare_frame_withdraw",
        "withdraw_frame",
      ];
    });
    assert.ok(codes(validate(root)).has("FRAME_FLOW_CONTRACT"));
  });
});

test("Frame entry skills describe consentless publish and withdrawal-only consent", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const orchestrate = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "orchestrate-cuebook-creator-workflow", "SKILL.md"),
    "utf-8",
  );
  assert.match(create, /prepare_frame_publish.*publish_frame/u);
  assert.match(create, /Withdrawals alone retain/u);
  assert.match(orchestrate, /Do not request or poll separate action consent for initial publication/u);
  assert.match(orchestrate, /Withdrawal still requires approved first-party consent/u);
  assert.doesNotMatch(create, /prepare → first-party consent bound to `prepared_hash` → publish/u);
});

test("Skill instructions cannot reintroduce get_frame_media", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "create-cuebook-content", "SKILL.md");
    fs.writeFileSync(filePath, `${fs.readFileSync(filePath, "utf-8")}\nCall \`get_frame_media\` to fetch the image.\n`);
    assert.ok(codes(validate(root)).has("FRAME_SKILL_MEDIA_PULL"));
  });
});
