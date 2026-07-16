#!/usr/bin/env python3
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


TAXONOMY_VERSION = "market-narrative-v2"
EVENT_PATTERNS = {
    "technical-level": [r"\b(?:20|50|100|200)[- ]day\b", r"\bdma\b", r"moving average", r"break(?:down|out)", r"day low", r"gap (?:fill|risk)", r"跌破", r"均线", r"新低", r"支撑位"],
    "prediction-market": [r"polymarket", r"kalshi", r"prediction market", r"implied probability", r"\bodds\b", r"预测市场", r"隐含概率"],
    "mechanical-flow": [r"index (?:addition|inclusion|reconstitution)", r"added to .*index", r"russell", r"buyback", r"repurchase", r"share issuance", r"secondary offering", r"unlock", r"指数纳入", r"回购", r"增发", r"解禁"],
    "credit-financing": [r"senior (?:secured |unsecured )?notes", r"\bbonds?\b", r"refinanc", r"coupon", r"maturit", r"debt issuance", r"credit spread", r"信用债", r"债券", r"再融资"],
    "company-guidance": [r"guidance", r"outlook", r"expects? .*\b(?:revenue|ebitda|eps)\b", r"reiterates? .*\b(?:revenue|ebitda|eps)\b", r"业绩指引", r"收入指引"],
    "earnings-result": [r"quarterly results", r"earnings (?:beat|miss)", r"reported (?:eps|revenue)", r"财报", r"盈利.*(?:上升|下降)"],
    "inventory-print": [r"storage .* (?:vs|versus)", r"inventory .* (?:vs|versus)", r"cpi .* (?:vs|versus)", r"库存", r"储量"],
    "macro-policy": [r"\bfed\b", r"fomc", r"core cpi", r"inflation", r"rate (?:cut|hike)", r"treasury yield", r"央行", r"通胀", r"降息", r"加息"],
    "analyst-action": [r"price target", r"raises? target", r"lowers? target", r"analyst", r"upgrades? .{0,50} to", r"downgrades? .{0,50} to", r"目标价", r"评级上调", r"评级下调"],
    "government-contract": [r"government contract", r"contract award", r"procurement", r"awarded .*contract", r"政府合同", r"中标"],
    "deal-event": [r"merger approval", r"merger closes?", r"shareholder approval", r"closing conditions", r"并购获批", r"合并完成"],
    "legal-regulatory": [r"lawsuit", r"sues?", r"regulator", r"regulatory approval", r"antitrust", r"oig", r"micar", r"诉讼", r"监管", r"反垄断"],
    "geopolitical-risk": [r"hormuz", r"shipping route", r"safe passage", r"military strike", r"war", r"sanction", r"brent", r"wti", r"战争", r"制裁", r"航运"],
    "capital-investment": [r"\$?\d+(?:\.\d+)?[BMK]? investment", r"capital expenditure", r"capex", r"投资计划", r"资本开支"],
    "operating-data": [r"shipments?", r"deliveries", r"same-store", r"subscribers?", r"daily active", r"同比", r"环比", r"出货"],
    "crowded-positioning": [r"liquidat", r"crowded", r"unwind", r"leveraged", r"margin call", r"circuit breaker", r"爆仓", r"杠杆", r"熔断", r"拥挤"],
    "social-sentiment": [r"lost .*savings", r"blew up", r"worst summer", r"pain", r"fomo", r"亏掉", r"无法翻身", r"彻底失败"],
    "product-strategy": [r"product cycle", r"\btam\b", r"adoption", r"platform strategy", r"category expansion", r"knowledge ownership", r"产品周期", r"渗透率", r"市场空间"],
    "price-action": [r"stock (?:is )?(?:up|down)", r"shares? (?:rise|fall)", r"risk-off", r"price dislocation", r"股价.*(?:上涨|下跌)", r"暴涨", r"暴跌"],
}

PRIORITY = list(EVENT_PATTERNS)
DEFAULTS = {
    "technical-level": (["forced-flow"], "tape-first", "tape", ["level", "distance_pct", "volume", "atr", "reclaim_condition"]),
    "prediction-market": (["probability-positioning", "crowding-unwind"], "number-first", "prediction_market", ["probability", "delta", "volume", "depth", "resolution_time"]),
    "mechanical-flow": (["forced-flow"], "actor-first", "flow", ["expected_flow", "float", "adv", "effective_date", "execution"]),
    "credit-financing": (["cashflow-credit"], "debate", "credit", ["principal", "coupon", "maturity", "cash", "fcf", "leverage"]),
    "company-guidance": (["model-revision"], "number-first", "estimates", ["new_range", "prior_range", "consensus", "revision_breadth", "price_reaction"]),
    "earnings-result": (["model-revision"], "number-first", "estimates", ["actual", "consensus", "guide", "margin", "price_reaction"]),
    "inventory-print": (["model-revision"], "number-first", "macro_print", ["actual", "consensus", "prior", "next_release", "spot_reaction"]),
    "macro-policy": (["risk-premium"], "source-first", "macro", ["rates", "yields", "dollar", "futures", "breadth"]),
    "analyst-action": (["model-revision"], "judgment-first", "estimates", ["rating", "target", "model_reason", "consensus_gap", "price_reaction"]),
    "government-contract": (["model-revision", "event-completion"], "number-first", "contract", ["contract_value", "duration", "revenue_share", "margin", "start_date"]),
    "deal-event": (["event-completion"], "event-first", "deal", ["close_date", "remaining_conditions", "spread", "consideration"]),
    "legal-regulatory": (["legal-overhang", "event-completion"], "event-first", "legal", ["jurisdiction", "remedy", "timeline", "financial_exposure"]),
    "geopolitical-risk": (["risk-premium"], "source-first", "macro", ["spot", "futures_curve", "volatility", "freight", "insurance"]),
    "capital-investment": (["cashflow-credit", "model-revision"], "number-first", "capex", ["amount", "funding", "timeline", "returns", "cashflow_impact"]),
    "operating-data": (["model-revision"], "number-first", "operations", ["actual", "prior", "consensus", "mix", "price_reaction"]),
    "crowded-positioning": (["crowding-unwind"], "actor-first", "positioning", ["oi", "funding", "borrow", "liquidations", "volume"]),
    "social-sentiment": (["sentiment-pain", "crowding-unwind"], "anecdote-first", "positioning", ["price_move", "leverage", "liquidations", "breadth"]),
    "product-strategy": (["tam-duration"], "judgment-first", "product", ["sell_through", "retention", "attach_rate", "competition", "next_guide"]),
    "price-action": (["forced-flow"], "tape-first", "tape", ["price_move", "volume", "level", "atr", "catalyst"]),
    "unknown": ([], "source-first", "source", ["primary_source", "event_time", "asset_link"]),
}


