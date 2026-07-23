#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const { browserExecutable } = require("./capture_html_viewpoint.cjs");

function sha256(buffer) {
  return `sha256:${crypto.createHash("sha256").update(buffer).digest("hex")}`;
}

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (_error) {
    throw new Error("Playwright is required. Add its node_modules directory to NODE_PATH before running this audit.");
  }
}

async function inspectViewport(page, width, height, sourceWidth = width, sourceHeight = height, displayScale = 1) {
  await page.setViewportSize({ width: sourceWidth, height: sourceHeight });
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  return page.evaluate(({ viewportWidth, viewportHeight, displayScale: logicalScale }) => {
    const errors = [];
    const warnings = [];
    const root = document.querySelector("[data-cuebook-viewpoint]");
    if (!root) return { width: viewportWidth, height: viewportHeight, scale: 1, errors: [{ code: "ROOT", message: "Missing data-cuebook-viewpoint root." }], warnings, elements: [] };

    function logicalRect(element) {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x * logicalScale,
        y: rect.y * logicalScale,
        left: rect.left * logicalScale,
        top: rect.top * logicalScale,
        right: rect.right * logicalScale,
        bottom: rect.bottom * logicalScale,
        width: rect.width * logicalScale,
        height: rect.height * logicalScale,
      };
    }

    const rootRect = logicalRect(root);
    const fontProfile = root.dataset.fontProfile || null;
    const fontLicenseMode = root.dataset.fontLicenseMode || null;
    const fontManifestRef = root.dataset.fontManifestRef || null;
    const noiFontFaces = Array.from(document.fonts || [])
      .filter((face) => String(face.family || "").replace(/["']/g, "").trim().toLowerCase() === "cuebook noi")
      .map((face) => ({ family: face.family, weight: face.weight, style: face.style, status: face.status }));
    const loadedNoiFaces = noiFontFaces.filter((face) => face.status === "loaded");
    if (fontProfile === "cuebook-noi-v1") {
      if (!['evaluation', 'production'].includes(fontLicenseMode)) errors.push({ code: "FONT_LICENSE_MODE", message: "Noi renders require evaluation or production license mode metadata." });
      if (!fontManifestRef || fontManifestRef.startsWith("/") || fontManifestRef.split("/").includes("..") || !fontManifestRef.endsWith(".json")) errors.push({ code: "FONT_MANIFEST_REF", message: "Noi renders require a safe artifact-local font manifest ref." });
      if (loadedNoiFaces.length === 0) errors.push({ code: "NOI_FONT_NOT_LOADED", message: "Cuebook Noi was declared but no face loaded in the browser." });
    }
    const transformScale = root.offsetWidth ? rootRect.width / root.offsetWidth : logicalScale;
    const authoredWidth = Number(root.dataset.width || 1244);
    const authoredHeight = Number(root.dataset.height || 800);
    const contractScale = Math.min(rootRect.width / authoredWidth, rootRect.height / authoredHeight);
    const tolerance = 0.75;
    const seen = new Set();
    const candidates = Array.from(document.querySelectorAll("[data-role], [data-logic-step-id]"))
      .filter((element) => {
        if (seen.has(element)) return false;
        seen.add(element);
        return true;
      });

    function visible(element) {
      const style = getComputedStyle(element);
      const rect = logicalRect(element);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && rect.width > 0.5 && rect.height > 0.5;
    }

    function visibleBinding(element) {
      const rect = logicalRect(element);
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) return false;
        if (node === root) break;
      }
      const intersectsRoot = rect.right >= rootRect.left + 0.5
        && rect.bottom >= rootRect.top + 0.5
        && rect.left <= rootRect.right - 0.5
        && rect.top <= rootRect.bottom - 0.5;
      return intersectsRoot && (rect.width > 0.5 || rect.height > 0.5);
    }

    function parseColor(value) {
      if (!value) return null;
      const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
      if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
      const oklch = value.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)%?)?\s*\)/i);
      if (!oklch) return null;
      let L = Number(oklch[1]);
      if (value.includes("%")) L /= 100;
      const C = Number(oklch[2]);
      const h = Number(oklch[3]) * Math.PI / 180;
      const alphaRaw = oklch[4] === undefined ? 1 : Number(oklch[4]);
      const alpha = alphaRaw;
      const a = C * Math.cos(h);
      const b = C * Math.sin(h);
      const l0 = L + 0.3963377774 * a + 0.2158037573 * b;
      const m0 = L - 0.1055613458 * a - 0.0638541728 * b;
      const s0 = L - 0.0894841775 * a - 1.291485548 * b;
      const l = l0 ** 3;
      const m = m0 ** 3;
      const s = s0 ** 3;
      const linear = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ];
      const encoded = linear.map((channel) => 255 * (channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.max(0, channel) ** (1 / 2.4) - 0.055));
      return [...encoded.map((channel) => Math.max(0, Math.min(255, channel))), alpha];
    }

    function composite(foreground, background) {
      const alpha = foreground[3];
      return [
        foreground[0] * alpha + background[0] * (1 - alpha),
        foreground[1] * alpha + background[1] * (1 - alpha),
        foreground[2] * alpha + background[2] * (1 - alpha),
        1,
      ];
    }

    function localBackground(element) {
      const layers = [];
      for (let node = element; node; node = node.parentElement) {
        const parsed = parseColor(getComputedStyle(node).backgroundColor);
        if (parsed && parsed[3] > 0) layers.push(parsed);
      }
      let result = [255, 255, 255, 1];
      for (let index = layers.length - 1; index >= 0; index -= 1) result = composite(layers[index], result);
      return result;
    }

    function luminance(color) {
      const channels = color.slice(0, 3).map((value) => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    }

    function contrastRatio(foreground, background) {
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }

    function selectorFor(element, index) {
      const role = element.getAttribute("data-role");
      const step = element.getAttribute("data-logic-step-id");
      if (role) return `[data-role=\"${role}\"]#${index}`;
      if (step) return `[data-logic-step-id=\"${step}\"]#${index}`;
      return `${element.tagName.toLowerCase()}#${index}`;
    }

    const elements = [];
    candidates.filter(visible).forEach((element, index) => {
      const style = getComputedStyle(element);
      const rect = logicalRect(element);
      const role = element.getAttribute("data-role");
      const logicStepId = element.getAttribute("data-logic-step-id");
      const id = selectorFor(element, index);
      const textLeaves = [element, ...element.querySelectorAll("*")].filter((candidate) => visible(candidate) && Array.from(candidate.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));
      const textMetrics = textLeaves.map((leaf, leafIndex) => {
        const leafStyle = getComputedStyle(leaf);
        const directText = Array.from(leaf.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(" ").replace(/\s+/g, " ").trim();
        const leafFontSize = Number.parseFloat(leafStyle.fontSize || "0") * transformScale;
        const leafWeight = Number.parseInt(leafStyle.fontWeight, 10) || 400;
        const background = localBackground(leaf);
        const foregroundRaw = parseColor(leafStyle.color);
        const foreground = foregroundRaw ? composite(foregroundRaw, background) : null;
        const contrast = foreground ? contrastRatio(foreground, background) : null;
        return { leafIndex, text: directText, style: leafStyle, fontSize: leafFontSize, fontWeight: leafWeight, contrast };
      });
      const fontSize = textMetrics.length ? Math.min(...textMetrics.map((metric) => metric.fontSize)) : 0;
      const lineHeightRaw = Number.parseFloat(style.lineHeight || "0");
      const lineHeight = (Number.isFinite(lineHeightRaw) ? lineHeightRaw : Number.parseFloat(style.fontSize || "0") * 1.2) * transformScale;
      const lineCount = element.textContent.trim() && lineHeight > 0 ? Math.max(1, Math.round(rect.height / lineHeight)) : 0;
      const text = element.textContent.replace(/\s+/g, " ").trim();
      const contrast = textMetrics.length && textMetrics.every((metric) => metric.contrast !== null) ? Math.min(...textMetrics.map((metric) => metric.contrast)) : null;

      if (role !== "brand" && (rect.left < rootRect.left - tolerance || rect.top < rootRect.top - tolerance || rect.right > rootRect.right + tolerance || rect.bottom > rootRect.bottom + tolerance)) {
        errors.push({ code: "CLIPPED", element: id, message: "Visible element escapes the Cuebook canvas." });
      }
      for (const metric of textMetrics) {
        const metricId = `${id}:text-${metric.leafIndex}`;
        const largeText = metric.fontSize >= 24 || (metric.fontSize >= 18.66 && metric.fontWeight >= 700);
        if (role !== "brand" && metric.fontSize < 11) errors.push({ code: "MIN_FONT", element: metricId, message: `Effective font size ${metric.fontSize.toFixed(2)}px is below 11px.` });
        if (!["normal", "0px"].includes(metric.style.letterSpacing)) errors.push({ code: "LETTER_SPACING", element: metricId, message: `Letter spacing must remain zero; found ${metric.style.letterSpacing}.` });
        if (fontProfile === "cuebook-noi-v1" && role !== "brand" && !metric.style.fontFamily.toLowerCase().includes("cuebook noi")) errors.push({ code: "NOI_FONT_FALLBACK_STACK", element: metricId, message: `Visible copy must lead with the Cuebook Noi stack; found ${metric.style.fontFamily}.` });
        if (metric.contrast !== null && metric.contrast < (largeText ? 3 : 4.5)) errors.push({ code: "TEXT_CONTRAST", element: metricId, message: `Local contrast ${metric.contrast.toFixed(2)}:1 is too low.` });
        if (/\d/.test(metric.text) && !metric.style.fontVariantNumeric.includes("tabular-nums")) errors.push({ code: "TABULAR_NUMBERS", element: metricId, message: "Numeric content must use tabular numerals." });
      }
      if (role === "claim" && lineCount > (viewportWidth <= 622 ? 3 : 2)) errors.push({ code: "CLAIM_LINES", element: id, message: `Claim uses ${lineCount} lines at ${viewportWidth}px.` });

      elements.push({
        id,
        role,
        visual_level: element.getAttribute("data-visual-level"),
        logic_step_id: logicStepId,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        effective_font_px: Number(fontSize.toFixed(3)),
        line_count: lineCount,
        contrast_ratio: contrast === null ? null : Number(contrast.toFixed(3)),
        overlap_ok: element.getAttribute("data-overlap-ok") === "true",
      });
    });

    const safeZone = {
      left: rootRect.right - 218 * contractScale,
      top: rootRect.bottom - 93 * contractScale,
      right: rootRect.right,
      bottom: rootRect.bottom,
    };
    function intersects(a, b, minimum = 0.75) {
      return Math.min(a.right ?? a.x + a.width, b.right ?? b.x + b.width) - Math.max(a.left ?? a.x, b.left ?? b.x) > minimum
        && Math.min(a.bottom ?? a.y + a.height, b.bottom ?? b.y + b.height) - Math.max(a.top ?? a.y, b.top ?? b.y) > minimum;
    }
    function contains(outer, inner, tolerance = 1) {
      const outerRight = outer.right ?? outer.x + outer.width;
      const outerBottom = outer.bottom ?? outer.y + outer.height;
      const innerRight = inner.right ?? inner.x + inner.width;
      const innerBottom = inner.bottom ?? inner.y + inner.height;
      return inner.x >= outer.x - tolerance
        && inner.y >= outer.y - tolerance
        && innerRight <= outerRight + tolerance
        && innerBottom <= outerBottom + tolerance;
    }
    for (const item of elements) {
      if (item.role !== "brand" && intersects(item.rect, safeZone)) errors.push({ code: "BRAND_SAFE_ZONE", element: item.id, message: "Argument content enters the bottom-right brand safe zone." });
    }
    const roleElements = elements.filter((item) => item.role && item.role !== "brand");
    const marketRelationship = root.dataset.marketRelationship || null;
    const argumentArchetype = root.dataset.argumentArchetype || null;
    const compositionArchetype = root.dataset.compositionArchetype || null;
    const financeTransform = root.dataset.financeTransform || null;
    const baselinePolicy = root.dataset.baselinePolicy || null;
    const chartDecision = root.dataset.chartDecision || null;
    const financeRouteValues = [marketRelationship, argumentArchetype, compositionArchetype];
    if (financeRouteValues.some(Boolean) && !financeRouteValues.every(Boolean)) {
      errors.push({ code: "FINANCE_ROUTE_METADATA", message: "Market relationship, argument archetype, and composition archetype must be declared together." });
    }
    const intentEncodingValues = [financeTransform, baselinePolicy, chartDecision];
    if ((financeRouteValues.some(Boolean) || intentEncodingValues.some(Boolean)) && !intentEncodingValues.every(Boolean)) {
      errors.push({ code: "FINANCE_INTENT_METADATA", message: "Finance transform, baseline policy, and chart decision must be declared together with the finance route." });
    }
    const supportedRelationships = new Set(["deviation", "magnitude", "change_over_time", "ranking", "distribution", "correlation", "part_to_whole", "flow", "relative_value", "term_structure", "revision", "event_reaction", "trigger_state", "scenario_payoff", "causal_transmission"]);
    const supportedArchetypes = new Set(["forecast_surprise", "guidance_reset", "valuation_reframe", "relative_trade", "crowding_unwind", "event_driven", "balance_sheet_pressure", "term_structure_risk", "technical_trigger", "regime_shift", "capital_flow", "news_synthesis", "scenario_payoff", "strategy_ladder"]);
    const supportedCompositions = new Set(["chart_stage", "editorial_split", "comparison_axis", "instrument_strip", "threshold_field", "transmission_gate", "timeline_rail", "distribution_field", "scenario_field", "network_field", "editorial_statement"]);
    const supportedTransforms = new Set(["level", "delta", "return", "excess_return", "indexed", "spread", "drawdown", "contribution", "event_window", "quantile", "payoff", "maturity_profile", "causal_path", "categorical_order", "none"]);
    const supportedBaselines = new Set(["zero", "reference", "indexed_100", "cropped_disclosed", "none"]);
    const supportedChartDecisions = new Set(["text", "number", "table", "chart", "diagram", "full_ohlcv"]);
    if (marketRelationship && !supportedRelationships.has(marketRelationship)) errors.push({ code: "MARKET_RELATIONSHIP", message: `Unsupported market relationship ${marketRelationship}.` });
    if (argumentArchetype && !supportedArchetypes.has(argumentArchetype)) errors.push({ code: "ARGUMENT_ARCHETYPE", message: `Unsupported argument archetype ${argumentArchetype}.` });
    if (compositionArchetype && !supportedCompositions.has(compositionArchetype)) errors.push({ code: "COMPOSITION_ARCHETYPE", message: `Unsupported composition archetype ${compositionArchetype}.` });
    if (financeTransform && !supportedTransforms.has(financeTransform)) errors.push({ code: "FINANCE_TRANSFORM", message: `Unsupported finance transform ${financeTransform}.` });
    if (baselinePolicy && !supportedBaselines.has(baselinePolicy)) errors.push({ code: "BASELINE_POLICY", message: `Unsupported baseline policy ${baselinePolicy}.` });
    if (chartDecision && !supportedChartDecisions.has(chartDecision)) errors.push({ code: "CHART_DECISION", message: `Unsupported chart decision ${chartDecision}.` });
    if (chartDecision === "diagram" && baselinePolicy !== "none") errors.push({ code: "FINANCE_ENCODING", message: "A qualitative diagram must declare baseline policy none." });

    const canvasArea = Math.max(1, rootRect.width * rootRect.height);
    const maxAreaRatio = (role) => roleElements
      .filter((item) => item.role === role)
      .reduce((maximum, item) => Math.max(maximum, (item.rect.width * item.rect.height) / canvasArea), 0);
    const maxHeightRatio = (role) => roleElements
      .filter((item) => item.role === role)
      .reduce((maximum, item) => Math.max(maximum, item.rect.height / Math.max(1, rootRect.height)), 0);
    const layoutMetrics = {
      claim_area_ratio: Number(maxAreaRatio("claim").toFixed(4)),
      claim_height_ratio: Number(maxHeightRatio("claim").toFixed(4)),
      evidence_area_ratio: Number(maxAreaRatio("evidence").toFixed(4)),
      condition_area_ratio: Number(maxAreaRatio("condition").toFixed(4)),
    };
    const proofLedCompositions = new Set(["chart_stage", "comparison_axis", "instrument_strip", "threshold_field", "distribution_field"]);
    if (proofLedCompositions.has(compositionArchetype)) {
      if (layoutMetrics.evidence_area_ratio < 0.28) errors.push({ code: "PROOF_EVIDENCE_AREA", message: `Proof-led composition gives evidence only ${(layoutMetrics.evidence_area_ratio * 100).toFixed(1)}% of canvas area; minimum is 28%.` });
      if (layoutMetrics.claim_height_ratio > 0.28) errors.push({ code: "PROOF_CLAIM_HEIGHT", message: `Proof-led composition gives the claim ${(layoutMetrics.claim_height_ratio * 100).toFixed(1)}% of canvas height; maximum is 28%.` });
    }
    for (let left = 0; left < roleElements.length; left += 1) {
      for (let right = left + 1; right < roleElements.length; right += 1) {
        const a = roleElements[left];
        const b = roleElements[right];
        if (contains(a.rect, b.rect) || contains(b.rect, a.rect)) continue;
        if (!a.overlap_ok && !b.overlap_ok && intersects(a.rect, b.rect, 3)) errors.push({ code: "ROLE_OVERLAP", element: `${a.id} + ${b.id}`, message: "Visible role groups overlap without data-overlap-ok=true." });
      }
    }
    if (rootRect.left < -tolerance || rootRect.top < -tolerance || rootRect.right > viewportWidth + tolerance || rootRect.bottom > viewportHeight + tolerance) {
      errors.push({ code: "ROOT_OVERFLOW", message: "Cuebook canvas does not fit the viewport." });
    }

    const bindingRefs = new Set();
    const graphicSelector = "path,polyline,polygon,line,rect,circle,ellipse,use,canvas,img";
    for (const element of document.querySelectorAll("[data-binding-ref]")) {
      const ref = element.getAttribute("data-binding-ref") || "";
      const roleOrStep = element.closest("[data-role], [data-logic-step-id]");
      const relevant = roleOrStep && root.contains(roleOrStep) && roleOrStep.getAttribute("data-role") !== "brand";
      const hasContent = Boolean(element.textContent.trim())
        || element.matches(graphicSelector)
        || Boolean(element.querySelector(graphicSelector))
        || element.getAttribute("data-binding-display") === "geometry";
      if (!/^BIND_[A-Za-z0-9_:-]{4,}$/.test(ref)) errors.push({ code: "BINDING_REF", element: ref || element.tagName.toLowerCase(), message: "Invalid data-binding-ref." });
      if (!root.contains(element)) errors.push({ code: "BINDING_SCOPE", element: ref, message: "Binding marker is outside the Cuebook canvas." });
      else if (!visibleBinding(element)) errors.push({ code: "BINDING_HIDDEN", element: ref, message: "Binding marker is not visibly rendered." });
      else if (!relevant) errors.push({ code: "BINDING_CONTEXT", element: ref, message: "Binding marker is not attached to a launch role or logic step." });
      else if (!hasContent) errors.push({ code: "BINDING_EMPTY", element: ref, message: "Binding marker has no visible text or rendered geometry." });
      else if (/^BIND_[A-Za-z0-9_:-]{4,}$/.test(ref)) bindingRefs.add(ref);
    }

    const geometryClearance = 8 * contractScale;
    for (const geometry of root.querySelectorAll('[data-binding-display="geometry"]')) {
      if (!visibleBinding(geometry) || geometry.closest('[data-overlap-ok="true"]')) continue;
      const role = geometry.closest('[data-role]');
      if (!role || role.getAttribute('data-role') === 'brand') continue;
      const geometryRect = logicalRect(geometry);
      const protectedRect = {
        left: geometryRect.left - geometryClearance,
        top: geometryRect.top - geometryClearance,
        right: geometryRect.right + geometryClearance,
        bottom: geometryRect.bottom + geometryClearance,
      };
      const textLeaves = [role, ...role.querySelectorAll('*')].filter((candidate) => {
        if (!visible(candidate) || geometry.contains(candidate) || candidate.contains(geometry)) return false;
        if (candidate.closest('[data-overlap-ok="true"]')) return false;
        return Array.from(candidate.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      });
      for (const leaf of textLeaves) {
        const textRect = logicalRect(leaf);
        if (!intersects(protectedRect, textRect, 0.5)) continue;
        errors.push({
          code: 'TEXT_GEOMETRY_CLEARANCE',
          element: geometry.getAttribute('data-binding-ref') || geometry.tagName.toLowerCase(),
          message: 'Bound geometry needs at least 8 authored pixels of clearance from sibling text.',
        });
        break;
      }
    }

    function textLeafRects(leaf) {
      const range = document.createRange();
      const rects = [];
      for (const node of leaf.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
        range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()).filter((rect) => rect.width > 0.5 && rect.height > 0.5));
      }
      return rects;
    }
    const auditableTextLeaves = [];
    for (const leaf of [root, ...root.querySelectorAll("*")]) {
      if (!visible(leaf) || leaf.closest('[data-role="brand"]')) continue;
      const directText = Array.from(leaf.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!directText) continue;
      auditableTextLeaves.push({ leaf, text: directText, rects: textLeafRects(leaf) });
    }

    const visibleEssentialGroups = Array.from(root.querySelectorAll("[data-essential-copy-group]"))
      .filter((element) => visibleBinding(element));
    const essentialGroupNames = new Set();
    for (const element of visibleEssentialGroups) {
      const name = (element.getAttribute("data-essential-copy-group") || "").trim();
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
        errors.push({ code: "PHONE_COPY_GROUP_NAME", message: "Essential copy groups need stable lowercase names." });
        continue;
      }
      essentialGroupNames.add(name);
    }
    const essentialFontSizes = [];
    for (const name of essentialGroupNames) {
      const groupLeaves = auditableTextLeaves.filter(({ leaf }) => leaf.closest("[data-essential-copy-group]")?.getAttribute("data-essential-copy-group") === name);
      if (groupLeaves.length === 0) {
        errors.push({ code: "PHONE_COPY_GROUP_EMPTY", element: name, message: "An essential copy group must contain visible reader-facing text." });
        continue;
      }
      for (const { leaf } of groupLeaves) {
        const effectivePx = Number.parseFloat(getComputedStyle(leaf).fontSize || "0") * transformScale;
        essentialFontSizes.push(effectivePx);
        if (viewportWidth <= 622 && effectivePx < 18) {
          errors.push({ code: "PHONE_ESSENTIAL_FONT", element: name, message: `Essential copy is ${effectivePx.toFixed(2)}px at phone display scale; minimum is 18px.` });
        }
      }
    }
    if (viewportWidth <= 622 && (essentialGroupNames.size < 2 || essentialGroupNames.size > 3)) {
      errors.push({ code: "PHONE_COPY_GROUPS", message: `Phone display needs 2-3 essential copy groups; found ${essentialGroupNames.size}.` });
    }
    const attentionMetrics = {
      essential_copy_groups: Array.from(essentialGroupNames).sort(),
      essential_copy_group_count: essentialGroupNames.size,
      essential_font_floor: essentialFontSizes.length ? Number(Math.min(...essentialFontSizes).toFixed(3)) : null,
    };

    const borderEdges = [];
    for (const element of [root, ...root.querySelectorAll("*")]) {
      if (!visible(element) || element.closest('[data-role="brand"]') || element.closest('[data-overlap-ok="true"]')) continue;
      const style = getComputedStyle(element);
      const rect = logicalRect(element);
      const sides = [
        ["top", Number.parseFloat(style.borderTopWidth), style.borderTopStyle, style.borderTopColor, { left: rect.left, top: rect.top, right: rect.right, bottom: rect.top + Number.parseFloat(style.borderTopWidth) }],
        ["right", Number.parseFloat(style.borderRightWidth), style.borderRightStyle, style.borderRightColor, { left: rect.right - Number.parseFloat(style.borderRightWidth), top: rect.top, right: rect.right, bottom: rect.bottom }],
        ["bottom", Number.parseFloat(style.borderBottomWidth), style.borderBottomStyle, style.borderBottomColor, { left: rect.left, top: rect.bottom - Number.parseFloat(style.borderBottomWidth), right: rect.right, bottom: rect.bottom }],
        ["left", Number.parseFloat(style.borderLeftWidth), style.borderLeftStyle, style.borderLeftColor, { left: rect.left, top: rect.top, right: rect.left + Number.parseFloat(style.borderLeftWidth), bottom: rect.bottom }],
      ];
      for (const [side, width, borderStyle, borderColor, edge] of sides) {
        if (!width || ["none", "hidden"].includes(borderStyle)) continue;
        const parsed = parseColor(borderColor);
        if (!parsed || parsed[3] <= 0.05) continue;
        borderEdges.push({ element, side, edge });
      }
    }
    const collisionPairs = new Set();
    for (const { element, side, edge } of borderEdges) {
      for (const { leaf, text, rects } of auditableTextLeaves) {
        if (leaf === element || leaf.closest('[data-overlap-ok="true"]')) continue;
        for (const rect of rects) {
          if (!intersects(edge, { x: rect.left, y: rect.top, width: rect.width, height: rect.height }, 0.5)) continue;
          const key = `${text}::${element.tagName}${element.className || ""}:${side}`;
          if (collisionPairs.has(key)) break;
          collisionPairs.add(key);
          errors.push({
            code: "TEXT_BORDER_COLLISION",
            element: text.slice(0, 40),
            message: `Visible text crosses a rendered ${side} border line; keep copy clear of rules, brackets, and axes or mark an intentional overlap with data-overlap-ok.`,
          });
          break;
        }
      }
    }

    const restateThreshold = 40 * contractScale;
    const tokenPattern = /(?<![A-Za-z0-9.])(\d[\d,]*(?:\.\d+)?)\s*(%|[A-Za-z]{1,2}(?![A-Za-z]))?/g;
    const tokenOccurrences = new Map();
    for (const { leaf, text } of auditableTextLeaves) {
      const group = leaf.closest("[data-role]");
      if (!group || group.getAttribute("data-role") === "brand") continue;
      const leafStyle = getComputedStyle(leaf);
      const effectivePx = Number.parseFloat(leafStyle.fontSize || "0") * transformScale;
      const suppressed = Boolean(leaf.closest('[data-value-restate-ok="true"]'));
      for (const match of text.matchAll(tokenPattern)) {
        const digits = match[1].replace(/,/g, "");
        const unit = (match[2] || "").toLowerCase();
        if (!unit && digits.replace(".", "").length < 2) continue;
        const token = `${digits}${unit}`;
        if (!tokenOccurrences.has(token)) tokenOccurrences.set(token, []);
        tokenOccurrences.get(token).push({ group, role: group.getAttribute("data-role"), effectivePx, suppressed });
      }
    }
    for (const [token, occurrences] of tokenOccurrences) {
      const groups = new Map();
      for (const occurrence of occurrences) {
        const existing = groups.get(occurrence.group);
        if (!existing || occurrence.effectivePx > existing.effectivePx) groups.set(occurrence.group, occurrence);
      }
      if (groups.size < 2) continue;
      const entries = Array.from(groups.values());
      if (entries.some((entry) => entry.suppressed)) continue;
      if (entries.every((entry) => entry.role === "evidence")) continue;
      const maxPx = Math.max(...entries.map((entry) => entry.effectivePx));
      const finding = {
        code: "VALUE_RESTATED",
        element: token,
        message: `Value ${token} is stated in ${groups.size} separate role groups; a value labeled on evidence geometry is already stated, so restating it ${maxPx >= restateThreshold ? "at display scale " : ""}elsewhere is a repeated fact. Promote the derived quantity instead, or mark the one legitimate restatement with data-value-restate-ok.`,
      };
      if (maxPx >= restateThreshold) errors.push(finding);
      else warnings.push(finding);
    }

    const declaredSteps = new Set(elements.filter((item) => item.logic_step_id).map((item) => item.logic_step_id));
    if (declaredSteps.size < 3) errors.push({ code: "LOGIC_STEP_COUNT", message: `Rendered visual exposes ${declaredSteps.size} logic steps; at least 3 are required.` });

    return {
      width: viewportWidth,
      height: viewportHeight,
      display_scale: logicalScale,
      transform_scale: Number(transformScale.toFixed(4)),
      contract_scale: Number(contractScale.toFixed(4)),
      font_profile: fontProfile,
      font_license_mode: fontLicenseMode,
      font_manifest_ref: fontManifestRef,
      noi_font_faces: noiFontFaces,
      loaded_noi_face_count: loadedNoiFaces.length,
      market_relationship: marketRelationship,
      argument_archetype: argumentArchetype,
      composition_archetype: compositionArchetype,
      finance_transform: financeTransform,
      baseline_policy: baselinePolicy,
      chart_decision: chartDecision,
      layout_metrics: layoutMetrics,
      attention_metrics: attentionMetrics,
      valid: errors.length === 0,
      errors,
      warnings,
      elements,
      logic_step_ids: Array.from(declaredSteps).sort(),
      binding_refs: Array.from(bindingRefs).sort(),
    };
  }, { viewportWidth: width, viewportHeight: height, displayScale });
}

