# Stable Failure Cases

| Input or condition | Expected behavior |
| --- | --- |
| `No EPS or revenue change` | Do not infer an estimate revision from negated terms |
| `breakthrough, but no capacity constraint` | Do not classify a supply bottleneck solely from the negated phrase |
| Reuters URL appears only in structured `links` | Classify the source as `media_wire` |
| `$ADM cooking oil` | Keep ticker `ADM`; do not infer private DM access or a macro-oil thesis from substrings |
| `deliveries` or `decision` | Do not trigger `IV` or proprietary `DM` substring matches |
| Unspaced-script equivalents of `liquidated`, `lost`, `ETF`, `$MU` | Match localized attention terms and explicit ticker evidence without Latin boundary errors |
| Bare `CEO FOMC USD ADR HBM` | Do not treat acronyms as tickers |
| Nested metrics present | Preserve observed values and availability |
| Metrics absent | Keep unavailable; do not rank the item as zero engagement |
| Search result has only a snippet | Use it for discovery; do not treat it as full post evidence |
| One platform and fewer than ten items | Keep profile at caution and avoid cross-platform claims |
| Two profiles have different eligible rule sets | Renderer should report different applied rule IDs or explain why neither applied |
