#!/usr/bin/env node

// Keep the checked-in Cuebook connector aligned with its distribution branch.
// Skill behavior and Tool contracts are shared; only distribution-bound
// origins change between the stable production and development channels.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DISTRIBUTION_CHANNELS = Object.freeze({
  development: Object.freeze({
    schema_version: "cuebook-distribution-channel-v1",
    channel: "development",
    web_origin: "https://cuebook.xyz",
    mcp_url: "https://cuebook.xyz/mcp",
    skills_base_url: "https://cuebook.xyz/.well-known/skills",
  }),
  production: Object.freeze({
    schema_version: "cuebook-distribution-channel-v1",
    channel: "production",
    web_origin: "https://cuebook.app",
    mcp_url: "https://cuebook.app/mcp",
    skills_base_url: "https://cuebook.app/.well-known/skills",
  }),
});

const HERMES_CHECKOUTS = Object.freeze({
  development: Object.freeze({ ref: "dev", directory: "cuebook-skills-dev" }),
  production: Object.freeze({ ref: "main", directory: "cuebook-skills-main" }),
});

const FILES = Object.freeze({
  manifest: "plugins/cuebook/distribution-channel-v1.json",
  mcp: "plugins/cuebook/runtime-template/.mcp.json",
  capabilityMap: "plugins/cuebook/assets/mcp-capability-map-v1.json",
  hermesOAuthBridge: "plugins/hermes/cuebook-auth/__init__.py",
});

export const CHANNEL_BOUND_PLATFORM_GUIDES = Object.freeze([
  "chatgpt.md",
  "claude-desktop.md",
  "cursor.md",
  "generic-agent-skills.md",
  "generic-mcp.md",
  "grok.md",
  "hermes.md",
  "openclaw.md",
]);

const CUEBOOK_SCHEMA_ID = /^https:\/\/cuebook\.(?:app|xyz)\//u;
const HERMES_MCP_URL_ASSIGNMENT = /_OFFICIAL_MCP_URL = "https:\/\/cuebook\.(?:app|xyz)\/mcp"/u;
const HERMES_AUTH_HOST_ASSIGNMENT = /_AUTHORIZATION_HOST = "cuebook\.(?:app|xyz)"/u;
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

function readJson(root, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function distributionSchemaFiles(root) {
  const pluginRoot = path.join(root, "plugins", "cuebook");
  if (!fs.existsSync(pluginRoot)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith(".schema.json")) {
        files.push(path.relative(root, target).split(path.sep).join("/"));
      }
    }
  };
  visit(pluginRoot);
  return files.sort();
}

export function distributionChannel(name) {
  const channel = DISTRIBUTION_CHANNELS[name];
  if (!channel) {
    throw new Error(`Unknown Cuebook distribution channel: ${name}`);
  }
  return channel;
}

export function distributionWrites(rootArg, channelName) {
  const root = path.resolve(rootArg);
  const channel = distributionChannel(channelName);
  const capabilityMap = readJson(root, FILES.capabilityMap);
  capabilityMap.server = {
    ...(capabilityMap.server ?? {}),
    url: channel.mcp_url,
  };

  const writes = new Map([
    [FILES.manifest, jsonText(channel)],
    [FILES.mcp, jsonText({
      mcpServers: {
        cuebook: {
          type: "http",
          url: channel.mcp_url,
          oauth_resource: channel.mcp_url,
        },
      },
    })],
    [FILES.capabilityMap, jsonText(capabilityMap)],
  ]);
  const hermesBridgePath = path.join(root, FILES.hermesOAuthBridge);
  if (!fs.existsSync(hermesBridgePath)) {
    throw new Error(`${FILES.hermesOAuthBridge} is missing.`);
  }
  const hermesBridge = fs.readFileSync(hermesBridgePath, "utf8");
  if (
    !HERMES_MCP_URL_ASSIGNMENT.test(hermesBridge)
    || !HERMES_AUTH_HOST_ASSIGNMENT.test(hermesBridge)
  ) {
    throw new Error(`${FILES.hermesOAuthBridge} has no channel-bound Cuebook endpoint.`);
  }
  const authorizationHost = new URL(channel.mcp_url).hostname;
  writes.set(
    FILES.hermesOAuthBridge,
    hermesBridge
      .replace(HERMES_MCP_URL_ASSIGNMENT, `_OFFICIAL_MCP_URL = "${channel.mcp_url}"`)
      .replace(HERMES_AUTH_HOST_ASSIGNMENT, `_AUTHORIZATION_HOST = "${authorizationHost}"`),
  );
  for (const relativePath of distributionSchemaFiles(root)) {
    const absolutePath = path.join(root, relativePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    const schema = JSON.parse(text);
    if (typeof schema.$id !== "string" || !CUEBOOK_SCHEMA_ID.test(schema.$id)) continue;
    const schemaUrl = new URL(schema.$id);
    const nextId = `${channel.web_origin}${schemaUrl.pathname}${schemaUrl.search}${schemaUrl.hash}`;
    const currentLiteral = JSON.stringify(schema.$id);
    if (!text.includes(currentLiteral)) {
      throw new Error(`${relativePath} does not contain its parsed $id literal.`);
    }
    writes.set(relativePath, text.replace(currentLiteral, JSON.stringify(nextId)));
  }
  for (const guideName of CHANNEL_BOUND_PLATFORM_GUIDES) {
    const relativePath = `plugins/cuebook/platforms/${guideName}`;
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) continue;
    let text = fs.readFileSync(absolutePath, "utf8");
    for (const candidate of Object.values(DISTRIBUTION_CHANNELS)) {
      text = text.replaceAll(candidate.mcp_url, channel.mcp_url);
      text = text.replaceAll(candidate.skills_base_url, channel.skills_base_url);
    }
    if (guideName === "hermes.md") {
      const checkout = HERMES_CHECKOUTS[channelName];
      text = text
        .replace(
          /cuebook_skills_branch="(?:dev|main)"/gu,
          `cuebook_skills_branch="${checkout.ref}"`,
        )
        .replace(/cuebook-skills-(?:dev|main)/gu, checkout.directory);
    }
    writes.set(relativePath, text);
  }
  return writes;
}

