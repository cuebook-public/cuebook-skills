# Platform Capabilities

Recheck official documentation before marking an automated release ready. Capability is account- and application-specific; this file supplies conservative routing defaults, not authorization.

## Capability Matrix

| Platform | Conservative default | Potential verified modes | Required checks |
| --- | --- | --- | --- |
| Owned website or CMS | `manual_handoff` | Deferred until an owned adapter contract is modeled | Passing Cuebook SEO preflight; passing GEO preflight when selected; CMS ownership, draft/create support, rollback, and receipt semantics |
| X | `manual_handoff` | `api_direct`; `api_scheduled` through a verified scheduler | OAuth scope, plan, media upload, create/edit limits, AI and paid-partnership fields |
| Telegram | `manual_handoff` | `api_direct`; scheduler-controlled `api_scheduled` | Bot or channel rights, target chat, media group constraints, message receipt |
| Reddit | `manual_handoff` | `api_direct` | OAuth, named community rules, post requirements, spam policy, flair and content type |
| Douyin | `manual_handoff` | `api_direct` after approved application and account authorization | App review, publish permission, asset constraints, audit status, identity and finance policy |
| Xiaohongshu | `manual_handoff` | Only an account-specific official capability verified at release time | Do not infer note publishing from Ark commerce APIs or browser session access |
| Seeking Alpha | blocked internal outline only | None for AI-assisted submission | Current contributor AI rule, independent authorship, disclosure |

## Official Sources

- X create or edit Post: https://docs.x.com/x-api/posts/create-post
- X media upload: https://docs.x.com/x-api/media/upload-media
- Telegram Bot API: https://core.telegram.org/bots/api
- Reddit API: https://www.reddit.com/dev/api/
- Reddit Rules: https://redditinc.com/policies/reddit-rules
- Reddit spam policy: https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam
- Douyin content publishing: https://open.douyin.com/platform/resource/docs/ability/content-management/douyin-publish-solution
- Xiaohongshu Ark introduction: https://school.xiaohongshu.com/en/open/quick-start/introduction.html
- Seeking Alpha submission rules: https://about.seekingalpha.com/article-submission-guidelines
- Google AI features and websites: https://developers.google.com/search/docs/appearance/ai-features

## Adapter Rules

- An adapter owns authentication and external calls. The release bundle stores only an opaque `account_ref` and `adapter_id`.
- A verified adapter must return a later durable receipt. Local success, a historical post, or a draft ID cannot masquerade as a published post.
- Retries use the release item's idempotency key. Never retry an ambiguous create blindly.
- Partial multi-item release stops dependent items until the external state is reconciled.
- Edit, delete, reply, and status operations are separate approved actions, not implicit follow-ups to create.
