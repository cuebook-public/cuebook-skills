#!/usr/bin/env node
// Normalize public or authorized exports into the CorpusV1 contract.
//
// Port of normalize_corpus.py. Output bytes, error codes, and message wording
// are contract and must stay byte-compatible with the Python original.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";

const SCHEMA_VERSION = "corpus.v1";
const NORMALIZER_VERSION = "1.0.0";
const CORE_METRICS = ["likes", "reposts", "replies", "views", "bookmarks", "quotes"];

const TEXT_FIELDS = ["text", "full_text", "content", "body", "tweet", "post", "message"];
const DATE_FIELDS = ["created_at", "published_at", "timestamp", "date", "time"];
const URL_FIELDS = ["url", "permalink", "post_url", "canonical_url"];
const ID_FIELDS = ["external_id", "post_id", "tweet_id", "status_id", "id"];
const PLATFORM_FIELDS = ["platform", "source_platform", "channel_type"];

const METRIC_ALIASES = {
  likes: ["likes", "like_count", "favorite_count", "favorites", "favourites"],
  reposts: ["reposts", "repost_count", "retweets", "retweet_count", "shares", "share_count"],
  replies: ["replies", "reply_count", "comments", "comment_count"],
  views: ["views", "view_count", "impressions", "impression_count"],
  bookmarks: ["bookmarks", "bookmark_count", "saves", "save_count"],
  quotes: ["quotes", "quote_count", "quote_tweets", "quote_tweet_count"],
};

const ENTITY_ALIASES = {
  tickers: ["tickers", "ticker", "symbols", "symbol", "cashtags", "cashtag"],
  hashtags: ["hashtags", "hashtag", "tags"],
  mentions: ["mentions", "mention", "user_mentions"],
  organizations: ["organizations", "organization", "orgs", "companies"],
  people: ["people", "persons", "person"],
  locations: ["locations", "location", "places"],
  other: ["other", "topics", "keywords"],
};

const TRACKING_QUERY_KEYS = new Set(["fbclid", "gclid", "igshid", "mc_cid", "mc_eid", "ref_src", "spm"]);

const LINK_KIND_MAP = {
  source: "source",
  citation: "citation",
  cite: "citation",
  reference: "citation",
  media: "media",
  image: "media",
  video: "media",
  external: "external",
  url: "external",
  link: "external",
  other: "other",
};

const PLATFORM_ALIASES = {
  twitter: "x",
  "x.com": "x",
  telegram: "telegram",
  substack: "newsletter",
  youtube: "youtube",
};

// ---------------------------------------------------------------------------
// Python compatibility helpers

// Python error hierarchy stand-ins so main() can catch what Python caught.
class PyValueError extends Error {}
class PyOSError extends Error {}
class PyUnicodeError extends PyValueError {}
class PyJSONDecodeError extends PyValueError {
  constructor(msg) {
    super(msg);
    this.msg = msg;
  }
}

function isDict(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function get(mapping, key) {
  return Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : null;
}

// The character set Python's str.strip()/str.split()/\s treat as whitespace.
const PY_WHITESPACE = "\\t\\n\\x0b\\x0c\\r\\x1c\\x1d\\x1e\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const PY_STRIP_RE = new RegExp(`^[${PY_WHITESPACE}]+|[${PY_WHITESPACE}]+$`, "g");
const PY_SPACE_RUN_RE = new RegExp(`[${PY_WHITESPACE}]+`, "g");

function pyStrip(text) {
  return text.replace(PY_STRIP_RE, "");
}

function stripChars(text, chars, mode = "both") {
  const set = new Set(chars);
  const units = [...text];
  let start = 0;
  let end = units.length;
  if (mode !== "right") while (start < end && set.has(units[start])) start += 1;
  if (mode !== "left") while (end > start && set.has(units[end - 1])) end -= 1;
  return units.slice(start, end).join("");
}

// str(value) for the JSON scalar types that reach output.
function pyStr(value) {
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  return String(value);
}

// Code-point string comparison (Python's str ordering).
function cmpCp(a, b) {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ra = ia.next();
    const rb = ib.next();
    if (ra.done && rb.done) return 0;
    if (ra.done) return -1;
    if (rb.done) return 1;
    const ca = ra.value.codePointAt(0);
    const cb = rb.value.codePointAt(0);
    if (ca !== cb) return ca < cb ? -1 : 1;
  }
}

function pySplitlines(text) {
  const lines = [];
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\r") {
      lines.push(current);
      current = "";
      if (text[i + 1] === "\n") i += 1;
    } else if ("\n\v\f\x1c\x1d\x1e\x85  ".includes(ch)) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

// bytes.decode("utf-8-sig") with Python-style error messages.
function decodeUtf8Sig(buffer) {
  let data = buffer;
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    data = data.subarray(3);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch {
    throw new PyUnicodeError(utf8ErrorMessage(data));
  }
}

function utf8ErrorMessage(data) {
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i];
    if (byte < 0x80) continue;
    let need;
    let low = 0x80;
    let high = 0xbf;
    if (byte >= 0xc2 && byte <= 0xdf) need = 1;
    else if (byte >= 0xe0 && byte <= 0xef) {
      need = 2;
      if (byte === 0xe0) low = 0xa0;
      if (byte === 0xed) high = 0x9f;
    } else if (byte >= 0xf0 && byte <= 0xf4) {
      need = 3;
      if (byte === 0xf0) low = 0x90;
      if (byte === 0xf4) high = 0x8f;
    } else {
      return `'utf-8' codec can't decode byte 0x${byte.toString(16).padStart(2, "0")} in position ${i}: invalid start byte`;
    }
    let ok = 0;
    for (let j = 1; j <= need; j += 1) {
      if (i + j >= data.length) {
        if (ok === 0) {
          return `'utf-8' codec can't decode byte 0x${byte.toString(16).padStart(2, "0")} in position ${i}: unexpected end of data`;
        }
        return `'utf-8' codec can't decode bytes in position ${i}-${i + ok}: unexpected end of data`;
      }
      const cont = data[i + j];
      const min = j === 1 ? low : 0x80;
      const max = j === 1 ? high : 0xbf;
      if (cont < min || cont > max) {
        if (ok === 0) {
          return `'utf-8' codec can't decode byte 0x${byte.toString(16).padStart(2, "0")} in position ${i}: invalid continuation byte`;
        }
        return `'utf-8' codec can't decode bytes in position ${i}-${i + ok}: invalid continuation byte`;
      }
      ok += 1;
    }
    i += need;
  }
  return "'utf-8' codec can't decode input";
}

// ---------------------------------------------------------------------------
// json.loads work-alike with CPython error messages (and NaN/Infinity support)

function pyJsonLoads(text) {
  const parser = new PyJsonParser(text);
  const value = parser.parseValue();
  parser.skipWhitespace();
  if (parser.pos !== parser.text.length) throw new PyJSONDecodeError("Extra data");
  return value;
}

class PyJsonParser {
  constructor(text) {
    this.text = text;
    this.pos = 0;
  }

  fail(msg) {
    throw new PyJSONDecodeError(msg);
  }

  skipWhitespace() {
    while (this.pos < this.text.length && " \t\n\r".includes(this.text[this.pos])) this.pos += 1;
  }

