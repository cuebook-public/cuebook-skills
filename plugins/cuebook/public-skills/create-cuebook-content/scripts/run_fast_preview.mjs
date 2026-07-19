#!/usr/bin/env node
// Compile one compact creator job into a validated FramePreviewV1. This is the
// deterministic boundary between model-authored copy/tool results and local
// rendering: callers do not need to inspect renderer source or materialize the
// full creator DAG.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateInstance } from "./validate_json_schema.mjs";
import { audit as auditChart } from "../references/modules/render-cuebook-thesis-chart/scripts/audit_chart_svg.mjs";
import { load_canonical_series, render_svg as renderChartSvg } from "../references/modules/render-cuebook-thesis-chart/scripts/render_thesis_chart.mjs";
import { validate as validateChart } from "../references/modules/render-cuebook-thesis-chart/scripts/validate_thesis_chart.mjs";
import { renderBatch } from "./render_frame_previews.mjs";
import { validate as validateFramePreview } from "./validate_frame_preview.mjs";
import { runFastPreviewV2Job } from "./run_fast_preview_v2.mjs";

const require = createRequire(import.meta.url);
const rasterizerScript = fileURLToPath(new URL("../references/modules/render-cuebook-thesis-chart/scripts/rasterize_thesis_chart.cjs", import.meta.url));
const { rasterizeSvg } = require(rasterizerScript);

const JOB_SCHEMA = JSON.parse(readFileSync(new URL("../references/frame-preview-fast-job-v1.schema.json", import.meta.url), "utf8"));
const CHART_SCHEMA = JSON.parse(readFileSync(new URL("../references/modules/render-cuebook-thesis-chart/references/thesis-chart-v1.schema.json", import.meta.url), "utf8"));
const MARKET_SCHEMA = JSON.parse(readFileSync(new URL("../references/modules/render-cuebook-thesis-chart/references/market-series-batch-v1.schema.json", import.meta.url), "utf8"));
const QUALITY_CHECKS = ["creator_ownership", "source_binding", "copy_fit", "image_render"];
const MUTABLE_PRICE_LABEL = /(?:现价|当前价|最新价|入场价|current\s+price|latest\s+price|entry\s+price)/iu;

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function failValidation(label, errors) {
  const detail = errors.map((error) => `${error.path ?? "$"}: ${error.message ?? error.code}`).join("\n");
  throw new Error(`${label} validation failed${detail ? `:\n${detail}` : "."}`);
}

function iso(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a timezone-aware ISO date-time.`);
  return new Date(parsed).toISOString();
}

function number(value, label, { nullable = false, positive = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value === "string" && !value.trim()) throw new Error(`${label} must be numeric.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (positive && parsed <= 0)) throw new Error(`${label} must be ${positive ? "positive and " : ""}numeric.`);
  return parsed;
}

function localeFor(job) {
  const copy = `${job.preview.candidate.frame.title}\n${job.preview.candidate.frame.body}`;
  return /[\u3400-\u9fff]/u.test(copy) ? "zh-CN" : "en-US";
}

