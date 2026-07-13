import { useEffect, useRef } from "react";
import "mathlive";
import "../mathliveSetup";

const MATH_OPEN = "\u00A7MATH\u00A7";
const MATH_CLOSE = "\u00A7END\u00A7";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeInlineStyle(styleValue = "") {
  const blockedProperties = new Set([
    "color",
    "background",
    "background-color",
    "caret-color",
    "-webkit-text-fill-color",
  ]);

  return styleValue
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const [property] = declaration.split(":");
      return property && !blockedProperties.has(property.trim().toLowerCase());
    })
    .join("; ");
}

const EMPTY_MATH_SLOT_LATEX = "\\phantom{0}";

const BEVELLED_FRACTION_SLASH_LATEX_PATTERN = /\\htmlStyle\{display:inline-block;vertical-align:-0\.02em;font-size:1\.3em;line-height:0\.9;padding:0;color:#(?:111|fff);\}\{\/\}/g;
const BEVELLED_FRACTION_SLASH_LATEX = "\\class{cme-bevelled-fraction-slash}{\\htmlStyle{display:inline-block;vertical-align:-0.02em;font-size:1.3em;line-height:0.9;padding:0;color:#fff;}{/}}";

function normalizeBevelledFractionSlash(latex = "") {
  const value = String(latex || "");
  if (value.includes("\\class{cme-bevelled-fraction-slash}{")) return value;
  return value.replace(BEVELLED_FRACTION_SLASH_LATEX_PATTERN, BEVELLED_FRACTION_SLASH_LATEX);
}

function renderEmptyMathPlaceholders(latex = "") {
  const normalized = normalizeBevelledFractionSlash(latex).replace(/\\placeholder\{\}/g, EMPTY_MATH_SLOT_LATEX);
  return normalized
    .replace(/\\frac\{\}\{\}/g, `\\frac{${EMPTY_MATH_SLOT_LATEX}}{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\frac\{\}\{([^{}]*)\}/g, `\\frac{${EMPTY_MATH_SLOT_LATEX}}{$1}`)
    .replace(/(\\frac\{[^{}]*\})\{\}/g, `$1{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\sqrt\{\}/g, `\\sqrt{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\left\(\s*\\right\)/g, `\\left(${EMPTY_MATH_SLOT_LATEX}\\right)`)
    .replace(/\\left\[\s*\\right\]/g, `\\left[${EMPTY_MATH_SLOT_LATEX}\\right]`)
    .replace(/\\left\|\s*\\right\|/g, `\\left|${EMPTY_MATH_SLOT_LATEX}\\right|`)
    .replace(/\\left\\\{\s*\\right\\\}/g, `\\left\\{${EMPTY_MATH_SLOT_LATEX}\\right\\}`)
    .replace(/\^\{\}/g, `^{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/_\{\}/g, `_{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\class\{cme-rounded-enclosure-template\}\{\}/g, `\\class{cme-rounded-enclosure-template}{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\class\{cme-rounded-box-template\}\{\}/g, `\\class{cme-rounded-box-template}{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\class\{cme-overline-right-bar-template\}\{\}/g, `\\class{cme-overline-right-bar-template}{${EMPTY_MATH_SLOT_LATEX}}`)
    .replace(/\\class\{cme-overline-left-curve-template\}\{\}/g, `\\class{cme-overline-left-curve-template}{${EMPTY_MATH_SLOT_LATEX}}`);
}

const MATH_FIELD_SHADOW_STYLE_ID = "cme-math-field-shadow-style";
const MATH_FIELD_SHADOW_CSS = `
:host {
  contain: none !important;
}

.ML__container {
  overflow: visible !important;
}

.ML__content {
  box-sizing: border-box !important;
  overflow: visible !important;
  padding-top: 0.35em !important;
  padding-bottom: 0.35em !important;
}

.ML__scrollbar,
.ML__scroll-button,
.ML__scroll-indicator {
  display: none !important;
}

.cme-not-identical-symbol {
  display: inline-block;
  position: relative;
  line-height: 1;
  padding: 0 0.015em;
}

.cme-not-identical-symbol::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.11em;
  height: 1.02em;
  border-radius: 999px;
  background: currentColor;
  transform: translate(-50%, -50%) rotate(17deg);
  transform-origin: center;
  pointer-events: none;
}

.cme-not-approx-equal-symbol {
  display: inline-block;
  position: relative;
  line-height: 1;
  padding: 0 0.015em;
}

.cme-not-approx-equal-symbol::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.11em;
  height: 1.04em;
  border-radius: 999px;
  background: currentColor;
  transform: translate(-50%, -50%) rotate(17deg);
  transform-origin: center;
  pointer-events: none;
}

.cme-left-right-extensible-arrows svg,
.cme-right-left-stacked-arrows svg {
  transform: scaleY(-1);
  transform-box: fill-box;
  transform-origin: center;
}

/* Overline with curved left boundary: one content-sized wrapper owns both
   strokes, so the overline starts at the curve endpoint and grows with input. */
.cme-overline-left-curve-template {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  inline-size: max-content;
  max-inline-size: none;
  padding: 0.22em 0.24em 0.06em 0.52em;
  line-height: 1;
  box-sizing: border-box;
  vertical-align: middle;
  white-space: nowrap;
}

.cme-overline-left-curve-template::before,
.cme-overline-left-curve-template::after {
  content: "";
  position: absolute;
  pointer-events: none;
}

.cme-overline-left-curve-template::before {
  left: 0;
  top: 0;
  bottom: 0.02em;
  width: 0.40em;
  border-right: 0.06em solid currentColor;
  border-radius: 0 50% 50% 0;
}

.cme-overline-left-curve-template::after {
  left: 0.37em;
  right: 0;
  top: 0;
  border-top: 0.06em solid currentColor;
}
/* Overline with right bar: the wrapper width is the rendered math width plus
   padding, so the top border and attached right border grow with live input. */
.cme-overline-right-bar-template {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0.18em 0.35em 0.06em 0.18em;
  line-height: 1;
  box-sizing: border-box;
  border-top: 0.06em solid currentColor;
  border-right: 0.06em solid currentColor;
  vertical-align: middle;
  white-space: nowrap;
}

.cme-division-layout-line {
  display: inline-block;
  position: relative;
  line-height: 1;
  white-space: nowrap;
}

.cme-division-layout-line .overline-line {
  opacity: 0;
}

.cme-division-layout-line::after {
  content: "";
  position: absolute;
  left: 0.38em;
  right: 0;
  top: calc(0.72em + 5px);
  border-top: 0.04em solid currentColor;
  transform: translateX(2px);
  pointer-events: none;
}

.cme-longdiv-wrapper {
  display: inline-grid !important;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
  align-items: baseline;
  vertical-align: -0.4em;
}

.cme-longdiv-divisor {
  display: block !important;
  grid-column: 1;
  grid-row: 2;
  text-align: right;
  padding-right: 0.1em;
  padding-top: 0.1em;
}

.cme-longdiv-quotient {
  display: block !important;
  grid-column: 2;
  grid-row: 1;
  border-bottom: 1px solid currentColor;
  padding-bottom: 0.1em;
  padding-left: 0.2em;
  text-align: center;
}

.cme-longdiv-dividend {
  display: block !important;
  grid-column: 2;
  grid-row: 2;
  position: relative;
  padding-left: 0.4em;
  padding-top: 0.1em;
  padding-right: 0.2em;
  text-align: left;
}

.cme-longdiv-dividend::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 0.4em;
  height: 100%;
  background: currentColor;
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg preserveAspectRatio='none' viewBox='0 0 10 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 0 0 C 10 20, 10 80, 0 100' stroke='black' stroke-width='1.5' fill='none' vector-effect='non-scaling-stroke' stroke-linecap='round' /%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg preserveAspectRatio='none' viewBox='0 0 10 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M 0 0 C 10 20, 10 80, 0 100' stroke='black' stroke-width='1.5' fill='none' vector-effect='non-scaling-stroke' stroke-linecap='round' /%3E%3C/svg%3E");
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  pointer-events: none;
}

.cme-longdiv-remainder {
  display: block !important;
  grid-column: 2;
  grid-row: 3;
  padding-left: 0.4em;
  padding-top: 0.1em;
  padding-right: 0.2em;
  text-align: left;
}
/* Rounded rectangle enclosure: MathLive measures the rendered body, then this
   wrapper adds em padding and a constant corner radius without fixed width. */
.cme-rounded-box-template {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.22em 0.42em;
  line-height: 1;
  box-sizing: border-box;
  border: 0.06em solid currentColor;
  border-radius: 0.24em;
  vertical-align: middle;
  white-space: nowrap;
}
/* The box is intrinsically sized by MathLive's rendered content; padding expands
   that measured box, and 50% radii turn the final box into a true ellipse. */
.cme-rounded-enclosure-template {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: max-content;
  max-inline-size: none;
  padding: 0.25em 0.45em;
  line-height: 1;
  box-sizing: border-box;
  border: 0.06em solid currentColor;
  border-radius: 50%;
  vertical-align: middle;
  white-space: nowrap;
}
.cme-mixed-fraction-whole,
.cme-mixed-fraction-slot,
.cme-mixed-fraction-denominator {
  display: inline-block;
  position: relative;
  min-width: 0.9em;
  padding-right: 0.22em;
  padding-left: 0.42em;
  line-height: 1.05;
  text-align: center;
  box-sizing: content-box;
}

.cme-mixed-fraction-slot {
  padding-top: 0.02em;
  padding-bottom: 0.16em;
}

.cme-mixed-fraction-denominator {
  padding-top: 0.12em;
  padding-bottom: 0;
}

.cme-mixed-fraction-slot::before,
.cme-mixed-fraction-slot::after {
  content: "";
  position: absolute;
  background: currentColor;
  pointer-events: none;
}

.cme-mixed-fraction-slot::before {
  left: 0.1em;
  top: -0.38em;
  bottom: 0.05em;
  width: 0.06em;
  border-radius: 999px;
}

.cme-mixed-fraction-slot::after {
  left: 0.1em;
  right: 0.02em;
  bottom: 0.05em;
  height: 0.06em;
  border-radius: 999px;
}
.cme-split-fraction-left {
  display: inline-block;
  min-width: 0.9em;
  padding-right: 0.12em;
  line-height: 1.05;
  text-align: right;
  box-sizing: content-box;
}

.cme-split-fraction-slot,
.cme-split-fraction-denominator {
  display: inline-block;
  position: relative;
  min-width: 0.9em;
  padding-right: 0.22em;
  padding-left: 0.42em;
  line-height: 1.05;
  text-align: center;
  box-sizing: content-box;
}

.cme-split-fraction-slot {
  padding-top: 0.02em;
  padding-bottom: 0.16em;
}

.cme-split-fraction-denominator {
  padding-top: 0.12em;
  padding-bottom: 0;
}

.cme-split-fraction-slot::before,
.cme-split-fraction-slot::after {
  content: "";
  position: absolute;
  background: currentColor;
  pointer-events: none;
}

.cme-split-fraction-slot::before {
  left: 0.1em;
  top: -0.38em;
  bottom: 0.05em;
  width: 0.06em;
  border-radius: 999px;
}

.cme-split-fraction-slot::after {
  left: 0.1em;
  right: 0.02em;
  bottom: 0.05em;
  height: 0.06em;
  border-radius: 999px;
}
.cme-vmatrix-template {
  display: inline-block;
  position: relative;
  line-height: 1;
  vertical-align: 0.48em;
  padding-left: 0.44em;
  padding-right: 0.44em;
}

.cme-vmatrix-template .ML__arraycolsep {
  width: 0.28em !important;
}

.cme-vmatrix-template::before,
.cme-vmatrix-template::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 0.095em;
  border-radius: 999px;
  background: currentColor;
  transform: translateY(-50%);
  pointer-events: none;
}

.cme-vmatrix-two-row-template::before,
.cme-vmatrix-two-row-template::after {
  height: 2.7em;
}

.cme-vmatrix-three-row-template::before,
.cme-vmatrix-three-row-template::after {
  height: 3.95em;
}

.cme-vmatrix-template::before {
  left: 0.1em;
}

.cme-vmatrix-template::after {
  right: 0.1em;
}
/* Dynamic Matrix Wrapper - Auto-scaling and Compact */
.cme-matrix-compact-wrapper {
  display: inline-flex;
  align-items: stretch;
  justify-content: center;
  position: relative;
  vertical-align: middle;
  line-height: 1;
  font-size: 0.65em;
  margin: 0 0.1em;
}

.cme-matrix-compact-wrapper.cme-bmatrix-dynamic-template,
.cme-matrix-compact-wrapper.cme-pmatrix-dynamic-template {
  padding-left: 0.45em;
  padding-right: 0.45em;
}

.cme-matrix-compact-wrapper .ML__arraycolsep {
  width: 0.15em !important;
}

.cme-matrix-compact-wrapper::before,
.cme-matrix-compact-wrapper::after {
  content: "";
  position: absolute;
  top: 0.05em;
  bottom: 0.05em;
  background: currentColor;
  pointer-events: none;
}

.cme-bmatrix-dynamic-template::before,
.cme-bmatrix-dynamic-template::after {
  width: 0.35em;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 72' preserveAspectRatio='none'%3E%3Cpath d='M12 2 H4 V70 H12' fill='none' stroke='white' stroke-width='2.5' vector-effect='non-scaling-stroke' stroke-linecap='square' stroke-linejoin='miter'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 72' preserveAspectRatio='none'%3E%3Cpath d='M12 2 H4 V70 H12' fill='none' stroke='white' stroke-width='2.5' vector-effect='non-scaling-stroke' stroke-linecap='square' stroke-linejoin='miter'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.cme-pmatrix-dynamic-template::before,
.cme-pmatrix-dynamic-template::after {
  width: 0.42em;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 72' preserveAspectRatio='none'%3E%3Cpath d='M17 2 C4 18 4 54 17 70' fill='none' stroke='white' stroke-width='2.5' vector-effect='non-scaling-stroke' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 72' preserveAspectRatio='none'%3E%3Cpath d='M17 2 C4 18 4 54 17 70' fill='none' stroke='white' stroke-width='2.5' vector-effect='non-scaling-stroke' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.cme-matrix-compact-wrapper::before {
  left: 0;
}
.cme-matrix-compact-wrapper::after {
  right: 0;
  transform: scaleX(-1);
}
.cme-cases-left-template,
.cme-cases-right-template {
  display: inline-block;
  position: relative;
  line-height: 1;
  vertical-align: 0.48em;
}

.cme-cases-left-template {
  padding-left: 0.62em;
}

.cme-cases-right-template {
  padding-right: 0.62em;
}

.cme-cases-left-template .ML__arraycolsep,
.cme-cases-right-template .ML__arraycolsep {
  width: 0.18em !important;
}

.cme-cases-2x2-template .ML__arraycolsep {
  width: 0.36em !important;
}

.cme-cases-left-template::before,
.cme-cases-right-template::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 0.48em;
  height: 2.55em;
  background: currentColor;
  pointer-events: none;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 48'%3E%3Cpath d='M9 2 C4 2 4 5 4 8 L4 16 C4 19 3 21 1 24 C3 27 4 29 4 32 L4 40 C4 43 4 46 9 46' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 48'%3E%3Cpath d='M9 2 C4 2 4 5 4 8 L4 16 C4 19 3 21 1 24 C3 27 4 29 4 32 L4 40 C4 43 4 46 9 46' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.cme-cases-left-template::before {
  left: 0.08em;
  transform: translateY(-50%);
}

.cme-cases-right-template::after {
  right: 0.08em;
  transform: translateY(-50%) scaleX(-1);
}
.cme-bevelled-fraction-slash {
  color: #ffffff !important;
}

`;

function installMathFieldShadowStyles(mathfield) {
  const shadowRoot = mathfield?.shadowRoot;
  if (!shadowRoot || shadowRoot.getElementById(MATH_FIELD_SHADOW_STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = MATH_FIELD_SHADOW_STYLE_ID;
  style.textContent = MATH_FIELD_SHADOW_CSS;
  shadowRoot.appendChild(style);
}

function scheduleMathFieldShadowStyles(mathfield, attempt = 0) {
  if (!mathfield || typeof window === "undefined") return;

  const apply = () => {
    installMathFieldShadowStyles(mathfield);
    if (!mathfield.shadowRoot && attempt < 6) {
      scheduleMathFieldShadowStyles(mathfield, attempt + 1);
    }
  };

  window.requestAnimationFrame(apply);
}

function createPreviewMathField(latex, tone = "dark") {
  const mf = document.createElement("math-field");
  scheduleMathFieldShadowStyles(mf);
  const isLightTone = tone === "light";
  const textColor = isLightTone ? "#22343d" : "#f4f4fb";
  const accentColor = isLightTone ? "#556e7b" : "#d8b4fe";
  const displayLatex = renderEmptyMathPlaceholders(latex);

  mf.setAttribute("read-only", "");
  mf.setAttribute("letter-shape-style", "upright");
  mf.setAttribute(
    "style",
    [
      "display:inline-block",
      "vertical-align:middle",
      "border:none",
      "background:transparent",
      "outline:none",
      "padding:0 2px",
      "margin:0 1px",
      "font-size:inherit",
      "min-height:auto",
      `color:${textColor}`,
      `--primary-color:${accentColor}`,
      "--caret-color:transparent",
      `--smart-fence-color:${accentColor}`,
    ].join(";"),
  );

  requestAnimationFrame(() => {
    if (mf.setValue) {
      mf.setValue(displayLatex);
    } else {
      mf.value = displayLatex;
    }
  });

  return mf;
}

function appendHtmlContent(parent, html, tone = "dark") {
  if (!html) {
    return;
  }

  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const allowed = new Set([
    "B",
    "STRONG",
    "I",
    "EM",
    "U",
    "BR",
    "DIV",
    "P",
    "SPAN",
    "UL",
    "OL",
    "LI",
    "SUB",
    "SUP",
    "H1",
    "H2",
    "H3",
    "H4",
    "BLOCKQUOTE",
    "A",
    "TABLE",
    "THEAD",
    "TBODY",
    "TR",
    "TH",
    "TD",
    "FIGURE",
    "FIGCAPTION",
    "COLGROUP",
    "COL",
  ]);

  const copy = (src, dest) => {
    Array.from(src.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        dest.appendChild(document.createTextNode(node.textContent));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.nodeName;

        if (tag === "MATH-FIELD") {
          const latex =
            (typeof node.getValue === "function" && node.getValue()) ||
            node.value ||
            node.getAttribute("data-latex") ||
            node.textContent ||
            "";
          dest.appendChild(createPreviewMathField(latex, tone));
        } else if (tag === "BR") {
          dest.appendChild(document.createElement("br"));
        } else if (tag === "SPAN" && node.classList.contains("math-tex")) {
          const span = document.createElement("span");
          span.className = "math-tex";

          if (node.getAttribute("data-latex")) {
            span.setAttribute("data-latex", node.getAttribute("data-latex"));
          }

          span.textContent = node.textContent;
          dest.appendChild(span);
        } else if (allowed.has(tag)) {
          const map = { STRONG: "b", EM: "i" };
          const el = document.createElement(map[tag] || tag.toLowerCase());

          if (tag === "A" && node.getAttribute("href")) {
            el.setAttribute("href", node.getAttribute("href"));
            el.setAttribute("target", "_blank");
            el.setAttribute("rel", "noopener noreferrer");
          }

          ["class", "colspan", "rowspan"].forEach((attr) => {
            if (node.getAttribute(attr)) {
              el.setAttribute(attr, node.getAttribute(attr));
            }
          });

          const sanitizedStyle = sanitizeInlineStyle(node.getAttribute("style") || "");
          if (sanitizedStyle) {
            el.setAttribute("style", sanitizedStyle);
          }

          copy(node, el);
          dest.appendChild(el);
        } else {
          copy(node, dest);
        }
      }
    });
  };

  const clean = document.createElement("span");
  copy(tmp, clean);

  while (clean.firstChild) {
    parent.appendChild(clean.firstChild);
  }
}

export default function QuestionPreview({ value = "", className = "", tone = "dark" }) {
  const containerRef = useRef(null);
  const previewColor = tone === "light" ? "#22343d" : "#f2f2f8";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

    el.innerHTML = "";

    const regex = new RegExp(
      escapeRegex(MATH_OPEN) + "([\\s\\S]*?)" + escapeRegex(MATH_CLOSE),
      "g",
    );

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(value)) !== null) {
      if (match.index > lastIndex) {
        appendHtmlContent(el, value.slice(lastIndex, match.index), tone);
      }

      el.appendChild(createPreviewMathField(match[1], tone));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < value.length) {
      appendHtmlContent(el, value.slice(lastIndex), tone);
    }

    el.querySelectorAll("span.math-tex").forEach((span) => {
      const latex = span.getAttribute("data-latex") || span.textContent || "";

      if (latex) {
        span.replaceWith(createPreviewMathField(latex, tone));
      }
    });
  }, [tone, value]);

  return (
    <span
      ref={containerRef}
      className={className}
      style={{ display: "inline", lineHeight: 1.7, verticalAlign: "middle", color: previewColor }}
    />
  );
}