  parseValue() {
    this.skipWhitespace();
    const ch = this.text[this.pos];
    if (ch === undefined) this.fail("Expecting value");
    if (ch === "{") return this.parseObject();
    if (ch === "[") return this.parseArray();
    if (ch === '"') return this.parseString();
    if (this.text.startsWith("true", this.pos)) {
      this.pos += 4;
      return true;
    }
    if (this.text.startsWith("false", this.pos)) {
      this.pos += 5;
      return false;
    }
    if (this.text.startsWith("null", this.pos)) {
      this.pos += 4;
      return null;
    }
    if (this.text.startsWith("NaN", this.pos)) {
      this.pos += 3;
      return NaN;
    }
    if (this.text.startsWith("Infinity", this.pos)) {
      this.pos += 8;
      return Infinity;
    }
    if (this.text.startsWith("-Infinity", this.pos)) {
      this.pos += 9;
      return -Infinity;
    }
    const match = /^-?(?:0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/.exec(this.text.slice(this.pos));
    if (match && match[0]) {
      this.pos += match[0].length;
      return Number(match[0]);
    }
    this.fail("Expecting value");
  }

  parseObject() {
    this.pos += 1;
    const result = {};
    this.skipWhitespace();
    if (this.text[this.pos] === "}") {
      this.pos += 1;
      return result;
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.pos] !== '"') this.fail("Expecting property name enclosed in double quotes");
      const key = this.parseString();
      this.skipWhitespace();
      if (this.text[this.pos] !== ":") this.fail("Expecting ':' delimiter");
      this.pos += 1;
      result[key] = this.parseValue();
      this.skipWhitespace();
      const ch = this.text[this.pos];
      if (ch === ",") {
        this.pos += 1;
        this.skipWhitespace();
        if (this.text[this.pos] === "}") this.fail("Illegal trailing comma before end of object");
        continue;
      }
      if (ch === "}") {
        this.pos += 1;
        return result;
      }
      this.fail("Expecting ',' delimiter");
    }
  }

  parseArray() {
    this.pos += 1;
    const result = [];
    this.skipWhitespace();
    if (this.text[this.pos] === "]") {
      this.pos += 1;
      return result;
    }
    for (;;) {
      result.push(this.parseValue());
      this.skipWhitespace();
      const ch = this.text[this.pos];
      if (ch === ",") {
        this.pos += 1;
        this.skipWhitespace();
        if (this.text[this.pos] === "]") this.fail("Illegal trailing comma before end of array");
        continue;
      }
      if (ch === "]") {
        this.pos += 1;
        return result;
      }
      this.fail("Expecting ',' delimiter");
    }
  }

  parseString() {
    const start = this.pos;
    this.pos += 1;
    let out = "";
    for (;;) {
      const ch = this.text[this.pos];
      if (ch === undefined) {
        this.pos = start;
        this.fail("Unterminated string starting at");
      }
      if (ch === '"') {
        this.pos += 1;
        return out;
      }
      if (ch === "\\") {
        const esc = this.text[this.pos + 1];
        if (esc === undefined) {
          this.pos = start;
          this.fail("Unterminated string starting at");
        }
        if (esc === "u") {
          const hex = this.text.slice(this.pos + 2, this.pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) this.fail("Invalid \\uXXXX escape");
          out += String.fromCharCode(parseInt(hex, 16));
          this.pos += 6;
          continue;
        }
        const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (!(esc in simple)) this.fail("Invalid \\escape");
        out += simple[esc];
        this.pos += 2;
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) this.fail("Invalid control character at");
      out += ch;
      this.pos += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// urllib.parse work-alikes

// Characters quote() never encodes plus the caller-provided safe set.
const ALWAYS_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~";

function quotePy(text, safe) {
  const safeSet = new Set((ALWAYS_SAFE + safe).split("").map((ch) => ch.charCodeAt(0)));
  const bytes = Buffer.from(text, "utf-8");
  let out = "";
  for (const byte of bytes) {
    if (safeSet.has(byte)) out += String.fromCharCode(byte);
    else out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}

function quotePlus(text) {
  if (text.includes(" ")) return quotePy(text, " ").replaceAll(" ", "+");
  return quotePy(text, "");
}

function unquotePy(text) {
  return text.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => {
    const bytes = Buffer.from(run.replaceAll("%", ""), "hex");
    return bytes.toString("utf-8");
  });
}

function parseQsl(query) {
  // parse_qsl(..., keep_blank_values=True)
  const result = [];
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const index = pair.indexOf("=");
    let name;
    let value;
    if (index === -1) {
      name = pair;
      value = "";
    } else {
      name = pair.slice(0, index);
      value = pair.slice(index + 1);
    }
    result.push([unquotePy(name.replaceAll("+", " ")), unquotePy(value.replaceAll("+", " "))]);
  }
  return result;
}

function urlencodePairs(pairs) {
  return pairs.map(([key, value]) => `${quotePlus(key)}=${quotePlus(value)}`).join("&");
}

function urlsplitPy(url) {
  // Python 3.10+ strips C0-control-or-space at both ends and removes \t\r\n.
  let text = url;
  let start = 0;
  let end = text.length;
  while (start < end && text.charCodeAt(start) <= 0x20) start += 1;
  while (end > start && text.charCodeAt(end - 1) <= 0x20) end -= 1;
  text = text.slice(start, end).replaceAll("\t", "").replaceAll("\r", "").replaceAll("\n", "");

  let scheme = "";
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/s.exec(text);
  let rest = text;
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    rest = schemeMatch[2];
  }
  const hashIndex = rest.indexOf("#");
  let fragment = "";
  if (hashIndex !== -1) {
    fragment = rest.slice(hashIndex + 1);
    rest = rest.slice(0, hashIndex);
  }
  let netloc = "";
  if (rest.startsWith("//")) {
    let cut = rest.length;
    for (const ch of ["/", "?", "#"]) {
      const idx = rest.indexOf(ch, 2);
      if (idx !== -1 && idx < cut) cut = idx;
    }
    netloc = rest.slice(2, cut);
    rest = rest.slice(cut);
  }
  let query = "";
  const queryIndex = rest.indexOf("?");
  if (queryIndex !== -1) {
    query = rest.slice(queryIndex + 1);
    rest = rest.slice(0, queryIndex);
  }
  return { scheme, netloc, path: rest, query, fragment };
}

function hostinfo(netloc) {
  const atIndex = netloc.lastIndexOf("@");
  let hostport = atIndex === -1 ? netloc : netloc.slice(atIndex + 1);
  let host;
  let portText = null;
  if (hostport.startsWith("[")) {
    const closing = hostport.indexOf("]");
    host = closing === -1 ? hostport.slice(1) : hostport.slice(1, closing);
    const after = closing === -1 ? "" : hostport.slice(closing + 1);
    if (after.startsWith(":")) portText = after.slice(1);
  } else {
    const colon = hostport.indexOf(":");
    if (colon === -1) {
      host = hostport;
    } else {
      host = hostport.slice(0, colon);
      portText = hostport.slice(colon + 1);
    }
  }
  return { hostname: host ? host.toLowerCase() : host, portText };
}

function parsePort(portText) {
  if (portText === null || portText === "") return null;
  if (!/^[0-9]+$/.test(portText)) throw new PyValueError(`invalid literal for int() with base 10: '${portText}'`);
  const port = parseInt(portText, 10);
  if (port < 0 || port > 65535) throw new PyValueError("Port out of range 0-65535");
  return port;
}

// host.encode("idna") work-alike (RFC 3490 ToASCII per label).
function encodeIdna(host) {
  const labels = host.split(".");
  const encoded = labels.map((label) => {
    if (label === "") throw new PyUnicodeError("label empty or too long");
    if (/^[\x00-\x7f]*$/.test(label)) {
      if (label.length > 63) throw new PyUnicodeError("label empty or too long");
      return label;
    }
    // Nameprep approximation: drop map-to-nothing characters, casefold, NFKC.
    let prepped = label
      .replace(/[­͏᠆᠋-᠍​-‍⁠︀-️﻿]/g, "")
      .toLowerCase()
      .normalize("NFKC");
    if (prepped === "") throw new PyUnicodeError("label empty or too long");
    if (/^[\x00-\x7f]*$/.test(prepped)) {
      if (prepped.length > 63) throw new PyUnicodeError("label empty or too long");
      return prepped;
    }
    const puny = `xn--${punycodeEncode([...prepped].map((ch) => ch.codePointAt(0)))}`;
    if (puny.length > 63) throw new PyUnicodeError("label empty or too long");
    return puny;
  });
  return encoded.join(".");
}