function validateJob(job) {
  const errors = validateInstance(job, JOB_SCHEMA);
  const branch = job?.visual?.kind === "logic_card"
    ? JOB_SCHEMA.$defs.logicVisual
    : job?.visual?.kind === "market_chart"
      ? JOB_SCHEMA.$defs.marketVisual
      : null;
  if (branch === null) errors.push({ path: "$.visual.kind", message: "Expected logic_card or market_chart." });
  else errors.push(...validateInstance(job.visual, branch, "$.visual", JOB_SCHEMA));
  if (errors.length) failValidation("Fast preview job", errors);
  if (job.preview.query_binding.required && job.preview.query_binding.status === "not_required") {
    throw new Error("A required current-market preview cannot use query status not_required.");
  }
  if (!job.preview.query_binding.required && job.preview.query_binding.status !== "not_required") {
    throw new Error("A non-required preview must use query status not_required.");
  }
  for (const [field, value] of Object.entries(job.visual)) {
    if (typeof value === "string" && MUTABLE_PRICE_LABEL.test(value)) {
      throw new Error(`visual.${field} cannot print a mutable current/entry price before a backend price lock exists.`);
    }
  }
  const copyLimits = [
    [job.preview.candidate.frame.title, 32, "preview.candidate.frame.title"],
    [job.preview.candidate.frame.body, 280, "preview.candidate.frame.body"],
    [job.preview.candidate.frame.alt_text, 160, "preview.candidate.frame.alt_text"],
  ];
  for (const [value, maximum, label] of copyLimits) {
    if ([...value.trim()].length > maximum) throw new Error(`${label} must be at most ${maximum} visible characters.`);
  }
  if (["reused", "executed", "partial"].includes(job.preview.query_binding.status)
      && (!job.preview.query_binding.as_of || !job.preview.query_binding.bundle_refs.length || !job.preview.query_binding.result_refs.length)) {
    throw new Error("A usable query binding requires as_of, bundle_refs, and result_refs before rendering.");
  }
  if (job.visual.kind === "market_chart") {
    for (const [value, maximum, label] of [
      [job.visual.title, 48, "visual.title"],
      [job.visual.subtitle, 120, "visual.subtitle"],
      [job.visual.claim_statement, 200, "visual.claim_statement"],
      [job.visual.success_label, 100, "visual.success_label"],
    ]) {
      if ([...value.trim()].length > maximum) throw new Error(`${label} must be at most ${maximum} visible characters.`);
    }
    const legs = job.visual.benchmark ? [job.visual.primary, job.visual.benchmark] : [job.visual.primary];
    const knownResults = new Set(job.preview.query_binding.result_refs);
    for (const leg of legs) {
      if (!knownResults.has(leg.result_ref)) {
        throw new Error(`${leg.ticker}.result_ref must resolve through preview.query_binding.result_refs.`);
      }
    }
  }
}

function normalizeBars(leg) {
  const seen = new Set();
  const bars = leg.candles.data.bars.map((bar, index) => {
    const openTime = iso(bar.openTime, `${leg.ticker}.bars[${index}].openTime`);
    if (seen.has(openTime)) throw new Error(`${leg.ticker} has duplicate candle ${openTime}.`);
    seen.add(openTime);
    const open = number(bar.open, `${leg.ticker}.bars[${index}].open`, { positive: true });
    const high = number(bar.high, `${leg.ticker}.bars[${index}].high`, { positive: true });
    const low = number(bar.low, `${leg.ticker}.bars[${index}].low`, { positive: true });
    const close = number(bar.close, `${leg.ticker}.bars[${index}].close`, { positive: true });
    const volume = number(bar.volume, `${leg.ticker}.bars[${index}].volume`, { nullable: true });
    if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) {
      throw new Error(`${leg.ticker}.bars[${index}] violates OHLC bounds.`);
    }
    return {
      open_time: openTime,
      observed_at: openTime,
      open,
      high,
      low,
      close,
      volume,
      vwap: null,
      state: "sealed",
      last_event_time: null,
    };
  }).sort((a, b) => Date.parse(a.open_time) - Date.parse(b.open_time));
  return bars;
}

function legCoverage(leg) {
  return leg.candles.meta.truncated || Boolean(leg.candles.data.nextCursor) ? "partial" : "complete";
}

function latestHistoricalBar(bars, declaredAt, ticker) {
  const declared = Date.parse(declaredAt);
  const eligible = bars.filter((bar) => Date.parse(bar.open_time) <= declared);
  if (!eligible.length) throw new Error(`${ticker} has no candle at or before declared_at.`);
  return eligible.at(-1);
}

