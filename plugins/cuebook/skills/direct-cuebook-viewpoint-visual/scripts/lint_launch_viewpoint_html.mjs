#!/usr/bin/env node
// Lint compact launch-mode Cuebook viewpoint HTML copy and role markup.
//
// Port of lint_launch_viewpoint_html.py. Error codes, message wording, and the
// JSON output shape are contract and must stay byte-compatible with the Python
// original. The HTML walk reproduces the event order of Python's html.parser
// (start tag / self-closing tag / end tag / character data, charrefs decoded,
// script and style treated as CDATA) with a small tolerant tokenizer.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const ALLOWED_ROLES = ["claim", "evidence", "condition", "context", "brand"];
const ALLOWED_ROLE_SET = new Set(ALLOWED_ROLES);
const ALLOWED_ENTRY_ROLES = new Set(["claim", "evidence", "condition"]);
const ALLOWED_COLOR_ROLES = new Set(["positive", "negative", "observed", "catalyst", "conditional", "comparison", "risk"]);
const ALLOWED_PALETTE_STRATEGIES = new Set(["creator_native", "thesis_native", "contrast_variant"]);
const ALLOWED_VISUAL_LEVELS = new Set(["1", "2", "3", "4"]);
const REQUIRED_FONT_PROFILE = "cuebook-noi-v1";
const ALLOWED_FONT_LICENSE_MODES = new Set(["evaluation", "production"]);
// Claim copy may include a verdict plus a compact implication. Rendered line,
// height, and collision audits remain the authoritative compactness gates.
const ROLE_LIMITS = { claim: 44, evidence: 60, condition: 28, context: 18, brand: 0 };
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const GRAPHIC_TAGS = new Set(["path", "polyline", "polygon", "line", "rect", "circle", "ellipse", "use", "canvas", "img"]);
const NON_VISUAL_TAGS = new Set(["head", "style", "script", "title", "template", "noscript", "meta", "link", "base", "defs", "symbol"]);
const BINDING_REF_PATTERN = /^BIND_[A-Za-z0-9_:-]{4,}$/;
const WORDMARK_ASSET = path.join(SCRIPT_DIR, "..", "assets", "cuebook-wordmark.svg");
const PALETTE_REGISTRY = path.join(SCRIPT_DIR, "..", "references", "creator-palette-presets-v1.json");
const REGISTERED_PALETTES = new Set(
  JSON.parse(readFileSync(PALETTE_REGISTRY, "utf-8")).presets.map((item) => item.preset_id),
);
const CANONICAL_WORDMARK_PATHS = [...readFileSync(WORDMARK_ASSET, "utf-8").matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1]);

// ---------------------------------------------------------------------------
// Python parity helpers.

// The character class Python's `\s` matches for str patterns (also str.isspace).
const PY_SPACE_CLASS = "\\t\\n\\x0b\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_SPACE_RUN = new RegExp(`[${PY_SPACE_CLASS}]+`, "g");
const PY_STRIP_RE = new RegExp(`^[${PY_SPACE_CLASS}]+|[${PY_SPACE_CLASS}]+$`, "g");

function pyStrip(value) {
  return value.replace(PY_STRIP_RE, "");
}

// Code-point length, matching Python len() on str.
function cpLen(value) {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

// Code-point ordering, matching Python sorted() on str.
function cpCompare(a, b) {
  const ita = a[Symbol.iterator]();
  const itb = b[Symbol.iterator]();
  for (;;) {
    const na = ita.next();
    const nb = itb.next();
    if (na.done && nb.done) return 0;
    if (na.done) return -1;
    if (nb.done) return 1;
    const ca = na.value.codePointAt(0);
    const cb = nb.value.codePointAt(0);
    if (ca !== cb) return ca - cb;
  }
}

function pySorted(iterable) {
  return [...iterable].sort(cpCompare);
}

// Python repr() for strings.
export function pyrepr(value) {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const hasSingle = value.includes("'");
    const hasDouble = value.includes('"');
    const quote = hasSingle && !hasDouble ? '"' : "'";
    let out = quote;
    for (const ch of value) {
      const code = ch.codePointAt(0);
      if (ch === "\\") out += "\\\\";
      else if (ch === quote) out += `\\${quote}`;
      else if (ch === "\n") out += "\\n";
      else if (ch === "\r") out += "\\r";
      else if (ch === "\t") out += "\\t";
      else if (code < 0x20 || code === 0x7f) out += `\\x${code.toString(16).padStart(2, "0")}`;
      else out += ch;
    }
    return out + quote;
  }
  if (Array.isArray(value)) return `[${value.map(pyrepr).join(", ")}]`;
  return String(value);
}

// Python repr() for a list value (used for f"{list}" interpolations).
export function pyreprList(items) {
  return `[${items.map(pyrepr).join(", ")}]`;
}

// Python repr() for a list of tuples (used for f"{[(role, level)]}").
function pyreprTupleList(pairs) {
  return `[${pairs.map((pair) => `(${pair.map(pyrepr).join(", ")})`).join(", ")}]`;
}