// RFC 3492 punycode encoder.
function punycodeEncode(codePoints) {
  const base = 36;
  const tmin = 1;
  const tmax = 26;
  const skew = 38;
  const damp = 700;
  const digit = (d) => String.fromCharCode(d < 26 ? 97 + d : 22 + d);
  const adapt = (delta, numPoints, firstTime) => {
    let value = firstTime ? Math.floor(delta / damp) : Math.floor(delta / 2);
    value += Math.floor(value / numPoints);
    let k = 0;
    while (value > Math.floor(((base - tmin) * tmax) / 2)) {
      value = Math.floor(value / (base - tmin));
      k += base;
    }
    return k + Math.floor(((base - tmin + 1) * value) / (value + skew));
  };

  let output = "";
  const basic = codePoints.filter((cp) => cp < 128);
  let handled = basic.length;
  const basicLength = handled;
  output += basic.map((cp) => String.fromCharCode(cp)).join("");
  if (basicLength > 0) output += "-";
  let n = 128;
  let delta = 0;
  let bias = 72;
  while (handled < codePoints.length) {
    let m = Infinity;
    for (const cp of codePoints) if (cp >= n && cp < m) m = cp;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const cp of codePoints) {
      if (cp < n) delta += 1;
      if (cp === n) {
        let q = delta;
        for (let k = base; ; k += base) {
          const t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
          if (q < t) break;
          output += digit(t + ((q - t) % (base - t)));
          q = Math.floor((q - t) / (base - t));
        }
        output += digit(q);
        bias = adapt(delta, handled + 1, handled === basicLength);
        delta = 0;
        handled += 1;
      }
    }
    delta += 1;
    n += 1;
  }
  return output;
}

function urlunsplitPy(scheme, netloc, path, query, fragment) {
  let url = path;
  if (netloc || (url && url.startsWith("//"))) {
    if (url && !url.startsWith("/")) url = `/${url}`;
    url = `//${netloc || ""}${url}`;
  }
  if (scheme) url = `${scheme}:${url}`;
  if (query) url = `${url}?${query}`;
  if (fragment) url = `${url}#${fragment}`;
  return url;
}

// ---------------------------------------------------------------------------
// datetime work-alikes (proleptic Gregorian; epoch arithmetic avoids Date)

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year, month) {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYear(year)) return 29;
  return table[month - 1];
}

function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  return { year: y + (month <= 2 ? 1 : 0), month, day };
}

function epochFromParts(parts) {
  const days = daysFromCivil(parts.year, parts.month, parts.day);
  return days * 86400 + parts.hour * 3600 + parts.minute * 60 + parts.second;
}

