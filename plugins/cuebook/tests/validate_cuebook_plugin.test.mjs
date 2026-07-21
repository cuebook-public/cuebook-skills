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
  assert.ok(result.stats.frame_fast_preview_bytes < 110_000);
  assert.ok(result.stats.frame_publish_input_bytes < 40_000);
  assert.equal(result.stats.platform_guide_count, 10);
  const modules = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "cuebook-modules-v1.json"), "utf-8"),
  );
  assert.ok(modules.routing_rules.query_deliverables.includes("factual_chart"));
  assert.ok(modules.routing_rules.create_deliverables.includes("creator_viewpoint_graphic"));
});

test("Claude Code marketplace reuses the two public Skills and canonical MCP config", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, ".claude-plugin", "marketplace.json"), "utf-8"),
  );
  assert.equal(marketplace.name, "cuebook");
  assert.equal(marketplace.plugins.length, 1);
  assert.equal(marketplace.plugins[0].name, "cuebook");
  assert.equal(marketplace.plugins[0].source, "./plugins/cuebook");
  assert.equal(Object.hasOwn(marketplace.plugins[0], "version"), false);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf-8"),
  );
  const expectedVersion = JSON.parse(
    fs.readFileSync(path.resolve(PLUGIN_ROOT, "..", "..", "package.json"), "utf-8"),
  ).version;
  assert.equal(manifest.name, "cuebook");
  assert.equal(manifest.version.split("+")[0], expectedVersion);
  assert.equal(manifest.skills, "./public-skills/");
  assert.equal(manifest.mcpServers, "./.mcp.json");
});

test("platform guides are English, endpoint-pinned, and explicit about live evidence", () => {
  const platformsRoot = path.join(PLUGIN_ROOT, "platforms");
  const guideNames = fs.readdirSync(platformsRoot)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort();
  assert.equal(guideNames.length, 10);
  const index = fs.readFileSync(path.join(platformsRoot, "README.md"), "utf-8");
  assert.match(index, /https:\/\/cuebook\.xyz\/mcp/u);
  assert.doesNotMatch(index, /[\u3400-\u9fff]/u);
  for (const guideName of guideNames) {
    const guide = fs.readFileSync(path.join(platformsRoot, guideName), "utf-8");
    assert.match(guide, /https:\/\/cuebook\.xyz\/mcp/u, guideName);
    assert.match(guide, /\*\*Live status:\*\*/u, guideName);
    assert.match(guide, /live verification gate/u, guideName);
    assert.doesNotMatch(guide, /[\u3400-\u9fff]/u, guideName);
    assert.ok(index.includes(`(${guideName})`), guideName);
  }
});

test("repository header links every named host badge to its platform guide", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const readme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8");
  const badges = new Map([
    ["Codex", "codex.md"],
    ["Claude Code", "claude-code.md"],
    ["Cursor", "cursor.md"],
    ["Hermes", "hermes.md"],
    ["OpenClaw", "openclaw.md"],
    ["Claude", "claude-desktop.md"],
    ["ChatGPT", "chatgpt.md"],
    ["Grok", "grok.md"],
  ]);
  for (const [label, guide] of badges) {
    assert.ok(
      readme.includes(
        `<a href="plugins/cuebook/platforms/${guide}"><img alt="${label}"`,
      ),
      label,
    );
  }
});

test("platform validation rejects a missing host guide", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    fs.rmSync(path.join(root, "platforms", "grok.md"));
    assert.ok(codes(validate(root)).has("PLATFORM_DOC_SET"));
  });
});

test("platform validation rejects endpoint drift", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "platforms", "cursor.md");
    fs.writeFileSync(
      filePath,
      fs.readFileSync(filePath, "utf-8").replaceAll("https://cuebook.xyz/mcp", "https://example.com/mcp"),
    );
    assert.ok(codes(validate(root)).has("PLATFORM_MCP_ENDPOINT"));
  });
});

test("Claude Code plugin cannot expose the internal Skill tree", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, ".claude-plugin", "plugin.json");
    rewrite(filePath, (payload) => {
      payload.skills = "./skills/";
    });
    assert.ok(codes(validate(root)).has("CLAUDE_PLUGIN_PUBLIC_SKILL_ROOT"));
  });
});

