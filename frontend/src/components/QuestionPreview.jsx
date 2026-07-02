import { useEffect, useRef } from "react";
import "mathlive";

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

const BEVELLED_FRACTION_SLASH_LATEX_PATTERN = /\\htmlStyle\{display:inline-block;position:relative;top:0\.02em;font-size:1\.3em;line-height:0\.9;padding:0;color:#(?:111|fff);\}\{\/\}/g;
const BEVELLED_FRACTION_SLASH_LATEX = "\\class{cme-bevelled-fraction-slash}{\\htmlStyle{display:inline-block;position:relative;top:0.02em;font-size:1.3em;line-height:0.9;padding:0;color:#fff;}{/}}";

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
.cme-two-row-matrix-template {
  display: inline-block;
  position: relative;
  line-height: 1;
  vertical-align: 0.48em;
  padding-left: 0.72em;
  padding-right: 0.72em;
}

.cme-two-row-matrix-template .ML__arraycolsep {
  width: 0.16em !important;
}

.cme-bmatrix-two-row-template::before,
.cme-bmatrix-two-row-template::after,
.cme-pmatrix-two-row-template::before,
.cme-pmatrix-two-row-template::after {
  content: "";
  position: absolute;
  top: 50%;
  height: 2.75em;
  background: currentColor;
  pointer-events: none;
}

.cme-bmatrix-two-row-template::before,
.cme-bmatrix-two-row-template::after {
  width: 0.55em;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 72'%3E%3Cpath d='M12 6 H3 V66 H12' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 72'%3E%3Cpath d='M12 6 H3 V66 H12' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.cme-pmatrix-two-row-template::before,
.cme-pmatrix-two-row-template::after {
  width: 0.58em;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 72'%3E%3Cpath d='M16 6 C6 18 6 54 16 66' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 18 72'%3E%3Cpath d='M16 6 C6 18 6 54 16 66' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.cme-bmatrix-two-row-template::before,
.cme-pmatrix-two-row-template::before {
  left: 0.04em;
  transform: translateY(-50%);
}

.cme-bmatrix-two-row-template::after,
.cme-pmatrix-two-row-template::after {
  right: 0.04em;
  transform: translateY(-50%) scaleX(-1);
}
.cme-bmatrix-three-row-template {
  display: inline-block;
  position: relative;
  line-height: 1;
  vertical-align: 0.48em;
  padding-left: 1.02em;
  padding-right: 1.02em;
}

.cme-bmatrix-three-row-template .ML__arraycolsep {
  width: 0.32em !important;
}

.cme-bmatrix-three-row-template::before,
.cme-bmatrix-three-row-template::after {
  content: "";
  position: absolute;
  top: 50%;
  width: 0.62em;
  height: 5.35em;
  background: currentColor;
  pointer-events: none;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 72'%3E%3Cpath d='M12 6 H3 V66 H12' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 72'%3E%3Cpath d='M12 6 H3 V66 H12' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% 100% no-repeat;
}

.cme-bmatrix-three-row-template::before {
  left: 0.08em;
  transform: translateY(-50%);
}

.cme-bmatrix-three-row-template::after {
  right: 0.08em;
  transform: translateY(-50%) scaleX(-1);
}

.cme-bmatrix-single-column-template {
  padding-left: 1.34em;
  padding-right: 1.34em;
}

.cme-bmatrix-single-column-template .ML__arraycolsep {
  width: 0.18em !important;
}

.cme-bmatrix-two-row-template.cme-bmatrix-single-column-template::before,
.cme-bmatrix-two-row-template.cme-bmatrix-single-column-template::after {
  width: 0.66em;
  height: 3.35em;
}

.cme-bmatrix-three-row-template.cme-bmatrix-single-column-template {
  padding-left: 1.42em;
  padding-right: 1.42em;
}

.cme-bmatrix-three-row-template.cme-bmatrix-single-column-template::before,
.cme-bmatrix-three-row-template.cme-bmatrix-single-column-template::after {
  width: 0.72em;
  height: 6.25em;
}

.cme-bmatrix-narrow-columns-template {
  padding-left: 0.9em;
  padding-right: 0.9em;
}

.cme-bmatrix-narrow-columns-template .ML__arraycolsep {
  width: 0.22em !important;
}

.cme-bmatrix-two-row-template.cme-bmatrix-narrow-columns-template::before,
.cme-bmatrix-two-row-template.cme-bmatrix-narrow-columns-template::after {
  width: 0.6em;
  height: 3.25em;
}

.cme-bmatrix-three-row-template.cme-bmatrix-narrow-columns-template {
  padding-left: 0.94em;
  padding-right: 0.94em;
}

.cme-bmatrix-three-row-template.cme-bmatrix-narrow-columns-template::before,
.cme-bmatrix-three-row-template.cme-bmatrix-narrow-columns-template::after {
  width: 0.68em;
  height: 6.05em;
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