// isoformat() (seconds precision, UTC) with +00:00 already replaced by Z.
function isoZFromEpoch(epochSeconds) {
  let days = Math.floor(epochSeconds / 86400);
  let rem = epochSeconds - days * 86400;
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(rem / 3600);
  rem -= hour * 3600;
  const minute = Math.floor(rem / 60);
  const second = rem - minute * 60;
  const pad = (num, width = 2) => String(num).padStart(width, "0");
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}Z`;
}

function utc_now() {
  return isoZFromEpoch(Math.floor(Date.now() / 1000));
}

// datetime.fromisoformat (Python 3.11+ grammar, ordinal dates excluded).
// Returns { epochSeconds (UTC-adjusted, microseconds dropped), aware } or null.
function parseIsoDatetime(text) {
  let rest = text;
  let year;
  let month;
  let day;
  let match;
  if ((match = /^(\d{4})-(\d{2})-(\d{2})/.exec(rest))) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    rest = rest.slice(match[0].length);
  } else if ((match = /^(\d{4})-W(\d{2})(?:-(\d))?/.exec(rest))) {
    const converted = dateFromIsoWeek(Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : 1);
    if (!converted) return null;
    ({ year, month, day } = converted);
    rest = rest.slice(match[0].length);
  } else if ((match = /^(\d{4})W(\d{2})(\d)?/.exec(rest))) {
    const converted = dateFromIsoWeek(Number(match[1]), Number(match[2]), match[3] ? Number(match[3]) : 1);
    if (!converted) return null;
    ({ year, month, day } = converted);
    rest = rest.slice(match[0].length);
  } else if ((match = /^(\d{4})(\d{2})(\d{2})/.exec(rest))) {
    [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    rest = rest.slice(match[0].length);
  } else {
    return null;
  }
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined && (day < 1 || day > daysInMonth(year, month))) return null;

  let hour = 0;
  let minute = 0;
  let second = 0;
  let offsetSeconds = null;
  if (rest.length > 0) {
    rest = rest.slice(1); // any single separator character
    const timeMatch = /^(\d{2})(?::?(\d{2})(?::?(\d{2}))?)?(?:[.,](\d+))?/.exec(rest);
    if (!timeMatch || timeMatch[0].length === 0) return null;
    hour = Number(timeMatch[1]);
    minute = timeMatch[2] === undefined ? 0 : Number(timeMatch[2]);
    second = timeMatch[3] === undefined ? 0 : Number(timeMatch[3]);
    if (timeMatch[4] !== undefined && timeMatch[3] === undefined) return null;
    if (hour > 23 || minute > 59 || second > 59) return null;
    rest = rest.slice(timeMatch[0].length);
    if (rest.length > 0) {
      if (rest === "Z" || rest === "z") {
        offsetSeconds = 0;
        rest = "";
      } else {
        const offsetMatch = /^([+-])(\d{2})(?::?(\d{2})(?::?(\d{2})(?:[.,]\d+)?)?)?$/.exec(rest);
        if (!offsetMatch) return null;
        const sign = offsetMatch[1] === "-" ? -1 : 1;
        const offHour = Number(offsetMatch[2]);
        const offMinute = offsetMatch[3] === undefined ? 0 : Number(offsetMatch[3]);
        const offSecond = offsetMatch[4] === undefined ? 0 : Number(offsetMatch[4]);
        if (offHour > 23 || offMinute > 59 || offSecond > 59) return null;
        offsetSeconds = sign * (offHour * 3600 + offMinute * 60 + offSecond);
        rest = "";
      }
    }
  }
  const naiveEpoch = epochFromParts({ year, month, day, hour, minute, second });
  return { epochSeconds: naiveEpoch - (offsetSeconds ?? 0), aware: offsetSeconds !== null };
}

function dateFromIsoWeek(year, week, weekday) {
  if (week < 1 || week > 53 || weekday < 1 || weekday > 7) return null;
  const jan4 = daysFromCivil(year, 1, 4);
  const jan4Weekday = ((jan4 + 4) % 7) + 1 - 1; // 1970-01-01 was a Thursday
  const week1Monday = jan4 - ((((jan4 + 3) % 7) + 7) % 7);
  const days = week1Monday + (week - 1) * 7 + (weekday - 1);
  const civil = civilFromDays(days);
  if (week === 53) {
    // Python rejects week 53 in years that only have 52 ISO weeks.
    const checkWeek1 = daysFromCivil(civil.year, 1, 4) - ((((daysFromCivil(civil.year, 1, 4) + 3) % 7) + 7) % 7);
    if (civil.year !== year && days < checkWeek1) return null;
    const nextWeek1 = daysFromCivil(year + 1, 1, 4) - ((((daysFromCivil(year + 1, 1, 4) + 3) % 7) + 7) % 7);
    if (week1Monday + 52 * 7 >= nextWeek1 && days >= nextWeek1) return null;
  }
  return civil;
}

// datetime.strptime for the three fallback patterns; returns naive epoch or null.
function parseStrptimeFallback(text) {
  const patterns = [
    /^(\d{1,4})\/(\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/,
    /^(\d{1,4})\/(\d{1,2})\/(\d{1,2})$/,
    /^(\d{1,4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2})$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = match[4] === undefined ? 0 : Number(match[4]);
    const minute = match[5] === undefined ? 0 : Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    if (year < 1 || year > 9999 || month < 1 || month > 12) continue;
    if (day < 1 || day > daysInMonth(year, month)) continue;
    if (hour > 23 || minute > 59 || second > 61) continue;
    return { epochSeconds: epochFromParts({ year, month, day, hour, minute, second: Math.min(second, 59) }), aware: false };
  }
  return null;
}

// email.utils.parsedate_to_datetime work-alike; returns epoch or null.
const RFC_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const RFC_MONTHS_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const RFC_DAYNAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const RFC_TIMEZONES = {
  UT: 0, UTC: 0, GMT: 0, Z: 0,
  AST: -400, ADT: -300, EST: -500, EDT: -400, CST: -600, CDT: -500,
  MST: -700, MDT: -600, PST: -800, PDT: -700,
};

function monthNumber(token) {
  const lowered = token.toLowerCase();
  let index = RFC_MONTHS.indexOf(lowered);
  if (index === -1) index = RFC_MONTHS_FULL.indexOf(lowered);
  return index === -1 ? null : index + 1;
}

function parseRfc2822(text) {
  let data = pyStrip(text).split(PY_SPACE_RUN_RE).filter((token) => token !== "");
  if (data.length === 0) return null;
  if (data[0].endsWith(",") || RFC_DAYNAMES.includes(data[0].toLowerCase())) {
    data = data.slice(1);
  } else {
    const comma = data[0].lastIndexOf(",");
    if (comma >= 0) data[0] = data[0].slice(comma + 1);
  }
  if (data.length === 3) {
    const stuff = data[0].split("-");
    if (stuff.length === 3) data = [...stuff, ...data.slice(1)];
  }
  if (data.length === 4) {
    const token = data[3];
    const plus = token.indexOf("+");
    const minus = token.indexOf("-");
    const cut = plus >= 0 ? plus : minus;
    if (cut > 0) {
      data[3] = token.slice(0, cut);
      data.push(token.slice(cut));
    } else {
      data.push("");
    }
  }
  if (data.length < 5) return null;
  data = data.slice(0, 5);
  let [dd, mm, yy, tm, tz] = data;
  if (!dd || !mm || !yy) return null;
  let month = monthNumber(mm);
  if (month === null) {
    [dd, mm] = [mm, dd];
    month = monthNumber(mm);
    if (month === null) return null;
  }
  if (dd.endsWith(",")) dd = dd.slice(0, -1);
  if (yy.includes(":") && yy.indexOf(":") > 0) [yy, tm] = [tm, yy];
  if (yy.endsWith(",")) yy = yy.slice(0, -1);
  if (!yy) return null;
  if (!/^\d/.test(yy)) [yy, tz] = [tz, yy];
  if (tm && tm.endsWith(",")) tm = tm.slice(0, -1);
  const day = Number(dd);
  let year = Number(yy);
  if (!Number.isInteger(day) || !Number.isInteger(year)) return null;
  if (year < 100) year += year > 68 ? 1900 : 2000;
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (tm) {
    const parts = tm.split(":");
    if (parts.length === 2 || parts.length === 3) {
      hour = Number(parts[0]);
      minute = Number(parts[1]);
      second = parts.length === 3 ? Number(parts[2]) : 0;
      if (![hour, minute, second].every(Number.isInteger)) return null;
    } else {
      return null;
    }
  }
  let offsetSeconds = null;
  if (tz) {
    const upper = tz.toUpperCase();
    if (upper in RFC_TIMEZONES) {
      const raw = RFC_TIMEZONES[upper];
      const sign = raw < 0 ? -1 : 1;
      const absolute = Math.abs(raw);
      offsetSeconds = sign * (Math.floor(absolute / 100) * 3600 + (absolute % 100) * 60);
    } else if (/^[+-]?\d+$/.test(tz)) {
      const raw = Number(tz);
      const sign = raw < 0 ? -1 : 1;
      const absolute = Math.abs(raw);
      offsetSeconds = sign * (Math.floor(absolute / 100) * 3600 + (absolute % 100) * 60);
    }
  }
  if (year < 1 || year > 9999 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 61) return null;
  const naiveEpoch = epochFromParts({ year, month, day, hour, minute, second: Math.min(second, 59) });
  return { epochSeconds: naiveEpoch - (offsetSeconds ?? 0), aware: offsetSeconds !== null };
}

function epochFromTimestamp(timestamp) {
  let seconds = Math.floor(timestamp);
  const micro = Math.round((timestamp - seconds) * 1e6);
  if (micro >= 1e6) seconds += 1;
  const { year } = civilFromDays(Math.floor(seconds / 86400));
  if (year < 1 || year > 9999) return null;
  return seconds;
}

// ---------------------------------------------------------------------------
// Normalization core (1:1 port)

function first_value(mapping, names) {
  for (const name of names) {
    const value = get(mapping, name);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function clean_scalar(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return null;
  const text = pyStrip(pyStr(value).normalize("NFC"));
  return text || null;
}

function normalize_text(value) {
  let text = pyStr(value || "").normalize("NFC");
  if (!value) text = "";
  text = text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const lines = text.split("\n").map((line) => pyStrip(line.replace(/[\t\f\v ]+/g, " ")));
  const compact = [];
  for (const line of lines) {
    if (line || compact.length === 0 || compact[compact.length - 1]) compact.push(line);
  }
  return pyStrip(compact.join("\n"));
}

function decode_structured(value) {
  if (typeof value !== "string") return value;
  const stripped = pyStrip(value);
  if (!stripped || !"[{".includes(stripped[0])) return value;
  try {
    return pyJsonLoads(stripped);
  } catch (error) {
    if (error instanceof PyJSONDecodeError) return value;
    throw error;
  }
}

function list_values(value) {
  value = decode_structured(value);
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) return value;
  if (isDict(value)) return [value];
  const text = pyStrip(pyStr(value));
  if (!text) return [];
  if (text.includes("\n") || text.includes(";") || text.includes("|") || text.includes(",")) {
    return text.split(/[\n;,|]+/).map((part) => pyStrip(part)).filter((part) => part);
  }
  return [text];
}

function load_records(pathText) {
  let data;
  try {
    data = readFileSync(pathText);
  } catch (error) {
    throw new PyOSError(osErrorMessage(error, pathText));
  }
  const digest = sha256Hex(data);
  const suffix = extname(pathText).toLowerCase();

  if (suffix === ".jsonl") {
    const records = [];
    const lines = pySplitlines(decodeUtf8Sig(data));
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;
      if (!pyStrip(line)) continue;
      let value;
      try {
        value = pyJsonLoads(line);
      } catch (error) {
        if (error instanceof PyJSONDecodeError) {
          throw new PyValueError(`${pathText}: invalid JSONL at line ${lineNumber}: ${error.msg}`);
        }
        throw error;
      }
      if (!isDict(value)) throw new PyValueError(`${pathText}: JSONL line ${lineNumber} is not an object`);
      records.push(value);
    }
    return [records, "jsonl", digest];
  }

  if (suffix === ".csv") {
    const text = decodeUtf8Sig(data);
    return [csvDictRows(pySplitlines(text)), "csv", digest];
  }

  if (suffix !== ".json") throw new PyValueError(`${pathText}: expected a .json, .jsonl, or .csv file`);

  let value;
  try {
    value = pyJsonLoads(decodeUtf8Sig(data));
  } catch (error) {
    if (error instanceof PyJSONDecodeError) throw new PyValueError(`${pathText}: invalid JSON: ${error.msg}`);
    throw error;
  }

  let records;
  if (Array.isArray(value)) {
    records = value;
  } else if (isDict(value)) {
    records = [];
    for (const key of ["items", "posts", "tweets", "records", "data"]) {
      if (Array.isArray(get(value, key))) {
        records = value[key];
        break;
      }
    }
    if (records.length === 0 && Object.keys(value).length > 0) {
      throw new PyValueError(`${pathText}: JSON object must contain items/posts/tweets/records/data`);
    }
  } else {
    throw new PyValueError(`${pathText}: JSON root must be an array or object`);
  }

  if (records.some((record) => !isDict(record))) throw new PyValueError(`${pathText}: every record must be an object`);
  return [records, "json", digest];
}

function osErrorMessage(error, pathText) {
  const table = {
    ENOENT: [2, "No such file or directory"],
    EACCES: [13, "Permission denied"],
    EISDIR: [21, "Is a directory"],
    ENOTDIR: [20, "Not a directory"],
  };
  const entry = table[error.code];
  if (entry) return `[Errno ${entry[0]}] ${entry[1]}: '${pathText}'`;
  return error.message;
}

// csv.DictReader over pre-split lines (default dialect).
function csvRows(lines) {
  const rows = [];
  let row = null;
  let field = "";
  let state = "start_record";
  const endField = () => {
    row.push(field);
    field = "";
  };
  for (const line of lines) {
    if (state === "start_record") {
      row = [];
      if (line === "") {
        rows.push(row);
        continue;
      }
      state = "start_field";
    } else if (state !== "in_quoted") {
      // Reached end of the previous line outside quotes: record ended there.
      endField();
      rows.push(row);
      row = [];
      state = line === "" ? "start_record" : "start_field";
      if (state === "start_record") {
        rows.push(row);
        continue;
      }
    }
    for (const ch of line) {
      if (state === "start_field") {
        if (ch === '"') state = "in_quoted";
        else if (ch === ",") endField();
        else {
          field += ch;
          state = "in_field";
        }
      } else if (state === "in_field") {
        if (ch === ",") {
          endField();
          state = "start_field";
        } else {
          field += ch;
        }
      } else if (state === "in_quoted") {
        if (ch === '"') state = "quote_in_quoted";
        else field += ch;
      } else if (state === "quote_in_quoted") {
        if (ch === '"') {
          field += '"';
          state = "in_quoted";
        } else if (ch === ",") {
          endField();
          state = "start_field";
        } else {
          field += ch;
          state = "in_quoted_tail";
        }
      } else if (state === "in_quoted_tail") {
        if (ch === ",") {
          endField();
          state = "start_field";
        } else {
          field += ch;
        }
      }
    }
    if (state === "in_quoted") continue; // quoted field continues on the next line
    if (state !== "start_record") {
      endField();
      rows.push(row);
      state = "start_record";
    }
  }
  if (state === "in_quoted" || state === "quote_in_quoted" || state === "in_quoted_tail") {
    endField();
    rows.push(row);
  }
  return rows;
}

function csvDictRows(lines) {
  const rows = csvRows(lines);
  if (rows.length === 0) return [];
  const fieldnames = rows[0];
  const records = [];
  for (const row of rows.slice(1)) {
    if (row.length === 0) continue;
    const record = {};
    fieldnames.forEach((name, index) => {
      record[name] = index < row.length ? row[index] : null;
    });
    if (row.length > fieldnames.length) {
      // Python stores extras under the None key; "None" is its observable str().
      record["None"] = row.slice(fieldnames.length);
    }
    records.push(record);
  }
  return records;
}

function normalize_datetime(value) {
  if (value === null || value === undefined || value === "") return null;
  let parsed = null;

  if (typeof value === "number") {
    let timestamp = value;
    if (timestamp > 10_000_000_000) timestamp /= 1000;
    const epoch = epochFromTimestamp(timestamp);
    if (epoch === null) return null;
    parsed = { epochSeconds: epoch, aware: true };
  } else {
    const text = pyStrip(pyStr(value));
    if (/^\d{10}(?:\d{3})?$/.test(text)) {
      let timestamp = Number(text);
      if (text.length === 13) timestamp /= 1000;
      const epoch = epochFromTimestamp(timestamp);
      if (epoch === null) return null;
      parsed = { epochSeconds: epoch, aware: true };
    } else {
      const isoText = text.endsWith("Z") || text.endsWith("z") ? `${text.slice(0, -1)}+00:00` : text;
      parsed = parseIsoDatetime(isoText);
      if (parsed === null) parsed = parseStrptimeFallback(text);
      if (parsed === null) parsed = parseRfc2822(text);
      if (parsed === null) return null;
    }
  }
  return isoZFromEpoch(parsed.epochSeconds);
}

function canonicalize_url(value) {
  let raw = clean_scalar(value);
  if (raw === null) return null;
  raw = stripChars(raw, "<>[]{}\"'");
  raw = raw.replace(/[.,;:!?\uff0c\u3002\uff1b\uff1a\uff01\uff1f)\]}]+$/, "");
  if (raw.startsWith("www.")) raw = `https://${raw}`;
  if (!/^https?:\/\//i.test(raw)) return null;

  let parts;
  let host;
  let port;
  try {
    parts = urlsplitPy(raw);
    const info = hostinfo(parts.netloc);
    host = stripChars(info.hostname || "", ".", "right").toLowerCase();
    if (!host) return null;
    host = encodeIdna(host);
    if (host.startsWith("www.")) host = host.slice(4);
    if (host === "twitter.com" || host === "mobile.twitter.com") host = "x.com";
    port = parsePort(info.portText);
  } catch (error) {
    if (error instanceof PyUnicodeError || error instanceof PyValueError) return null;
    throw error;
  }

  const scheme = parts.scheme.toLowerCase();
  let netloc = host;
  if (port && !((scheme === "http" && port === 80) || (scheme === "https" && port === 443))) {
    netloc = `${host}:${port}`;
  }

  let path = quotePy(parts.path || "", "/%:@-._~!$&'()*+,;=");
  if (path !== "/") path = stripChars(path, "/", "right");
  const query = [];
  for (const [key, itemValue] of parseQsl(parts.query)) {
    const lowered = key.toLowerCase();
    if (lowered.startsWith("utm_") || TRACKING_QUERY_KEYS.has(lowered)) continue;
    query.push([key, itemValue]);
  }
  query.sort((a, b) => cmpCp(a[0], b[0]) || cmpCp(a[1], b[1]));
  return urlunsplitPy(scheme, netloc, path, urlencodePairs(query), "");
}

