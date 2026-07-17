export function baseBundle() {
  return {
    schema_version: "viewpoint-data-bundle-v1",
    bundle_id: "VDATA_benchmark01",
    revision: 1,
    state: "ready",
    temporal_mode: "declaration",
    lineage: {
      expression_plan_ref: "CEXP_benchmark01@r1",
      meaning_fingerprint: `sha256:${"a".repeat(64)}`,
      research_pack_ref: "RESEARCH_benchmark01",
      input_artifact_refs: ["CEXP_benchmark01@r1", "MSERIES_benchmark01"],
      decision_cutoff_at: "2026-07-14T08:00:00Z",
      as_of: "2026-07-14T08:00:00Z",
    },
    request: {
      grammar: "binary_level",
      visual_job: "Show whether price is holding the creator's explicit level.",
      required_kinds: ["ohlcv"],
      fallback_modes: ["qualitative", "key_numbers"],
    },
    instruments: [{
      instrument_id: "INS_primary",
      entity_ref: "ENTITY_000660",
      symbol: "000660",
      venue: "XKRX",
      currency: "KRW",
      role: "primary",
      mapping_source_ref: "ENTITYMAP_000660",
      mapping_limitation: null,
    }],
    series: [{
      series_id: "SER_ohlcv",
      kind: "ohlcv",
      label: "SK Hynix daily",
      instrument_refs: ["INS_primary"],
      unit: "KRW",
      interval: "1d",
      timezone: "Asia/Seoul",
      source_ref: "KRX_000660_daily",
      formula_ref: null,
      points: [
        { t: "2026-07-13T06:30:00Z", state: "sealed", source_ref: "KRX_bar_0713", available_at: "2026-07-13T06:31:00Z", o: 1900000, h: 1920000, l: 1810000, c: 1845000, v: 1000 },
        { t: "2026-07-14T06:30:00Z", state: "sealed", source_ref: "KRX_bar_0714", available_at: "2026-07-14T06:31:00Z", o: 1800000, h: 1930000, l: 1678000, c: 1913000, v: 1600 },
      ],
    }],
    key_values: [],
    events: [],
    levels: [],
    formulas: [],
    requirements: [{
      requirement_id: "REQ_ohlcv",
      expression_plan_requirement_ref: "CEXP_benchmark01@r1#/data_requirements/D1",
      kind: "ohlcv",
      request_class: "market_series",
      required: true,
      material_to_claim: false,
      expression_surfaces: ["visual"],
      status: "available",
      resolved_refs: ["SER_ohlcv"],
      missing_reason: null,
      fallback: null,
    }],
    render_payload: {
      mode: "series",
      series_refs: ["SER_ohlcv"],
      value_refs: [],
      event_refs: [],
      level_refs: [],
      formula_refs: [],
    },
    quality_report: {
      decision: "ready",
      hard_failures: [],
      warnings: [],
      checks: ["cutoff", "ohlcv", "source", "requirements"],
      counts: { instruments: 1, series: 1, key_values: 0, events: 0, levels: 0, formulas: 0, requirements: 1, missing_required: 0 },
    },
  };
}

export function expressionPlan() {
  return {
    plan_id: "CEXP_benchmark01",
    revision: 1,
    meaning_fingerprint: { fingerprint_sha256: `sha256:${"a".repeat(64)}` },
    data_requirements: [{
      id: "D1",
      kind: "series",
      request_class: "market_series",
      required: true,
      material_to_claim: false,
      expression_surfaces: ["visual"],
    }],
  };
}

export function sourcedEvent({ role = "news", sourceType = "issuer" } = {}) {
  return {
    event_id: "EV_catalyst",
    label: "Issuer announces the dated catalyst",
    at: "2026-07-14T05:00:00Z",
    available_at: "2026-07-14T05:01:00Z",
    source_ref: "SRC_issuer_announcement",
    publisher_or_issuer: "Example Issuer",
    source_type: sourceType,
    source_url: "https://example.com/announcement",
    supported_fact_refs: ["FACT_catalyst"],
    role,
  };
}

export function explicitLevel() {
  return {
    level_id: "LVL_trigger",
    label: "Creator trigger",
    instrument_ref: "INS_primary",
    value: 1900000,
    unit: "KRW",
    kind: "trigger",
    source_ref: "SRC_creator_level",
    fact_refs: ["FACT_creator_level"],
    observed_at: "2026-07-14T06:30:00Z",
    available_at: "2026-07-14T06:31:00Z",
    explicit: true,
  };
}

export function keyValue(valueId, instrumentRef, { valuation = false } = {}) {
  return {
    value_id: valueId,
    label: valuation ? "Forward P/E" : "Comparable metric",
    instrument_refs: [instrumentRef],
    numeric_value: 12.0,
    display_value: "12.0x",
    unit: "x",
    as_of: "2026-07-14T06:30:00Z",
    available_at: "2026-07-14T06:31:00Z",
    source_ref: `SRC_${valueId}`,
    evidence_kind: "reported",
    formula_ref: null,
    role: "comparison",
    valuation_basis: valuation ? {
      metric_name: "P/E",
      numerator: "price per share",
      denominator: "forward earnings per share",
      denominator_value: 100.0,
      period_basis: "forward",
      accounting_basis: "issuer guidance basis",
      currency_treatment: "same-currency per-share ratio",
      share_class: "common shares",
      comparability_notes: "Compared on the same forward period.",
    } : null,
  };
}

export function evidenceObject(shape, payload, { state = "observed", formulaRef = null, sourceRefs = null } = {}) {
  return {
    evidence_id: `EOBJ_${shape}`,
    shape,
    label: shape.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    state,
    as_of: "2026-07-14T07:30:00Z",
    available_at: "2026-07-14T07:31:00Z",
    source_refs: sourceRefs ?? [`SRC_${shape}`],
    formula_ref: formulaRef,
    payload,
  };
}

export function bundleWithEvidence(object, { requestClass = "qualitative_evidence" } = {}) {
  const item = baseBundle();
  const clonedObject = structuredClone(object);
  const shape = clonedObject.shape;
  item.evidence_objects = [clonedObject];
  item.request.required_kinds = [shape];
  Object.assign(item.requirements[0], {
    kind: shape,
    request_class: requestClass,
    resolved_refs: [clonedObject.evidence_id],
  });
  Object.assign(item.render_payload, {
    mode: "evidence",
    series_refs: [],
    evidence_object_refs: [clonedObject.evidence_id],
  });
  item.quality_report.counts.evidence_objects = 1;
  return item;
}