function synchronizedBaseline(primaryBars, benchmarkBars, observationStart, declaredAt) {
  const start = Date.parse(observationStart);
  const declared = Date.parse(declaredAt);
  const benchmarkByTime = new Map(benchmarkBars.map((bar) => [bar.open_time, bar]));
  for (const primary of primaryBars) {
    const timestamp = Date.parse(primary.open_time);
    const benchmark = benchmarkByTime.get(primary.open_time);
    if (benchmark && timestamp >= start && timestamp <= declared) return { timestamp: primary.open_time, primary, benchmark };
  }
  throw new Error("Relative performance needs one synchronized primary/benchmark candle inside the observation window.");
}

function marketSession(visual) {
  if (visual.mode === "relative_performance") return "all_sessions";
  return visual.primary.asset_class.toLowerCase().includes("crypto") ? "continuous" : "regular";
}

function makeMarketArtifacts(job) {
  const visual = job.visual;
  if (visual.mode === "relative_performance" && !visual.benchmark) {
    throw new Error("relative_performance requires a benchmark leg.");
  }
  if (visual.mode === "single_price" && visual.benchmark) {
    throw new Error("single_price cannot include a benchmark leg.");
  }
  if (visual.mode === "relative_performance" && !["outperform", "underperform"].includes(visual.direction)) {
    throw new Error("Relative performance requires outperform or underperform direction.");
  }
  if (visual.mode === "single_price" && !["long", "short"].includes(visual.direction)) {
    throw new Error("Single-price charts require long or short direction.");
  }

  const observationStart = iso(visual.observation_start, "observation_start");
  const declaredAt = iso(visual.declared_at, "declared_at");
  const horizonEnd = visual.horizon_end === null ? null : iso(visual.horizon_end, "horizon_end");
  if (Date.parse(observationStart) >= Date.parse(declaredAt)) throw new Error("observation_start must precede declared_at.");
  if (horizonEnd !== null && Date.parse(horizonEnd) <= Date.parse(declaredAt)) throw new Error("horizon_end must follow declared_at.");

  const rawLegs = visual.mode === "relative_performance" ? [visual.primary, visual.benchmark] : [visual.primary];
  const prepared = rawLegs.map((leg) => ({ leg, bars: normalizeBars(leg), coverage: legCoverage(leg) }));
  let sharedBaseline = null;
  if (visual.mode === "relative_performance") {
    sharedBaseline = synchronizedBaseline(prepared[0].bars, prepared[1].bars, observationStart, declaredAt);
  }
  const intervalSet = new Set(prepared.map(({ leg }) => leg.candles.data.interval));
  const intervalStatus = intervalSet.size === 1 ? "matched" : "degraded";
  const coverageWarnings = prepared
    .filter(({ coverage }) => coverage === "partial")
    .map(({ leg }) => `${leg.ticker} candle coverage is partial.`);
  const warnings = unique([
    ...job.preview.query_binding.warnings,
    ...visual.warnings,
    ...coverageWarnings,
    ...(intervalStatus === "degraded" ? ["Primary and benchmark intervals do not match."] : []),
  ]);
  const conditional = job.preview.state === "conditional"
    || job.preview.query_binding.status === "partial"
    || warnings.length > 0;
  if (conditional && warnings.length === 0) warnings.push("Preview is conditional on incomplete evidence.");
  const chartState = conditional ? "conditional" : "ready";
  const session = marketSession(visual);

  const series = prepared.map(({ leg, bars, coverage }, index) => {
    const latest = latestHistoricalBar(bars, declaredAt, leg.ticker);
    let baselineValue = latest.close;
    let baselineAt = latest.open_time;
    let baselineBasis = session === "continuous" ? "spot" : "official_close";
    if (visual.mode === "relative_performance") {
      const selected = index === 0 ? sharedBaseline.primary : sharedBaseline.benchmark;
      baselineValue = selected.close;
      baselineAt = sharedBaseline.timestamp;
      baselineBasis = "official_close";
    } else if (leg.market_state?.observedAt && Date.parse(leg.market_state.observedAt) <= Date.parse(declaredAt)) {
      const livePrice = number(leg.market_state.price, `${leg.ticker}.market_state.price`, { positive: true });
      baselineValue = livePrice;
      baselineAt = iso(leg.market_state.observedAt, `${leg.ticker}.market_state.observedAt`);
      baselineBasis = session === "continuous" ? "spot" : "last_trade";
    }
    return {
      id: `S${index + 1}`,
      ticker: leg.ticker,
      display_name: leg.display_name,
      instrument_id: leg.ticker,
      asset_id: leg.asset_id,
      role: index === 0 ? "primary" : "benchmark",
      transformation: visual.mode === "relative_performance" ? "return_from_baseline" : "raw_price",
      baseline: {
        value: baselineValue,
        unit: visual.mode === "relative_performance" ? "return_pct" : "price",
        observed_at: baselineAt,
        observation_basis: baselineBasis,
        market_state: session === "continuous" ? "continuous" : "unknown",
        source_ref: leg.result_ref,
      },
      provider: {
        name: "Cuebook MCP",
        endpoint: "cuebook:mcp:get_candles",
        requested_interval: leg.candles.data.interval,
        observed_interval: leg.candles.data.interval,
        coverage_status: coverage,
        as_of: iso(leg.candles.meta.asOf, `${leg.ticker}.meta.asOf`),
      },
    };
  });

  const marketBatch = {
    schema_version: "market-series-batch-v1",
    fetched_at: iso(job.preview.query_binding.as_of ?? visual.primary.candles.meta.asOf, "query_binding.as_of"),
    series: prepared.map(({ leg, bars, coverage }, index) => ({
      series_ref: `S${index + 1}`,
      instrument_id: leg.ticker,
      ticker: leg.ticker,
      interval: leg.candles.data.interval,
      coverage_status: coverage,
      source_ref: leg.result_ref,
      provider_id: "cuebook-mcp",
      venue: "composite",
      currency: "price",
      timezone: "UTC",
      calendar_ref: session === "continuous" ? "continuous" : "market-session",
      session,
      quote_basis: visual.mode === "relative_performance" ? "official_close" : series[index].baseline.observation_basis,
      adjustment_basis: "unknown",
      source_as_of: iso(leg.candles.meta.asOf, `${leg.ticker}.meta.asOf`),
      license_scope: "display",
      quality_flags: coverage === "partial" ? ["partial_coverage"] : [],
      bars,
    })),
  };

  const latestPrimary = latestHistoricalBar(prepared[0].bars, declaredAt, visual.primary.ticker);
  const annotations = [
    {
      id: "A1",
      kind: "baseline",
      series_ref: "S1",
      value: series[0].baseline.value,
      observed_at: series[0].baseline.observed_at,
      label: localeFor(job) === "zh-CN" ? "观察起点" : "Observation baseline",
      provenance: "derived",
      source_ref: visual.primary.result_ref,
    },
  ];
  if (horizonEnd !== null) {
    annotations.push(
      {
        id: "A2",
        kind: "declaration",
        series_ref: "S1",
        value: latestPrimary.close,
        observed_at: declaredAt,
        label: localeFor(job) === "zh-CN" ? "观点提出" : "View declared",
        provenance: "explicit",
        source_ref: "creator:declaration",
      },
      {
        id: "A3",
        kind: "expiry",
        series_ref: null,
        value: null,
        observed_at: horizonEnd,
        label: visual.success_label,
        provenance: "explicit",
        source_ref: "creator:horizon",
      },
    );
  }

  const horizonSeconds = horizonEnd === null ? null : Math.round((Date.parse(horizonEnd) - Date.parse(declaredAt)) / 1000);
  const chart = {
    schema_version: "thesis-chart-v1",
    chart_id: `CHART_FAST_${job.preview.candidate.candidate_id.replace(/^FPREV_CAND_/, "")}`,
    revision: 1,
    state: chartState,
    lineage: {
      input_artifact_refs: unique(rawLegs.map((leg) => leg.result_ref)),
      thesis_ref: null,
      settlement_claim_ref: null,
    },
    role: visual.role,
    claim: {
      evaluation_kind: visual.mode === "relative_performance" ? "relative_performance" : "directional_return",
      direction: visual.direction,
      action_state: "observe_only",
      statement: visual.claim_statement,
    },
    time: {
      declared_at: declaredAt,
      horizon_end: horizonEnd,
      horizon_status: horizonEnd === null ? "unspecified" : "explicit",
      timezone: "UTC",
      market_session: session,
      horizon_seconds: horizonSeconds,
      context_start: observationStart,
      preferred_interval: visual.primary.candles.data.interval,
      observed_interval: intervalSet.size === 1 ? visual.primary.candles.data.interval : [...intervalSet].join(","),
      interval_status: intervalStatus,
      bar_limit: Math.min(500, Math.max(10, ...prepared.map(({ bars }) => bars.length))),
    },
    series,
    annotations,
    render: {
      mode: visual.mode,
      chart_type: visual.mode === "relative_performance" ? "line" : "candles",
      y_axis: visual.mode === "relative_performance" ? "return_pct" : "price",
      width: 2488,
      height: 1056,
      future_region: horizonEnd !== null,
      show_volume: visual.mode === "single_price" && visual.show_volume,
      volume_average_window: 20,
      show_forming_bar: false,
      forecast_path: "none",
      theme: "cuebook_light",
      style_profile: "cuebook_feed_v1",
      brand: "cuebook",
      watermark: true,
      show_latest_metric: false,
      show_state_label: false,
      show_provenance_footer: false,
      show_guide: false,
      locale: localeFor(job),
      timeline_layout: horizonEnd === null ? "continuous_time" : "decision_split",
      decision_split_ratio: 0.68,
      show_settlement_panel: false,
      title: visual.title,
      subtitle: visual.subtitle,
      success_label: visual.success_label,
    },
    quality_report: {
      decision: conditional ? "conditional" : "ready",
      warnings,
      hard_failures: [],
    },
  };
  return { chart, marketBatch, state: chartState };
}