// json.dumps parity: Python's string escaping never touches U+2028/U+2029 and
// escapes non-ASCII only when ensure_ascii is requested.
function pyJsonString(value, ensureAscii) {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    const code = value.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else if (ensureAscii && code > 0x7f) out += `\\u${code.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}

// json.dumps(value, ensure_ascii=..., sort_keys=..., indent=...). Floats never
// appear in linter output, so plain numbers serialize like Python ints.
export function pyJsonDumps(value, { indent = null, sortKeys = false, ensureAscii = false } = {}) {
  const render = (node, depth) => {
    if (node === null || node === undefined) return "null";
    if (node === true) return "true";
    if (node === false) return "false";
    if (typeof node === "number") return String(node);
    if (typeof node === "string") return pyJsonString(node, ensureAscii);
    const pad = indent === null ? "" : "\n" + " ".repeat(indent * (depth + 1));
    const endPad = indent === null ? "" : "\n" + " ".repeat(indent * depth);
    const itemSep = indent === null ? ", " : ",";
    if (Array.isArray(node)) {
      if (node.length === 0) return "[]";
      const parts = node.map((item) => pad + render(item, depth + 1));
      return `[${parts.join(itemSep)}${endPad}]`;
    }
    let keys = Object.keys(node);
    if (sortKeys) keys = keys.sort(cpCompare);
    if (keys.length === 0) return "{}";
    const parts = keys.map((key) => `${pad}${pyJsonString(key, ensureAscii)}: ${render(node[key], depth + 1)}`);
    return `{${parts.join(itemSep)}${endPad}}`;
  };
  return render(value, 0);
}

// ---------------------------------------------------------------------------
// Tolerant HTML tokenizer reproducing Python html.parser event behavior.

// html.unescape parity: full numeric charref handling plus the named entities
// that can realistically appear in skill-generated HTML. (The complete HTML5
// table is ~2200 entries; unknown names pass through unchanged, exactly like
// Python does for unregistered entities.)
const NAMED_ENTITIES = new Map(Object.entries({
  "amp;": "&", "AMP;": "&", "amp": "&", "AMP": "&",
  "lt;": "<", "LT;": "<", "lt": "<", "LT": "<",
  "gt;": ">", "GT;": ">", "gt": ">", "GT": ">",
  "quot;": '"', "QUOT;": '"', "quot": '"', "QUOT": '"',
  "apos;": "'",
  "nbsp;": " ", "nbsp": " ",
  "copy;": "©", "copy": "©", "COPY;": "©", "COPY": "©",
  "reg;": "®", "reg": "®", "REG;": "®", "REG": "®",
  "trade;": "™",
  "sect;": "§", "sect": "§",
  "para;": "¶", "para": "¶",
  "middot;": "·", "middot": "·",
  "bull;": "•",
  "hellip;": "…",
  "ndash;": "–",
  "mdash;": "—",
  "lsquo;": "‘",
  "rsquo;": "’",
  "ldquo;": "“",
  "rdquo;": "”",
  "sbquo;": "‚",
  "bdquo;": "„",
  "dagger;": "†",
  "Dagger;": "‡",
  "permil;": "‰",
  "prime;": "′",
  "Prime;": "″",
  "laquo;": "«", "laquo": "«",
  "raquo;": "»", "raquo": "»",
  "iexcl;": "¡", "iexcl": "¡",
  "iquest;": "¿", "iquest": "¿",
  "cent;": "¢", "cent": "¢",
  "pound;": "£", "pound": "£",
  "curren;": "¤", "curren": "¤",
  "yen;": "¥", "yen": "¥",
  "euro;": "€",
  "deg;": "°", "deg": "°",
  "plusmn;": "±", "plusmn": "±",
  "micro;": "µ", "micro": "µ",
  "times;": "×", "times": "×",
  "divide;": "÷", "divide": "÷",
  "minus;": "−",
  "frac12;": "½", "frac12": "½",
  "frac14;": "¼", "frac14": "¼",
  "frac34;": "¾", "frac34": "¾",
  "sup1;": "¹", "sup1": "¹",
  "sup2;": "²", "sup2": "²",
  "sup3;": "³", "sup3": "³",
  "shy;": "­", "shy": "­",
  "ensp;": " ",
  "emsp;": " ",
  "thinsp;": " ",
  "zwnj;": "‌",
  "zwj;": "‍",
  "lrm;": "‎",
  "rlm;": "‏",
  "larr;": "←",
  "uarr;": "↑",
  "rarr;": "→",
  "darr;": "↓",
  "harr;": "↔",
  "lArr;": "⇐",
  "rArr;": "⇒",
  "hArr;": "⇔",
  "infin;": "∞",
  "ne;": "≠",
  "le;": "≤",
  "ge;": "≥",
  "asymp;": "≈",
  "equiv;": "≡",
  "sim;": "∼",
  "prop;": "∝",
  "radic;": "√",
  "sum;": "∑",
  "prod;": "∏",
  "int;": "∫",
  "part;": "∂",
  "nabla;": "∇",
  "there4;": "∴",
  "loz;": "◊",
  "spades;": "♠",
  "clubs;": "♣",
  "hearts;": "♥",
  "diams;": "♦",
  "alpha;": "α", "beta;": "β", "gamma;": "γ", "delta;": "δ",
  "epsilon;": "ε", "theta;": "θ", "lambda;": "λ", "mu;": "μ",
  "pi;": "π", "rho;": "ρ", "sigma;": "σ", "tau;": "τ",
  "phi;": "φ", "chi;": "χ", "psi;": "ψ", "omega;": "ω",
  "Delta;": "Δ", "Sigma;": "Σ", "Omega;": "Ω", "Pi;": "Π",
}));

// html._invalid_charrefs (Windows-1252 remapping per the HTML5 spec).
const INVALID_CHARREFS = new Map([
  [0x00, "�"], [0x0d, "\r"], [0x80, "€"], [0x81, "\x81"],
  [0x82, "‚"], [0x83, "ƒ"], [0x84, "„"], [0x85, "…"],
  [0x86, "†"], [0x87, "‡"], [0x88, "ˆ"], [0x89, "‰"],
  [0x8a, "Š"], [0x8b, "‹"], [0x8c, "Œ"], [0x8d, "\x8d"],
  [0x8e, "Ž"], [0x8f, "\x8f"], [0x90, "\x90"], [0x91, "‘"],
  [0x92, "’"], [0x93, "“"], [0x94, "”"], [0x95, "•"],
  [0x96, "–"], [0x97, "—"], [0x98, "˜"], [0x99, "™"],
  [0x9a, "š"], [0x9b, "›"], [0x9c, "œ"], [0x9d, "\x9d"],
  [0x9e, "ž"], [0x9f, "Ÿ"],
]);

function isInvalidCodepoint(num) {
  if ((num >= 0x01 && num <= 0x08) || (num >= 0x0e && num <= 0x1f) || num === 0x7f) return true;
  if (num >= 0xfdd0 && num <= 0xfdef) return true;
  const low = num & 0xffff;
  return low === 0xfffe || low === 0xffff;
}

const CHARREF_RE = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/g;

export function unescapeHtml(text) {
  if (!text.includes("&")) return text;
  return text.replace(CHARREF_RE, (_, s) => {
    if (s[0] === "#") {
      const body = s.endsWith(";") ? s.slice(1, -1) : s.slice(1);
      const num = body[0] === "x" || body[0] === "X" ? parseInt(body.slice(1), 16) : parseInt(body, 10);
      if (INVALID_CHARREFS.has(num)) return INVALID_CHARREFS.get(num);
      if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) return "�";
      if (isInvalidCodepoint(num)) return "";
      return String.fromCodePoint(num);
    }
    if (NAMED_ENTITIES.has(s)) return NAMED_ENTITIES.get(s);
    for (let end = s.length - 1; end >= 2; end -= 1) {
      const head = s.slice(0, end);
      if (NAMED_ENTITIES.has(head)) return NAMED_ENTITIES.get(head) + s.slice(end);
    }
    return "&" + s;
  });
}

const TAGFIND_TOLERANT = /([a-zA-Z][^\t\n\r\f />\x00]*)(?:[\t\n\r\f ]|\/(?!>))*/y;
const ATTRFIND_TOLERANT = /((?<=['"\s/])[^\s/>][^\s/=>]*)(\s*=+\s*('[^']*'|"[^"]*"|(?!['"])[^>\s]*))?(?:\s|\/(?!>))*/y;
const END_TAG_FIND = /<\/\s*([a-zA-Z][-.a-zA-Z0-9:_]*)\s*>/y;
const CDATA_CONTENT_ELEMENTS = new Set(["script", "style"]);

// Walk the HTML, invoking html.parser-shaped callbacks on the handler object:
// handleStartTag(tag, attrs), handleStartEndTag(tag, attrs), handleEndTag(tag),
// handleData(text). Tag and attribute names arrive lowercased; attribute
// values arrive entity-decoded, with null for bare attributes.
export function walkHtml(html, handler) {
  let i = 0;
  const n = html.length;
  let cdataElem = null;

  const parseStartTag = (start) => {
    TAGFIND_TOLERANT.lastIndex = start + 1;
    const nameMatch = TAGFIND_TOLERANT.exec(html);
    if (!nameMatch || nameMatch.index !== start + 1) {
      handler.handleData(html[start]);
      return start + 1;
    }
    const tag = nameMatch[1].toLowerCase();
    let k = TAGFIND_TOLERANT.lastIndex;
    const attrs = [];
    for (;;) {
      if (k >= n) {
        // Incomplete tag at EOF: emit the remainder as data, like close().
        handler.handleData(html.slice(start));
        return n;
      }
      if (html[k] === ">") {
        handler.handleStartTag(tag, attrs);
        if (CDATA_CONTENT_ELEMENTS.has(tag)) cdataElem = tag;
        return k + 1;
      }
      if (html[k] === "/" && html[k + 1] === ">") {
        handler.handleStartEndTag(tag, attrs);
        return k + 2;
      }
      ATTRFIND_TOLERANT.lastIndex = k;
      const m = ATTRFIND_TOLERANT.exec(html);
      if (!m || m.index !== k || m[0].length === 0) {
        // Junk inside the tag: html.parser replays the whole tag as data.
        let gt = html.indexOf(">", k);
        if (gt === -1) gt = n;
        handler.handleData(html.slice(start, gt));
        return gt;
      }
      let value = m[3];
      if (m[2] === undefined) value = null;
      else if (value.length >= 2 && ((value[0] === "'" && value[value.length - 1] === "'") || (value[0] === '"' && value[value.length - 1] === '"'))) {
        value = value.slice(1, -1);
      }
      if (value) value = unescapeHtml(value);
      attrs.push([m[1].toLowerCase(), value === undefined ? null : value]);
      k = ATTRFIND_TOLERANT.lastIndex;
    }
  };

  const parseEndTag = (start) => {
    const gtpos = html.indexOf(">", start + 1);
    if (gtpos === -1) {
      handler.handleData(html.slice(start));
      return n;
    }
    END_TAG_FIND.lastIndex = start;
    const match = END_TAG_FIND.exec(html);
    if (match && match.index === start) {
      const tag = match[1].toLowerCase();
      if (cdataElem !== null && tag !== cdataElem) {
        handler.handleData(html.slice(start, gtpos));
        return gtpos;
      }
      handler.handleEndTag(tag);
      if (tag === cdataElem) cdataElem = null;
      return END_TAG_FIND.lastIndex;
    }
    if (cdataElem !== null) {
      handler.handleData(html.slice(start, gtpos));
      return gtpos;
    }
    const nameRe = /[a-zA-Z][^\t\n\r\f />\x00]*/y;
    nameRe.lastIndex = start + 2;
    const nameMatch = nameRe.exec(html);
    if (!nameMatch || nameMatch.index !== start + 2) {
      if (html.startsWith("</>", start)) return start + 3;
      const bogusEnd = html.indexOf(">", start + 2);
      return bogusEnd === -1 ? n : bogusEnd + 1;
    }
    const tag = nameMatch[1].toLowerCase();
    const after = html.indexOf(">", nameRe.lastIndex);
    handler.handleEndTag(tag);
    return after === -1 ? n : after + 1;
  };

  while (i < n) {
    if (cdataElem !== null) {
      const endRe = new RegExp(`</[\\t\\n\\r\\f ]*${cdataElem}`, "ig");
      endRe.lastIndex = i;
      const m = endRe.exec(html);
      const stop = m ? m.index : n;
      if (stop > i) handler.handleData(html.slice(i, stop));
      i = stop;
      if (i >= n) break;
      i = parseEndTag(i);
      continue;
    }
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      handler.handleData(unescapeHtml(html.slice(i)));
      break;
    }
    if (lt > i) handler.handleData(unescapeHtml(html.slice(i, lt)));
    i = lt;
    const next = html[i + 1];
    if (next !== undefined && /[a-zA-Z]/.test(next)) {
      i = parseStartTag(i);
    } else if (next === "/") {
      i = parseEndTag(i);
    } else if (html.startsWith("<!--", i)) {
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
    } else if (next === "?") {
      const end = html.indexOf(">", i + 2);
      i = end === -1 ? n : end + 1;
    } else if (next === "!") {
      const end = html.indexOf(">", i + 2);
      i = end === -1 ? n : end + 1;
    } else {
      handler.handleData("<");
      i += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Linter proper (direct port of the Python module).

export function issue(code, message) {
  return { code, message };
}

const DISPLAY_NONE_RE = /(?:^|;)\s*display\s*:\s*none(?:\s*!important)?\s*(?:;|$)/i;
const VISIBILITY_HIDDEN_RE = /(?:^|;)\s*visibility\s*:\s*(?:hidden|collapse)(?:\s*!important)?\s*(?:;|$)/i;
const OPACITY_ZERO_RE = /(?:^|;)\s*opacity\s*:\s*(?:0+(?:\.0+)?|0%)(?:\s*!important)?\s*(?:;|$)/i;

export function style_hides(style) {
  if (!style) return false;
  return DISPLAY_NONE_RE.test(style) || VISIBILITY_HIDDEN_RE.test(style) || OPACITY_ZERO_RE.test(style);
}

const CLASS_SELECTOR_RE = /^\.[A-Za-z_][\p{L}\p{N}_-]*$/u;
const ID_SELECTOR_RE = /^#[A-Za-z_][\p{L}\p{N}_-]*$/u;
const TAG_SELECTOR_RE = /^[A-Za-z][\p{L}\p{N}_-]*$/u;

export function hidden_css_selectors(html) {
  const classes = new Set();
  const ids = new Set();
  const tags = new Set();
  for (const [, selectorBlock, declarations] of html.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!style_hides(declarations)) continue;
    for (const selector of selectorBlock.split(",")) {
      let value = pyStrip(selector);
      if (value.includes("<") && value.includes(">")) {
        value = pyStrip(value.slice(value.lastIndexOf(">") + 1));
      }
      if (CLASS_SELECTOR_RE.test(value)) classes.add(value.slice(1));
      else if (ID_SELECTOR_RE.test(value)) ids.add(value.slice(1));
      else if (TAG_SELECTOR_RE.test(value)) tags.add(value.toLowerCase());
    }
  }
  return [classes, ids, tags];
}

// Attribute lookup helpers matching Python dict(attrs).get(...) semantics:
// missing and bare attributes both read as None/null.
function attrsToMap(attrs) {
  const map = new Map();
  for (const [name, value] of attrs) map.set(name, value);
  return map;
}

function attrGet(values, name) {
  const value = values.get(name);
  return value === undefined ? null : value;
}

class LaunchParser {
  constructor(hiddenSelectors) {
    this.contract = false;
    this.contract_count = 0;
    this.wordmark = false;
    [this.hidden_classes, this.hidden_ids, this.hidden_tags] = hiddenSelectors;
    this.frames = [];
    this.role_parts = {};
    for (const role of ALLOWED_ROLES) this.role_parts[role] = [];
    this.unscoped = [];
    this.unknown_roles = new Set();
    this.role_groups = 0;
    this.claim_break = false;
    this.entry_role = null;
    this.color_system = null;
    this.palette_family = null;
    this.palette_strategy = null;
    this.palette_preset = null;
    this.font_profile = null;
    this.font_license_mode = null;
    this.font_manifest_ref = null;
    this.group_levels = [];
    this.color_roles = new Set();
    this.unknown_color_roles = new Set();
    this.binding_records = [];
    this.logic_records = [];
  }

  locallyHidden(tag, values) {
    // Python str.split() with no arguments: split on whitespace runs, drop empties.
    const classes = new Set(
      String(attrGet(values, "class") || "").split(new RegExp(`[${PY_SPACE_CLASS}]+`)).filter((item) => item !== ""),
    );
    return Boolean(
      NON_VISUAL_TAGS.has(tag)
      || this.hidden_tags.has(tag)
      || values.has("hidden")
      || values.has("inert")
      || String(attrGet(values, "aria-hidden") || "").toLowerCase() === "true"
      || (tag === "input" && String(attrGet(values, "type") || "").toLowerCase() === "hidden")
      || style_hides(attrGet(values, "style"))
      || [...classes].some((item) => this.hidden_classes.has(item))
      || (attrGet(values, "id") !== null && this.hidden_ids.has(attrGet(values, "id"))),
    );
  }

  addRecord(values, frame) {
    const bindingRef = attrGet(values, "data-binding-ref");
    const bindingDisplay = attrGet(values, "data-binding-display");
    const hasGraphic = GRAPHIC_TAGS.has(frame.tag) || bindingDisplay === "geometry";
    if (bindingRef !== null) {
      this.binding_records.push({
        ref: String(bindingRef),
        tag: frame.tag,
        in_contract: frame.in_contract,
        hidden: frame.hidden,
        relevant: (ALLOWED_ROLE_SET.has(frame.effective_role) && frame.effective_role !== "brand") || Boolean(frame.effective_logic_step),
        has_text: false,
        has_graphic: hasGraphic,
        display: bindingDisplay,
      });
      frame.binding_record = this.binding_records.length - 1;
    }
    const logicStep = attrGet(values, "data-logic-step-id");
    if (logicStep !== null) {
      this.logic_records.push({
        step_id: String(logicStep),
        in_contract: frame.in_contract,
        hidden: frame.hidden,
        has_text: false,
        has_graphic: hasGraphic,
      });
      frame.logic_record = this.logic_records.length - 1;
    }
  }

  markGraphicAncestors(frame) {
    if (frame.hidden || !GRAPHIC_TAGS.has(frame.tag)) return;
    for (const ancestor of [...this.frames, frame]) {
      if (ancestor.binding_record !== null) this.binding_records[ancestor.binding_record].has_graphic = true;
      if (ancestor.logic_record !== null) this.logic_records[ancestor.logic_record].has_graphic = true;
    }
  }

  handleStartTag(tag, attrs) {
    const values = attrsToMap(attrs);
    const parent = this.frames.length ? this.frames[this.frames.length - 1] : null;
    const isContract = attrGet(values, "data-cuebook-visual-contract") === "launch-v1";
    if (isContract) {
      this.contract = true;
      this.contract_count += 1;
      this.entry_role = attrGet(values, "data-entry-role");
      this.color_system = attrGet(values, "data-color-system");
      this.palette_family = attrGet(values, "data-palette-family");
      this.palette_strategy = attrGet(values, "data-palette-strategy");
      this.palette_preset = attrGet(values, "data-palette-preset");
      this.font_profile = attrGet(values, "data-font-profile");
      this.font_license_mode = attrGet(values, "data-font-license-mode");
      this.font_manifest_ref = attrGet(values, "data-font-manifest-ref");
    }
    if (attrGet(values, "data-cuebook-wordmark") === "v1") this.wordmark = true;
    const explicitRole = attrGet(values, "data-role");
    const effectiveRole = explicitRole || (parent ? parent.effective_role : null);
    const ownLogicStep = attrGet(values, "data-logic-step-id");
    const effectiveLogicStep = ownLogicStep || (parent ? parent.effective_logic_step : null);
    const hidden = Boolean(parent && parent.hidden) || this.locallyHidden(tag, values);
    const inContract = isContract || Boolean(parent && parent.in_contract);
    const frame = {
      tag,
      effective_role: effectiveRole,
      effective_logic_step: effectiveLogicStep,
      hidden,
      in_contract: inContract,
      binding_record: null,
      logic_record: null,
    };
    if (explicitRole && inContract && !hidden) {
      this.role_groups += 1;
      if (!ALLOWED_ROLE_SET.has(explicitRole)) this.unknown_roles.add(explicitRole);
      else if (explicitRole !== "brand") this.group_levels.push([explicitRole, attrGet(values, "data-visual-level")]);
    }
    const colorRole = attrGet(values, "data-color-role");
    if (colorRole && inContract && !hidden) {
      if (ALLOWED_COLOR_ROLES.has(colorRole)) this.color_roles.add(colorRole);
      else this.unknown_color_roles.add(colorRole);
    }
    if (tag === "br" && effectiveRole === "claim" && inContract && !hidden) this.claim_break = true;
    this.addRecord(values, frame);
    this.markGraphicAncestors(frame);
    if (!VOID_TAGS.has(tag)) this.frames.push(frame);
  }

  handleStartEndTag(tag, attrs) {
    this.handleStartTag(tag, attrs);
    if (!VOID_TAGS.has(tag) && this.frames.length) this.frames.pop();
  }

  handleEndTag(tag) {
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      if (this.frames[index].tag === tag) {
        this.frames.length = index;
        return;
      }
    }
  }

  handleData(data) {
    const text = data.replace(PY_SPACE_RUN, "");
    if (!text) return;
    const frame = this.frames.length ? this.frames[this.frames.length - 1] : null;
    if (frame && frame.hidden) return;
    const currentRole = frame ? frame.effective_role : null;
    if (currentRole !== null && ALLOWED_ROLE_SET.has(currentRole)) this.role_parts[String(currentRole)].push(text);
    else this.unscoped.push(text);
    for (const ancestor of this.frames) {
      if (ancestor.binding_record !== null) this.binding_records[ancestor.binding_record].has_text = true;
      if (ancestor.logic_record !== null) this.logic_records[ancestor.logic_record].has_text = true;
    }
  }
}

const LSTEP_ID_RE = /^LSTEP_[A-Za-z0-9_:-]{3,}$/;
const PALETTE_FAMILY_RE = /^[a-z0-9]+(?:-[a-z0-9]+){1,5}$/;
const FONT_MANIFEST_REF_RE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.json$/;

export function audit_html(html) {
  const errors = [];
  const parser = new LaunchParser(hidden_css_selectors(html));
  walkHtml(html, parser);
  const roleText = {};
  for (const role of ALLOWED_ROLES) roleText[role] = parser.role_parts[role].join("");
  let visibleCount = 0;
  for (const value of Object.values(roleText)) visibleCount += cpLen(value);
  for (const value of parser.unscoped) visibleCount += cpLen(value);
  const visibleBindingRefs = new Set();
  for (const record of parser.binding_records) {
    const ref = record.ref;
    const validRef = BINDING_REF_PATTERN.test(ref);
    if (!validRef) errors.push(issue("BINDING_REF", `Invalid data-binding-ref ${pyrepr(ref)}.`));
    if (!(record.display === null || record.display === "text" || record.display === "geometry")) {
      errors.push(issue("BINDING_DISPLAY", `Binding ${pyrepr(ref)} uses unsupported data-binding-display.`));
    }
    if (!record.in_contract) errors.push(issue("BINDING_SCOPE", `Binding ${pyrepr(ref)} must be inside the launch visual root.`));
    else if (record.hidden) errors.push(issue("BINDING_HIDDEN", `Binding ${pyrepr(ref)} is attached to a hidden or non-rendered element.`));
    else if (!record.relevant) errors.push(issue("BINDING_CONTEXT", `Binding ${pyrepr(ref)} must be on or inside a non-brand launch role or logic step.`));
    else if (!record.has_text && !record.has_graphic) errors.push(issue("BINDING_EMPTY", `Binding ${pyrepr(ref)} must label visible text or rendered geometry.`));
    else if (validRef) visibleBindingRefs.add(ref);
  }
  const visibleLogicStepIds = new Set();
  for (const record of parser.logic_records) {
    if (record.in_contract && !record.hidden && (record.has_text || record.has_graphic) && LSTEP_ID_RE.test(record.step_id)) {
      visibleLogicStepIds.add(record.step_id);
    }
  }
  const wordmarkMatch = html.match(/<svg\b(?=[^>]*\bdata-cuebook-wordmark=["']v1["'])[^>]*>([\s\S]*?)<\/svg>/i);

  if (!parser.contract) {
    errors.push(issue("LAUNCH_CONTRACT", "Root must declare data-cuebook-visual-contract=launch-v1."));
  } else if (parser.contract_count !== 1) {
    errors.push(issue("LAUNCH_CONTRACT_COUNT", `Exactly one launch visual root is required; found ${parser.contract_count}.`));
  }
  if (parser.entry_role === null || !ALLOWED_ENTRY_ROLES.has(parser.entry_role)) {
    errors.push(issue("ENTRY_ROLE", "Root must declare data-entry-role=claim|evidence|condition."));
  }
  if (parser.color_system !== "semantic-v1") {
    errors.push(issue("COLOR_SYSTEM", "Root must declare data-color-system=semantic-v1."));
  }
  if (!parser.palette_family || !PALETTE_FAMILY_RE.test(parser.palette_family)) {
    errors.push(issue("PALETTE_FAMILY", "Root must declare a lowercase hyphenated data-palette-family."));
  }
  if (parser.palette_strategy === null || !ALLOWED_PALETTE_STRATEGIES.has(parser.palette_strategy)) {
    errors.push(issue("PALETTE_STRATEGY", "Root must declare data-palette-strategy=creator_native|thesis_native|contrast_variant."));
  }
  if (parser.palette_preset === null || !REGISTERED_PALETTES.has(parser.palette_preset)) {
    errors.push(issue("PALETTE_PRESET", "Root must declare a registered data-palette-preset."));
  } else if (parser.palette_family !== parser.palette_preset) {
    errors.push(issue("PALETTE_FAMILY_PRESET", "data-palette-family must equal data-palette-preset."));
  }
  if (parser.font_profile !== REQUIRED_FONT_PROFILE) {
    errors.push(issue("FONT_PROFILE", `Root must declare data-font-profile=${REQUIRED_FONT_PROFILE}.`));
  }
  if (parser.font_license_mode === null || !ALLOWED_FONT_LICENSE_MODES.has(parser.font_license_mode)) {
    errors.push(issue("FONT_LICENSE_MODE", "Root must declare data-font-license-mode=evaluation|production."));
  }
  if (!parser.font_manifest_ref || !FONT_MANIFEST_REF_RE.test(parser.font_manifest_ref)) {
    errors.push(issue("FONT_MANIFEST_REF", "Root must declare a safe artifact-local data-font-manifest-ref ending in .json."));
  }
  if (!/["']Cuebook Noi["']/.test(html)) {
    errors.push(issue("NOI_FONT_STACK", "Launch CSS must declare the Cuebook Noi family alias."));
  }
  if (/(?:src\s*:[^;{}]*url\(\s*["']?(?:https?:|\/\/|data:)|<link\b[^>]*href\s*=\s*["'](?:https?:|\/\/|data:))/i.test(html)) {
    errors.push(issue("FONT_NETWORK_ASSET", "Font assets must be artifact-local and network-free."));
  }
  const fontCssContext = [
    ...[...html.matchAll(/@font-face\s*\{[\s\S]*?\}/gi)].map((m) => m[0]),
    ...[...html.matchAll(/font-family\s*:[^;{}]+/gi)].map((m) => m[0]),
    ...[...html.matchAll(/<link\b[^>]*href\s*=\s*["'][^"']+["'][^>]*>/gi)].map((m) => m[0]),
  ].join("\n");
  if (/capsule\s+sans|\bnib\b/i.test(fontCssContext)) {
    errors.push(issue("BENCHMARK_FONT", "Robinhood brand fonts are forbidden; use the Cuebook Noi profile."));
  }
  if (parser.font_license_mode === "production" && fontCssContext.toLowerCase().includes("trial")) {
    errors.push(issue("TRIAL_FONT_RELEASE", "Production launch HTML cannot reference a Trial font family, path, or asset."));
  }
  if (!parser.wordmark) {
    errors.push(issue("WORDMARK_REQUIRED", "Final visual must include the canonical data-cuebook-wordmark=v1 SVG."));
  } else if (!wordmarkMatch) {
    errors.push(issue("WORDMARK_ELEMENT", "Cuebook wordmark marker must be attached to an inline SVG element."));
  } else {
    const wordmarkPaths = [...wordmarkMatch[1].matchAll(/<path\s+d="([^"]+)"/g)].map((m) => m[1]);
    const pathsMatch = wordmarkPaths.length === CANONICAL_WORDMARK_PATHS.length
      && wordmarkPaths.every((value, index) => value === CANONICAL_WORDMARK_PATHS[index]);
    if (!pathsMatch) {
      errors.push(issue("WORDMARK_PATHS", "Cuebook wordmark paths must exactly match the canonical product asset."));
    } else if ([...wordmarkMatch[1].matchAll(/fill=["']currentColor["']/gi)].length !== CANONICAL_WORDMARK_PATHS.length) {
      errors.push(issue("WORDMARK_FILL", "Every canonical wordmark path must inherit currentColor."));
    }
  }
  if (parser.wordmark && ![
    /\.cuebook-wordmark\s*\{/i,
    /right\s*:\s*41px/i,
    /bottom\s*:\s*34px/i,
    /width\s*:\s*136px/i,
    /height\s*:\s*26px/i,
    /color\s*:\s*#(?:F2F3F4|101411)/i,
  ].every((pattern) => pattern.test(html))) {
    errors.push(issue("WORDMARK_GEOMETRY", "Canonical wordmark must use the fixed 136 x 26 bottom-right geometry on the 1244 x 528 authoring canvas."));
  }
  if (!roleText.claim) {
    errors.push(issue("CLAIM_REQUIRED", "One visible claim role is required."));
  }
  if (parser.unknown_roles.size) {
    errors.push(issue("UNKNOWN_ROLE", `Unsupported visible roles: ${pyreprList(pySorted(parser.unknown_roles))}.`));
  }
  if (parser.unknown_color_roles.size) {
    errors.push(issue("UNKNOWN_COLOR_ROLE", `Unsupported semantic color roles: ${pyreprList(pySorted(parser.unknown_color_roles))}.`));
  }
  const missingLevels = parser.group_levels.filter(([, level]) => level === null).map(([role]) => role);
  const invalidLevels = parser.group_levels.filter(([, level]) => level !== null && !ALLOWED_VISUAL_LEVELS.has(level));
  const validLevels = parser.group_levels.filter(([, level]) => level !== null && ALLOWED_VISUAL_LEVELS.has(level));
  if (missingLevels.length) {
    errors.push(issue("VISUAL_LEVEL_REQUIRED", `Every non-brand visible role group needs data-visual-level: ${pyreprList(missingLevels)}.`));
  }
  if (invalidLevels.length) {
    errors.push(issue("VISUAL_LEVEL", `Visual levels must be 1-4: ${pyreprTupleList(invalidLevels)}.`));
  }
  const levelOneRoles = validLevels.filter(([, level]) => level === "1").map(([role]) => role);
  if (levelOneRoles.length !== 1) {
    errors.push(issue("VISUAL_ENTRY", `Exactly one level-1 group is required; found ${levelOneRoles.length}.`));
  } else if (parser.entry_role && levelOneRoles[0] !== parser.entry_role) {
    errors.push(issue("ENTRY_ROLE_MISMATCH", `Level-1 role ${pyrepr(levelOneRoles[0])} does not match root entry role ${pyrepr(parser.entry_role)}.`));
  }
  if (new Set(validLevels.map(([, level]) => level)).size < 2) {
    errors.push(issue("HIERARCHY_DEPTH", "Use at least two distinct visual levels."));
  }
  if (validLevels.some(([role, level]) => role === "claim" && level !== "1" && level !== "2")) {
    errors.push(issue("CLAIM_LEVEL", "Claim must use visual level 1 or 2."));
  }
  if (!parser.color_roles.size) {
    errors.push(issue("COLOR_ROLE_REQUIRED", "Declare at least one semantic data-color-role."));
  } else if (parser.color_roles.size > 3) {
    errors.push(issue("COLOR_ROLE_LIMIT", `Use at most three semantic color roles; found ${parser.color_roles.size}.`));
  }
  if (parser.unscoped.length) {
    errors.push(issue("UNSCOPED_TEXT", `Visible text lacks a launch role: ${pyreprList(parser.unscoped)}.`));
  }
  if (parser.claim_break) {
    errors.push(issue("CLAIM_MANUAL_BREAK", "Claim copy cannot contain a manual br."));
  }
  if (roleText.brand) {
    errors.push(issue("BRAND_TEXT", "Visible brand text is forbidden; use only the canonical SVG wordmark."));
  }
  if (roleText.claim && cpLen(roleText.claim) > 12 && !/text-wrap\s*:\s*balance/i.test(html)) {
    errors.push(issue("CLAIM_BALANCE", "Long claim copy must use text-wrap: balance."));
  }
  if (parser.role_groups > 8) {
    errors.push(issue("ROLE_GROUPS", `Use at most 8 visible role groups; found ${parser.role_groups}.`));
  }
  if (visibleCount > 120) {
    errors.push(issue("VISIBLE_COPY", `Launch visual contains ${visibleCount} visible characters; maximum is 120.`));
  }
  for (const [role, limit] of Object.entries(ROLE_LIMITS)) {
    if (cpLen(roleText[role]) > limit) {
      errors.push(issue("ROLE_BUDGET", `Role ${pyrepr(role)} contains ${cpLen(roleText[role])} characters; maximum is ${limit}.`));
    }
  }
  const generatedCopy = /content\s*:\s*(["'])(?!\s*\1)([\s\S]+?)\1/i.test(html);
  if (generatedCopy) {
    errors.push(issue("GENERATED_COPY", "CSS generated text is forbidden; place factual labels in role-marked HTML."));
  }
  const numericCopy = Object.values(roleText).some((value) => /[0-9]/.test(value));
  if (numericCopy && !/font-variant-numeric\s*:\s*tabular-nums/i.test(html)) {
    errors.push(issue("TABULAR_NUMBERS", "Market numbers and dates require font-variant-numeric: tabular-nums."));
  }

  const roleCharCounts = {};
  for (const role of ALLOWED_ROLES) roleCharCounts[role] = cpLen(roleText[role]);
  return {
    valid: errors.length === 0,
    errors,
    stats: {
      visible_char_count: visibleCount,
      role_groups: parser.role_groups,
      role_char_counts: roleCharCounts,
      visual_levels: validLevels,
      color_roles: pySorted(parser.color_roles),
      palette_family: parser.palette_family,
      palette_strategy: parser.palette_strategy,
      palette_preset: parser.palette_preset,
      font_profile: parser.font_profile,
      font_license_mode: parser.font_license_mode,
      font_manifest_ref: parser.font_manifest_ref,
      visible_binding_refs: pySorted(visibleBindingRefs),
      visible_logic_step_ids: pySorted(visibleLogicStepIds),
    },
  };
}

// Python OSError text for the READ issue.
const OS_ERROR_TEXT = {
  ENOENT: [2, "No such file or directory"],
  EACCES: [13, "Permission denied"],
  ENOTDIR: [20, "Not a directory"],
  EISDIR: [21, "Is a directory"],
};

// str(PurePosixPath(value)) normalization for argparse type=Path arguments.
export function pathStr(value) {
  const isAbsolute = value.startsWith("/");
  const parts = value.split("/").filter((item) => item !== "" && item !== ".");
  const joined = (isAbsolute ? "/" : "") + parts.join("/");
  if (joined === "") return isAbsolute ? "/" : ".";
  return joined;
}

function main(argv) {
  const positionals = argv.filter((arg) => arg !== "--");
  if (positionals.length !== 1) {
    process.stderr.write("usage: lint_launch_viewpoint_html.mjs html\n");
    return 2;
  }
  const htmlPath = pathStr(positionals[0]);
  let result;
  try {
    result = audit_html(readFileSync(htmlPath, "utf-8"));
  } catch (error) {
    const mapped = OS_ERROR_TEXT[error.code];
    const message = mapped ? `[Errno ${mapped[0]}] ${mapped[1]}: '${htmlPath}'` : String(error.message);
    result = { valid: false, errors: [issue("READ", message)], stats: {} };
  }
  process.stdout.write(pyJsonDumps(result, { indent: 2 }) + "\n");
  return result.valid ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