test("frontmatter descriptions with YAML mapping punctuation are quoted", () => {
  const skillsRoot = path.join(PLUGIN_ROOT, "skills");
  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
    const text = fs.readFileSync(skillPath, "utf-8");
    const line = text.split("\n").find((candidate) => candidate.startsWith("description: "));
    assert.ok(line, skillPath);
    const value = line.slice("description: ".length);
    if (!value.includes(": ")) continue;
    assert.ok(
      (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")),
      skillPath,
    );
  }
});

test("public entrypoints check readiness quietly and never expose connector internals", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  for (const [name, text] of [["create", create], ["query", query]]) {
    assert.ok(text.indexOf("## Quiet Readiness Check") >= 0, name);
    assert.match(text, /normal MCP result is the only runtime readiness proof/u, name);
    assert.match(text, /Do not run a CLI login/u, name);
    assert.match(text, /Never mention the README, missing actions, Tool names/u, name);
    assert.match(text, /at most two short sentences/u, name);
    assert.doesNotMatch(text, /## Connection Gate/u, name);
    assert.doesNotMatch(text, /host pauses for OAuth/u, name);
    assert.doesNotMatch(text, /normal connector continuation/u, name);
    assert.doesNotMatch(text, /host OAuth initiation per user action/u, name);
  }
  assert.ok(create.indexOf("## Quiet Readiness Check") < create.indexOf("## Fast Preview"));
  assert.match(create, /silently call `get_frame_capabilities` once/u);
  assert.ok(query.indexOf("## Quiet Readiness Check") < query.indexOf("## Routing"));
  assert.match(query, /Silently run the smallest required Cuebook read/u);
  assert.doesNotMatch(create, /## Meaning Lock|## Selection Freeze/u);
});

test("Codex install docs authenticate once before the first Cuebook task", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const marketplace = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, ".agents", "plugins", "marketplace.json"), "utf-8"),
  );
  const docs = [
    fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "platforms", "codex.md"), "utf-8"),
  ];
  for (const text of docs) {
    assert.match(text, /background test task/u);
    assert.match(text, /codex mcp list --json/u);
    assert.match(text, /codex mcp login cuebook/u);
    assert.match(text, /not_logged_in/u);
    assert.match(text, /browser approval/iu);
    assert.match(text, /does not\s+guarantee.*browser/isu);
    assert.match(text, /normal MCP result/u);
    assert.doesNotMatch(text, /first Cuebook (?:request|call) may open a browser/iu);
    assert.doesNotMatch(text, /normal connector continuation/u);
  }
  assert.match(docs[0], /Open one new Codex task only after installation and authentication are complete/u);
  assert.match(docs[2], /Authentication belongs to installation/u);
  assert.equal(marketplace.plugins[0].policy.authentication, "ON_INSTALL");
});

test("Codex update docs distinguish Git marketplaces from local checkouts", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const docs = [
    fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "README.md"), "utf-8"),
    fs.readFileSync(path.join(PLUGIN_ROOT, "platforms", "codex.md"), "utf-8"),
  ];
  for (const text of docs) {
    assert.match(text, /Git-backed marketplace/u);
    assert.match(text, /local checkout/u);
    assert.match(text, /skip .*marketplace upgrade/isu);
    assert.match(text, /codex plugin add cuebook@cuebook/u);
    assert.match(text, /codex mcp list --json/u);
  }
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
  assert.ok(policy.creator_fast_allowlist.includes("list_asset_cues"));
  assert.ok(policy.creator_fast_allowlist.includes("get_cues"));
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

test("creator guidance uses Cues as optional thought anchors rather than proof", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const query = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "query-cuebook", "SKILL.md"),
    "utf-8",
  );
  const intake = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "intake-cuebook-viewpoint", "SKILL.md"),
    "utf-8",
  );
  const combined = `${create}\n${query}\n${intake}`;
  assert.match(create, /## Conversation Heuristics/u);
  assert.match(create, /## Optional New Angle/u);
  assert.match(combined, /one `aligned` Cue/iu);
  assert.match(combined, /contrasting.*adjacent/iu);
  assert.match(combined, /not proof/iu);
  assert.match(combined, /creator-owned hypothesis/iu);
  assert.match(create, /Only adopted additions enter the confirmed draft/iu);
  assert.match(combined, /never treats another published view as proof, consensus, or creator adoption/iu);
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
  assert.deepEqual(flow.initial_publish_sequence.slice(-2), [
    "prepare_frame_publish",
    "publish_frame",
  ]);
  assert.deepEqual(flow.correction_publish_sequence, [
    "prepare_frame_correction_publish",
    "publish_frame_correction",
  ]);
  assert.deepEqual(flow.withdraw_sequence, [
    "prepare_frame_withdraw",
    "first_party_consent",
    "get_frame_action_consent",
    "withdraw_frame",
  ]);
  assert.equal(flow.action_consent_usage, "withdrawal_only");
  assert.equal(flow.publish_success_source, "validated_publish_receipt");
  assert.equal(flow.creator_link_policy, "never_present_canonical_url");
  assert.equal(flow.explicit_frame_query_tool, "get_frame");
  assert.equal(flow.automatic_post_publish_readback, false);
  assert.ok(!flow.initial_publish_sequence.includes("get_frame"));
  assert.ok(!flow.correction_publish_sequence.includes("get_frame"));
});