function domain_from_url(value) {
  const url = canonicalize_url(value);
  if (url === null) return null;
  const { hostname } = hostinfo(urlsplitPy(url).netloc);
  return (hostname || "").toLowerCase() || null;
}

const URL_RE = new RegExp(`https?://[^${PY_WHITESPACE}<>"']+`, "gi");

function extract_urls(text) {
  const urls = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = canonicalize_url(match[0]);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function normalize_link(value, defaultKind = "external") {
  value = decode_structured(value);
  let title = null;
  let kind = defaultKind;
  let rawUrl;
  if (isDict(value)) {
    rawUrl = first_value(value, ["url", "href", "link", "expanded_url", "unwound_url"]);
    title = clean_scalar(first_value(value, ["title", "label", "name"]));
    const rawKind = clean_scalar(first_value(value, ["kind", "type", "link_type"]));
    if (rawKind) kind = get(LINK_KIND_MAP, rawKind.toLowerCase()) ?? "other";
  } else {
    rawUrl = value;
  }

  const url = canonicalize_url(rawUrl);
  const domain = domain_from_url(url);
  if (!url || !domain) return null;
  const normalized = {
    url,
    domain,
    kind: get(LINK_KIND_MAP, kind.toLowerCase()) ?? "other",
  };
  if (title) normalized.title = title;
  return normalized;
}

function merge_link(existing, incoming) {
  const priority = { source: 0, citation: 1, media: 2, external: 3, other: 4 };
  const result = { ...existing };
  if (priority[incoming.kind] < priority[result.kind]) result.kind = incoming.kind;
  if (!result.title && incoming.title) result.title = incoming.title;
  return result;
}

function normalize_links(record, text, itemUrl) {
  const byUrl = new Map();
  const fields = [
    ["links", "external"],
    ["urls", "external"],
    ["outbound_links", "external"],
    ["citations", "citation"],
    ["sources", "source"],
    ["media_links", "media"],
  ];
  for (const [field, kind] of fields) {
    for (const value of list_values(get(record, field))) {
      const link = normalize_link(value, kind);
      if (link && link.url !== itemUrl) {
        byUrl.set(link.url, byUrl.has(link.url) ? merge_link(byUrl.get(link.url), link) : link);
      }
    }
  }
  for (const url of extract_urls(text)) {
    if (url === itemUrl) continue;
    const link = normalize_link(url);
    if (link) {
      byUrl.set(link.url, byUrl.has(link.url) ? merge_link(byUrl.get(link.url), link) : link);
    }
  }
  return [...byUrl.values()];
}

function entity_strings(value) {
  const result = [];
  for (let item of list_values(value)) {
    if (isDict(item)) {
      item = first_value(item, ["value", "name", "text", "symbol", "tag", "handle", "username"]);
    }
    const scalar = clean_scalar(item);
    if (scalar) result.push(scalar);
  }
  return result;
}

function unique_strings(values, transform = null) {
  const result = [];
  const seen = new Set();
  for (const value of values) {
    const normalized = transform ? transform(value) : clean_scalar(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }
  return result;
}

function normalize_ticker(value) {
  let ticker = clean_scalar(value);
  if (ticker === null) return null;
  ticker = stripChars(ticker, "$", "left").toUpperCase();
  if (/^(?:[A-Z]{1,8}:)?[A-Z0-9][A-Z0-9.\-]{0,14}$/.test(ticker)) return ticker;
  return null;
}

function normalize_hashtag(value) {
  const tag = clean_scalar(value);
  if (tag && stripChars(tag, "#")) return stripChars(tag, "#");
  return null;
}

function normalize_mention(value) {
  const mention = clean_scalar(value);
  if (mention && stripChars(mention, "@", "left")) return stripChars(mention, "@", "left");
  return null;
}

const TICKER_RE = /(?<![\p{L}\p{N}_$])\$([A-Za-z][A-Za-z0-9.\-]{0,14})/gu;
const WORD_BOUNDARY = "(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))";
const VENUE_RE = new RegExp(`${WORD_BOUNDARY}(NASDAQ|NYSE|AMEX|HKEX|SSE|SZSE|SH|SZ):([A-Z0-9.\\-]{1,15})${WORD_BOUNDARY}`, "giu");
const HASHTAG_RE = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}_\u3400-\u9fff][\p{L}\p{N}_\u3400-\u9fff-]{0,49})#?/gu;
const MENTION_RE = /(?<![\p{L}\p{N}_])@([A-Za-z0-9_]{1,32})/gu;

