export function relativeSpec() {
  return {
    schema_version: "market-figure-spec-v1",
    spec_id: "FIGSPEC_testrelative20260714",
    revision: 1,
    state: "conditional",
    lineage: {
      input_artifact_refs: ["POST_testrelative20260714", "SETTLE_testrelative20260714"],
      visual_argument_ref: "VARG_testrelative20260714",
      thesis_chart_ref: "CHART_testrelative20260714",
      chart_data_ref: "CHART_testrelative20260714:data",
      indicator_pack_ref: "INDPACK_testrelative20260714",
      settlement_claim_ref: "SETTLE_testrelative20260714",
      news_fact_refs: ["F1"],
      decision_cutoff_at: "2026-07-14T08:30:00Z",
    },
    grammar: "relative_strength",
    frame: {
      kicker: "Hormuz risk",
      headline: "One supply shock, but USO is moving faster for now",
      viewpoint: "Crude futures absorb shipping risk first; energy equities still pass through cash flow and equity beta.",
    },
    news_anchor: {
      headline: "Tanker attacked in the outbound channel south of Hormuz",
      publisher: "UKMTO",
      published_at: "2026-07-14T07:27:30Z",
      status: "observed",
      fact_refs: ["F1"],
      source_refs: ["source:ukmto:test"],
    },
    curve: {
      title: "Synchronized returns since the July 13 close",
      x_axis: { kind: "time", label: "Time", unit: "UTC", zero_policy: "adaptive" },
      y_axis: { kind: "value", label: "Cumulative return", unit: "%", zero_policy: "include" },
      series: [
        {
          id: "S1",
          label: "USO",
          role: "primary",
          data_kind: "observed",
          transformation: "return_from_baseline",
          unit: "%",
          source_ref: "cuebook:market.candles:USO",
          formula: null,
          baseline: {
            value: 117.79,
            observed_at: "2026-07-13T20:00:00Z",
            source_ref: "cuebook:market.latest:USO",
          },
          points: [
            { x: "2026-07-13T20:00:00Z", y: 0, state: "sealed", source_ref: null },
            { x: "2026-07-14T08:27:43Z", y: 2.56, state: "forming", source_ref: null },
          ],
        },
        {
          id: "S2",
          label: "XLE",
          role: "benchmark",
          data_kind: "observed",
          transformation: "return_from_baseline",
          unit: "%",
          source_ref: "cuebook:market.candles:XLE",
          formula: null,
          baseline: {
            value: 56.74,
            observed_at: "2026-07-13T20:00:00Z",
            source_ref: "cuebook:market.latest:XLE",
          },
          points: [
            { x: "2026-07-13T20:00:00Z", y: 0, state: "sealed", source_ref: null },
            { x: "2026-07-14T08:26:07Z", y: 0.53, state: "forming", source_ref: null },
          ],
        },
      ],
      markers: [
        {
          id: "M1", kind: "event", x: "2026-07-14T07:27:30Z", y: null,
          label: "Attack", status: "observed", source_ref: "source:ukmto:test",
        },
        {
          id: "M2", kind: "expiry", x: "2026-07-14T20:00:00Z", y: null,
          label: "Settlement", status: "proposed", source_ref: "SETTLE_testrelative20260714",
        },
      ],
    },
    key_numbers: [
      {
        id: "K1", label: "USO", display_value: "+2.56%", numeric_value: 2.56, unit: "%",
        as_of: "2026-07-14T08:27:43Z", role: "magnitude", status: "provisional", source_ref: "INDPACK_test:I1",
      },
      {
        id: "K2", label: "XLE", display_value: "+0.53%", numeric_value: 0.53, unit: "%",
        as_of: "2026-07-14T08:26:07Z", role: "comparison", status: "provisional", source_ref: "INDPACK_test:I2",
      },
      {
        id: "K3", label: "Excess return", display_value: "+2.03pp", numeric_value: 2.03, unit: "pp",
        as_of: "2026-07-14T08:27:43Z", role: "settlement", status: "provisional", source_ref: "INDPACK_test:I3",
      },
    ],
    countercase: {
      label: "Countercase",
      condition: "If insurance terms do not tighten and transit normalizes, the risk premium may unwind.",
      source_refs: ["source:imo:test"],
    },
    settlement: {
      settleable: true,
      claim_ref: "SETTLE_testrelative20260714",
      deadline_at: "2026-07-14T20:00:00Z",
      success_line: "At the July 14 close, USO's return is higher than XLE's.",
      status: "needs_confirmation",
    },
    render: {
      layout: "compact", width: 720, height: 420, theme: "cuebook_light",
      watermark: "Cuebook", show_legend: true, show_sources: true,
    },
    quality_report: {
      decision: "conditional",
      warnings: ["Cuebook returned daily data and the latest bars are forming."],
      hard_failures: [],
    },
  };
}

