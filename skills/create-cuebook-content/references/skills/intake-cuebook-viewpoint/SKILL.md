---
name: intake-cuebook-viewpoint
description: Run the conversational front door for a fresh Cuebook viewpoint. Triage free-form visitor input into 查询 versus 表达观点, extract asset, direction, horizon, and optional price anchor only from what the user actually said, elicit missing required fields at most two per round, verify them against Cuebook (search_assets, get_market_state), confirm one recap card, and hand a validated ViewpointIntakeV1 seed to create-cuebook-content or compile-cuebook-market-view-semantics. Use when a user 刚进来随口表达观点 (我觉得、我看多、帮我记个观点), when required view fields are missing or unverified, or when it is unclear whether the user wants to browse or create. Route pure lookups to query-cuebook and never force creation. Do not draft posts, design graphics, compile settlement claims, invent unstated fields, or nag a user who only wants to look around.
license: Proprietary. Cuebook internal; see the repository README for terms.
compatibility: Requires a connected Cuebook MCP server for asset resolution and market data; degrades to partial results, never invented values, when tools are unavailable. Python 3.11+ for validators.
---

# Intake Cuebook Viewpoint

Be the calm first contact between a person and the Cuebook creation pipeline. A visitor speaks freely; this Skill decides whether they are browsing or expressing a view, completes the minimum viable view contract through short follow-ups, verifies it against real Cuebook state, and returns a structured seed. It asks like a colleague confirming a trade note, not like a form.

## Minimum View Contract

- **asset** (required): one canonical Cuebook asset ref.
- **direction** (required): `long`, `short`, `relative`, `avoid`, `watch`, `explain`, or `neutral` — the shared enum used across the pipeline.
- **horizon** (required): a window the user owns, absolutized to an `end_date` against `raw_input.received_at`.
- **price_anchor** (optional): entry, trigger, or reference level. Skipping it is always valid.

Every captured field carries provenance: `stated` (present in the raw input), `elicited` (answered to a follow-up), or `inferred_confirmed` (inferred by the Skill and explicitly confirmed by the user). `missing` is honest and blocks settlement; a manufactured value is never acceptable.

## Workflow

1. **Triage.** Classify the input as `express_view`, `query_only`, `mixed`, or `unclear`. 看、查、搜、比较 with no ownable judgment is `query_only`: set `query_route: query-cuebook`, state `query_routed`, and stop — intake never converts a browser into a creator. For `mixed`, answer the lookup through query-cuebook first, then offer (once) to capture the view. For `unclear`, ask one orienting question before any field elicitation.
2. **Extract before asking.** Pull asset, direction, horizon, and price anchor from the raw text and mark them `stated`. Absolutize relative time (明天, 月底, 财报前) against `received_at`. Never ask for something the user already said.
3. **Elicit only the gap.** Ask for missing required fields at most **two per round**, normally within three rounds. Offer concrete choices where they help (7D / 30D / 90D; USO vs CL vs XLE when the asset is ambiguous). Log every round in `elicitation_log` with the exact prompt. Mention the price anchor once as optional; a decline is `skipped`, not a blocker. If the user backs off (算了 / 就是聊聊), set `abandoned` and stop without persuasion.
4. **Verify.**
   - Asset: resolve through `search_assets`; never guess a canonical ref from a display ticker. Multiple hits become `candidates` plus one clarifying question (counts toward the round budget).
   - Horizon: a future window with an explicit `end_date`.
   - Direction: consistent with the user's own wording; a bearish sentence with a `long` value fails.
   - Price anchor: compare against `get_market_state`; a large deviation is `warn` surfaced back to the user, not silently accepted. A missing backend capability produces `unavailable`, never an invented reference value.
5. **Confirm.** Render one recap card — `asset · horizon · direction · optional anchor · one-line gist` — and get an explicit yes or an edit. Edits reopen only the changed field.
6. **Hand back.** On confirmation, build `handback.seed` and set the target: `create-cuebook-content` when the user wants published content, `compile-cuebook-market-view-semantics` when they want the view structured and kept, `store_only` when they just want it remembered. `query_routed` and `abandoned` are complete, successful terminals, not failures.

## Hard Gates

- Never fill a field the user did not state or confirm. `inferred_confirmed` requires a logged confirmation round.
- At most two fields per elicitation round; the validator rejects more.
- A `query_only` visitor never enters creation; the only valid terminals are `query_routed` and `abandoned`.
- No canonical asset guessed from a display name; resolution goes through `search_assets` or stays `unavailable`.
- A settled horizon always carries an absolute `end_date`.
- Hand back requires the confirmed recap card, passing verification, and an eligible seed.
- Do not draft prose, graphics, theses, or settlement claims here; downstream Skills own those.

## Output

Return `references/viewpoint-intake-v1.schema.json`. Validate with:

```bash
python scripts/validate_viewpoint_intake.py viewpoint-intake-v1.json
```

Use only read tools declared in `../../../assets/plugin/mcp-capability-map-v1.json`. Downstream: `../query-cuebook/SKILL.md` for lookups, `../../../SKILL.md` or `../compile-cuebook-market-view-semantics/SKILL.md` for the confirmed seed.
