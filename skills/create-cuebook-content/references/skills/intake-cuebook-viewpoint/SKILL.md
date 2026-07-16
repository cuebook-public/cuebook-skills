---
name: intake-cuebook-viewpoint
description: Run the conversational front door for a fresh Cuebook viewpoint. Triage free-form visitor input into 查询 versus 表达观点, extract asset, direction, horizon, and optional price anchor only from what the user actually said, elicit missing required fields at most two per round, verify them against Cuebook (search_assets, get_market_state), confirm one recap card, and hand a validated ViewpointIntakeV1 seed to create-cuebook-content or compile-cuebook-market-view-semantics. Use when a user 刚进来随口表达观点 (我觉得、我看多、帮我记个观点), when required view fields are missing or unverified, or when it is unclear whether the user wants to browse or create. Route pure lookups to query-cuebook and never force creation. Do not draft posts, design graphics, compile settlement claims, invent unstated fields, or nag a user who only wants to look around.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Python 3.11+ for validators.
---

# Intake Cuebook Viewpoint

Be the calm first contact between a person and the Cuebook creation pipeline. A visitor speaks freely; this Skill decides whether they are browsing or expressing a view, completes the minimum viable view contract through short follow-ups, verifies it against real Cuebook state, and returns a structured seed. It asks like a colleague confirming a trade note, not like a form.

## Minimum View Contract

- **asset** (required): one canonical Cuebook asset ref. A `relative` view additionally captures **pair_asset** (the leg it beats).
- **direction** (required): `long`, `short`, `relative`, `avoid`, `watch`, `explain`, or `neutral`. Only the first three are settleable: `relative` must be confirmed as a two-asset long-short pair; `avoid/watch/explain/neutral` views can be stored but never carry a settlement family or publish as a market_view Frame — say so plainly instead of coercing them.
- **horizon** (required): a window the user owns, captured as a `HorizonIntentV1`-compatible intent (duration in hour/calendar_day/market_session, or an instant) with the creator timezone. **Bounds: at least 1 hour, at most 6 months.** Outside the bounds, offer the nearest valid window; do not silently clamp.
- **settlement** (required for settleable directions): one of the four launch families — `single_asset_direction`, `single_asset_price_target`, `pair_asset_direction`, `pair_asset_price_targets`. Direction families freeze an **explicit** `threshold_bps`; a default of 0 is still spoken and recorded as `"0"`.
- **price_anchor** (optional unless the family is a price target): target/trigger level with a direction-consistent operator (`gt/gte` for long, `lt/lte` for short).

Every captured field carries provenance: `stated` (present in the raw input), `elicited` (answered to a follow-up), or `inferred_confirmed` (inferred by the Skill and explicitly confirmed by the user). `missing` is honest and blocks settlement; a manufactured value is never acceptable.

## Workflow

1. **Triage.** Classify the input as `express_view`, `query_only`, `mixed`, or `unclear`. 看、查、搜、比较 with no ownable judgment is `query_only`: set `query_route: query-cuebook`, state `query_routed`, and stop — intake never converts a browser into a creator. For `mixed`, answer the lookup through query-cuebook first, then offer (once) to capture the view. For `unclear`, ask one orienting question before any field elicitation.
2. **Extract before asking.** Pull asset, direction, horizon, and price anchor from the raw text and mark them `stated`. Absolutize relative time (明天, 月底, 财报前) against `received_at`. Never ask for something the user already said.
3. **Elicit only the gap.** Ask for missing required fields at most **two per round**, normally within three rounds. Offer concrete choices where they help (48H / 30D / 90D; USO vs CL vs XLE when the asset is ambiguous; 「按方向对错结算，还是挂个目标价？」 for the settlement family). A `relative` view gets one follow-up for the second asset. Log every round in `elicitation_log` with the exact prompt. Mention the price anchor once as optional for direction families; a decline is `skipped`, not a blocker. If the user backs off (算了 / 就是聊聊), set `abandoned` and stop without persuasion.
4. **Verify.**
   - Asset: resolve through `search_assets`; never guess a canonical ref from a display ticker. Multiple hits become `candidates` plus one clarifying question (counts toward the round budget).
   - Horizon: a future window inside the 1-hour-to-6-month bounds, structured as duration or instant with timezone.
   - Direction: consistent with the user's own wording; a bearish sentence with a `long` value fails.
   - **Target versus direction**: check the target against the reference price from `get_market_state`. A long target at or below the current price (or a short target at or above it) is a contradiction — ask once, plainly: 「500 在现价 550 下方——你是想做空吗？」 A confirmed flip is `elicited`; if the user insists on the contradictory pair, the intake ends `blocked` with the reason recorded. Never publish a target the arithmetic refutes.
   - Price anchor sanity: a large deviation from the reference is `warn` surfaced back to the user, not silently accepted. A missing backend capability produces `unavailable`, never an invented reference value.
5. **Confirm.** Render one recap card — `asset · horizon · direction · optional anchor · one-line gist` — and get an explicit yes or an edit. Edits reopen only the changed field.
6. **Hand back.** On confirmation, build `handback.seed` (asset refs, direction, horizon intent, settlement family, explicit threshold, optional target + operator — everything a `SettlementIntentV1` needs) and set the target: `create-cuebook-content` when the user wants published content, `compile-cuebook-market-view-semantics` when they want the view structured and kept, `store_only` when they just want it remembered or the direction is non-settleable. `query_routed`, `abandoned`, and `blocked` (unresolved contradiction, out-of-bounds horizon the user will not adjust) are complete, honest terminals, not failures.

## Hard Gates

- Never fill a field the user did not state or confirm. `inferred_confirmed` requires a logged confirmation round.
- At most two fields per elicitation round; the validator rejects more.
- A `query_only` visitor never enters creation; the only valid terminals are `query_routed` and `abandoned`.
- No canonical asset guessed from a display name; resolution goes through `search_assets` or stays `unavailable`.
- A settled horizon is structured (duration or instant, with timezone) and sits inside 1 hour to 6 months.
- A long target never sits at or below the reference price, and a short target never at or above it. One clarifying question may flip the direction; an unresolved contradiction is `blocked`, never published.
- `avoid/watch/explain/neutral` never carry a settlement family; direction families never omit an explicit threshold; pair families never omit the second asset.
- Hand back requires the confirmed recap card, passing verification, and an eligible seed.
- Do not draft prose, graphics, theses, or settlement claims here; downstream Skills own those.

## Output

Return `references/viewpoint-intake-v1.schema.json`. Validate with:

```bash
python scripts/validate_viewpoint_intake.py viewpoint-intake-v1.json
```

Use only read tools declared in `../../../assets/plugin/mcp-capability-map-v1.json`. Downstream: `../query-cuebook/SKILL.md` for lookups, `../../../SKILL.md` or `../compile-cuebook-market-view-semantics/SKILL.md` for the confirmed seed.