function normalize_entities(record, text) {
  const collected = {};
  for (const name of Object.keys(ENTITY_ALIASES)) collected[name] = [];
  const nested = decode_structured(get(record, "entities"));

  if (isDict(nested)) {
    for (const [canonical, aliases] of Object.entries(ENTITY_ALIASES)) {
      for (const alias of aliases) collected[canonical].push(...entity_strings(get(nested, alias)));
    }
  } else if (Array.isArray(nested)) {
    for (const entry of nested) {
      if (!isDict(entry)) {
        collected.other.push(...entity_strings(entry));
        continue;
      }
      const entityType = pyStr(first_value(entry, ["type", "kind", "entity_type"]) ?? "other").toLowerCase();
      let destination = "other";
      for (const [canonical, aliases] of Object.entries(ENTITY_ALIASES)) {
        if (aliases.includes(entityType)) {
          destination = canonical;
          break;
        }
      }
      collected[destination].push(...entity_strings(entry));
    }
  }

  for (const [canonical, aliases] of Object.entries(ENTITY_ALIASES)) {
    for (const alias of aliases) collected[canonical].push(...entity_strings(get(record, alias)));
  }

  for (const match of text.matchAll(TICKER_RE)) collected.tickers.push(match[1]);
  for (const match of text.matchAll(VENUE_RE)) collected.tickers.push(`${match[1]}:${match[2]}`);
  for (const match of text.matchAll(HASHTAG_RE)) collected.hashtags.push(match[1]);
  for (const match of text.matchAll(MENTION_RE)) collected.mentions.push(match[1]);

  return {
    tickers: unique_strings(collected.tickers, normalize_ticker),
    hashtags: unique_strings(collected.hashtags, normalize_hashtag),
    mentions: unique_strings(collected.mentions, normalize_mention),
    organizations: unique_strings(collected.organizations),
    people: unique_strings(collected.people),
    locations: unique_strings(collected.locations),
    other: unique_strings(collected.other),
  };
}

function parse_metric_number(value) {
  if (typeof value === "boolean" || value === null || value === undefined || value === "") return null;
  let number;
  if (typeof value === "number") {
    number = value;
  } else {
    let text = pyStrip(pyStr(value).normalize("NFKC")).toLowerCase();
    text = text.replaceAll(",", "").replaceAll("\uff0c", "").replaceAll(" ", "");
    const match = /^([+-]?[0-9]+(?:\.[0-9]+)?)(k|m|b|\u4e07|\u4ebf)?$/.exec(text);
    if (!match) return null;
    number = Number(match[1]);
    const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000, "\u4e07": 10_000, "\u4ebf": 100_000_000 }[match[2]] ?? 1;
    number *= multiplier;
  }
  if (!Number.isFinite(number) || number < 0) return null;
  return number;
}

function snake_case(value) {
  value = value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  value = stripChars(value.replace(/[^a-z0-9]+/g, "_"), "_");
  return /^[a-z][a-z0-9_]*$/.test(value || "") ? value : null;
}

function normalized_key_map(mapping) {
  const result = {};
  for (const [key, value] of Object.entries(mapping)) result[pyStr(key).toLowerCase()] = value;
  return result;
}

function normalize_metrics(record) {
  const nested = {};
  for (const field of ["metrics", "public_metrics", "engagement"]) {
    const value = decode_structured(get(record, field));
    if (isDict(value)) Object.assign(nested, value);
  }
  const nestedValues = decode_structured(get(nested, "values"));
  if (isDict(nestedValues)) Object.assign(nested, nestedValues);

  const nestedLower = normalized_key_map(nested);
  const recordLower = normalized_key_map(record);
  const values = {};
  const consumedAliases = new Set();
  for (const [canonical, aliases] of Object.entries(METRIC_ALIASES)) {
    for (const alias of aliases) {
      consumedAliases.add(alias.toLowerCase());
      let raw = get(nestedLower, alias.toLowerCase());
      if (raw === null || raw === undefined || raw === "") raw = get(recordLower, alias.toLowerCase());
      const parsed = parse_metric_number(raw);
      if (parsed !== null) {
        values[canonical] = parsed;
        break;
      }
    }
  }

  const ignored = new Set(["available", "observed_at", "captured_at", "collected_at", "missing", "values"]);
  for (const [key, raw] of Object.entries(nested)) {
    const normalizedKey = snake_case(pyStr(key));
    if (!normalizedKey || ignored.has(normalizedKey) || consumedAliases.has(normalizedKey) || normalizedKey in values) {
      continue;
    }
    const parsed = parse_metric_number(raw);
    if (parsed !== null) values[normalizedKey] = parsed;
  }

  const observedAt = normalize_datetime(
    first_value(nested, ["observed_at", "captured_at", "collected_at"])
      ?? first_value(record, ["metrics_observed_at", "metrics_at"]),
  );
  return {
    available: Object.keys(values).length > 0,
    observed_at: observedAt,
    values,
    missing: CORE_METRICS.filter((name) => !(name in values)),
  };
}

function normalize_author(record, defaultName, defaultHandle) {
  const nested = decode_structured(get(record, "author"));
  let name;
  let handle;
  if (isDict(nested)) {
    name = clean_scalar(first_value(nested, ["name", "display_name", "author_name"]));
    handle = clean_scalar(first_value(nested, ["handle", "username", "screen_name"]));
  } else {
    name = clean_scalar(nested);
    handle = null;
  }
  name = name || clean_scalar(first_value(record, ["author_name", "display_name", "creator_name"])) || defaultName;
  handle = handle || clean_scalar(first_value(record, ["author_handle", "handle", "username", "screen_name"])) || defaultHandle;
  if (handle) handle = stripChars(handle, "@", "left") || null;
  return { name: name ?? null, handle: handle ?? null };
}

function infer_platform(url) {
  const domain = domain_from_url(url);
  if (!domain) return null;
  if (domain === "x.com") return "x";
  if (domain === "t.me" || domain === "telegram.me") return "telegram";
  if (domain.endsWith("substack.com")) return "newsletter";
  if (domain === "youtube.com" || domain === "youtu.be") return "youtube";
  return null;
}

function normalize_platform(record, url, defaultPlatform) {
  const platform = clean_scalar(first_value(record, PLATFORM_FIELDS)) || defaultPlatform || infer_platform(url) || "unknown";
  const lowered = platform.toLowerCase();
  return get(PLATFORM_ALIASES, lowered) ?? lowered;
}

function normalize_content_type(record) {
  const raw = (clean_scalar(first_value(record, ["content_type", "type", "record_type"])) || "post").toLowerCase();
  const mapping = {
    tweet: "post",
    status: "post",
    message: "post",
    blog: "article",
    news: "article",
    substack: "newsletter",
    podcast: "transcript",
    video_transcript: "transcript",
    reply: "comment",
  };
  const normalized = get(mapping, raw) ?? raw;
  return ["post", "article", "newsletter", "transcript", "comment", "other"].includes(normalized) ? normalized : "other";
}

function detect_language(text) {
  const han = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (han) {
    const ratio = latin / Math.max(1, han + latin);
    return latin >= 10 && ratio >= 0.25 ? "mixed" : "zh";
  }
  if (latin) return "en";
  return "und";
}

function normalize_language(record, text) {
  const supplied = clean_scalar(first_value(record, ["language", "lang"]));
  if (!supplied) return detect_language(text);
  const lowered = supplied.toLowerCase().replaceAll("_", "-");
  if (lowered.startsWith("zh")) return "zh";
  if (lowered.startsWith("en")) return "en";
  return lowered;
}

