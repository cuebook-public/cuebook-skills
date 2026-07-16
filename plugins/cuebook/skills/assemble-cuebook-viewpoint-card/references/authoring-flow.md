# Cuebook Viewpoint Authoring Flow

## Step 1: Lock The View

The first screen is product input, serialized as `CreatorViewIntentV1`:

| UI control | Contract field | Owner |
| --- | --- | --- |
| asset | `market` | creator |
| deadline | `deadline` | creator |
| up/down/outperform/range/custom | `outcome` | creator |
| fundamental/news/technical/flow/macro | `evidence_preferences` | creator |
| free text | `creator_text` | creator, preserved verbatim |

This screen does not need one skill per control. The contract locks the creator's decision boundary before AI enrichment.

## Step 2: Add Evidence Blocks

| Product action | Capability | Output |
| --- | --- | --- |
| add or improve text | `$render-cuebook-market-post` | PostV1 |
| add news | `$build-market-research-pack` | sourced facts in ResearchPackV1 |
| add viewpoint logic | `$compile-cuebook-visual-argument` -> `$render-cuebook-logic-card` | VisualArgumentV1 + LogicCardV1 |
| add data-led figure | `$render-cuebook-market-figure` | MarketFigureSpecV1 + MarketFigureV1 |
| add chart | `$render-cuebook-thesis-chart` | ThesisChartV1 + chart asset |
| add indicator | `$compute-cuebook-market-indicators` | IndicatorPackV1 |
| add settlement footer | `$compile-cuebook-settlement-claim` | SettlementClaimV1 |
| generate preview | `$assemble-cuebook-viewpoint-card` | ViewpointCardV1 |

The assembler may recommend blocks using the stated evidence preference and claim type. It should not add a block merely to fill the page. Block recommendation remains part of assembly until product data proves it needs a separately versioned ranking model.

## State Propagation

The card inherits the strictest block state:

- `ready`: all evidence is current and sealed, settlement is confirmed, disclosures are resolved;
- `conditional`: useful authoring preview with forming data, degraded interval, unresolved deadline, or unknown disclosure;
- `blocked`: asset mismatch, unsupported claim, missing benchmark, unsourced news, or invalid settlement contract.

Changing the asset, direction, benchmark, deadline, or settlement rule creates a new intent/thesis revision. Reordering or removing optional evidence blocks changes the card revision only.

## Runtime Services

The following are product services, not content skills:

- OHLCV query adapter and live quote subscription;
- thesis registry and immutable revision store;
- expiry scheduler and settlement oracle;
- creator disclosure/identity store;
- Feed persistence, ranking, moderation, and receipts.

Keep these behind versioned provider contracts. Skills produce inspectable artifacts; services own durable state and side effects.
