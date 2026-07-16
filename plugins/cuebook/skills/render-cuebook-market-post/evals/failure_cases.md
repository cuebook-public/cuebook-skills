# Stable Failure Cases

Keep these cases in every renderer regression pass.

| Case | Expected behavior |
| --- | --- |
| FDX card citing JANX | Reject; suggest JANX or repair the source mapping |
| DKNG card citing LTH | Reject |
| MU card citing AMKR | Reject |
| QCOM card citing BOKF or IOT | Reject |
| CNR card citing CP or RXO | Reject |
| HOPE card using a generic technology-stock bridge | Reject; the target entity is not reached |
| PPLI card using a generic equities-rally bridge | Reject |
| BR card sourced from Catalyst Bank or Lakeside | Reject unless Broadridge is independently established |
| FTRE reiterated guidance called fresh upside | Caution until compared with prior guidance and consensus |
| LINK or ASND Russell inclusion | Route to mechanical flow; request effective date, float, ADV, and expected flow |
| ICFI buyback | Route to mechanical flow; request authorization, execution, ADV, and float |
| UNG source body names natural gas while provider URL points to USO | Caution for source-metadata conflict; repair before publication |
| Cue with opposite fragment and asset directions | Reject |
| Current price without a timestamped source | Remove the price or block publication |
| ResearchPackV1 is conditional but draft states a firm thesis | Keep the draft conditional and surface the missing input |
| Research pack is referenced with a null decision | Block validation until its quality decision is carried forward |
| Draft has no fact-ID map | Add platform-specific `draft_evidence` before publication |
| RouteV1 abstains but a public draft is present | Block and clear every draft |
| Selected opportunity or program item is absent from lineage | Block handoff until lineage is repaired |
| Position or commercial disclosure is unknown while state is ready | Downgrade or resolve disclosure before release |
| Draft says to buy a quantity or set personal leverage | Reject the action instruction; keep only the supported view and next observable |
| Raw event return is attributed without a benchmark or correct window | Add the benchmark/window or soften the claim |
| Trade claim omits liquidity, asset expression, or horizon | Render as a watch, not an instruction; retain risk boundaries in structured metadata |
| Draft says Cuebook found, inspired, completed, or improved the idea | Remove workflow narration; retain the assistance record internally |
| Draft ends with `我认错` or `什么情况算看错` | Replace it with the horizon, next catalyst, or next observable |

Regression drafts must also avoid dumping raw source articles, URLs, HTML, internal error codes, and year fragments such as `FY26` as standalone numbers.