export function collectDistributionIssues(rootArg, expectedChannel) {
  const root = path.resolve(rootArg);
  const issues = [];
  const add = (file, message) => issues.push({
    code: "DISTRIBUTION_CHANNEL",
    file,
    message,
  });

  let manifest;
  let mcp;
  let capabilityMap;
  let hermesBridge;
  try {
    manifest = readJson(root, FILES.manifest);
  } catch (error) {
    add(FILES.manifest, `Cannot read the distribution manifest: ${error.message}`);
    return issues;
  }
  try {
    mcp = readJson(root, FILES.mcp);
  } catch (error) {
    add(FILES.mcp, `Cannot read the MCP configuration: ${error.message}`);
    return issues;
  }
  try {
    capabilityMap = readJson(root, FILES.capabilityMap);
  } catch (error) {
    add(FILES.capabilityMap, `Cannot read the capability map: ${error.message}`);
    return issues;
  }
  try {
    hermesBridge = fs.readFileSync(path.join(root, FILES.hermesOAuthBridge), "utf8");
  } catch (error) {
    add(FILES.hermesOAuthBridge, `Cannot read the Hermes OAuth bridge: ${error.message}`);
    return issues;
  }

  const selected = DISTRIBUTION_CHANNELS[manifest.channel];
  if (!selected) {
    add(FILES.manifest, `Unsupported channel ${JSON.stringify(manifest.channel)}.`);
    return issues;
  }
  for (const field of ["schema_version", "channel", "web_origin", "mcp_url", "skills_base_url"]) {
    if (manifest[field] !== selected[field]) {
      add(FILES.manifest, `${field} must equal ${JSON.stringify(selected[field])} for ${selected.channel}.`);
    }
  }
  if (expectedChannel && manifest.channel !== expectedChannel) {
    add(
      FILES.manifest,
      `Expected the ${expectedChannel} channel, found ${JSON.stringify(manifest.channel)}.`,
    );
  }

  const servers = mcp.mcpServers ?? {};
  const configured = servers.cuebook ?? {};
  if (Object.keys(servers).length !== 1 || !Object.hasOwn(servers, "cuebook")) {
    add(FILES.mcp, "The distribution must configure exactly one MCP server named cuebook.");
  }
  if (configured.type !== "http") {
    add(FILES.mcp, "Cuebook MCP transport must remain http.");
  }
  if (configured.url !== selected.mcp_url) {
    add(FILES.mcp, `MCP URL must equal ${selected.mcp_url}.`);
  }
  if (configured.oauth_resource !== selected.mcp_url) {
    add(FILES.mcp, `OAuth resource must equal ${selected.mcp_url}.`);
  }
  if (capabilityMap.server?.url !== selected.mcp_url) {
    add(FILES.capabilityMap, `Capability server URL must equal ${selected.mcp_url}.`);
  }
  const expectedHermesMcp = `_OFFICIAL_MCP_URL = "${selected.mcp_url}"`;
  const expectedHermesHost = `_AUTHORIZATION_HOST = "${new URL(selected.mcp_url).hostname}"`;
  if (!hermesBridge.includes(expectedHermesMcp)) {
    add(FILES.hermesOAuthBridge, `Hermes MCP URL must equal ${selected.mcp_url}.`);
  }
  if (!hermesBridge.includes(expectedHermesHost)) {
    add(
      FILES.hermesOAuthBridge,
      `Hermes authorization host must equal ${new URL(selected.mcp_url).hostname}.`,
    );
  }
  for (const candidate of Object.values(DISTRIBUTION_CHANNELS)) {
    if (
      candidate.channel !== selected.channel
      && hermesBridge.includes(`_OFFICIAL_MCP_URL = "${candidate.mcp_url}"`)
    ) {
      add(
        FILES.hermesOAuthBridge,
        `Hermes OAuth bridge must not retain ${candidate.mcp_url}.`,
      );
    }
  }
  for (const guideName of CHANNEL_BOUND_PLATFORM_GUIDES) {
    const relativePath = `plugins/cuebook/platforms/${guideName}`;
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      add(relativePath, "Cannot read the channel-bound platform guide.");
      continue;
    }
    const text = fs.readFileSync(absolutePath, "utf8");
    if (!text.includes(selected.mcp_url)) {
      add(relativePath, `Platform guide must use ${selected.mcp_url}.`);
    }
    for (const candidate of Object.values(DISTRIBUTION_CHANNELS)) {
      if (candidate.channel !== selected.channel && text.includes(candidate.mcp_url)) {
        add(
          relativePath,
          `Platform guide must not retain the ${candidate.channel} endpoint ${candidate.mcp_url}.`,
        );
      }
    }
    if (guideName === "hermes.md") {
      if (!text.includes(selected.skills_base_url)) {
        add(relativePath, `Hermes guide must use ${selected.skills_base_url}.`);
      }
      for (const candidate of Object.values(DISTRIBUTION_CHANNELS)) {
        if (
          candidate.channel !== selected.channel
          && text.includes(candidate.skills_base_url)
        ) {
          add(
            relativePath,
            `Hermes guide must not retain the ${candidate.channel} Skill endpoint ${candidate.skills_base_url}.`,
          );
        }
      }
      const checkout = HERMES_CHECKOUTS[selected.channel];
      if (
        !text.includes(`cuebook_skills_branch="${checkout.ref}"`)
        || !text.includes(`/plugin-sources/${checkout.directory}`)
        || !text.includes('pull --ff-only origin "${cuebook_skills_branch}"')
        || !text.includes('rev-parse "origin/${cuebook_skills_branch}"')
      ) {
        add(relativePath, `Hermes checkout must use the ${checkout.ref} distribution branch.`);
      }
      for (const [channelName, candidate] of Object.entries(HERMES_CHECKOUTS)) {
        if (
          channelName !== selected.channel
          && (
            text.includes(`cuebook_skills_branch="${candidate.ref}"`)
            || text.includes(`/plugin-sources/${candidate.directory}`)
          )
        ) {
          add(
            relativePath,
            `Hermes checkout must not retain the ${candidate.ref} distribution branch.`,
          );
        }
      }
    }
  }
  for (const relativePath of distributionSchemaFiles(root)) {
    let schema;
    try {
      schema = readJson(root, relativePath);
    } catch (error) {
      add(relativePath, `Cannot read the JSON Schema: ${error.message}`);
      continue;
    }
    if (typeof schema.$id !== "string" || !CUEBOOK_SCHEMA_ID.test(schema.$id)) continue;
    if (new URL(schema.$id).origin !== selected.web_origin) {
      add(relativePath, `Schema $id must use ${selected.web_origin}.`);
    }
  }

  return issues;
}

