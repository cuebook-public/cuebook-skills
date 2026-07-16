#!/usr/bin/env python3
"""Distill a CorpusV1 artifact into an evidence-backed ProfileV1."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit


SCHEMA_VERSION = "profile.v1"
DISTILLER_VERSION = "1.0.0"
CORE_ENGAGEMENT_FIELDS = {"likes", "reposts", "replies", "views", "bookmarks", "quotes"}

EVENT_PATTERNS: dict[str, tuple[str, ...]] = {
    "hard-data-print": (
        r"\b(?:cpi|ppi|nfp|gdp|payrolls?|inflation|revenue|earnings|eps|ebitda|guidance|inventory|storage)\b",
        r"(?:财报|业绩|营收|利润|指引|库存|通胀|非农|数据(?:公布|出炉)|同比|环比|采购经理指数)",
    ),
    "tape-break": (
        r"\b(?:break(?:out|down)?|gap|vwap|volume|new high|new low|support|resistance|moving average)\b",
        r"(?:突破|跌破|新高|新低|跳空|放量|缩量|均线|技术位|支撑位|阻力位|成交量|盘中)",
    ),
    "prediction-market-shift": (
        r"\b(?:polymarket|kalshi|prediction market|odds|probability)\b",
        r"(?:预测市场|赔率|概率|胜率|隐含概率)",
    ),
    "crowded-unwind": (
        r"\b(?:liquidat(?:e|ed|ion)|crowded|unwind|front[- ]?run|leverage|margin call|trapped)\b",
        r"(?:爆仓|强平|拥挤|去杠杆|平仓|踩踏|被套|挤仓|解除杠杆)",
    ),
    "macro-risk-premium": (
        r"\b(?:fed|rates?|yields?|treasur(?:y|ies)|fx|dollar|crude oil|oil (?:price|futures|market|supply|route)|wti|brent|sanctions?|tariffs?|war|geopolitic)\b",
        r"(?:美联储|利率|收益率|国债|美元|汇率|原油|油价|制裁|关税|战争|地缘|风险溢价|央行)",
    ),
    "estimate-revision": (
        r"\b(?:analyst|upgrade|downgrade|estimate revision|price target|consensus estimate)\b",
        r"(?:分析师|上调|下调|目标价|盈利预测|一致预期|预期修正|估值调整)",
    ),
    "mechanical-flow": (
        r"\b(?:etf|index|buyback|issuance|rebalance|unlock|passive flow|options expiry)\b",
        r"(?:指数调仓|被动资金|回购|增发|解禁|再平衡|期权到期|机械性资金|ETF)",
    ),
    "supply-bottleneck": (
        r"\b(?:capacity|bottleneck|supply chain|shortage|semiconductor|gpu|power constraint|logistics)\b",
        r"(?:产能|瓶颈|供应链|短缺|芯片|半导体|算力|电力约束|物流|供给不足)",
    ),
    "credit-cashflow-stress": (
        r"\b(?:debt|credit|coupon|refinanc|cash flow|free cash flow|fcf|default|spread widening)\b",
        r"(?:债务|信用|票息|再融资|现金流|自由现金流|违约|利差走阔|偿债)",
    ),
    "sentiment-pain": (
        r"\b(?:fomo|fear|panic|capitulat|pain|lost money|blew up|retail sentiment)\b",
        r"(?:恐慌|情绪|割肉|亏损|亏掉|爆亏|踏空|追涨|抄底|散户|投降|绝望)",
    ),
    "valuation-rerating": (
        r"\b(?:valuation|multiple|p/e|price to sales|tam|rerat(?:e|ing)|discounted cash flow)\b",
        r"(?:估值|市盈率|市销率|倍数|重估|估值切换|市场空间|现金流折现)",
    ),
}

REASONING_PATTERNS: dict[str, tuple[str, ...]] = {
    "source-first": (
        r"\b(?:filing|primary source|original document|release says|according to the report|data show)\b",
        r"(?:公告显示|原文|原始文件|一手数据|报告显示|数据表明|根据(?:公告|文件|报告|数据))",
    ),
    "actor-forced": (
        r"\b(?:forced to|must buy|must sell|must hedge|cover shorts?|de[- ]risk|margin call)\b",
        r"(?:被迫|必须买|必须卖|必须对冲|回补空头|降低风险|追加保证金|强制平仓)",
    ),
    "model-line": (
        r"\b(?:revenue|gross margin|operating margin|eps|ebitda|free cash flow|fcf|tam)\b",
        r"(?:营收|收入|毛利率|营业利润率|每股收益|现金流|市场空间|盈利模型)",
    ),
    "tape-first": (
        r"\b(?:price action|the tape|volume confirms|breaks? support|breaks? resistance|vwap)\b",
        r"(?:盘面|走势|价格行为|成交量确认|跌破支撑|突破阻力|量价|均价线)",
    ),
    "crowding-first": (
        r"\b(?:everyone is|consensus trade|crowded|positioning|trapped longs?|trapped shorts?)\b",
        r"(?:所有人都|一致交易|拥挤交易|持仓过度|多头被套|空头被套|共识太强)",
    ),
    "analogy-first": (
        r"\b(?:last time|similar to|reminds me of|historical analogue|rhymes with)\b",
        r"(?:上一次|类似于|让我想起|历史上|复刻|类比|如同当年)",
    ),
    "pain-first": (
        r"\b(?:retail pain|capitulation|lost money|panic selling|fomo became)\b",
        r"(?:散户痛苦|割肉|亏损变成|恐慌抛售|踏空情绪|情绪变成资金流)",
    ),
    "skepticism-first": (
        r"\b(?:too neat|doesn't add up|consensus is wrong|skeptical|the story ignores)\b",
        r"(?:没那么简单|说不通|共识错了|值得怀疑|叙事忽略|故事太顺|不买账)",
    ),
    "falsifier-first": (
        r"\b(?:invalidat(?:e|ed|ion)|unless|wrong if|falsif|stop if)\b",
        r"(?:失效条件|证伪|除非|如果.+则错|错在|止损条件|不成立)",
    ),
}

OFFICIAL_DOMAINS = {
    "sec.gov",
    "federalreserve.gov",
    "bls.gov",
    "bea.gov",
    "eia.gov",
    "treasury.gov",
    "stats.gov.cn",
    "pbc.gov.cn",
    "csrc.gov.cn",
    "sse.com.cn",
    "szse.cn",
    "hkexnews.hk",
}
MEDIA_DOMAINS = {
    "reuters.com",
    "bloomberg.com",
    "wsj.com",
    "ft.com",
    "cnbc.com",
    "apnews.com",
    "caixin.com",
    "yicai.com",
    "cls.cn",
    "36kr.com",
}
MARKET_DATA_DOMAINS = {
    "tradingview.com",
    "finance.yahoo.com",
    "investing.com",
    "fred.stlouisfed.org",
    "macrotrends.net",
    "coinglass.com",
    "glassnode.com",
    "polymarket.com",
    "kalshi.com",
}
SOCIAL_DOMAINS = {
    "x.com",
    "twitter.com",
    "t.me",
    "reddit.com",
    "youtube.com",
    "youtu.be",
    "discord.com",
    "weibo.com",
    "zhihu.com",
}

HOOK_ORDER = (
    "thread",
    "number-first",
    "question-first",
    "judgment-first",
    "anecdote-first",
)
HOOK_PATTERNS = {
    "thread": r"(?:\bthread\b|🧵|线程|长文|^\s*1/\d*)",
    "number-first": r"^[\s\"'“”‘’(\[【（]*(?:[$¥￥€£]\s*)?[+-]?\d[\d,.]*(?:\.\d+)?\s*(?:%|％|x|X|倍|万|亿)?",
    "question-first": r"(?:[?？]\s*$)|^\s*(?:why|how|what|can|will|is|are)\b|^\s*(?:为什么|怎么|如何|是否|能否|会不会|还有多少)",
    "judgment-first": r"^\s*(?:i think|looks like|this is|this isn't|bullish|bearish)\b|^\s*(?:我认为|我觉得|看起来|这不是|这是|先别|看多|看空|重点是|真正的问题)",
    "anecdote-first": r"^(?:.{0,20})(?:someone|a friend|my friend|a colleague|朋友|同事|有人|群里|一位)",
}

PROPRIETARY_PATTERNS = (
    r"\b(?:my source|source said|friend said|dm(?:ed)? me|desk color|channel check|off the record)\b",
    r"(?:朋友说|消息人士|私信|群里说|内部渠道|听说|小道消息|渠道调研|不便透露)",
)

DATA_HOOKS = {
    "hard-data-print": ["release timestamp", "primary source value", "prior and consensus values"],
    "tape-break": ["venue and symbol", "price level", "volume and time window"],
    "prediction-market-shift": ["market contract", "odds snapshot", "liquidity and timestamp"],
    "crowded-unwind": ["positioning proxy", "liquidation or leverage data", "affected assets"],
    "macro-risk-premium": ["policy or event timestamp", "rates/FX/commodity snapshot", "affected assets"],
    "estimate-revision": ["old estimate", "new estimate", "model line and revision source"],
    "mechanical-flow": ["flow mechanism", "effective date", "estimated notional"],
    "supply-bottleneck": ["capacity measure", "constraint source", "downstream exposure"],
    "credit-cashflow-stress": ["debt maturity", "spread or coupon", "cash-flow coverage"],
    "sentiment-pain": ["sentiment proxy", "positioning or flow confirmation", "time window"],
    "valuation-rerating": ["valuation multiple", "peer or history baseline", "changed model input"],
}

ROUTE_EVENT_TYPES = {
    "hard-data-print": ["company-guidance", "earnings-result", "inventory-print", "operating-data"],
    "tape-break": ["technical-level", "price-action"],
    "prediction-market-shift": ["prediction-market"],
    "crowded-unwind": ["crowded-positioning"],
    "macro-risk-premium": ["macro-policy", "geopolitical-risk"],
    "estimate-revision": ["analyst-action", "company-guidance", "earnings-result"],
    "mechanical-flow": ["mechanical-flow"],
    "supply-bottleneck": ["product-strategy", "operating-data", "capital-investment"],
    "credit-cashflow-stress": ["credit-financing", "capital-investment"],
    "sentiment-pain": ["social-sentiment", "crowded-positioning"],
    "valuation-rerating": ["product-strategy", "analyst-action"],
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def share(count: int, total: int) -> float:
    return round(count / total, 4) if total else 0.0


def unique_strings(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = value.strip()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            result.append(cleaned)
    return result


def validate_corpus(corpus: Any) -> list[dict[str, Any]]:
    if not isinstance(corpus, dict):
        raise ValueError("CorpusV1 root must be an object")
    if corpus.get("schema_version") != "corpus.v1":
        raise ValueError('expected schema_version "corpus.v1"; normalize raw inputs first')
    if not isinstance(corpus.get("corpus_id"), str) or not corpus["corpus_id"]:
        raise ValueError("CorpusV1 corpus_id is required")
    provenance = corpus.get("provenance")
    if not isinstance(provenance, dict) or provenance.get("rights_basis") not in {"public", "authorized"}:
        raise ValueError("CorpusV1 provenance must declare public or authorized rights")
    items = corpus.get("items")
    if not isinstance(items, list) or not items:
        raise ValueError("CorpusV1 items must be a non-empty array")

    seen_ids: set[str] = set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"items[{index}] must be an object")
        item_id = item.get("id")
        if not isinstance(item_id, str) or not item_id:
            raise ValueError(f"items[{index}].id is required")
        if item_id in seen_ids:
            raise ValueError(f"duplicate CorpusV1 item id: {item_id}")
        seen_ids.add(item_id)
        if not isinstance(item.get("text"), str) or not item["text"].strip():
            raise ValueError(f"items[{index}].text must be non-empty")
        if not isinstance(item.get("links"), list):
            raise ValueError(f"items[{index}].links must be an array")
        entities = item.get("entities")
        if not isinstance(entities, dict) or not isinstance(entities.get("tickers"), list):
            raise ValueError(f"items[{index}].entities.tickers must be an array")
        metrics = item.get("metrics")
        if not isinstance(metrics, dict) or not isinstance(metrics.get("values"), dict):
            raise ValueError(f"items[{index}].metrics.values must be an object")
        if not isinstance(metrics.get("available"), bool):
            raise ValueError(f"items[{index}].metrics.available must be boolean")
        numeric_values = {
            key: value
            for key, value in metrics["values"].items()
            if isinstance(value, (int, float)) and not isinstance(value, bool) and value >= 0
        }
        if len(numeric_values) != len(metrics["values"]):
            raise ValueError(f"items[{index}].metrics.values must contain non-negative numbers")
        if metrics["available"] != bool(numeric_values):
            raise ValueError(f"items[{index}].metrics.available disagrees with metrics.values")
        item_provenance = item.get("provenance")
        if not isinstance(item_provenance, dict) or item_provenance.get("rights_basis") not in {"public", "authorized"}:
            raise ValueError(f"items[{index}].provenance has no valid rights basis")
    return items


def matches_any(text: str, patterns: Iterable[str]) -> bool:
    return any(re.search(pattern, text, flags=re.I) for pattern in patterns)


def matches_unnegated(text: str, patterns: Iterable[str]) -> bool:
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.I):
            before = text[max(0, match.start() - 48):match.start()]
            english_negation = re.search(
                r"\b(?:no|not|without|never)\b(?:\W+\w+){0,4}\W*$",
                before,
                flags=re.I,
            )
            chinese_negation = re.search(
                r"(?:没有|并无|不存在|未见|未出现|不含|毫无|无)[\s的任何明显实际所谓]*$",
                before,
            )
            if not english_negation and not chinese_negation:
                return True
    return False


def confidence(count: int, item_share: float) -> str:
    if count >= 5 and item_share >= 0.15:
        return "high"
    if count >= 2:
        return "medium"
    return "low"


def pattern_map(
    items: list[dict[str, Any]],
    patterns: dict[str, tuple[str, ...]],
    key_name: str,
    top_evidence: int,
    negation_aware: bool = False,
) -> tuple[list[dict[str, Any]], set[str]]:
    counts: Counter[str] = Counter()
    evidence: dict[str, list[str]] = defaultdict(list)
    hit_items: set[str] = set()
    for item in items:
        for name, expressions in patterns.items():
            matched = matches_unnegated(item["text"], expressions) if negation_aware else matches_any(item["text"], expressions)
            if matched:
                counts[name] += 1
                hit_items.add(item["id"])
                if len(evidence[name]) < top_evidence:
                    evidence[name].append(item["id"])
    order = {name: index for index, name in enumerate(patterns)}
    entries = []
    for name, count in sorted(counts.items(), key=lambda pair: (-pair[1], order[pair[0]])):
        item_share = share(count, len(items))
        entries.append({
            key_name: name,
            "count": count,
            "share": item_share,
            "confidence": confidence(count, item_share),
            "evidence_item_ids": evidence[name],
        })
    return entries, hit_items


def canonical_domain(link: Any) -> str | None:
    if not isinstance(link, dict):
        return None
    raw_url = link.get("url")
    host: str | None = None
    if isinstance(raw_url, str) and raw_url.strip():
        try:
            parts = urlsplit(raw_url.strip())
            if parts.scheme.lower() in {"http", "https"}:
                host = parts.hostname
        except ValueError:
            host = None
    if not host and isinstance(link.get("domain"), str):
        raw_domain = link["domain"].strip().lower()
        try:
            host = urlsplit("//" + raw_domain).hostname
        except ValueError:
            host = None
    if not host:
        return None
    domain = host.rstrip(".").lower()
    while domain.startswith(("www.", "m.", "mobile.")):
        domain = domain.split(".", 1)[1]
    if domain in {"twitter.com", "mobile.twitter.com"}:
        domain = "x.com"
    try:
        return domain.encode("idna").decode("ascii")
    except UnicodeError:
        return None


def domain_in(domain: str, candidates: set[str]) -> bool:
    return any(domain == candidate or domain.endswith("." + candidate) for candidate in candidates)


def source_type(domain: str) -> str:
    if (
        domain_in(domain, OFFICIAL_DOMAINS)
        or domain.endswith(".gov")
        or domain.endswith(".gov.cn")
        or domain.endswith(".gov.uk")
    ):
        return "official"
    if domain_in(domain, MEDIA_DOMAINS):
        return "media_wire"
    if domain_in(domain, MARKET_DATA_DOMAINS):
        return "market_data"
    if domain_in(domain, SOCIAL_DOMAINS):
        return "social"
    return "other"


def build_source_map(items: list[dict[str, Any]], top_evidence: int) -> dict[str, Any]:
    domain_links: Counter[str] = Counter()
    domain_items: dict[str, set[str]] = defaultdict(set)
    category_links: Counter[str] = Counter()
    category_items: dict[str, set[str]] = defaultdict(set)
    category_evidence: dict[str, list[str]] = defaultdict(list)
    linked_items: set[str] = set()

    for item in items:
        seen_urls: set[str] = set()
        item_categories: set[str] = set()
        for link in item["links"]:
            raw_url = link.get("url") if isinstance(link, dict) else None
            if isinstance(raw_url, str) and raw_url in seen_urls:
                continue
            if isinstance(raw_url, str):
                seen_urls.add(raw_url)
            domain = canonical_domain(link)
            if not domain:
                continue
            category = source_type(domain)
            linked_items.add(item["id"])
            domain_links[domain] += 1
            domain_items[domain].add(item["id"])
            category_links[category] += 1
            category_items[category].add(item["id"])
            item_categories.add(category)
        for category in item_categories:
            if len(category_evidence[category]) < top_evidence:
                category_evidence[category].append(item["id"])

    total_links = sum(domain_links.values())
    type_order = {"official": 0, "media_wire": 1, "market_data": 2, "social": 3, "other": 4}
    categories = []
    for category, count in sorted(category_links.items(), key=lambda pair: (-pair[1], type_order[pair[0]])):
        category_domains = [
            domain
            for domain, _ in sorted(
                ((domain, count) for domain, count in domain_links.items() if source_type(domain) == category),
                key=lambda pair: (-pair[1], pair[0]),
            )
        ]
        categories.append({
            "source_type": category,
            "link_count": count,
            "item_count": len(category_items[category]),
            "share": share(count, total_links),
            "domains": category_domains,
            "evidence_item_ids": category_evidence[category],
        })

    domains = [
        {
            "domain": domain,
            "source_type": source_type(domain),
            "link_count": count,
            "item_count": len(domain_items[domain]),
        }
        for domain, count in sorted(domain_links.items(), key=lambda pair: (-pair[1], pair[0]))
    ]
    return {
        "linked_items": len(linked_items),
        "unlinked_items": len(items) - len(linked_items),
        "link_coverage": share(len(linked_items), len(items)),
        "categories": categories,
        "domains": domains,
    }


def normalize_ticker(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    ticker = value.strip().lstrip("$").upper()
    if re.fullmatch(r"(?:[A-Z]{1,8}:)?[A-Z0-9][A-Z0-9.\-]{0,14}", ticker):
        return ticker
    return None


def top_tickers(items: list[dict[str, Any]], limit: int = 30) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    for item in items:
        tickers: set[str] = set()
        for raw in item["entities"].get("tickers", []):
            ticker = normalize_ticker(raw)
            if ticker:
                tickers.add(ticker)
        for raw in re.findall(r"(?<![\w$])\$([A-Za-z][A-Za-z0-9.\-]{0,14})", item["text"]):
            ticker = normalize_ticker(raw)
            if ticker:
                tickers.add(ticker)
        for venue, symbol in re.findall(
            r"\b(NASDAQ|NYSE|AMEX|HKEX|SSE|SZSE|SH|SZ):([A-Z0-9.\-]{1,15})\b",
            item["text"],
            flags=re.I,
        ):
            ticker = normalize_ticker(f"{venue}:{symbol}")
            if ticker:
                tickers.add(ticker)
        counts.update(tickers)
    return [{"ticker": ticker, "count": count} for ticker, count in counts.most_common(limit)]


def distribution(values: Iterable[str], total: int) -> list[dict[str, Any]]:
    counts = Counter(value for value in values if isinstance(value, str) and value)
    return [
        {"name": name, "count": count, "share": share(count, total)}
        for name, count in sorted(counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]


def first_hook(text: str) -> str:
    opening = text.strip()
    for name in HOOK_ORDER:
        candidate = opening if name in {"thread", "question-first"} else opening[:160]
        if re.search(HOOK_PATTERNS[name], candidate, flags=re.I):
            return name
    return "statement"


def build_writing_map(items: list[dict[str, Any]], top_evidence: int) -> dict[str, Any]:
    hook_counts: Counter[str] = Counter()
    hook_evidence: dict[str, list[str]] = defaultdict(list)
    character_counts: list[int] = []
    line_counts: list[int] = []
    format_counts: Counter[str] = Counter()

    for item in items:
        text = item["text"].strip()
        hook = first_hook(text)
        hook_counts[hook] += 1
        if len(hook_evidence[hook]) < top_evidence:
            hook_evidence[hook].append(item["id"])
        character_counts.append(len(text))
        line_count = len(text.splitlines())
        line_counts.append(line_count)
        if len(text) <= 280:
            format_counts["short"] += 1
        if line_count > 1:
            format_counts["multiline"] += 1
        if re.search(r"\d", text):
            format_counts["contains-number"] += 1
        if re.search(r"[?？]", text):
            format_counts["contains-question"] += 1
        if len(text) >= 1000:
            format_counts["long-form"] += 1

    hook_order = {name: index for index, name in enumerate((*HOOK_ORDER, "statement"))}
    hooks = []
    for name, count in sorted(hook_counts.items(), key=lambda pair: (-pair[1], hook_order[pair[0]])):
        item_share = share(count, len(items))
        hooks.append({
            "pattern": name,
            "count": count,
            "share": item_share,
            "confidence": confidence(count, item_share),
            "evidence_item_ids": hook_evidence[name],
        })
    formats = [
        {"pattern": name, "count": count, "share": share(count, len(items))}
        for name, count in sorted(format_counts.items(), key=lambda pair: (-pair[1], pair[0]))
        if count
    ]
    return {
        "hooks": hooks,
        "cadence": {
            "median_characters": round(statistics.median(character_counts), 2),
            "median_lines": round(statistics.median(line_counts), 2),
        },
        "format_patterns": formats,
        "language_distribution": distribution(
            (item.get("language") or "und" for item in items),
            len(items),
        ),
        "abstraction_rule": "Use only method-level mechanics and original wording; never reproduce catchphrases or imitate the target.",
    }


def metrics_availability(items: list[dict[str, Any]]) -> dict[str, Any]:
    field_counts: Counter[str] = Counter()
    items_with_any = 0
    items_with_engagement = 0
    for item in items:
        values = item["metrics"]["values"]
        if values:
            items_with_any += 1
            field_counts.update(values.keys())
            if CORE_ENGAGEMENT_FIELDS.intersection(values):
                items_with_engagement += 1
    ordered_fields = sorted(
        field_counts,
        key=lambda name: (
            list(("likes", "reposts", "replies", "views", "bookmarks", "quotes")).index(name)
            if name in CORE_ENGAGEMENT_FIELDS
            else 99,
            name,
        ),
    )
    comparable_engagement = any(
        field_counts[name] >= 8 and share(field_counts[name], len(items)) >= 0.5
        for name in CORE_ENGAGEMENT_FIELDS - {"views"}
    )
    return {
        "items_total": len(items),
        "items_with_any": items_with_any,
        "item_coverage": share(items_with_any, len(items)),
        "fields": {
            name: {
                "observed_items": field_counts[name],
                "coverage": share(field_counts[name], len(items)),
            }
            for name in ordered_fields
        },
        "engagement_ranking_available": (
            items_with_engagement >= 8
            and share(items_with_engagement, len(items)) >= 0.5
            and comparable_engagement
        ),
    }


def make_check(name: str, passed: bool, value: int | float, threshold: str, detail: str) -> dict[str, Any]:
    return {
        "name": name,
        "status": "pass" if passed else "caution",
        "value": value,
        "threshold": threshold,
        "detail": detail,
    }


def build_quality_gate(
    items: list[dict[str, Any]],
    source_map: dict[str, Any],
    event_hit_items: set[str],
    metrics: dict[str, Any],
) -> dict[str, Any]:
    item_count = len(items)
    date_coverage = share(sum(1 for item in items if item.get("created_at")), item_count)
    event_coverage = share(len(event_hit_items), item_count)
    checks = [
        make_check("sample_size", item_count >= 30, item_count, ">=30 items", "Enough items for recurring-pattern claims."),
        make_check("date_coverage", date_coverage >= 0.8, date_coverage, ">=0.80", "Created-at coverage supports regime and cadence interpretation."),
        make_check(
            "source_link_coverage",
            source_map["link_coverage"] >= 0.25,
            source_map["link_coverage"],
            ">=0.25",
            "Structured outbound links support source attribution.",
        ),
        make_check(
            "metrics_availability",
            metrics["engagement_ranking_available"],
            metrics["items_with_any"],
            ">=8 comparable items and >=0.50 coverage",
            "Observed metrics support within-stratum engagement comparisons without treating missing values as zero.",
        ),
        make_check(
            "event_signal_coverage",
            event_coverage >= 0.25,
            event_coverage,
            ">=0.25",
            "Observed event signals support an attention map.",
        ),
    ]
    reasons = [
        {
            "sample_size": "Fewer than 30 items; pattern recurrence is provisional.",
            "date_coverage": "Created-at coverage is below 80%; timing conclusions are limited.",
            "source_link_coverage": "Fewer than 25% of items contain attributable outbound links.",
            "metrics_availability": "Metrics do not form a large enough comparable sample for engagement ranking.",
            "event_signal_coverage": "Recognized event signals appear in fewer than 25% of items.",
        }[check["name"]]
        for check in checks
        if check["status"] != "pass"
    ]
    score = round(
        35 * min(1.0, item_count / 30)
        + 15 * date_coverage
        + 15 * source_map["link_coverage"]
        + 15 * metrics["item_coverage"]
        + 20 * event_coverage
    )
    return {
        "status": "pass" if not reasons else "caution",
        "score": max(0, min(100, score)),
        "reasons": reasons,
        "checks": checks,
        "metrics_availability": metrics,
    }


def build_risk_map(
    items: list[dict[str, Any]],
    source_map: dict[str, Any],
    metrics: dict[str, Any],
    event_hit_items: set[str],
    top_evidence: int,
) -> dict[str, Any]:
    flags: list[dict[str, Any]] = []
    item_count = len(items)
    date_coverage = share(sum(1 for item in items if item.get("created_at")), item_count)
    platforms = {item.get("platform") for item in items if item.get("platform")}
    event_coverage = share(len(event_hit_items), item_count)

    def add_flag(risk_type: str, severity: str, detail: str, evidence: Iterable[str] = ()) -> None:
        flags.append({
            "risk_type": risk_type,
            "severity": severity,
            "detail": detail,
            "evidence_item_ids": unique_strings(evidence)[:top_evidence],
        })

    if item_count < 30:
        add_flag("small_sample", "high" if item_count < 10 else "medium", f"Only {item_count} items support this profile.")
    if source_map["link_coverage"] < 0.25:
        add_flag("weak_source_attribution", "high", "Structured outbound-link coverage is below 25%.")
    if metrics["item_coverage"] < 0.5:
        add_flag("metrics_unavailable", "medium", "Missing metrics cannot be interpreted as zero engagement.")
    elif not metrics["engagement_ranking_available"]:
        add_flag("engagement_not_comparable", "medium", "Visible metrics do not form a comparable platform/time sample for ranking content performance.")
    if date_coverage < 0.8:
        add_flag("incomplete_dates", "medium", "Created-at coverage is below 80%.")
    if len(platforms) == 1:
        add_flag("single_platform", "medium", "Observed mechanics may be specific to one platform.")
    if event_coverage < 0.25:
        add_flag("weak_event_recurrence", "medium", "Recognized event signals cover less than 25% of items.")

    proprietary_evidence = [
        item["id"] for item in items if matches_any(item["text"], PROPRIETARY_PATTERNS)
    ]
    if proprietary_evidence:
        add_flag(
            "opaque_or_proprietary_claims",
            "high",
            "Some items invoke private, second-hand, or opaque access; do not treat it as reusable evidence.",
            proprietary_evidence,
        )

    return {
        "flags": flags,
        "prohibited_actions": [
            "Directly imitate or impersonate the target.",
            "Reuse exact catchphrases, signature anecdotes, or biographical identity markers.",
            "Treat private, proprietary, or second-hand claims as verified facts.",
            "Generate market content from this profile without current evidence and downstream validation.",
        ],
    }


def build_cuebook_bridge(
    attention_map: list[dict[str, Any]],
    source_map: dict[str, Any],
    reasoning_map: list[dict[str, Any]],
    writing_map: dict[str, Any],
) -> dict[str, Any]:
    return {
        "taxonomy_version": "profile-bridge-v1",
        "attention_affinities": [
            {
                "rule_id": f"selection.event.{entry['event_type']}",
                "attention_type": entry["event_type"],
                "route_event_types": ROUTE_EVENT_TYPES[entry["event_type"]],
                "weight": entry["share"],
                "evidence_item_ids": entry["evidence_item_ids"],
            }
            for entry in attention_map
        ],
        "source_preferences": [
            {
                "rule_id": f"selection.source.{entry['source_type'].replace('_', '-')}",
                "source_type": entry["source_type"],
                "weight": entry["share"],
                "evidence_item_ids": entry["evidence_item_ids"],
            }
            for entry in source_map["categories"]
        ],
        "reasoning_rules": [
            {
                "rule_id": f"reasoning.{entry['pattern']}",
                "pattern": entry["pattern"],
                "weight": entry["share"],
                "evidence_item_ids": entry["evidence_item_ids"],
            }
            for entry in reasoning_map
        ],
        "opening_rules": [
            {
                "rule_id": f"opening.{entry['pattern']}",
                "pattern": entry["pattern"],
                "weight": entry["share"],
                "evidence_item_ids": entry["evidence_item_ids"],
            }
            for entry in writing_map["hooks"]
        ],
        "data_hooks": [
            {
                "rule_id": f"data.{entry['event_type']}",
                "attention_type": entry["event_type"],
                "route_event_types": ROUTE_EVENT_TYPES[entry["event_type"]],
                "required_inputs": DATA_HOOKS[entry["event_type"]],
                "evidence_item_ids": entry["evidence_item_ids"],
            }
            for entry in attention_map
        ],
        "render_constraints": [
            {"rule_id": "avoid.voice-clone", "instruction": "Treat ProfileV1 as method-level guidance, never as a voice clone."},
            {"rule_id": "evidence.current-source", "instruction": "Ground each factual claim in current Cuebook evidence."},
            {"rule_id": "avoid.identity-markers", "instruction": "Use original wording and omit catchphrases, biography, and private-access claims."},
            {"rule_id": "evidence.preserve-missing", "instruction": "Keep unavailable metrics and sources explicitly unavailable."},
        ],
        "prohibited_moves": [
            "Direct impersonation or named-style imitation.",
            "Fabricated source access, engagement values, or market data.",
            "Unverified private anecdotes or proprietary claims.",
            "Publishing without current-source and risk validation.",
        ],
    }


def distill(corpus: dict[str, Any], top_evidence: int = 5) -> dict[str, Any]:
    if not 1 <= top_evidence <= 20:
        raise ValueError("top_evidence must be between 1 and 20")
    items = validate_corpus(corpus)
    source_map = build_source_map(items, top_evidence)
    attention_map, event_hit_items = pattern_map(
        items,
        EVENT_PATTERNS,
        "event_type",
        top_evidence,
        negation_aware=True,
    )
    reasoning_map, _ = pattern_map(
        items,
        REASONING_PATTERNS,
        "pattern",
        top_evidence,
    )
    writing_map = build_writing_map(items, top_evidence)
    metrics = metrics_availability(items)
    quality_gate = build_quality_gate(items, source_map, event_hit_items, metrics)
    risk_map = build_risk_map(
        items,
        source_map,
        metrics,
        event_hit_items,
        top_evidence,
    )

    dates = sorted(
        item["created_at"]
        for item in items
        if isinstance(item.get("created_at"), str) and item["created_at"]
    )
    subject = corpus.get("subject") if isinstance(corpus.get("subject"), dict) else {}
    target = {
        "name": subject.get("name") if isinstance(subject.get("name"), str) else None,
        "handles": unique_strings(subject.get("handles", [])),
        "platforms": unique_strings(subject.get("platforms", []))
        or unique_strings(item.get("platform", "unknown") for item in items),
    }
    profile_seed = f"{corpus['corpus_id']}|{DISTILLER_VERSION}"
    profile_id = "profile_" + hashlib.sha256(profile_seed.encode("utf-8")).hexdigest()[:16]

    return {
        "schema_version": SCHEMA_VERSION,
        "profile_id": profile_id,
        "generated_at": utc_now(),
        "target": target,
        "corpus_summary": {
            "corpus_id": corpus["corpus_id"],
            "items_total": len(corpus["items"]),
            "items_analyzed": len(items),
            "date_range": {
                "start": dates[0] if dates else None,
                "end": dates[-1] if dates else None,
            },
            "language_distribution": distribution(
                (item.get("language") or "und" for item in items),
                len(items),
            ),
            "platform_distribution": distribution(
                (item.get("platform") or "unknown" for item in items),
                len(items),
            ),
            "top_tickers": top_tickers(items),
            "linked_items": source_map["linked_items"],
        },
        "quality_gate": quality_gate,
        "source_map": source_map,
        "attention_map": attention_map,
        "reasoning_map": reasoning_map,
        "writing_map": writing_map,
        "risk_map": risk_map,
        "cuebook_bridge": build_cuebook_bridge(attention_map, source_map, reasoning_map, writing_map),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert a CorpusV1 JSON artifact into ProfileV1")
    parser.add_argument("input", type=Path, help="CorpusV1 JSON file")
    parser.add_argument("--output", type=Path, help="Write ProfileV1 JSON here instead of stdout")
    parser.add_argument("--top-evidence", type=int, default=5, help="Evidence item IDs per map entry (1-20)")
    parser.add_argument("--compact", action="store_true", help="Emit compact JSON")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        corpus = json.loads(args.input.read_text(encoding="utf-8-sig"))
        profile = distill(corpus, top_evidence=args.top_evidence)
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        parser.error(str(exc))
    payload = json.dumps(
        profile,
        ensure_ascii=False,
        indent=None if args.compact else 2,
        separators=(",", ":") if args.compact else None,
    )
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)


if __name__ == "__main__":
    main()
