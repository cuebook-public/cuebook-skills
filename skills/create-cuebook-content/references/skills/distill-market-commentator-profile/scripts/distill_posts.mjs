#!/usr/bin/env node
// Distill a CorpusV1 artifact into an evidence-backed ProfileV1.
// Port of distill_posts.py; ProfileV1 semantics and deterministic ordering are
// contract.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { domainToASCII, pathToFileURL } from "node:url";

import { pyFloatFixed, pyLen, pyRound, pyStrip } from "../../render-cuebook-market-signal/scripts/pycompat.mjs";

export const SCHEMA_VERSION = "profile.v1";
export const DISTILLER_VERSION = "1.0.0";
export const CORE_ENGAGEMENT_FIELDS = new Set(["likes", "reposts", "replies", "views", "bookmarks", "quotes"]);
const CORE_ENGAGEMENT_ORDER = ["likes", "reposts", "replies", "views", "bookmarks", "quotes"];

export const EVENT_PATTERNS = {
  "hard-data-print": [
    /\b(?:cpi|ppi|nfp|gdp|payrolls?|inflation|revenue|earnings|eps|ebitda|guidance|inventory|storage)\b/iu,
    /(?:财报|业绩|营收|利润|指引|库存|通胀|非农|数据(?:公布|出炉)|同比|环比|采购经理指数)/iu,
  ],
  "tape-break": [
    /\b(?:break(?:out|down)?|gap|vwap|volume|new high|new low|support|resistance|moving average)\b/iu,
    /(?:突破|跌破|新高|新低|跳空|放量|缩量|均线|技术位|支撑位|阻力位|成交量|盘中)/iu,
  ],
  "prediction-market-shift": [
    /\b(?:polymarket|kalshi|prediction market|odds|probability)\b/iu,
    /(?:预测市场|赔率|概率|胜率|隐含概率)/iu,
  ],
  "crowded-unwind": [
    /\b(?:liquidat(?:e|ed|ion)|crowded|unwind|front[- ]?run|leverage|margin call|trapped)\b/iu,
    /(?:爆仓|强平|拥挤|去杠杆|平仓|踩踏|被套|挤仓|解除杠杆)/iu,
  ],
  "macro-risk-premium": [
    /\b(?:fed|rates?|yields?|treasur(?:y|ies)|fx|dollar|crude oil|oil (?:price|futures|market|supply|route)|wti|brent|sanctions?|tariffs?|war|geopolitic)\b/iu,
    /(?:美联储|利率|收益率|国债|美元|汇率|原油|油价|制裁|关税|战争|地缘|风险溢价|央行)/iu,
  ],
  "estimate-revision": [
    /\b(?:analyst|upgrade|downgrade|estimate revision|price target|consensus estimate)\b/iu,
    /(?:分析师|上调|下调|目标价|盈利预测|一致预期|预期修正|估值调整)/iu,
  ],
  "mechanical-flow": [
    /\b(?:etf|index|buyback|issuance|rebalance|unlock|passive flow|options expiry)\b/iu,
    /(?:指数调仓|被动资金|回购|增发|解禁|再平衡|期权到期|机械性资金|ETF)/iu,
  ],
  "supply-bottleneck": [
    /\b(?:capacity|bottleneck|supply chain|shortage|semiconductor|gpu|power constraint|logistics)\b/iu,
    /(?:产能|瓶颈|供应链|短缺|芯片|半导体|算力|电力约束|物流|供给不足)/iu,
  ],
  "credit-cashflow-stress": [
    /\b(?:debt|credit|coupon|refinanc|cash flow|free cash flow|fcf|default|spread widening)\b/iu,
    /(?:债务|信用|票息|再融资|现金流|自由现金流|违约|利差走阔|偿债)/iu,
  ],
  "sentiment-pain": [
    /\b(?:fomo|fear|panic|capitulat|pain|lost money|blew up|retail sentiment)\b/iu,
    /(?:恐慌|情绪|割肉|亏损|亏掉|爆亏|踏空|追涨|抄底|散户|投降|绝望)/iu,
  ],
  "valuation-rerating": [
    /\b(?:valuation|multiple|p\/e|price to sales|tam|rerat(?:e|ing)|discounted cash flow)\b/iu,
    /(?:估值|市盈率|市销率|倍数|重估|估值切换|市场空间|现金流折现)/iu,
  ],
};