export function configureDistributionChannel(rootArg, channelName) {
  const root = path.resolve(rootArg);
  const writes = distributionWrites(root, channelName);
  for (const [relativePath, text] of writes) {
    fs.writeFileSync(path.join(root, relativePath), text, "utf8");
  }
  return {
    channel: channelName,
    files: [...writes.keys()],
  };
}

function parseArgs(argv) {
  const options = { check: false, expectedChannel: undefined };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") options.check = true;
    else if (arg === "--expected-channel") options.expectedChannel = argv[++index];
    else if (arg.startsWith("-")) throw new Error(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (options.check) {
    if (positional.length !== 0) throw new Error("--check does not accept a channel argument.");
    if (options.expectedChannel) distributionChannel(options.expectedChannel);
  } else if (positional.length !== 1) {
    throw new Error(
      "usage: configure_distribution_channel.mjs production|development OR --check [--expected-channel production|development]",
    );
  }
  return { ...options, channel: positional[0] };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const options = parseArgs(process.argv.slice(2));
  if (options.check) {
    const issues = collectDistributionIssues(root, options.expectedChannel);
    if (issues.length > 0) {
      for (const issue of issues) process.stderr.write(`- ${issue.file}: ${issue.message}\n`);
      process.exitCode = 1;
      return;
    }
    const manifest = readJson(root, FILES.manifest);
    process.stdout.write(`${JSON.stringify({ valid: true, channel: manifest.channel, mcp_url: manifest.mcp_url }, null, 2)}\n`);
    return;
  }
  const result = configureDistributionChannel(root, options.channel);
  process.stdout.write(`${JSON.stringify({ ...result, next: "Run npm run build:release before committing." }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