async function renderLogic(job, outputRoot, options) {
  const candidate = job.preview.candidate;
  const report = await renderBatch({
    schema_version: "frame-preview-render-v1",
    font_css_path: null,
    candidates: [{ ...job.visual, candidate_id: candidate.candidate_id, language: localeFor(job) }],
  }, outputRoot, { capture: options.capture });
  const rendered = report.candidates[0];
  return {
    visual_kind: "logic_card",
    template_id: job.visual.template_id,
    image_ref: rendered.preview_ref,
    image_sha256: rendered.sha256,
    visual_report: report,
    state: job.preview.state === "conditional" || job.preview.query_binding.status === "partial" ? "conditional" : "ready",
  };
}

async function renderMarket(job, outputRoot, options) {
  const { chart, marketBatch, state } = makeMarketArtifacts(job);
  const chartSchemaErrors = validateInstance(chart, CHART_SCHEMA);
  if (chartSchemaErrors.length) failValidation("Thesis chart schema", chartSchemaErrors);
  const chartValidation = validateChart(chart);
  if (!chartValidation.valid) failValidation("Thesis chart", chartValidation.errors);
  const marketErrors = validateInstance(marketBatch, MARKET_SCHEMA);
  if (marketErrors.length) failValidation("Market series", marketErrors);

  const candidateDir = path.join(outputRoot, job.preview.candidate.candidate_id);
  mkdirSync(candidateDir, { recursive: true });
  const specPath = path.join(candidateDir, "thesis-chart-v1.json");
  const marketPath = path.join(candidateDir, "market-series-batch-v1.json");
  const svgPath = path.join(candidateDir, "frame-preview.svg");
  const pngPath = path.join(candidateDir, "viewpoint-2488.png");
  writeJson(specPath, chart);
  writeJson(marketPath, marketBatch);
  const fetched = chart.series.map((series) => load_canonical_series(chart, series, marketBatch));
  writeFileSync(svgPath, `${renderChartSvg(chart, fetched)}\n`, "utf8");
  const svgAudit = auditChart(svgPath);
  if (!svgAudit.valid) failValidation("Rendered chart", svgAudit.errors);
  await options.rasterize(svgPath, pngPath);
  if (!existsSync(pngPath)) throw new Error("Chart rasterizer did not produce the preview PNG.");
  const imageRef = path.relative(outputRoot, pngPath).split(path.sep).join("/");
  const report = {
    schema_version: "frame-preview-market-render-report-v1",
    state,
    chart_ref: path.relative(outputRoot, specPath).split(path.sep).join("/"),
    market_data_ref: path.relative(outputRoot, marketPath).split(path.sep).join("/"),
    svg_ref: path.relative(outputRoot, svgPath).split(path.sep).join("/"),
    preview_ref: imageRef,
    width: 2488,
    height: 1056,
    sha256: sha256(pngPath),
    audit: svgAudit,
  };
  writeJson(path.join(outputRoot, "frame-preview-market-render-report.json"), report);
  return {
    visual_kind: "market_chart",
    template_id: "thesis_chart",
    image_ref: imageRef,
    image_sha256: report.sha256,
    visual_report: report,
    state,
  };
}

