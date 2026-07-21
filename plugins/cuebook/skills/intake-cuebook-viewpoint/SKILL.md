---
name: intake-cuebook-viewpoint
description: Run the conversational front door for a fresh Cuebook viewpoint. Triage free-form input into a lookup versus an expressed viewpoint, extract asset, direction, and horizon only from what the user said, then—once the asset is resolved—use at most one aligned and one contrasting or adjacent Cuebook Cue as optional thought anchors in one heuristic interview. Continue immediately when skipped. Verify required fields against Cuebook, confirm one recap card, and hand a validated ViewpointIntakeV1 seed to create-cuebook-content or compile-cuebook-market-view-semantics. Use when a user casually expresses a new view, required fields are missing or unverified, or browse versus create is unclear. Route pure lookups to query-cuebook and never force creation. Do not draft posts, graphics, or settlement claims, turn a Cue into creator ownership, invent fields, or nag a visitor.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Node.js 18+ for validators.
---

# Intake Cuebook Viewpoint

Be the calm first contact between a person and the Cuebook creation pipeline. A visitor speaks freely; this Skill decides whether they are browsing or expressing a view, completes the minimum viable view contract through short follow-ups, verifies it against real Cuebook state, and returns a structured seed. It asks like a colleague confirming a trade note, not like a form.

## Minimum View Contract

- **asset** (required): one canonical Cuebook asset ref. A `relative` view additionally captures **pair_asset** (the leg it beats).
- **direction** (required): `long`, `short`, `relative`, `avoid`, `watch`, `explain`, or `neutral`. Only the first three are settleable: `relative` must be confirmed as a two-asset long-short pair; `avoid/watch/explain/neutral` views can be stored but never carry a settlement family or publish as a market_view Frame — say so plainly instead of coercing them.
- **horizon** (required): a window the user owns, captured as a `HorizonIntentV1`-compatible duration in hours or calendar days, or as an exact instant, with the creator timezone. **Bounds: at least 1 hour, at most 6 months.** Outside the bounds, offer the nearest valid window; do not silently clamp. Never ask the creator to choose a trading-session or next-close policy.
- **creator context** (optional): any triggering news or event, market clue or signal, and intuition or inspiration the creator wants amplified. After the minimum view and canonical asset are known, one compact interview may use up to two relevant Cuebook Cues as optional thought anchors. A skip is complete and never blocks creation.
- **settlement** (derived before rendering): an eligible single-asset `long` or `short` uses `single_asset_direction` automatically, with `threshold_bps: "0"`, `session_policy: "at_instant"`, and the exact creator-owned deadline. Record its provenance as `policy_default`. Intake may hand the derivation to Create, but Create must validate it and include the human rule in the text-only Meaning Lock before any pixels are rendered. The later publish confirmation authorizes only the external write. Ask a separate settlement question only when the creator requests a price-target or pair override.
- **price_anchor** (optional unless the family is a price target): target/trigger level with a direction-consistent operator (`gt/gte` for long, `lt/lte` for short).

Every creator-supplied field carries provenance: `stated` (present in the raw input), `elicited` (answered to a follow-up), or `inferred_confirmed` (inferred by the Skill and explicitly confirmed by the user). When the target is a publishable Frame, server policy may deterministically supply the standard zero-threshold direction rule before Create presents the Meaning Lock; it must never manufacture an asset, direction, horizon, target, or pair.

## Workflow