test("Frame creator flow never reads back or presents a canonical web link after publish", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  const orchestrator = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "orchestrate-cuebook-creator-workflow", "SKILL.md"),
    "utf-8",
  );
  const combined = `${create}\n${publish}\n${orchestrator}`;
  assert.equal(combined.includes("→ `get_frame` readback"), false);
  assert.equal(combined.includes("verify through `get_frame`"), false);
  assert.equal(combined.includes("On successful readback"), false);
  assert.equal(combined.includes("unless the creator explicitly requests technical diagnostics"), false);
  assert.match(combined, /已经替你发布好了，去 Cuebook App 看看吧。/u);
  assert.match(combined, /Never present .*canonical_url/iu);
  assert.equal(combined.includes("say exactly “已发布，去 Cuebook App 看。” and stop"), false);
  assert.equal(combined.includes("Return only “已发布，去 Cuebook App 看。”"), false);
  assert.match(combined, /creator-specific/iu);
  assert.match(
    combined,
    /这是 Cuebook Agent 帮我完善并记录的交易想法，想听听你怎么判断；请用 Cuebook 打开，尚未连接时按提示安装并连接：<Cuebook 分享入口>/u,
  );
  assert.match(combined, /exact `frame_id \+ release_id`/u);
  assert.match(combined, /App, not the Skill or publication flow, owns sharing/iu);
  assert.match(combined, /another AI/iu);
  assert.match(combined, /simulated Paper Trade/iu);
  assert.match(combined, /explicit opt-in/iu);
  assert.match(combined, /preview_paper_order/iu);
  assert.match(combined, /explicit placement intent/iu);
});

test("creator journey feels editorial without exposing a fixed flow", () => {
  const repositoryRoot = path.resolve(PLUGIN_ROOT, "..", "..");
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const readme = fs.readFileSync(path.join(repositoryRoot, "README.md"), "utf-8");
  assert.match(create, /## Creator Experience/u);
  assert.match(create, /Behave like an attentive editor/iu);
  assert.match(create, /one continuous lift/u);
  assert.match(create, /smallest useful Cuebook memory/u);
  assert.match(create, /Ask no question when the idea is already sufficient/u);
  assert.match(create, /one high-leverage question at a time/u);
  assert.match(create, /Do not present a form/u);
  assert.match(create, /connection Cuebook made visible/u);
  assert.match(create, /Never announce a gate, stage, lock, workflow/iu);
  assert.doesNotMatch(create, /\*\*Lock\.\*\*|## Meaning Lock|## Selection Freeze/u);
  assert.match(readme, /The Cuebook Experience/u);
  assert.match(readme, /without taking authorship away/u);
  assert.match(readme, /Internal Tool calls, providers, retries, hashes, and publication mechanics remain backstage/u);
});

test("ordinary one-preview publish does not reconstruct the advanced release graph", () => {
  const create = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "SKILL.md"),
    "utf-8",
  );
  const publish = fs.readFileSync(
    path.join(PLUGIN_ROOT, "skills", "create-cuebook-content", "references", "frame-publish-workflow.md"),
    "utf-8",
  );
  assert.match(create, /Do not reconstruct `PostV1`, `VisualDirectionSetV1`, `PublishCandidateSetV1`/u);
  assert.match(publish, /Direct Fast Publish/u);
  assert.match(publish, /do not synthesize a `VisualDirectionSetV1`/u);
  assert.match(publish, /Do not add the optional local generation handoff/u);
  assert.match(publish, /replay at most once with the exact same idempotency key/u);
  assert.match(publish, /never send the same invalid shape repeatedly/u);
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
    schema_catalog_sha256: "0f654cce42c03e23eab005eb76e092db6a872f5da5377e9af0e05bf126bde299",
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
