# Stable Reconciliation Failure Cases

| Case | Failure | Required response |
| --- | --- | --- |
| HTTP 200 without remote ID | Acknowledgement becomes publication | Keep acknowledged or ambiguous |
| Timeout is retried with new key | Duplicate post may be created | Stop and reconcile remote state |
| Engagement is attached to unverified post | Metrics lack a durable object | Block the snapshot |
| Factual correction rewrites old artifact | Prior history disappears | Append correction and invalidate dependencies |
| Material correction has no notice | Audience remains misled | Require edit, notice, or retraction |
| Paper trade enters track record | Simulation becomes execution | Mark ineligible |
| Upload contains winners only | Cohort denominator is missing | Mark partial and block claim |
| Random split mixes future regimes | Learning leaks time | Require forward-time evaluation |