1. **Triage.** Classify the input as `express_view`, `query_only`, `mixed`, or `unclear`. Read, search, inspect, or compare intent with no ownable judgment is `query_only`: set `query_route: query-cuebook`, state `query_routed`, and stop—intake never converts a browser into a creator. For `mixed`, answer the lookup through query-cuebook first, then offer (once) to capture the view. For `unclear`, ask one orienting question before any field elicitation.
2. **Extract before asking.** Pull asset, direction, horizon, any volunteered price anchor, triggering news/events, clues/signals, and intuition/inspiration from the raw text. Mark structured fields `stated`; preserve creator context as working notes and later distill it into `because_gist`. Absolutize relative time such as tomorrow, month-end, or before earnings against `received_at`. Never ask for something the user already said.
3. **Complete only the rigid gap.** Ask for missing asset, direction, horizon, or pair asset at most **two per round**. Offer concrete choices where they help (48H / 30D / 90D; USO vs CL vs XLE when the asset is ambiguous). Do not ask settlement or price yet.
4. **Resolve before the open interview.** Resolve the asset through `search_assets`; never guess a canonical ref from a display ticker. Multiple hits become `candidates` plus one clarifying question (counts toward the round budget). Once resolved, call `list_asset_cues` in the shared read phase and select at most one relevant, time-legible aligned Cue plus one contrasting or adjacent Cue; use `get_cues` only for selected details. Use fewer when they add no material thinking value. An older Cue may be a dated analogy or prior, never current state.
5. **Interview heuristically once, then move.** Reflect the distinctive kernel in one tentative sentence and paraphrase selected Cues as other published viewpoints, not facts or consensus. Let the aligned Cue deepen mechanism or why-now and the contrasting/adjacent Cue expose another regime, actor, comparator, next footprint, or countercase. Ask only one primary heuristic: anomaly, causal bridge, why now, next observable footprint, market blind spot, or creator emphasis. One concrete-memory deepener is allowed in the same round. Never attribute a Cue-derived explanation to the creator unless they adopt it; record adoption or rejection explicitly. Log the exact prompt with `news_signal` and/or `intuition`. Explicitly allow “use my original idea.” A skip or refusal closes the interview and starts the next phase immediately; never repeat it, penalize the result, use Cue popularity as pressure, or ask the creator to prove a clearly framed inference.
6. **Derive the standard release rule.** This step always follows the interview or its skip. For an explicit publication request with a resolved single asset, `long` or `short` direction, and horizon, derive `single_asset_direction` with `threshold_bps: "0"`; the deadline is the exact calendar instant implied by the horizon. Do not offer settlement families, sessions, trading days, or a second confirmation. Ask for a price only when the creator explicitly requests a price target. A `relative` view gets one follow-up for the second asset and may block when the backend cannot settle the pair. Log only questions actually asked. If the user backs off or says they only want to discuss the idea, set `abandoned` and stop without persuasion.
7. **Verify.**
   - Horizon: a future window inside the 1-hour-to-6-month bounds, structured as duration or instant with timezone.
   - Direction: consistent with the user's own wording; a bearish sentence with a `long` value fails.
   - **Target versus direction**: check the target against the reference price from `get_market_state`. A long target at or below the current price (or a short target at or above it) is a contradiction—ask once, plainly: “500 is below the current price of 550. Did you mean to go short?” A confirmed flip is `elicited`; if the user insists on the contradictory pair, the intake ends `blocked` with the reason recorded. Never publish a target the arithmetic refutes.
   - Price anchor sanity: a large deviation from the reference is `warn` surfaced back to the user, not silently accepted. A missing backend capability produces `unavailable`, never an invented reference value.
8. **Confirm the intake once.** Render one recap card — `asset · horizon · direction · optional target · one-line gist` — and get an explicit yes or an edit. Include only Cue-derived reasoning the creator adopted. This confirms the intake, not yet the exact public copy or settlement wording. Create will later show one combined text-only Meaning Lock before rendering. Edits reopen only the changed field.
9. **Hand back.** On confirmation, build `handback.seed` with the creator's claim and context, asset refs, direction, and horizon. Preserve adopted Cue source refs and keep rejected or unused Cues outside the creator seed. Include settlement family, explicit threshold, or target + operator when already derived or creator-selected. A creation handback may carry `settlement_family: null` only as a request for Create to derive and validate the standard rule before its Meaning Lock; null never permits rendering first and filling settlement during upload. Set the target: `create-cuebook-content` when the user wants published content, `compile-cuebook-market-view-semantics` when they want the view structured and kept, `store_only` when they just want it remembered or the direction is non-settleable. `query_routed`, `abandoned`, and `blocked` (unresolved contradiction, out-of-bounds horizon the user will not adjust) are complete, honest terminals, not failures.

## Hard Gates

- Never fill an asset, direction, horizon, target, pair, or creator rationale the user did not state or confirm. The only policy-derived launch values are the standard single-asset family and zero-bps threshold for a publishable Frame, and Create must show their human meaning before rendering.
- At most two fields per elicitation round; the validator rejects more.
- The optional creator interview happens at most once and before every settlement or price question. It uses at most two Cues and never treats another published view as proof, consensus, or creator adoption. `Go ahead`, `use my original idea`, `that is all`, `nothing more`, or an equivalent refusal in any language closes it without another prompt.
- A `query_only` visitor never enters creation; the only valid terminals are `query_routed` and `abandoned`.
- No canonical asset guessed from a display name; resolution goes through `search_assets` or stays `unavailable`.
- A settled horizon is structured (hour/calendar-day duration or instant, with timezone), sits inside 1 hour to 6 months, and resolves to one exact deadline. New creator flows never ask for a market-session count.
- A long target never sits at or below the reference price, and a short target never at or above it. One clarifying question may flip the direction; an unresolved contradiction is `blocked`, never published.
- `avoid/watch/explain/neutral` never carry a settlement family; direction families never omit an explicit threshold; pair families never omit the second asset.
- Hand back requires the confirmed recap card, passing verification, and an eligible seed.
- Do not draft prose, graphics, theses, or settlement claims here; downstream Skills own those.

## Output

Return `references/viewpoint-intake-v1.schema.json`. Validate with:

```bash
node scripts/validate_viewpoint_intake.mjs viewpoint-intake-v1.json
```

Use only read tools declared in `../../assets/mcp-capability-map-v1.json`. Downstream: `$query-cuebook` for lookups, `$create-cuebook-content` or `$compile-cuebook-market-view-semantics` for the confirmed seed.