export async function runFastPreviewJob(job, outputDir, dependencies = {}) {
  if (job?.schema_version === "frame-preview-fast-job-v2") {
    return runFastPreviewV2Job(job, outputDir, dependencies);
  }
  const startedAt = Date.now();
  validateJob(job);
  const outputRoot = path.resolve(outputDir);
  mkdirSync(outputRoot, { recursive: true });
  const visualStartedAt = Date.now();
  const options = {
    capture: dependencies.capture,
    rasterize: dependencies.rasterize ?? rasterizeSvg,
  };
  const rendered = job.visual.kind === "market_chart"
    ? await renderMarket(job, outputRoot, options)
    : await renderLogic(job, outputRoot, options);
  const candidate = job.preview.candidate;
  const state = rendered.state ?? job.preview.state;
  const preview = {
    schema_version: "frame-preview-v1",
    preview_id: job.preview.preview_id,
    state,
    created_at: job.preview.created_at,
    creator_view: job.preview.creator_view,
    query_binding: job.preview.query_binding,
    generation: { mode: "recommended_one", candidate_count: 1 },
    candidates: [{
      candidate_id: candidate.candidate_id,
      angle: candidate.angle,
      visual_kind: rendered.visual_kind,
      template_id: rendered.template_id,
      frame: { ...candidate.frame, image_ref: rendered.image_ref },
      image_sha256: rendered.image_sha256,
      evidence_refs: candidate.evidence_refs,
      quality_checks: QUALITY_CHECKS,
    }],
    selection: { selected_candidate_id: null, confirmed: false },
    blockers: [],
  };
  const previewValidation = validateFramePreview(preview, outputRoot);
  if (!previewValidation.valid) failValidation("Frame preview", previewValidation.errors);
  writeJson(path.join(outputRoot, "frame-preview-v1.json"), preview);
  const report = {
    schema_version: "frame-preview-fast-run-report-v1",
    preview_ref: "frame-preview-v1.json",
    visual_kind: rendered.visual_kind,
    visual_duration_ms: Date.now() - visualStartedAt,
    total_duration_ms: Date.now() - startedAt,
    visual_report: rendered.visual_report,
  };
  writeJson(path.join(outputRoot, "frame-preview-fast-run-report.json"), report);
  return { preview, report };
}

async function main() {
  const [input, outputDir] = process.argv.slice(2);
  if (!input || !outputDir || process.argv.length !== 4) {
    process.stderr.write("usage: run_fast_preview.mjs frame-preview-fast-job-v1-or-v2.json output-dir\n");
    process.exitCode = 2;
    return;
  }
  const job = JSON.parse(readFileSync(input, "utf8"));
  const result = await runFastPreviewJob(job, outputDir);
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