export const REASONING_PATTERNS = {
  "source-first": [
    /\b(?:filing|primary source|original document|release says|according to the report|data show)\b/iu,
    /(?:公告显示|原文|原始文件|一手数据|报告显示|数据表明|根据(?:公告|文件|报告|数据))/iu,
  ],
  "actor-forced": [
    /\b(?:forced to|must buy|must sell|must hedge|cover shorts?|de[- ]?risk|margin call)\b/iu,
    /(?:被迫|必须买|必须卖|必须对冲|回补空头|降低风险|追加保证金|强制平仓)/iu,
  ],
  "model-line": [
    /\b(?:revenue|gross margin|operating margin|eps|ebitda|free cash flow|fcf|tam)\b/iu,
    /(?:营收|收入|毛利率|营业利润率|每股收益|现金流|市场空间|盈利模型)/iu,
  ],
  "tape-first": [
    /\b(?:price action|the tape|volume confirms|breaks? support|breaks? resistance|vwap)\b/iu,
    /(?:盘面|走势|价格行为|成交量确认|跌破支撑|突破阻力|量价|均价线)/iu,
  ],
  "crowding-first": [
    /\b(?:everyone is|consensus trade|crowded|positioning|trapped longs?|trapped shorts?)\b/iu,
    /(?:所有人都|一致交易|拥挤交易|持仓过度|多头被套|空头被套|共识太强)/iu,
  ],
  "analogy-first": [
    /\b(?:last time|similar to|reminds me of|historical analogue|rhymes with)\b/iu,
    /(?:上一次|类似于|让我想起|历史上|复刻|类比|如同当年)/iu,
  ],
  "pain-first": [
    /\b(?:retail pain|capitulation|lost money|panic selling|fomo became)\b/iu,
    /(?:散户痛苦|割肉|亏损变成|恐慌抛售|踏空情绪|情绪变成资金流)/iu,
  ],
  "skepticism-first": [
    /\b(?:too neat|doesn't add up|consensus is wrong|skeptical|the story ignores)\b/iu,
    /(?:没那么简单|说不通|共识错了|值得怀疑|叙事忽略|故事太顺|不买账)/iu,
  ],
  "falsifier-first": [
    /\b(?:invalidat(?:e|ed|ion)|unless|wrong if|falsif|stop if)\b/iu,
    /(?:失效条件|证伪|除非|如果.+则错|错在|止损条件|不成立)/iu,
  ],
};

const OFFICIAL_DOMAINS = new Set(["sec.gov", "federalreserve.gov", "bls.gov", "bea.gov", "eia.gov", "treasury.gov", "stats.gov.cn", "pbc.gov.cn", "csrc.gov.cn", "sse.com.cn", "szse.cn", "hkexnews.hk"]);
const MEDIA_DOMAINS = new Set(["reuters.com", "bloomberg.com", "wsj.com", "ft.com", "cnbc.com", "apnews.com", "caixin.com", "yicai.com", "cls.cn", "36kr.com"]);
const MARKET_DATA_DOMAINS = new Set(["tradingview.com", "finance.yahoo.com", "investing.com", "fred.stlouisfed.org", "macrotrends.net", "coinglass.com", "glassnode.com", "polymarket.com", "kalshi.com"]);
const SOCIAL_DOMAINS = new Set(["x.com", "twitter.com", "t.me", "reddit.com", "youtube.com", "youtu.be", "discord.com", "weibo.com", "zhihu.com"]);

const HOOK_ORDER = ["thread", "number-first", "question-first", "judgment-first", "anecdote-first"];
const HOOK_PATTERNS = {
  thread: /(?:\bthread\b|🧵|线程|长文|^\s*1\/\d*)/iu,
  "number-first": /^[\s"'“”‘’(\[【（]*(?:[$¥￥€£]\s*)?[+-]?\d[\d,.]*(?:\.\d+)?\s*(?:%|％|x|X|倍|万|亿)?/iu,
  "question-first": /(?:[?？]\s*$)|^\s*(?:why|how|what|can|will|is|are)\b|^\s*(?:为什么|怎么|如何|是否|能否|会不会|还有多少)/iu,
  "judgment-first": /^\s*(?:i think|looks like|this is|this isn't|bullish|bearish)\b|^\s*(?:我认为|我觉得|看起来|这不是|这是|先别|看多|看空|重点是|真正的问题)/iu,
  "anecdote-first": /^(?:.{0,20})(?:someone|a friend|my friend|a colleague|朋友|同事|有人|群里|一位)/iu,
};

const PROPRIETARY_PATTERNS = [
  /\b(?:my source|source said|friend said|dm(?:ed)? me|desk color|channel check|off the record)\b/iu,
  /(?:朋友说|消息人士|私信|群里说|内部渠道|听说|小道消息|渠道调研|不便透露)/iu,
];

const DATA_HOOKS = {
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
};

const ROUTE_EVENT_TYPES = {
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
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function roundDigits(value, digits) {
  return Number(pyFloatFixed(value, digits));
}

export function share(count, total) {
  return total ? roundDigits(count / total, 4) : 0;
}

export function uniqueStrings(values) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = pyStrip(value);
    if (cleaned && !seen.has(cleaned)) {
      seen.add(cleaned);
      result.push(cleaned);
    }
  }
  return result;
}

export function validateCorpus(corpus) {
  if (!isObject(corpus)) throw new Error("CorpusV1 root must be an object");
  if (corpus.schema_version !== "corpus.v1") throw new Error('expected schema_version "corpus.v1"; normalize raw inputs first');
  if (typeof corpus.corpus_id !== "string" || !corpus.corpus_id) throw new Error("CorpusV1 corpus_id is required");
  const provenance = corpus.provenance;
  if (!isObject(provenance) || !new Set(["public", "authorized"]).has(provenance.rights_basis)) {
    throw new Error("CorpusV1 provenance must declare public or authorized rights");
  }
  const items = corpus.items;
  if (!Array.isArray(items) || !items.length) throw new Error("CorpusV1 items must be a non-empty array");
  const seenIds = new Set();
  items.forEach((item, index) => {
    if (!isObject(item)) throw new Error(`items[${index}] must be an object`);
    const itemId = item.id;
    if (typeof itemId !== "string" || !itemId) throw new Error(`items[${index}].id is required`);
    if (seenIds.has(itemId)) throw new Error(`duplicate CorpusV1 item id: ${itemId}`);
    seenIds.add(itemId);
    if (typeof item.text !== "string" || !pyStrip(item.text)) throw new Error(`items[${index}].text must be non-empty`);
    if (!Array.isArray(item.links)) throw new Error(`items[${index}].links must be an array`);
    const entities = item.entities;
    if (!isObject(entities) || !Array.isArray(entities.tickers)) throw new Error(`items[${index}].entities.tickers must be an array`);
    const metrics = item.metrics;
    if (!isObject(metrics) || !isObject(metrics.values)) throw new Error(`items[${index}].metrics.values must be an object`);
    if (typeof metrics.available !== "boolean") throw new Error(`items[${index}].metrics.available must be boolean`);
    const numericValues = Object.entries(metrics.values).filter(([, value]) => typeof value === "number" && Number.isFinite(value) && value >= 0);
    if (numericValues.length !== Object.keys(metrics.values).length) throw new Error(`items[${index}].metrics.values must contain non-negative numbers`);
    if (metrics.available !== Boolean(numericValues.length)) throw new Error(`items[${index}].metrics.available disagrees with metrics.values`);
    const itemProvenance = item.provenance;
    if (!isObject(itemProvenance) || !new Set(["public", "authorized"]).has(itemProvenance.rights_basis)) {
      throw new Error(`items[${index}].provenance has no valid rights basis`);
    }
  });
  return items;
}

export function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function withGlobal(pattern) {
  return new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
}

export function matchesUnnegated(text, patterns) {
  for (const pattern of patterns) {
    for (const match of text.matchAll(withGlobal(pattern))) {
      const fullBefore = text.slice(0, match.index);
      const before = Array.from(fullBefore).slice(-48).join("");
      const englishNegation = /\b(?:no|not|without|never)\b(?:\W+\w+){0,4}\W*$/iu.test(before);
      const chineseNegation = /(?:没有|并无|不存在|未见|未出现|不含|毫无|无)[\s的任何明显实际所谓]*$/u.test(before);
      if (!englishNegation && !chineseNegation) return true;
    }
  }
  return false;
}

export function confidence(count, itemShare) {
  if (count >= 5 && itemShare >= 0.15) return "high";
  if (count >= 2) return "medium";
  return "low";
}

export function patternMap(items, patterns, keyName, topEvidence, negationAware = false) {
  const counts = new Map();
  const evidence = new Map();
  const hitItems = new Set();
  for (const item of items) {
    for (const [name, expressions] of Object.entries(patterns)) {
      const matched = negationAware ? matchesUnnegated(item.text, expressions) : matchesAny(item.text, expressions);
      if (matched) {
        counts.set(name, (counts.get(name) ?? 0) + 1);
        hitItems.add(item.id);
        if (!evidence.has(name)) evidence.set(name, []);
        if (evidence.get(name).length < topEvidence) evidence.get(name).push(item.id);
      }
    }
  }
  const order = new Map(Object.keys(patterns).map((name, index) => [name, index]));
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || order.get(a[0]) - order.get(b[0])).map(([name, count]) => {
    const itemShare = share(count, items.length);
    return { [keyName]: name, count, share: itemShare, confidence: confidence(count, itemShare), evidence_item_ids: evidence.get(name) };
  });
  return [entries, hitItems];
}

export function canonicalDomain(link) {
  if (!isObject(link)) return null;
  const rawUrl = link.url;
  let host = null;
  if (typeof rawUrl === "string" && pyStrip(rawUrl)) {
    try {
      const parts = new URL(pyStrip(rawUrl));
      if (new Set(["http:", "https:"]).has(parts.protocol.toLowerCase())) host = parts.hostname;
    } catch {
      host = null;
    }
  }
  if (!host && typeof link.domain === "string") {
    const rawDomain = pyStrip(link.domain).toLowerCase();
    try {
      host = new URL(`http://${rawDomain}`).hostname;
    } catch {
      host = null;
    }
  }
  if (!host) return null;
  let domain = host.replace(/\.+$/, "").toLowerCase();
  while (/^(?:www|m|mobile)\./.test(domain)) domain = domain.split(".").slice(1).join(".");
  if (new Set(["twitter.com", "mobile.twitter.com"]).has(domain)) domain = "x.com";
  const ascii = domainToASCII(domain);
  return ascii || null;
}

function domainIn(domain, candidates) {
  return [...candidates].some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

export function sourceType(domain) {
  if (domainIn(domain, OFFICIAL_DOMAINS) || domain.endsWith(".gov") || domain.endsWith(".gov.cn") || domain.endsWith(".gov.uk")) return "official";
  if (domainIn(domain, MEDIA_DOMAINS)) return "media_wire";
  if (domainIn(domain, MARKET_DATA_DOMAINS)) return "market_data";
  if (domainIn(domain, SOCIAL_DOMAINS)) return "social";
  return "other";
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function buildSourceMap(items, topEvidence) {
  const domainLinks = new Map();
  const domainItems = new Map();
  const categoryLinks = new Map();
  const categoryItems = new Map();
  const categoryEvidence = new Map();
  const linkedItems = new Set();
  for (const item of items) {
    const seenUrls = new Set();
    const itemCategories = new Set();
    for (const link of item.links) {
      const rawUrl = isObject(link) ? link.url : null;
      if (typeof rawUrl === "string" && seenUrls.has(rawUrl)) continue;
      if (typeof rawUrl === "string") seenUrls.add(rawUrl);
      const domain = canonicalDomain(link);
      if (!domain) continue;
      const category = sourceType(domain);
      linkedItems.add(item.id);
      increment(domainLinks, domain);
      if (!domainItems.has(domain)) domainItems.set(domain, new Set());
      domainItems.get(domain).add(item.id);
      increment(categoryLinks, category);
      if (!categoryItems.has(category)) categoryItems.set(category, new Set());
      categoryItems.get(category).add(item.id);
      itemCategories.add(category);
    }
    for (const category of itemCategories) {
      if (!categoryEvidence.has(category)) categoryEvidence.set(category, []);
      if (categoryEvidence.get(category).length < topEvidence) categoryEvidence.get(category).push(item.id);
    }
  }
  const totalLinks = [...domainLinks.values()].reduce((sum, value) => sum + value, 0);
  const typeOrder = new Map(["official", "media_wire", "market_data", "social", "other"].map((name, index) => [name, index]));
  const categories = [...categoryLinks.entries()].sort((a, b) => b[1] - a[1] || typeOrder.get(a[0]) - typeOrder.get(b[0])).map(([category, count]) => {
    const categoryDomains = [...domainLinks.entries()].filter(([domain]) => sourceType(domain) === category).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en")).map(([domain]) => domain);
    return { source_type: category, link_count: count, item_count: categoryItems.get(category).size, share: share(count, totalLinks), domains: categoryDomains, evidence_item_ids: categoryEvidence.get(category) };
  });
  const domains = [...domainLinks.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en")).map(([domain, count]) => ({ domain, source_type: sourceType(domain), link_count: count, item_count: domainItems.get(domain).size }));
  return { linked_items: linkedItems.size, unlinked_items: items.length - linkedItems.size, link_coverage: share(linkedItems.size, items.length), categories, domains };
}

export function normalizeTicker(value) {
  if (typeof value !== "string") return null;
  const ticker = pyStrip(value).replace(/^\$+/, "").toUpperCase();
  return /^(?:[A-Z]{1,8}:)?[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(ticker) ? ticker : null;
}

export function topTickers(items, limit = 30) {
  const counts = new Map();
  const firstSeen = new Map();
  let ordinal = 0;
  for (const item of items) {
    const tickers = new Set();
    for (const raw of item.entities.tickers ?? []) {
      const ticker = normalizeTicker(raw);
      if (ticker) tickers.add(ticker);
    }
    for (const match of item.text.matchAll(/(?<![\w$])\$([A-Za-z][A-Za-z0-9.\-]{0,14})/g)) {
      const ticker = normalizeTicker(match[1]);
      if (ticker) tickers.add(ticker);
    }
    for (const match of item.text.matchAll(/\b(NASDAQ|NYSE|AMEX|HKEX|SSE|SZSE|SH|SZ):([A-Z0-9.\-]{1,15})\b/giu)) {
      const ticker = normalizeTicker(`${match[1]}:${match[2]}`);
      if (ticker) tickers.add(ticker);
    }
    for (const ticker of tickers) {
      if (!firstSeen.has(ticker)) firstSeen.set(ticker, ordinal++);
      increment(counts, ticker);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || firstSeen.get(a[0]) - firstSeen.get(b[0])).slice(0, limit).map(([ticker, count]) => ({ ticker, count }));
}

export function distribution(values, total) {
  const counts = new Map();
  for (const value of values) if (typeof value === "string" && value) increment(counts, value);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([name, count]) => ({ name, count, share: share(count, total) }));
}

export function firstHook(text) {
  const opening = pyStrip(text);
  for (const name of HOOK_ORDER) {
    const candidate = new Set(["thread", "question-first"]).has(name) ? opening : Array.from(opening).slice(0, 160).join("");
    if (HOOK_PATTERNS[name].test(candidate)) return name;
  }
  return "statement";
}

function splitLines(text) {
  return text.split(/\r\n|\n|\r|\v|\f|\x1c|\x1d|\x1e|\x85|\u2028|\u2029/u);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildWritingMap(items, topEvidence) {
  const hookCounts = new Map();
  const hookEvidence = new Map();
  const characterCounts = [];
  const lineCounts = [];
  const formatCounts = new Map();
  for (const item of items) {
    const text = pyStrip(item.text);
    const hook = firstHook(text);
    increment(hookCounts, hook);
    if (!hookEvidence.has(hook)) hookEvidence.set(hook, []);
    if (hookEvidence.get(hook).length < topEvidence) hookEvidence.get(hook).push(item.id);
    characterCounts.push(pyLen(text));
    const lineCount = splitLines(text).length;
    lineCounts.push(lineCount);
    if (pyLen(text) <= 280) increment(formatCounts, "short");
    if (lineCount > 1) increment(formatCounts, "multiline");
    if (/\d/u.test(text)) increment(formatCounts, "contains-number");
    if (/[?？]/u.test(text)) increment(formatCounts, "contains-question");
    if (pyLen(text) >= 1000) increment(formatCounts, "long-form");
  }
  const hookOrder = new Map([...HOOK_ORDER, "statement"].map((name, index) => [name, index]));
  const hooks = [...hookCounts.entries()].sort((a, b) => b[1] - a[1] || hookOrder.get(a[0]) - hookOrder.get(b[0])).map(([name, count]) => {
    const itemShare = share(count, items.length);
    return { pattern: name, count, share: itemShare, confidence: confidence(count, itemShare), evidence_item_ids: hookEvidence.get(name) };
  });
  const formatPatterns = [...formatCounts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).filter(([, count]) => count).map(([name, count]) => ({ pattern: name, count, share: share(count, items.length) }));
  return {
    hooks,
    cadence: { median_characters: roundDigits(median(characterCounts), 2), median_lines: roundDigits(median(lineCounts), 2) },
    format_patterns: formatPatterns,
    language_distribution: distribution(items.map((item) => item.language || "und"), items.length),
    abstraction_rule: "Use only method-level mechanics and original wording; never reproduce catchphrases or imitate the target.",
  };
}

export function metricsAvailability(items) {
  const fieldCounts = new Map();
  let itemsWithAny = 0;
  let itemsWithEngagement = 0;
  for (const item of items) {
    const values = item.metrics.values;
    if (Object.keys(values).length) {
      itemsWithAny += 1;
      for (const name of Object.keys(values)) increment(fieldCounts, name);
      if (Object.keys(values).some((name) => CORE_ENGAGEMENT_FIELDS.has(name))) itemsWithEngagement += 1;
    }
  }
  const orderedFields = [...fieldCounts.keys()].sort((a, b) => {
    const ai = CORE_ENGAGEMENT_FIELDS.has(a) ? CORE_ENGAGEMENT_ORDER.indexOf(a) : 99;
    const bi = CORE_ENGAGEMENT_FIELDS.has(b) ? CORE_ENGAGEMENT_ORDER.indexOf(b) : 99;
    return ai - bi || (a < b ? -1 : a > b ? 1 : 0);
  });
  const comparableEngagement = [...CORE_ENGAGEMENT_FIELDS].filter((name) => name !== "views").some((name) => (fieldCounts.get(name) ?? 0) >= 8 && share(fieldCounts.get(name) ?? 0, items.length) >= 0.5);
  const fields = {};
  for (const name of orderedFields) fields[name] = { observed_items: fieldCounts.get(name), coverage: share(fieldCounts.get(name), items.length) };
  return {
    items_total: items.length,
    items_with_any: itemsWithAny,
    item_coverage: share(itemsWithAny, items.length),
    fields,
    engagement_ranking_available: itemsWithEngagement >= 8 && share(itemsWithEngagement, items.length) >= 0.5 && comparableEngagement,
  };
}

function makeCheck(name, passed, value, threshold, detail) {
  return { name, status: passed ? "pass" : "caution", value, threshold, detail };
}

export function buildQualityGate(items, sourceMap, eventHitItems, metrics) {
  const itemCount = items.length;
  const dateCoverage = share(items.filter((item) => item.created_at).length, itemCount);
  const eventCoverage = share(eventHitItems.size, itemCount);
  const checks = [
    makeCheck("sample_size", itemCount >= 30, itemCount, ">=30 items", "Enough items for recurring-pattern claims."),
    makeCheck("date_coverage", dateCoverage >= 0.8, dateCoverage, ">=0.80", "Created-at coverage supports regime and cadence interpretation."),
    makeCheck("source_link_coverage", sourceMap.link_coverage >= 0.25, sourceMap.link_coverage, ">=0.25", "Structured outbound links support source attribution."),
    makeCheck("metrics_availability", metrics.engagement_ranking_available, metrics.items_with_any, ">=8 comparable items and >=0.50 coverage", "Observed metrics support within-stratum engagement comparisons without treating missing values as zero."),
    makeCheck("event_signal_coverage", eventCoverage >= 0.25, eventCoverage, ">=0.25", "Observed event signals support an attention map."),
  ];
  const reasonMap = {
    sample_size: "Fewer than 30 items; pattern recurrence is provisional.",
    date_coverage: "Created-at coverage is below 80%; timing conclusions are limited.",
    source_link_coverage: "Fewer than 25% of items contain attributable outbound links.",
    metrics_availability: "Metrics do not form a large enough comparable sample for engagement ranking.",
    event_signal_coverage: "Recognized event signals appear in fewer than 25% of items.",
  };
  const reasons = checks.filter((check) => check.status !== "pass").map((check) => reasonMap[check.name]);
  const score = pyRound(35 * Math.min(1, itemCount / 30) + 15 * dateCoverage + 15 * sourceMap.link_coverage + 15 * metrics.item_coverage + 20 * eventCoverage);
  return { status: reasons.length ? "caution" : "pass", score: Math.max(0, Math.min(100, score)), reasons, checks, metrics_availability: metrics };
}

export function buildRiskMap(items, sourceMap, metrics, eventHitItems, topEvidence) {
  const flags = [];
  const itemCount = items.length;
  const dateCoverage = share(items.filter((item) => item.created_at).length, itemCount);
  const platforms = new Set(items.filter((item) => item.platform).map((item) => item.platform));
  const eventCoverage = share(eventHitItems.size, itemCount);
  const addFlag = (riskType, severity, detail, evidence = []) => flags.push({ risk_type: riskType, severity, detail, evidence_item_ids: uniqueStrings(evidence).slice(0, topEvidence) });
  if (itemCount < 30) addFlag("small_sample", itemCount < 10 ? "high" : "medium", `Only ${itemCount} items support this profile.`);
  if (sourceMap.link_coverage < 0.25) addFlag("weak_source_attribution", "high", "Structured outbound-link coverage is below 25%.");
  if (metrics.item_coverage < 0.5) addFlag("metrics_unavailable", "medium", "Missing metrics cannot be interpreted as zero engagement.");
  else if (!metrics.engagement_ranking_available) addFlag("engagement_not_comparable", "medium", "Visible metrics do not form a comparable platform/time sample for ranking content performance.");
  if (dateCoverage < 0.8) addFlag("incomplete_dates", "medium", "Created-at coverage is below 80%.");
  if (platforms.size === 1) addFlag("single_platform", "medium", "Observed mechanics may be specific to one platform.");
  if (eventCoverage < 0.25) addFlag("weak_event_recurrence", "medium", "Recognized event signals cover less than 25% of items.");
  const proprietaryEvidence = items.filter((item) => matchesAny(item.text, PROPRIETARY_PATTERNS)).map((item) => item.id);
  if (proprietaryEvidence.length) addFlag("opaque_or_proprietary_claims", "high", "Some items invoke private, second-hand, or opaque access; do not treat it as reusable evidence.", proprietaryEvidence);
  return {
    flags,
    prohibited_actions: [
      "Directly imitate or impersonate the target.",
      "Reuse exact catchphrases, signature anecdotes, or biographical identity markers.",
      "Treat private, proprietary, or second-hand claims as verified facts.",
      "Generate market content from this profile without current evidence and downstream validation.",
    ],
  };
}

export function buildCuebookBridge(attentionMap, sourceMap, reasoningMap, writingMap) {
  return {
    taxonomy_version: "profile-bridge-v1",
    attention_affinities: attentionMap.map((entry) => ({ rule_id: `selection.event.${entry.event_type}`, attention_type: entry.event_type, route_event_types: ROUTE_EVENT_TYPES[entry.event_type], weight: entry.share, evidence_item_ids: entry.evidence_item_ids })),
    source_preferences: sourceMap.categories.map((entry) => ({ rule_id: `selection.source.${entry.source_type.replaceAll("_", "-")}`, source_type: entry.source_type, weight: entry.share, evidence_item_ids: entry.evidence_item_ids })),
    reasoning_rules: reasoningMap.map((entry) => ({ rule_id: `reasoning.${entry.pattern}`, pattern: entry.pattern, weight: entry.share, evidence_item_ids: entry.evidence_item_ids })),
    opening_rules: writingMap.hooks.map((entry) => ({ rule_id: `opening.${entry.pattern}`, pattern: entry.pattern, weight: entry.share, evidence_item_ids: entry.evidence_item_ids })),
    data_hooks: attentionMap.map((entry) => ({ rule_id: `data.${entry.event_type}`, attention_type: entry.event_type, route_event_types: ROUTE_EVENT_TYPES[entry.event_type], required_inputs: DATA_HOOKS[entry.event_type], evidence_item_ids: entry.evidence_item_ids })),
    render_constraints: [
      { rule_id: "avoid.voice-clone", instruction: "Treat ProfileV1 as method-level guidance, never as a voice clone." },
      { rule_id: "evidence.current-source", instruction: "Ground each factual claim in current Cuebook evidence." },
      { rule_id: "avoid.identity-markers", instruction: "Use original wording and omit catchphrases, biography, and private-access claims." },
      { rule_id: "evidence.preserve-missing", instruction: "Keep unavailable metrics and sources explicitly unavailable." },
    ],
    prohibited_moves: [
      "Direct impersonation or named-style imitation.",
      "Fabricated source access, engagement values, or market data.",
      "Unverified private anecdotes or proprietary claims.",
      "Publishing without current-source and risk validation.",
    ],
  };
}

export function distill(corpus, topEvidence = 5) {
  if (!Number.isInteger(topEvidence) || topEvidence < 1 || topEvidence > 20) throw new Error("top_evidence must be between 1 and 20");
  const items = validateCorpus(corpus);
  const sourceMap = buildSourceMap(items, topEvidence);
  const [attentionMap, eventHitItems] = patternMap(items, EVENT_PATTERNS, "event_type", topEvidence, true);
  const [reasoningMap] = patternMap(items, REASONING_PATTERNS, "pattern", topEvidence);
  const writingMap = buildWritingMap(items, topEvidence);
  const metrics = metricsAvailability(items);
  const qualityGate = buildQualityGate(items, sourceMap, eventHitItems, metrics);
  const riskMap = buildRiskMap(items, sourceMap, metrics, eventHitItems, topEvidence);
  const dates = items.filter((item) => typeof item.created_at === "string" && item.created_at).map((item) => item.created_at).sort();
  const subject = isObject(corpus.subject) ? corpus.subject : {};
  const subjectPlatforms = uniqueStrings(subject.platforms ?? []);
  const target = {
    name: typeof subject.name === "string" ? subject.name : null,
    handles: uniqueStrings(subject.handles ?? []),
    platforms: subjectPlatforms.length ? subjectPlatforms : uniqueStrings(items.map((item) => item.platform || "unknown")),
  };
  const profileSeed = `${corpus.corpus_id}|${DISTILLER_VERSION}`;
  const profileId = `profile_${createHash("sha256").update(profileSeed, "utf8").digest("hex").slice(0, 16)}`;
  return {
    schema_version: SCHEMA_VERSION,
    profile_id: profileId,
    generated_at: utcNow(),
    target,
    corpus_summary: {
      corpus_id: corpus.corpus_id,
      items_total: corpus.items.length,
      items_analyzed: items.length,
      date_range: { start: dates.length ? dates[0] : null, end: dates.length ? dates.at(-1) : null },
      language_distribution: distribution(items.map((item) => item.language || "und"), items.length),
      platform_distribution: distribution(items.map((item) => item.platform || "unknown"), items.length),
      top_tickers: topTickers(items),
      linked_items: sourceMap.linked_items,
    },
    quality_gate: qualityGate,
    source_map: sourceMap,
    attention_map: attentionMap,
    reasoning_map: reasoningMap,
    writing_map: writingMap,
    risk_map: riskMap,
    cuebook_bridge: buildCuebookBridge(attentionMap, sourceMap, reasoningMap, writingMap),
  };
}

function parseArgs(argv) {
  let input = null;
  let output = null;
  let topEvidence = 5;
  let compact = false;
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--output") output = argv[++index];
    else if (token === "--top-evidence") topEvidence = Number(argv[++index]);
    else if (token === "--compact") compact = true;
    else if (!input) input = token;
    else throw new Error(`unrecognized arguments: ${token}`);
  }
  if (!input) throw new Error("the following arguments are required: input");
  if (!Number.isInteger(topEvidence)) throw new Error("argument --top-evidence: invalid int value");
  return { input, output, topEvidence, compact };
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
    const text = readFileSync(args.input, "utf8").replace(/^\uFEFF/, "");
    const profile = distill(JSON.parse(text), args.topEvidence);
    const payload = JSON.stringify(profile, null, args.compact ? undefined : 2);
    if (args.output) writeFileSync(args.output, `${payload}\n`, "utf8");
    else process.stdout.write(`${payload}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`usage: distill_posts.mjs input [--output OUTPUT] [--top-evidence N] [--compact]\ndistill_posts.mjs: error: ${error.message}\n`);
    return 2;
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) process.exit(main());
