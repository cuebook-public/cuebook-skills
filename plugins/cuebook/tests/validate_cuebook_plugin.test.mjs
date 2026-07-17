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
  const modules = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, "assets", "cuebook-modules-v1.json"), "utf-8"),
  );
  assert.ok(modules.routing_rules.query_deliverables.includes("factual_chart"));
  assert.ok(modules.routing_rules.create_deliverables.includes("creator_viewpoint_graphic"));
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
      payload.queries[0].mcp_tools.push("save_creator_artifact");
    });
    assert.ok(codes(validate(root)).has("QUERY_WRITE_TOOL"));
  });
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

test("Skill instructions cannot reintroduce get_frame_media", () => {
  withTmpPath((tmpPath) => {
    const root = copiedPlugin(tmpPath);
    const filePath = path.join(root, "skills", "create-cuebook-content", "SKILL.md");
    fs.writeFileSync(filePath, `${fs.readFileSync(filePath, "utf-8")}\nCall \`get_frame_media\` to fetch the image.\n`);
    assert.ok(codes(validate(root)).has("FRAME_SKILL_MEDIA_PULL"));
  });
});
