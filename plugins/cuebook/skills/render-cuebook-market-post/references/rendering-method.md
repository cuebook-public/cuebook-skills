# Cuebook Market Rendering Method

## 1. Evidence Classes

Build the fact ledger before writing.

| Class | Meaning | Allowed wording |
| --- | --- | --- |
| `source` | Present in the Cuebook source or attached primary evidence | State directly and attribute when useful |
| `verified-live` | Confirmed from a current authoritative or market-data source | State with source and `as_of` |
| `derived` | Calculation or causal read based on ledger facts | State as analysis; expose the inputs |
| `hypothesis` | Tradable idea that still needs confirmation | Use conditional language and name the next observable |

Do not promote a `derived` claim into a source fact. Do not use `hypothesis` wording as a reported fact.

Freshness is independent of evidence class:

- `current`: inside the brief's freshness window.
- `stale`: outside the window but still historically relevant.
- `unknown`: no reliable event or observation time.

## 2. ResearchPackV1 Handoff

When a validated ResearchPackV1 is available:

- preserve source and fact IDs instead of re-summarizing provenance;
- use its comparator table for beat/miss, guidance, revision, and prior-period language;
- use its market context for event-window, benchmark, liquidity, valuation, and positioning claims;
- keep its gaps, counterevidence, scenarios, and invalidation available to the internal angle decision;
- do not upgrade a `conditional` or `blocked` research decision during rendering.

Copy `quality_report.decision` into `PostV1.research_decision`. Derive publication state from the stricter input: `reject` or `blocked` becomes `blocked`; `caution` or `conditional` becomes `conditional`; only `pass` plus `ready` or no research pack can become `ready`.

Build a ResearchPackV1 first when the requested post depends on several missing research modules. A one-fact current update can still use the renderer's local fact ledger.

## 3. Angle Selection

### Cuebook-assisted discovery

Use this mode only when there is a real creator seed. Preserve five parts in internal `assisted_discovery`: creator seed, Cue/evidence-linked additions with acceptance or rejection, creator judgment, idea delta, and final trade idea. Set `public_attribution: false`; only adopted additions enter the completed market judgment, and public copy never describes the assistance process.

External facts and source views still receive normal source attribution. Cuebook workflow, accepted/rejected additions, and idea delta stay outside body copy and selector copy.

Keep quote semantics exact. “Current price” in prose may be a last trade, last close, or midpoint underneath; preserve that basis and timestamp in the artifact.

Create at least two candidate tensions when the cue is publishable:

- number versus consensus or prior
- headline versus model-line change
- story versus tape
- event versus forced flow
- probability versus hedge behavior
- financing benefit versus future burden
- product proof versus duration
- anecdote versus market-wide evidence

Pick the angle with the strongest ledger support and clearest next condition. Prefer an expectation or tape disagreement over a generic summary. Do not choose an angle because it sounds dramatic.

### Trading-idea completion

Before drafting, build a private logic map with seven fields: creator judgment, observed change, market disagreement, pressured actor, transmission, asset/horizon expression, and next observable. Label every field `explicit`, `implied`, `evidence_supplied`, or `unavailable`.

Use research only to supply missing factual fields that materially change comprehension. Relevant Cues may propose a connection, countercase, comparator, or next footprint for the creator to adopt or reject; they do not establish it as fact. Every supplied factual link needs a fact reference, while an adopted causal bridge, analogy, scenario, or expectation may remain explicitly typed as `hypothesis`. Keep unavailable factual links out of the prose; do not cover them with generic market language. The public draft should read as one coherent view, with no mention of prompts, research passes, Cuebook help, idea delta, or authoring workflow.

Counterevidence and invalidation remain available for internal confidence and settlement artifacts. Body copy includes them only when they materially improve the creator's view or the user explicitly asks. Translate them into a neutral watch or change in confidence; never use `invalidation`, `falsification condition`, `I admit I was wrong`, `where I was wrong`, `what would prove this wrong`, or locale-equivalent headings.

## 4. Using ProfileV1

A profile may adjust:

- which supported facts receive attention
- preferred reasoning moves
- opening shape and paragraph rhythm
- density, jargon, and Frame reading distance
- preferred source types and recurring watch items

A profile may not add facts, private access, biography, exact catchphrases, or a claim that the draft came from the profiled person. Record every applied profile rule ID in `angle.profile_rule_ids`.

## 5. Frame Shape

The Frame surface always presents one title, one body, and one paired image. Use plain, market-native language. Lead with the strongest tested observation or creator judgment, connect the actors and transmission mechanism in a short causal sequence, and end with the horizon plus one confirming or weakening next observable.

Choose body shape from argument complexity. Most Chinese Frames fit within two to seven paragraphs and roughly 160–1,100 visible characters (about 70–450 English words), with a 1,200-character hard Frame ceiling. These are capacity bounds, not targets: finish when the argument is complete, vary paragraph mass and sentence rhythm, and never add generic background simply to make it longer. Let the image carry the observed relationship, selected reasoning beats, and a deadline or observation marker when material. Do not duplicate every image label in prose, append source lists or settlement forms to the body, or manufacture a future price path.

The opening paragraph must stand alone as a Feed lead if the App truncates the detail body. Use later paragraphs only for the causal links, comparisons, or future observation this particular idea needs. The final paragraph need not be a standardized risk boundary; it may end on consequence, tension, catalyst, horizon, or a softly worded reason to revisit.

Facts, inferences, and the creator's viewpoint remain distinct in the evidence ledger even when the public wording is seamless. A material contradiction is surfaced to the creator for a decision; it is not silently rewritten into a different view.

## 6. Focused Editing Passes

Run these passes separately so one kind of edit does not hide another:

1. **Evidence**: map every hard claim and number to the ledger; preserve basis, period, and freshness.
2. **Market consequence**: make each paragraph answer what changes for a model, price, probability, cash flow, or exposed actor. Cut paragraphs that only announce analysis.
3. **Human language**: preserve the claim while removing abstract connectors, generic warnings, engagement bait, and template residue. Keep one thought per paragraph and vary sentence length naturally.
4. **Platform fit**: tune length, density, jargon, title, links, and ending for the requested surface.

After editing, read only the public draft. It should stand on its own without schema names, gate codes, or research-process narration.

## 7. Human-Language Checks

Delete any sentence that only announces analysis. Replace abstractions with an actor, number, date, level, or observable action. Vary sentence length naturally. One casual phrase can help; a stack of catchphrases reads manufactured.

Before returning, read only the draft without the research fields. It should make sense to a market reader and should not reveal internal schema names or gate codes.