def values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [part for item in value for part in values(item)]
    if isinstance(value, dict):
        preferred = [value.get(key) for key in ("content", "text", "title", "note") if value.get(key)]
        return [part for item in (preferred or list(value.values())) for part in values(item)]
    return [str(value)]


def field(card: dict[str, Any], *names: str) -> Any:
    for name in names:
        if card.get(name) is not None:
            return card[name]
    return None


def blob(card: dict[str, Any], names: tuple[str, ...]) -> str:
    return re.sub(r"\s+", " ", " ".join(part for name in names for part in values(card.get(name)))).strip()


def score_events(card: dict[str, Any]) -> list[tuple[str, float]]:
    source = blob(card, ("source_content", "sourceContent", "source_events", "sourceEvents", "evidence"))
    story = blob(card, ("title", "bottom_line", "bottomLine", "asset_mechanism", "assetMechanism", "overread_note", "overreadNote"))
    metadata = blob(card, ("observable_type", "observableType", "category_tag", "categoryTag"))
    scores: dict[str, float] = defaultdict(float)
    for event, patterns in EVENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, source, re.I):
                scores[event] += 2.0
            if re.search(pattern, story, re.I):
                scores[event] += 1.0
            if re.search(pattern, metadata, re.I):
                scores[event] += 0.25
    return sorted(scores.items(), key=lambda item: (-item[1], PRIORITY.index(item[0])))


def hard_numbers(card: dict[str, Any]) -> list[str]:
    text = blob(card, ("source_content", "sourceContent", "source_events", "sourceEvents", "evidence", "title", "bottom_line", "bottomLine"))
    found = re.findall(r"(?<![A-Za-z])[$€£¥]?\d+(?:\.\d+)?\s?(?:%|pp|bps|[BMK]|亿|万)(?![A-Za-z])", text, re.I)
    return list(dict.fromkeys(re.sub(r"\s+", "", item) for item in found))[:8]


def route(card: dict[str, Any], gate: dict[str, Any] | None = None) -> dict[str, Any]:
    gate = gate or card.get("gate") or card.get("validation")
    cue = card.get("cue") if isinstance(card.get("cue"), dict) else card
    cue_id = str(field(cue, "id", "cue_id", "cueId") or "")
    if isinstance(gate, dict) and gate.get("decision") == "reject":
        return {"schema_version":"route-v1","taxonomy_version":TAXONOMY_VERSION,"cue_id":cue_id,"event_type":"unknown","event_confidence":0.0,"candidates":[],"reasoning_lenses":[],"render_shape":"source-first","required_context":[],"hard_numbers":[],"abstain":True,"abstain_reason":"projection-rejected"}
    ranked = score_events(cue)
    event = ranked[0][0] if ranked else "unknown"
    top = ranked[0][1] if ranked else 0.0
    confidence = 0.0 if not ranked else round(min(0.98, top / (top + 2.0)), 3)
    lenses, shape, kind, fields = DEFAULTS[event]
    story = blob(cue, ("title", "bottom_line", "bottomLine", "asset_mechanism", "assetMechanism"))
    lenses = list(lenses)
    directness = str(field(cue, "directness") or "direct")
    if directness in {"supported_proxy", "speculative_proxy"} and "proxy-transmission" not in lenses:
        lenses.append("proxy-transmission")
    if event in {"analyst-action", "product-strategy"} and re.search(r"\b(structural|category|product cycle|tam|duration)\b", story, re.I) and "tam-duration" not in lenses:
        lenses.append("tam-duration")
    return {
        "schema_version":"route-v1",
        "taxonomy_version":TAXONOMY_VERSION,
        "cue_id":cue_id,
        "event_type":event,
        "event_confidence":confidence,
        "candidates":[{"event_type":name,"score":score} for name,score in ranked[:3]],
        "reasoning_lenses":lenses,
        "render_shape":shape,
        "required_context":[{"kind":kind,"fields":fields,"why":f"Confirm or invalidate the {event} read before writing."}],
        "hard_numbers":hard_numbers(cue),
        "abstain":event == "unknown",
        "abstain_reason":"no-supported-event-type" if event == "unknown" else ""
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Route a validated Cuebook narrative")
    parser.add_argument("json_file", nargs="?", help="Cue or {cue, validation} JSON; stdin when omitted")
    args = parser.parse_args()
    raw = Path(args.json_file).read_text(encoding="utf-8") if args.json_file else __import__("sys").stdin.read()
    payload = json.loads(raw)
    output = [route(item) for item in payload] if isinstance(payload, list) else route(payload)
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
