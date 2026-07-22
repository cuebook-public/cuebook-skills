// Cross-check the creator-confirmed semantic package before any preview pixels are rendered.

function issue(code, issuePath, message) {
  return { code, path: issuePath, message };
}

function sameInstant(left, right) {
  return typeof left === "string"
    && typeof right === "string"
    && Number.isFinite(Date.parse(left))
    && Date.parse(left) === Date.parse(right);
}

export function validateMeaningLock({ preview, candidates, expressions, route }) {
  const errors = [];
  const lock = preview?.meaning_lock;
  const creatorView = preview?.creator_view;
  if (!lock || !creatorView) return errors;

  if (Date.parse(lock.confirmed_at) > Date.parse(preview.created_at)) {
    errors.push(issue("MEANING_LOCK_ORDER", "$.preview.meaning_lock.confirmed_at", "The creator must confirm the meaning lock before the preview job is created."));
  }

  for (const field of ["subject", "direction", "horizon", "claim", "mechanism", "next_watch"]) {
    if (lock[field] !== creatorView[field]) {
      errors.push(issue("MEANING_LOCK_VIEW_MISMATCH", `$.preview.meaning_lock.${field}`, `Meaning lock ${field} must exactly match creator_view.${field}.`));
    }
  }

  candidates.forEach((candidate, index) => {
    if (candidate?.frame?.title !== lock.title) {
      errors.push(issue("MEANING_LOCK_TITLE", `$.preview.candidates[${index}].frame.title`, "Rendered candidates must use the creator-confirmed title exactly."));
    }
    if (candidate?.frame?.body !== lock.body) {
      errors.push(issue("MEANING_LOCK_BODY", `$.preview.candidates[${index}].frame.body`, "Rendered candidates must use the creator-confirmed body exactly."));
    }
  });

  const beats = new Set(lock.visual_intent?.required_beats ?? []);
  if (expressions.some((expression) => expression?.observation_test !== null) && !beats.has("tested_observation")) {
    errors.push(issue("MEANING_LOCK_OBSERVATION", "$.preview.meaning_lock.visual_intent.required_beats", "A data-backed visual lock must retain the tested observation."));
  }
  if (expressions.some((expression) => expression?.argument?.mechanism) && !beats.has("mechanism")) {
    errors.push(issue("MEANING_LOCK_MECHANISM", "$.preview.meaning_lock.visual_intent.required_beats", "The visual lock must retain the creator's mechanism."));
  }
  if (expressions.some((expression) => expression?.market === null) && route === "market" && !beats.has("argument_structure")) {
    errors.push(issue("MEANING_LOCK_ARGUMENT", "$.preview.meaning_lock.visual_intent.required_beats", "A non-chart expression must retain visible argument structure."));
  }
  if (expressions.some((expression) => (expression?.future_beats?.length ?? 0) > 0) && !beats.has("future_check")) {
    errors.push(issue("MEANING_LOCK_FUTURE", "$.preview.meaning_lock.visual_intent.required_beats", "A dated visual lock must retain one future check."));
  }
  if (route === "market" && expressions.some((expression) => expression?.market !== null) && !beats.has("price_context")) {
    errors.push(issue("MEANING_LOCK_PRICE_CONTEXT", "$.preview.meaning_lock.visual_intent.required_beats", "A market geometry must retain a decision-useful historical price or performance context."));
  }
  if (route === "lens" && !beats.has("component_anatomy")) {
    errors.push(issue("MEANING_LOCK_COMPONENTS", "$.preview.meaning_lock.visual_intent.required_beats", "A Creator Lens must retain visible component anatomy."));
  }

  const settlement = lock.settlement;
  if (["standard_direction", "terminal_range", "relative_outperformance", "compound_conditions"].includes(settlement?.mode)) {
    if (!beats.has("settlement_clock")) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_CLOCK", "$.preview.meaning_lock.visual_intent.required_beats", "A settleable visual lock must retain its deadline clock."));
    }
    if (settlement.direction !== creatorView.direction) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_DIRECTION", "$.preview.meaning_lock.settlement.direction", "Settlement direction must match the creator-confirmed direction."));
    }
    const expectedCondition = {
      long: "above_publication_baseline",
      short: "below_publication_baseline",
      range: "within_publication_baseline_band_at_deadline",
      outperform: "focal_outperforms_pair",
      underperform: "focal_underperforms_pair",
      compound: "all_conditions_hit",
    }[creatorView.direction] ?? null;
    if (settlement.success_condition !== expectedCondition) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_OUTCOME", "$.preview.meaning_lock.settlement.success_condition", "The success condition must match the confirmed direction."));
    }
    if (settlement.mode === "terminal_range" && !beats.has("settlement_band")) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_BAND", "$.preview.meaning_lock.visual_intent.required_beats", "A range visual must retain the creator-confirmed symmetric terminal band."));
    }
    if (settlement.mode === "relative_outperformance") {
      const focal = settlement.asset_ref?.trim().toLowerCase().replace(/^asset:/u, "");
      const pair = settlement.pair_asset_ref?.trim().toLowerCase().replace(/^asset:/u, "");
      if (!focal || !pair || focal === pair) {
        errors.push(issue("MEANING_LOCK_RELATIVE_ASSETS", "$.preview.meaning_lock.settlement.pair_asset_ref", "Relative settlement requires two distinct creator-confirmed assets."));
      }
      if (!expressions.some((expression) => expression?.market?.benchmark && ["indexed_return", "relative_spread"].includes(expression.market.main_transform))) {
        errors.push(issue("MEANING_LOCK_RELATIVE_GEOMETRY", "$.expressions", "Relative settlement must show both assets through synchronized normalized returns or their return spread."));
      }
    }
    if (settlement.mode === "compound_conditions") {
      const focal = settlement.asset_ref?.trim().toLowerCase().replace(/^asset:/u, "");
      const pair = settlement.pair_asset_ref?.trim().toLowerCase().replace(/^asset:/u, "");
      if (!focal || !pair || focal === pair) {
        errors.push(issue("MEANING_LOCK_COMPOUND_ASSETS", "$.preview.meaning_lock.settlement.pair_asset_ref", "Compound settlement requires two distinct creator-confirmed assets."));
      }
      const directions = [settlement.primary_direction, settlement.pair_direction];
      const hasRange = directions.includes("range");
      const expectedFamily = hasRange ? "pair_asset_conditions" : "pair_asset_direction";
      if (settlement.family !== expectedFamily) {
        errors.push(issue("MEANING_LOCK_COMPOUND_FAMILY", "$.preview.meaning_lock.settlement.family", "A compound view uses pair_asset_conditions when either leg is a range, otherwise pair_asset_direction."));
      }
      const legFields = [
        ["primary", settlement.primary_direction, settlement.threshold_bps, settlement.max_abs_move_bps],
        ["pair", settlement.pair_direction, settlement.pair_threshold_bps, settlement.pair_max_abs_move_bps],
      ];
      for (const [role, direction, threshold, band] of legFields) {
        if (direction === "range") {
          if (threshold !== null || typeof band !== "string") {
            errors.push(issue("MEANING_LOCK_COMPOUND_RANGE", `$.preview.meaning_lock.settlement.${role === "primary" ? "max_abs_move_bps" : "pair_max_abs_move_bps"}`, "A range leg freezes its exact band and no directional threshold."));
          }
        } else if (threshold !== "0" || band !== null) {
          errors.push(issue("MEANING_LOCK_COMPOUND_DIRECTION", `$.preview.meaning_lock.settlement.${role === "primary" ? "threshold_bps" : "pair_threshold_bps"}`, "Atomic compound direction legs use a fixed zero-bps threshold and no range band."));
        }
      }
      if (!beats.has("condition_join")) {
        errors.push(issue("MEANING_LOCK_COMPOUND_JOIN", "$.preview.meaning_lock.visual_intent.required_beats", "A compound visual must say that both conditions are joined by AND."));
      }
      if (hasRange && !beats.has("settlement_band")) {
        errors.push(issue("MEANING_LOCK_SETTLEMENT_BAND", "$.preview.meaning_lock.visual_intent.required_beats", "A compound range visual must retain every creator-confirmed symmetric terminal band."));
      }
      if (!expressions.some((expression) => expression?.market?.benchmark && ["indexed_return", "drawdown"].includes(expression.market.main_transform))) {
        errors.push(issue("MEANING_LOCK_COMPOUND_GEOMETRY", "$.expressions", "A compound visual must show both assets on synchronized baseline-relative geometry."));
      }
      const compoundBeat = expressions.flatMap((expression) => expression?.future_beats ?? []).find((beat) => (
        beat.role === "settlement"
        && sameInstant(beat.at, settlement.requested_settle_at)
        && /(?:\bAND\b|both|\u540c\u65f6|\u90fd|\u4e14)/iu.test(beat.label)
      ));
      if (!compoundBeat) {
        errors.push(issue("MEANING_LOCK_COMPOUND_RULE", "$.expressions[*].future_beats", "The visible deadline label must state that both frozen conditions are required."));
      }
    }
    expressions.forEach((expression, index) => {
      if (!sameInstant(settlement.requested_settle_at, expression?.time?.horizon_end)) {
        errors.push(issue("MEANING_LOCK_DEADLINE", `$.expressions[${index}].time.horizon_end`, "Every rendered expression must use the creator-confirmed exact settlement deadline."));
      }
    });
  } else if (route === "market" && ["long", "short", "range", "outperform", "underperform", "compound"].includes(creatorView.direction)) {
    errors.push(issue("MEANING_LOCK_SETTLEMENT_REQUIRED", "$.preview.meaning_lock.settlement", "An eligible market preview must freeze its confirmed settlement before rendering."));
  }

  return errors;
}