function fingerprint_text(text) {
  const normalized = text.normalize("NFKC").toLowerCase();
  return pyStrip(normalized.replace(PY_SPACE_RUN_RE, " "));
}

function identity_seed(item) {
  if (item.external_id) return `external|${item.platform}|${item.external_id}`;
  if (item.url) return `url|${item.url}`;
  const author = item.author.handle || item.author.name || "";
  return `content|${item.platform}|${author.toLowerCase()}|${item.created_at || ""}|${fingerprint_text(item.text)}`;
}

function make_item_id(item) {
  return `item_${sha256Hex(Buffer.from(identity_seed(item), "utf-8")).slice(0, 16)}`;
}

function dedupe_keys(item) {
  const keys = [];
  if (item.external_id) keys.push(`external|${item.platform}|${item.external_id}`);
  if (item.url) keys.push(`url|${item.url}`);
  const textKey = fingerprint_text(item.text);
  const author = item.author.handle || item.author.name || "";
  const when = item.created_at || "";
  const textKeyLength = [...textKey].length;
  if (textKeyLength >= 16 && (author || when)) {
    keys.push(`content|${item.platform}|${author.toLowerCase()}|${when}|${textKey}`);
  } else if (textKeyLength >= 40) {
    keys.push(`content|${textKey}`);
  }
  return keys;
}

function normalize_record(record, options) {
  const {
    sourcePath,
    sourceDigest,
    sourceIndex,
    sourceLabel,
    rightsBasis,
    defaultPlatform,
    defaultAuthorName,
    defaultAuthorHandle,
  } = options;
  const warnings = [];
  const sourceName = basename(sourcePath);
  const text = normalize_text(first_value(record, TEXT_FIELDS));
  if (!text) return [null, [`${sourceName}[${sourceIndex}]: missing text; skipped`]];

  const rawDate = first_value(record, DATE_FIELDS);
  const createdAt = normalize_datetime(rawDate);
  if (rawDate !== null && rawDate !== "" && createdAt === null) {
    warnings.push(`${sourceName}[${sourceIndex}]: invalid created_at dropped`);
  }

  const externalId = clean_scalar(first_value(record, ID_FIELDS));
  const url = canonicalize_url(first_value(record, URL_FIELDS));
  const rawUrl = first_value(record, URL_FIELDS);
  if (rawUrl !== null && rawUrl !== "" && url === null) {
    warnings.push(`${sourceName}[${sourceIndex}]: invalid canonical URL dropped`);
  }
  const platform = normalize_platform(record, url, defaultPlatform);
  const author = normalize_author(record, defaultAuthorName, defaultAuthorHandle);
  const upstream = decode_structured(get(record, "provenance"));

  const sourceRecord = {
    source_label: sourceLabel,
    source_file: sourceName,
    source_file_sha256: sourceDigest,
    source_record_index: sourceIndex,
    source_record_id: externalId,
    source_url: url,
  };
  if (isDict(upstream) && Object.keys(upstream).length > 0) sourceRecord.upstream = upstream;

  const item = {
    id: "",
    external_id: externalId,
    platform,
    author,
    content_type: normalize_content_type(record),
    text,
    created_at: createdAt,
    url,
    language: normalize_language(record, text),
    links: normalize_links(record, text, url),
    entities: normalize_entities(record, text),
    metrics: normalize_metrics(record),
    provenance: {
      rights_basis: rightsBasis,
      records: [sourceRecord],
      transformations: [
        "unicode_nfc",
        "normalized_whitespace",
        "canonical_urls",
        "structured_entities",
        "structured_metrics",
      ],
    },
  };
  item.id = make_item_id(item);
  return [item, warnings];
}

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index) {
    while (this.parent[index] !== index) {
      this.parent[index] = this.parent[this.parent[index]];
      index = this.parent[index];
    }
    return index;
  }

  union(left, right) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot;
  }
}

function merge_metrics(left, right) {
  const values = { ...left.values };
  for (const [name, value] of Object.entries(right.values)) {
    values[name] = name in values ? Math.max(values[name], value) : value;
  }
  const candidates = [left.observed_at, right.observed_at].filter(Boolean);
  const observed = candidates.length === 0 ? null : candidates.reduce((a, b) => (cmpCp(a, b) >= 0 ? a : b));
  return {
    available: Object.keys(values).length > 0,
    observed_at: observed,
    values,
    missing: CORE_METRICS.filter((name) => !(name in values)),
  };
}

function merge_items(items) {
  const result = structuredClone(items[0]);
  const links = new Map(result.links.map((link) => [link.url, { ...link }]));
  for (const incoming of items.slice(1)) {
    if ([...incoming.text].length > [...result.text].length) result.text = incoming.text;
    for (const field of ["external_id", "created_at", "url"]) {
      if (!result[field] && incoming[field]) result[field] = incoming[field];
    }
    if (result.platform === "unknown" && incoming.platform !== "unknown") result.platform = incoming.platform;
    for (const field of ["name", "handle"]) {
      if (!result.author[field] && incoming.author[field]) result.author[field] = incoming.author[field];
    }
    if (result.content_type === "other" && incoming.content_type !== "other") result.content_type = incoming.content_type;
    if (result.language === "und" && incoming.language !== "und") result.language = incoming.language;

    for (const link of incoming.links) {
      links.set(link.url, links.has(link.url) ? merge_link(links.get(link.url), link) : { ...link });
    }
    for (const [entityType, values] of Object.entries(incoming.entities)) {
      result.entities[entityType] = unique_strings([...result.entities[entityType], ...values]);
    }
    result.metrics = merge_metrics(result.metrics, incoming.metrics);
    result.provenance.records.push(...structuredClone(incoming.provenance.records));
    result.provenance.transformations.push(...incoming.provenance.transformations);
  }

  result.links = [...links.values()];
  if (items.length > 1) result.provenance.transformations.push("deduplicated_merge");
  result.provenance.transformations = unique_strings(result.provenance.transformations);
  result.id = make_item_id(result);
  return result;
}

function deduplicate(items) {
  const unionFind = new UnionFind(items.length);
  const seen = new Map();
  items.forEach((item, index) => {
    for (const key of dedupe_keys(item)) {
      if (seen.has(key)) unionFind.union(seen.get(key), index);
      else seen.set(key, index);
    }
  });

  const groups = new Map();
  items.forEach((item, index) => {
    const root = unionFind.find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push([index, item]);
  });
  const orderedGroups = [...groups.values()].sort(
    (a, b) => Math.min(...a.map(([index]) => index)) - Math.min(...b.map(([index]) => index)),
  );
  const merged = orderedGroups.map((group) => merge_items(group.map(([, item]) => item)));
  return [merged, items.length - merged.length];
}

function build_subject(items, subjectName, subjectHandles) {
  const names = unique_strings(items.filter((item) => item.author.name).map((item) => item.author.name));
  const handles = unique_strings([
    ...(subjectHandles || []).map((handle) => stripChars(handle, "@", "left")),
    ...items.filter((item) => item.author.handle).map((item) => item.author.handle),
  ]);
  const platforms = unique_strings(items.map((item) => item.platform));
  return {
    name: clean_scalar(subjectName) ?? (names.length === 1 ? names[0] : null),
    handles,
    platforms,
  };
}