async function auditRenderedViewpoint(htmlArg, outputArg, browserOverride = null, profile = "wide") {
  const htmlPath = path.resolve(htmlArg);
  const outputDir = path.resolve(outputArg);
  if (!fs.existsSync(htmlPath)) throw new Error(`HTML does not exist: ${htmlPath}`);
  const browserPath = browserOverride || browserExecutable();
  if (!browserPath) throw new Error("No supported Chromium executable found.");
  const { chromium } = loadPlaywright();
  fs.mkdirSync(outputDir, { recursive: true });
  const profileViewports = profile === "og"
    ? [[1200, 630, 1200, 630, 1]]
    : [[1244, 800, 1244, 800, 1], [622, 400, 1244, 800, 0.5]];
  const browser = await chromium.launch({ executablePath: browserPath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: profileViewports[0][0], height: profileViewports[0][1] } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
    const viewports = [];
    for (const viewport of profileViewports) viewports.push(await inspectViewport(page, ...viewport));
    const errors = viewports.flatMap((viewport) => viewport.errors.map((item) => ({ ...item, viewport: `${viewport.width}x${viewport.height}` })));
    const warnings = viewports.flatMap((viewport) => viewport.warnings.map((item) => ({ ...item, viewport: `${viewport.width}x${viewport.height}` })));
    const full = viewports[0];
    const layoutSignature = full.elements
      .filter((item) => item.role && item.role !== "brand")
      .map((item) => {
        const centerX = item.rect.x + item.rect.width / 2;
        const centerY = item.rect.y + item.rect.height / 2;
        const areaRatio = item.rect.width * item.rect.height / (full.width * full.height);
        const aspect = item.rect.height ? item.rect.width / item.rect.height : 0;
        return {
          role: item.role,
          level: item.visual_level,
          x_band: Math.max(0, Math.min(3, Math.floor(centerX / full.width * 4))),
          y_band: Math.max(0, Math.min(2, Math.floor(centerY / full.height * 3))),
          area_band: areaRatio >= 0.24 ? "hero" : areaRatio >= 0.08 ? "support" : "detail",
          aspect_band: aspect >= 2.4 ? "wide" : aspect <= 0.75 ? "tall" : "block",
        };
      })
      .sort((left, right) => left.y_band - right.y_band || left.x_band - right.x_band || String(left.role).localeCompare(String(right.role)));
    const layoutFingerprint = sha256(Buffer.from(JSON.stringify(layoutSignature)));
    const report = {
      schema_version: "viewpoint-render-audit-v1",
      source: path.basename(htmlPath),
      source_sha256: sha256(fs.readFileSync(htmlPath)),
      profile,
      profile_version: `render-audit-${profile}-v1`,
      audited_at: new Date().toISOString(),
      valid: errors.length === 0,
      errors,
      warnings,
      layout_signature: layoutSignature,
      layout_fingerprint_sha256: layoutFingerprint,
      viewports,
    };
    const reportPath = path.join(outputDir, "render-audit.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    return { reportPath, report };
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2).filter((value) => value !== "--profile" && value !== "og" && value !== "wide");
  const profileIndex = process.argv.indexOf("--profile");
  const profile = profileIndex === -1 ? "wide" : process.argv[profileIndex + 1];
  if (!["wide", "og"].includes(profile)) throw new Error("Supported profiles: wide (default), og.");
  const [htmlArg, outputArg] = args;
  if (!htmlArg || !outputArg) throw new Error("Usage: audit_rendered_viewpoint.cjs <direction.html> <output-dir> [--profile wide|og]");
  const result = await auditRenderedViewpoint(htmlArg, outputArg, null, profile);
  process.stdout.write(`${result.reportPath}\n`);
  if (!result.report.valid) process.exitCode = 1;
}

module.exports = { auditRenderedViewpoint };

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
