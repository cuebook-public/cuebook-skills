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
  if (settlement?.mode === "standard_direction") {
    if (!beats.has("settlement_clock")) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_CLOCK", "$.preview.meaning_lock.visual_intent.required_beats", "A settleable visual lock must retain its deadline clock."));
    }
    if (settlement.direction !== creatorView.direction) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_DIRECTION", "$.preview.meaning_lock.settlement.direction", "Settlement direction must match the creator-confirmed direction."));
    }
    const expectedCondition = creatorView.direction === "long"
      ? "above_publication_baseline"
      : creatorView.direction === "short"
        ? "below_publication_baseline"
        : null;
    if (settlement.success_condition !== expectedCondition) {
      errors.push(issue("MEANING_LOCK_SETTLEMENT_OUTCOME", "$.preview.meaning_lock.settlement.success_condition", "The success condition must match the confirmed long or short direction."));
    }
    expressions.forEach((expression, index) => {
      if (!sameInstant(settlement.requested_settle_at, expression?.time?.horizon_end)) {
        errors.push(issue("MEANING_LOCK_DEADLINE", `$.expressions[${index}].time.horizon_end`, "Every rendered expression must use the creator-confirmed exact settlement deadline."));
      }
    });
  } else if (route === "market" && ["long", "short"].includes(creatorView.direction)) {
    errors.push(issue("MEANING_LOCK_SETTLEMENT_REQUIRED", "$.preview.meaning_lock.settlement", "An eligible single-asset long or short market preview must freeze standard settlement before rendering."));
  }

  return errors;
}
