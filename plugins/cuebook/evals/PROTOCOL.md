# Cuebook Skills Evaluation Protocol V1

Structural tests (schema, formula, geometry, binding) live in each skill's
`tests/`. This protocol covers what they cannot: trigger behavior, skill
effectiveness, and regression between skill versions.

## 1. Trigger evaluation

Source cases: each skill's `evals/trigger_cases.json` with four sets —
`positive` (must trigger), `negative` (must not), `neighboring` (must route to
the named skill instead), `adversarial` (must refuse or degrade honestly).

Procedure per platform (Codex today; Claude Code when its adapter lands):

- Run every case **three times** in a fresh session with the plugin loaded.
- Record which skill actually activated and, for `neighboring`, the full route.
- Score: `trigger_rate = triggered_correctly / (cases x runs)` per set.

Pass bars: positive ≥ 0.9, negative false-trigger ≤ 0.1, neighboring
route-correct ≥ 0.8. A regression of more than 0.1 against the previous
release blocks that release.

## 2. With/without comparison

For each public entrypoint and each substantive skill change:

- **with_skill**: current tree.
- **without_skill**: same prompt with the changed skill removed (baseline
  ability of the bare model plus MCP tools).
- **old_skill**: same prompt with the previous released version (regression).

Use a fixed prompt set (start from `positive` cases plus two real user
transcripts). For every run record:

| Field | Meaning |
| --- | --- |
| `quality` | human score 1-5 against the skill's own hard gates |
| `wall_time` | end-to-end seconds |
| `tokens` | input + output tokens attributed to the run |
| `violations` | count of hard-gate violations detected by validators |

A skill earns its context cost only when `with_skill` beats `without_skill`
on quality or violations without an unacceptable token/time cost.

## 3. Human scoring for rendered output

Visual and text artifacts additionally get a blind pairwise pass: shuffle
`with_skill` vs `old_skill` outputs, have a reviewer pick the better one per
pair and note the first confusing element. Three or more pairs per change.
Record results beside the release notes; the rendered audit remains the
objective floor, this scoring is the subjective ceiling.

## 4. Bookkeeping

Store run logs under `evals/runs/<date>-<platform>/` (not committed until a
release is cut). Every release notes the trigger rates and the with/without
verdict for skills changed since the last release.