export function normalize_files(paths, options) {
  const {
    rights_basis: rightsBasis,
    source_label: sourceLabel,
    subject_name: subjectName = null,
    subject_handles: subjectHandles = null,
    default_platform: defaultPlatform = null,
    default_author_name: defaultAuthorName = null,
    default_author_handle: defaultAuthorHandle = null,
  } = options;
  if (rightsBasis !== "public" && rightsBasis !== "authorized") {
    throw new PyValueError("rights_basis must be public or authorized");
  }
  if (paths.length === 0) throw new PyValueError("at least one input path is required");

  const normalized = [];
  const inputMetadata = [];
  const warnings = [];
  let skipped = 0;
  let inputRecords = 0;

  for (const path of paths) {
    const [records, inputFormat, digest] = load_records(path);
    inputMetadata.push({ path, format: inputFormat, sha256: digest, records: records.length });
    inputRecords += records.length;
    records.forEach((record, sourceIndex) => {
      const [item, itemWarnings] = normalize_record(record, {
        sourcePath: path,
        sourceDigest: digest,
        sourceIndex,
        sourceLabel,
        rightsBasis,
        defaultPlatform,
        defaultAuthorName,
        defaultAuthorHandle,
      });
      warnings.push(...itemWarnings);
      if (item === null) skipped += 1;
      else normalized.push(item);
    });
  }

  if (normalized.length === 0) throw new PyValueError("no non-empty records could be normalized");

  const [items, duplicatesRemoved] = deduplicate(normalized);
  const generatedAt = utc_now();
  const corpusHash = sha256Hex(
    Buffer.from(items.map((item) => item.id).sort(cmpCp).join("|"), "utf-8"),
  ).slice(0, 16);
  const languages = new Map();
  const platforms = new Map();
  for (const item of items) {
    languages.set(item.language, (languages.get(item.language) ?? 0) + 1);
    platforms.set(item.platform, (platforms.get(item.platform) ?? 0) + 1);
  }
  const sortedCounts = (counter) =>
    Object.fromEntries([...counter.entries()].sort((a, b) => cmpCp(a[0], b[0])));

  return {
    schema_version: SCHEMA_VERSION,
    corpus_id: `corpus_${corpusHash}`,
    generated_at: generatedAt,
    subject: build_subject(items, subjectName, subjectHandles),
    items,
    provenance: {
      rights_basis: rightsBasis,
      source_label: sourceLabel,
      inputs: inputMetadata,
      normalized_at: generatedAt,
      normalizer: { name: "normalize_corpus.py", version: NORMALIZER_VERSION },
    },
    stats: {
      input_records: inputRecords,
      output_items: items.length,
      duplicates_removed: duplicatesRemoved,
      metrics_items: items.filter((item) => item.metrics.available).length,
      languages: sortedCounts(languages),
      platforms: sortedCounts(platforms),
    },
    quality: {
      warnings,
      skipped_records: skipped,
      duplicates_removed: duplicatesRemoved,
    },
  };
}

// ---------------------------------------------------------------------------
// argparse work-alike (only what this CLI needs)

const OPTION_SPECS = [
  { name: "--help", short: "-h", flag: true },
  { name: "--rights-basis", dest: "rights_basis", choices: ["public", "authorized"], required: true },
  { name: "--source-label", dest: "source_label", default: "normalized input files" },
  { name: "--subject-name", dest: "subject_name" },
  { name: "--subject-handle", dest: "subject_handle", append: true },
  { name: "--default-platform", dest: "default_platform" },
  { name: "--default-author-name", dest: "default_author_name" },
  { name: "--default-author-handle", dest: "default_author_handle" },
  { name: "--output", dest: "output" },
  { name: "--compact", dest: "compact", flag: true },
];

function usageParts() {
  const optionParts = [
    "[-h]",
    "--rights-basis {public,authorized}",
    "[--source-label SOURCE_LABEL]",
    "[--subject-name SUBJECT_NAME]",
    "[--subject-handle SUBJECT_HANDLE]",
    "[--default-platform DEFAULT_PLATFORM]",
    "[--default-author-name DEFAULT_AUTHOR_NAME]",
    "[--default-author-handle DEFAULT_AUTHOR_HANDLE]",
    "[--output OUTPUT]",
    "[--compact]",
  ];
  const positionalParts = ["inputs [inputs ...]"];
  return { optionParts, positionalParts };
}

function buildUsage(prog) {
  // argparse wraps at the terminal width; goldens run at the 80-column default.
  const width = 80;
  const prefix = `usage: ${prog} `;
  const indent = " ".repeat(prefix.length);
  const { optionParts, positionalParts } = usageParts();
  const lines = [];
  let current = prefix;
  let started = false;
  const flush = () => {
    lines.push(current);
    current = indent;
    started = false;
  };
  const addGroup = (parts, breakBefore) => {
    if (breakBefore && started) flush();
    for (const part of parts) {
      const candidate = started ? `${current} ${part}` : current + part;
      if (candidate.length > width && started) {
        flush();
        current = indent + part;
        started = true;
      } else {
        current = candidate;
        started = true;
      }
    }
  };
  addGroup(optionParts, false);
  addGroup(positionalParts, true);
  if (started) lines.push(current);
  return `${lines.join("\n")}\n`;
}

class ArgumentParserError extends Error {}

function parserError(prog, message) {
  process.stderr.write(buildUsage(prog));
  process.stderr.write(`${prog}: error: ${message}\n`);
  process.exit(2);
}

function matchOption(token) {
  const eq = token.indexOf("=");
  const name = eq === -1 ? token : token.slice(0, eq);
  const inline = eq === -1 ? null : token.slice(eq + 1);
  if (name === "-h") return { spec: OPTION_SPECS[0], inline, name };
  if (!name.startsWith("--")) return null;
  const exact = OPTION_SPECS.find((spec) => spec.name === name);
  if (exact) return { spec: exact, inline, name };
  const prefixMatches = OPTION_SPECS.filter((spec) => spec.name.startsWith(name));
  if (prefixMatches.length === 1) return { spec: prefixMatches[0], inline, name };
  if (prefixMatches.length > 1) return { ambiguous: prefixMatches, inline, name };
  return null;
}

function parseArgs(argv, prog) {
  const values = { subject_handle: [], source_label: "normalized input files", compact: false };
  const positionals = [];
  const unrecognized = [];
  let index = 0;
  let onlyPositionals = false;
  while (index < argv.length) {
    const token = argv[index];
    if (onlyPositionals || token === "-" || !token.startsWith("-") || /^-\d/.test(token)) {
      positionals.push(token);
      index += 1;
      continue;
    }
    if (token === "--") {
      onlyPositionals = true;
      index += 1;
      continue;
    }
    const matched = matchOption(token);
    if (!matched) {
      unrecognized.push(token);
      index += 1;
      continue;
    }
    if (matched.ambiguous) {
      parserError(prog, `ambiguous option: ${matched.name} could match ${matched.ambiguous.map((spec) => spec.name).join(", ")}`);
    }
    const { spec, inline } = matched;
    if (spec.flag) {
      if (inline !== null) parserError(prog, `argument ${spec.short ? `${spec.short}/${spec.name}` : spec.name}: ignored explicit argument '${inline}'`);
      if (spec.name === "--help") {
        process.stdout.write(buildUsage(prog));
        process.exit(0);
      }
      values[spec.dest] = true;
      index += 1;
      continue;
    }
    let value = inline;
    if (value === null) {
      const next = argv[index + 1];
      if (next === undefined || (next.startsWith("-") && next !== "-" && !/^-\d/.test(next))) {
        parserError(prog, `argument ${spec.name}: expected one argument`);
      }
      value = next;
      index += 2;
    } else {
      index += 1;
    }
    if (spec.choices && !spec.choices.includes(value)) {
      parserError(
        prog,
        `argument ${spec.name}: invalid choice: '${value}' (choose from ${spec.choices.map((choice) => `'${choice}'`).join(", ")})`,
      );
    }
    if (spec.append) values[spec.dest].push(value);
    else values[spec.dest] = value;
  }

  const missing = [];
  if (positionals.length === 0) missing.push("inputs");
  if (values.rights_basis === undefined) missing.push("--rights-basis");
  if (missing.length > 0) parserError(prog, `the following arguments are required: ${missing.join(", ")}`);
  if (unrecognized.length > 0) parserError(prog, `unrecognized arguments: ${unrecognized.join(" ")}`);
  values.inputs = positionals;
  return values;
}

function main() {
  const prog = basename(process.argv[1] || "normalize_corpus.mjs");
  const args = parseArgs(process.argv.slice(2), prog);
  let corpus;
  try {
    corpus = normalize_files(args.inputs, {
      rights_basis: args.rights_basis,
      source_label: args.source_label,
      subject_name: args.subject_name ?? null,
      subject_handles: args.subject_handle,
      default_platform: args.default_platform ?? null,
      default_author_name: args.default_author_name ?? null,
      default_author_handle: args.default_author_handle ?? null,
    });
  } catch (error) {
    if (error instanceof PyOSError || error instanceof PyValueError) {
      parserError(prog, error.message);
    }
    throw error;
  }
  const payload = args.compact ? JSON.stringify(corpus) : JSON.stringify(corpus, null, 2);
  if (args.output) writeFileSync(args.output, `${payload}\n`, "utf-8");
  else process.stdout.write(`${payload}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
