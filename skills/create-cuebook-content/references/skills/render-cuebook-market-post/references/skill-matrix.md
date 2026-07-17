# Cuebook Market Content Matrix

This matrix helps choose a market tension after projection validation and source-first routing. Event type, reasoning lens, Frame composition, and tone remain separate controls.

## Event Matrix

| Event type | Useful reasoning lens | Context to verify | Strong tension | Actor to name | Typical blocker |
| --- | --- | --- | --- | --- | --- |
| `company-guidance` | model revision | new range, prior range, consensus, price reaction | reported range versus what models carried | analysts and PMs | reiterated guidance presented as a fresh raise |
| `earnings-result` | model revision | actual, consensus, mix, margin, guide | headline beat versus the line that matters | analysts, holders, shorts | beat/miss label without comparator |
| `inventory-print` | model revision / macro balance | actual, consensus, prior, next release, spot reaction | surplus or deficit versus positioning | directional holders and commodity desks | one number without seasonal or consensus context |
| `technical-level` | forced flow | level, distance, volume, ATR, reclaim condition | intact story versus broken tape | levered holders and systematic sellers | level has no timestamp or chart source |
| `prediction-market` | probability positioning | probability delta, volume, depth, expiry, spot hedge | odds move versus real-world confirmation | hedgers and event traders | probability treated as truth |
| `mechanical-flow` | forced flow | effective date, expected flow, float, ADV, execution | changed buyer base versus unchanged fundamentals | passive funds, issuer, insiders | index add, buyback, issuance, or unlock written as analyst opinion |
| `credit-financing` | cash flow and credit | principal, coupon, maturity, cash, FCF, leverage | longer runway versus heavier service burden | creditors and equity holders | financing success treated as unqualified equity upside |
| `analyst-action` | model revision | target, rating, model reason, consensus gap, reaction | headline change versus actual estimate change | analysts and headline chasers | target-only card with no operating reason |
| `macro-policy` | risk premium | rates, yields, dollar, futures, breadth | policy headline versus the price that holds after it | macro funds and hedgers | narrow source forced into a broad ETF |
| `geopolitical-risk` | risk premium | spot, curve, volatility, freight, insurance | scary news versus persistent risk pricing | hedgers, importers, shippers | certainty about escalation without market confirmation |
| `crowded-positioning` | crowding unwind | OI, funding, borrow, liquidations, volume | catalyst size versus position size | crowded longs, shorts, event traders | every decline labeled liquidation |
| `social-sentiment` | sentiment pain | price move, leverage, liquidations, breadth | personal loss story versus market-wide stress | retail leverage and late buyers | unverifiable anecdote treated as representative data |
| `product-strategy` | TAM and duration | sell-through, retention, attach rate, competition, guide | one product hit versus repeatable category duration | growth PMs and skeptical shorts | one quarter extrapolated into a permanent moat |
| `government-contract` | event completion / model revision | value, duration, revenue share, margin, start date | award headline versus earnings materiality | analysts and event holders | contract value confused with recognized revenue |
| `deal-event` | event completion | close date, conditions, spread, consideration | approval headline versus remaining closing risk | arbitrageurs and holders | event described as complete before conditions clear |
| `legal-regulatory` | legal overhang | jurisdiction, remedy, timeline, exposure | legal headline versus financial consequence | legal-arb desks and holders | no distinction between allegation, ruling, and remedy |
| `capital-investment` | cash flow / model revision | amount, funding, timeline, return, cash-flow impact | strategic ambition versus funding and payback | creditors, equity holders, suppliers | capex amount presented as immediate revenue |
| `operating-data` | model revision | actual, prior, consensus, mix, reaction | operating change versus embedded expectations | analysts and holders | growth rate lacks period or comparable base |

## Angle Order

When several angles are valid, prefer this order:

1. A hard comparator that changes an estimate, probability, balance, or flow.
2. A forced actor with a visible deadline or trigger.
3. A disagreement between headline, model, and tape.
4. A supported second-order chain with an explicit target asset.
5. A watch-only hypothesis with a named next observable.

Do not use social pain, dramatic language, or a commentator profile to rescue a thin cue.

## Frame Translation

| Surface | Title | Body | Image |
| --- | --- | --- | --- |
| Frame | creator judgment or hard change | one supported mechanism plus the horizon or next observable | observed evidence, two to four reasoning beats, and a timing marker when material |

The three components divide labor. They do not change evidence strength or turn a caution into a pass.

## Research Module Map

Use `../../build-market-research-pack/SKILL.md` when a route needs several of these modules or the user wants a reusable decision artifact.

| Route need | Research module | Minimum useful fields |
| --- | --- | --- |
| Expectation gap | event comparator | actual, consensus, prior, period, unit, basis |
| Model revision | estimate path | current estimate, 7/30/90-day change, breadth, analyst count |
| Story versus tape | price reaction | correct event window, benchmark, excess return, volume, persistence |
| Forced flow | positioning and flow | actor, notional, float/ADV, effective date, execution window |
| Executability | liquidity and risk | spread, ADV, volatility, data delay, adverse scenario |
| Valuation claim | valuation range | method, assumptions, peers, sensitivity, scenario range |
| Social pain | representativeness | breadth, leverage, liquidations, fund flow, sample caveat |

## Profile Controls

Use a distilled profile only through explicit rule IDs:

- `selection.*`: which supported event or comparator gets attention
- `reasoning.*`: preferred analytical sequence
- `opening.*`: number-first, actor-first, tape-first, question-first
- `rhythm.*`: paragraph and sentence density
- `frame.*`: title/body/image composition conventions
- `avoid.*`: phrases, identity markers, unsupported private-source moves

Return the applied IDs. If opposite profiles produce identical angle and rhythm despite different eligible rules, the profile bridge has failed and should be reviewed.
