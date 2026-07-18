# Channel Methods

Recheck current platform and named-community rules before `publish_ready`. Do not rely on these shapes as guarantees of reach.

## Time And Disclosure

Set one `temporal_mode`: `realtime` for a current event with at least one explicitly current fact, `historical_replay` for an expired or past event, and `evergreen` for education that does not depend on a live setup. Label historical replay in the public copy and keep the original timestamps visible.

Record position, commercial relationship, identity, and AI-assistance states in `disclosure_state`. A general “not investment advice” sentence does not replace a missing material-position or sponsorship disclosure.

## Generic Long-Form Investment Article

Use `long_form_article` when the destination permits AI assistance and rights are clear. A useful section sequence is thesis, changed evidence, model or valuation impact, counterargument, risks, invalidation, and conclusion. Expose valuation inputs and source links. Keep disclosure separate from the conclusion.

Use `article_outline` when the user wants a research architecture rather than public prose. Sections contain notes and fact IDs, not polished copy.

## Seeking Alpha

Current [submission rules](https://about.seekingalpha.com/article-submission-guidelines) prohibit generative AI from writing, rewriting, or clarifying contributor articles. The renderer may return only an `internal_outline`; set the policy and publication state to `blocked`. The user must independently author any submission under the platform's current rules.

The outline may still preserve thesis, mispricing, valuation assumptions, risks, counterevidence, sources, and disclosures. Do not include submission-ready body text or imitate published authors.

## Reddit

The unit is community plus thread, not generic “Reddit tone.” For a post, include community, current rules URL/check time, flair, title, self-contained body, fact IDs, and a reply plan. For a comment, include the target thread and answer the OP's actual question before adding a source.

Check [Reddit Rules](https://redditinc.com/policies/reddit-rules), [Spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam), and the named subreddit's rules. Disclose material affiliation. Do not mass-post variants, conceal promotion, coordinate voting, or treat votes as evidence.

## Xiaohongshu Finance Carousel

Use `carousel_note`:

1. Cover: one concrete promise or tension.
2. Context card: event, date, and exposed asset.
3. Evidence cards: one fact or chart job per card.
4. Interpretation card: who is forced to act and why.
5. Counterpoint or invalidation card.
6. Source/disclosure card when the topic is financial analysis.

Keep caption additive; do not paste every card into it. Use original or rights-cleared assets. Record qualification for professional financial analysis or marketing and recheck the platform's current governance.

## Douyin Finance Short Video

Use `short_video` with an explicit duration and ordered beats. A compact structure is:

- 0-3s: concrete tension;
- 3-12s: event and hard evidence;
- 12-30s: market mechanism and exposed actor;
- final beat: counterpoint, condition, or next data point;
- visible disclosure where required.

Voiceover should sound natural aloud. On-screen text should be shorter than voiceover. Visual direction should prove or orient, not merely decorate. Do not offer personalized orders, sizing, leverage, or unsupported price levels.

Check the current [Douyin finance-industry convention](https://95152.douyin.com/article/5561765854302017) and record account qualification, identity disclosure, commercial relationship, and risk-disclosure timing.

## Asset Rights

`asset_plan.origin` may be `generated`, `owned`, `licensed`, `public-domain`, `permission`, or `source-reference-only`. Only the first five may be rendered into `publish_ready` media. `source-reference-only` can guide an internal outline but cannot be shipped as an asset.