export function instrumentMapSpec() {
  const payload = relativeSpec();
  Object.assign(payload, {
    spec_id: "FIGSPEC_testinstrumentmap20260714",
    state: "ready",
    grammar: "instrument_map",
    frame: {
      kicker: "Memory cycle · ETF vehicles",
      headline: "One memory cycle, four ETFs with different exposure",
      viewpoint: "The risk axis uses a shared 20-day window; the exposure axis comes from each fund's holdings or index constituents.",
    },
    news_anchor: null,
    curve: {
      title: "Shared 20-day annualized volatility vs memory-producer exposure",
      x_axis: { kind: "numeric", label: "20D annualized volatility", unit: "%", zero_policy: "adaptive" },
      y_axis: { kind: "value", label: "Memory exposure", unit: "pct", zero_policy: "include" },
      series: [{
        id: "S1",
        label: "ETF vehicles",
        role: "primary",
        data_kind: "formula",
        transformation: "risk_exposure_map",
        unit: "pct",
        source_ref: "VEHICLEPACK_memory_etfs_20260714",
        formula: "x=stdev(log_returns,20d)*sqrt(252); y=sum(memory_producer_weights)",
        baseline: null,
        points: [
          { x: 31.2, y: 4.9, state: "sealed", source_ref: "VEHICLE_SMH", label: "SMH" },
          { x: 43.8, y: 47.33, state: "sealed", source_ref: "VEHICLE_EWY", label: "EWY" },
          { x: 56.5, y: 96, state: "sealed", source_ref: "VEHICLE_DRAM", label: "DRAM" },
          { x: 118.4, y: 41.62, state: "sealed", source_ref: "VEHICLE_KORU", label: "KORU · 3x daily" },
        ],
      }],
      markers: [],
    },
    key_numbers: [
      {
        id: "K1", label: "EWY's two largest memory stocks", display_value: "47.33%", numeric_value: 47.33, unit: "%",
        as_of: "2026-07-07T20:00:00Z", role: "comparison", status: "observed", source_ref: "VEHICLE_EWY",
      },
      {
        id: "K2", label: "KORU daily target", display_value: "3x", numeric_value: 3, unit: "x",
        as_of: "2026-07-13T20:00:00Z", role: "risk", status: "observed", source_ref: "VEHICLE_KORU",
      },
    ],
    countercase: null,
    settlement: { settleable: false, claim_ref: null, deadline_at: null, success_line: null, status: "none" },
    quality_report: { decision: "ready", warnings: [], hard_failures: [] },
  });
  Object.assign(payload.lineage, {
    input_artifact_refs: ["VEHICLEPACK_memory_etfs_20260714"],
    visual_argument_ref: null,
    thesis_chart_ref: null,
    chart_data_ref: "VEHICLEPACK_memory_etfs_20260714",
    indicator_pack_ref: "INDPACK_memory_etfs_risk20d_20260714",
    settlement_claim_ref: null,
    news_fact_refs: [],
  });
  return payload;
}

export function semanticRelativeSpec() {
  const payload = relativeSpec();
  payload.argument_path = {
    mode: "causal_chain",
    nodes: [
      {
        id: "N1", kind: "event", label: "Tanker attacked in the outbound Hormuz channel",
        status: "observed", source_refs: ["source:ukmto:test"],
      },
      {
        id: "N2", kind: "mechanism", label: "Shipping risk enters crude futures first",
        status: "derived", source_refs: ["source:uso:methodology"],
      },
      {
        id: "N3", kind: "actor_action", label: "Tactical capital first buys direct crude exposure",
        status: "derived", source_refs: ["cuebook:market.candles:USO", "cuebook:market.candles:XLE"],
      },
      {
        id: "N4", kind: "market_effect", label: "USO reprices before XLE",
        status: "conditional", source_refs: ["INDPACK_test:I3"],
      },
    ],
    edges: [
      { from: "N1", to: "N2", relation: "causes", certainty: "inferred", label: "Risk repricing" },
      { from: "N2", to: "N3", relation: "enables", certainty: "inferred", label: "More direct transmission" },
      { from: "N3", to: "N4", relation: "causes", certainty: "hypothesis", label: "Lead-lag sequence" },
    ],
  };
  payload.trade_logic = {
    profile_ref: "TLOGIC_USO_XLE_HORMUZ_20260714",
    family: "event_driven",
    mechanism: "risk_premium_transmission",
    expression: "relative_value_pair",
    horizon: "one_to_three_days",
    public_tags: ["event-driven", "risk-premium flow", "relative value"],
  };
  payload.render.semantic_mode = "argument_curve";
  return payload;
}

export function sourceChartRedrawSpec() {
  const payload = relativeSpec();
  payload.spec_id = "FIGSPEC_testredraw20260715";
  payload.grammar = "positioning_pressure";
  payload.lineage.settlement_claim_ref = null;
  payload.settlement = { settleable: false, claim_ref: null, deadline_at: null, success_line: null, status: "none" };
  payload.curve.data_fidelity = "source_chart_redraw";
  payload.curve.markers = payload.curve.markers.slice(0, 1);
  const seed = payload.curve.series[0];
  payload.curve.series = Array.from({ length: 5 }, (_, index) => {
    const item = structuredClone(seed);
    Object.assign(item, {
      id: `S${index + 1}`,
      label: `Series ${index + 1}`,
      role: index === 0 ? "primary" : "context",
      data_kind: "digitized_observed",
      transformation: "positioning",
      unit: "ratio",
      source_ref: "source-chart:test",
      stroke_style: index === 0 ? "dashed" : "solid",
      color_role: index < 2 ? "focus" : "support",
      formula: null,
      baseline: null,
    });
    item.points.forEach((point, pointIndex) => {
      point.y = index * 0.1 + pointIndex * 0.05;
      point.state = "sealed";
    });
    return item;
  });
  payload.render.focus_series_ids = ["S1", "S2", "S3", "S4"];
  payload.render.endpoint_series_ids = ["S1", "S2"];
  payload.quality_report = {
    decision: "conditional",
    warnings: ["Source-chart redraw digitized from a supplied screenshot."],
    hard_failures: [],
  };
  return payload;
}
