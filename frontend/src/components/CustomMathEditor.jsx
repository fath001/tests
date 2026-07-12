/**
 * CustomMathEditor — A WIRIS/MathType-inspired Math & Chemistry editor
 * powered by MathLive for interactive WYSIWYG visual editing.
 *
 * The main input area is a CustomTextEditor (contenteditable + inline math-fields).
 * Math/Chem snippets from the popup are inserted as editable <math-field> nodes.
 *
 * Props:
 *   value    {string}   — serialized string (plain text + §MATH§latex§END§ segments)
 *   onChange {function} — called with new serialized string on every change
 */

import { useCallback, useEffect, useRef, useState } from "react";
import "mathlive";
import "../mathliveSetup";
import "./CustomMathEditor.css";
import CustomTextEditor from "./CustomTextEditor";
import SpecialCharacterModal from "./SpecialCharacterModal";

function unwrapChemValue(value = "") {
  const match = String(value).match(/^\\ce\{([\s\S]*)\}$/);
  return match ? match[1] : String(value);
}

function serializeChemValue(value = "") {
  const normalized = unwrapChemValue(value)
    .replace(/\\text\{([^}]*)\}/g, "$1")
    .replace(/\$/g, "")
    .trim();
  return normalized ? `\\ce{${normalized}}` : "";
}


function hasExpandedMathSelection(selection) {
  return Boolean(
    selection &&
    Array.isArray(selection.ranges) &&
    selection.ranges.some(([start, end]) => start !== end)
  );
}

const MATRIX_BMATRIX_TWO_ROW_COLUMN_INSERT =
  "\\begin{bmatrix} #? \\\\ #? \\end{bmatrix}";
const MATRIX_PMATRIX_TWO_ROW_COLUMN_INSERT =
  "\\begin{pmatrix} #? \\\\ #? \\end{pmatrix}";

function buildMatrixArrayBody(rows, cols, rowSeparator = "\\\\") {
  return Array.from({ length: rows }, () => (
    Array.from({ length: cols }, () => "#?").join(" & ")
  )).join(` ${rowSeparator} `);
}

function wrapMatrixBodyWithDelimiters(body, leftDelimiter, rightDelimiter) {
  return "\\left" + leftDelimiter + "\\begin{matrix} " + body + " \\end{matrix}\\right" + rightDelimiter;
}

function buildMatrixInsertLatex(type, rows, cols) {
  const body = buildMatrixArrayBody(rows, cols, "\\\\");

  if (type === "bmatrix" || type === "pmatrix" || type === "vmatrix") {
    return `\\begin{${type}} ${body} \\end{${type}}`;
  }

  return `\\begin{${type}} ${body} \\end{${type}}`;
}

/* ── Shadow CSS for matrix bracket/parenthesis rendering inside MathLive shadow DOM ── */
const CME_MATRIX_SHADOW_STYLE_ID = 'cme-matrix-shadow-style';
const CME_MATRIX_SHADOW_CSS = `
:host {
  font-family: Helvetica, Arial, sans-serif !important;
  --text-font-family: Helvetica, Arial, sans-serif;
  --math-font-family: Helvetica, Arial, sans-serif;
}

/* Force all math letters and text to use Helvetica */
.ML__mathit,
.ML__mathrm,
.ML__text,
.ML__cmr,
.ML__mathsf,
.ML__mathsfit {
  font-family: Helvetica, Arial, sans-serif !important;
}

.ML__mathit {
  font-style: italic !important;
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


/* Dynamic Cancel / Strikeout Templates */
.cme-cancel-template,
.cme-bcancel-template,
.cme-xcancel-template {
  display: inline-block;
  position: relative;
  line-height: 1;
  padding: 0 0.1em;
}

.cme-cancel-template::after,
.cme-bcancel-template::after,
.cme-xcancel-template::after,
.cme-xcancel-template::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.cme-cancel-template::after {
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='100' x2='100' y2='0' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='100' x2='100' y2='0' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
}

.cme-bcancel-template::after {
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='0' x2='100' y2='100' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='0' x2='100' y2='100' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
}

.cme-xcancel-template::after {
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='100' x2='100' y2='0' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='100' x2='100' y2='0' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
}

.cme-xcancel-template::before {
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='0' x2='100' y2='100' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' preserveAspectRatio='none' viewBox='0 0 100 100'%3E%3Cline x1='0' y1='0' x2='100' y2='100' stroke='white' stroke-width='1.5' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E") no-repeat center / 100% 100%;
}
`;

function installMatrixShadowStyles(mathfield) {
  const shadowRoot = mathfield?.shadowRoot;
  if (!shadowRoot || shadowRoot.getElementById(CME_MATRIX_SHADOW_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CME_MATRIX_SHADOW_STYLE_ID;
  style.textContent = CME_MATRIX_SHADOW_CSS;
  shadowRoot.appendChild(style);
}

function countPlaceholdersBeforePrimarySlot(template) {
  if (!template || !template.includes("#0")) return 0;

  const placeholderTokens = Array.from(template.matchAll(/#(?:\d+|\?|@)/g));
  const primarySlotIndex = placeholderTokens.findIndex((match) => match[0] === "#0");
  if (primarySlotIndex <= 0) return 0;

  return placeholderTokens.slice(0, primarySlotIndex).length;
}

function moveToNextMathPlaceholder(mathfield, count) {
  if (!mathfield || !count || typeof mathfield.executeCommand !== "function") return;

  for (let i = 0; i < count; i += 1) {
    try {
      mathfield.executeCommand("moveToNextPlaceholder");
    } catch {
      break;
    }
  }
}
function makeToolbarIconImage(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const TOOLBAR_ICON_IMAGES = {
  "integral-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="1.45" y="13.55" font-size="13.8" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="7.25" y="5.65" width="4.15" height="4.15" rx="0.55" fill="none" stroke="#4a5559" stroke-width="1.2"/>
    </svg>
  `),
  "definite-integral-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.95" y="14.05" font-size="14.2" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="5.1" y="1.2" width="2.55" height="2.55" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="2.1" y="13.15" width="2.55" height="2.55" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="8.45" y="6.15" width="3.8" height="3.8" rx="0.58" fill="none" stroke="#4a5559" stroke-width="1.2"/>
    </svg>
  `),
  "integral-with-differential-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.95" y="13.85" font-size="14.6" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="6.55" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <text x="10.55" y="8.95" font-size="4.95" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#37474f">d</text>
      <rect x="13.15" y="6.15" width="3.05" height="3.05" rx="0.48" fill="none" stroke="#4a5559" stroke-width="1.15"/>
    </svg>
  `),
  "definite-integral-with-differential-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">
      <text x="0.85" y="14.05" font-size="14.4" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∫</text>
      <rect x="5.15" y="1.15" width="2.45" height="2.45" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="2.15" y="13.1" width="2.45" height="2.45" rx="0.42" fill="none" stroke="#4a5559" stroke-width="1.15"/>
      <rect x="8.45" y="6.95" width="3.45" height="3.45" rx="0.55" fill="none" stroke="#4a5559" stroke-width="1.2"/>
      <text x="12.45" y="9.85" font-size="5.15" font-family="Arial, Helvetica, sans-serif" font-weight="700" fill="#37474f">d</text>
      <rect x="14.15" y="6.95" width="2.9" height="3.45" rx="0.5" fill="none" stroke="#4a5559" stroke-width="1.2"/>
    </svg>
  `),
  "derivative-first-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="2" y="16" font-size="11" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">d</text>
      <line x1="5.5" y1="8" x2="5.5" y2="16" stroke="#4a5559" stroke-width="1.2"/>
      <text x="7" y="16" font-size="11" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">dx</text>
    </svg>
  `),
  "derivative-second-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="2" y="16" font-size="11" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">d</text>
      <text x="6.5" y="10" font-size="8" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">2</text>
      <line x1="9" y1="8" x2="9" y2="16" stroke="#4a5559" stroke-width="1.2"/>
      <text x="10.5" y="16" font-size="11" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">dx</text>
      <text x="14.5" y="19" font-size="8" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">2</text>
    </svg>
  `),
  "partial-derivative-first-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="2" y="16" font-size="12" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∂</text>
      <line x1="6.5" y1="8" x2="6.5" y2="16" stroke="#4a5559" stroke-width="1.2"/>
      <text x="8" y="16" font-size="11" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">∂x</text>
    </svg>
  `),
  "partial-derivative-second-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <text x="2" y="16" font-size="12" font-family="Cambria Math, STIX Two Math, Times New Roman, serif" font-weight="700" fill="#37474f">∂</text>
      <text x="7" y="10" font-size="8" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">2</text>
      <line x1="9.5" y1="8" x2="9.5" y2="16" stroke="#4a5559" stroke-width="1.2"/>
      <text x="11" y="16" font-size="11" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">∂x</text>
      <text x="15.5" y="19" font-size="8" font-family="Cambria Math, Times New Roman, serif" font-weight="700" fill="#37474f">2</text>
    </svg>
  `),
  "slash-operator-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M8 4L16 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
  "setminus-operator-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <path d="M16 4L8 20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
  "minus-plus-operator-template-image": makeToolbarIconImage(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
      <line x1="7" y1="8" x2="17" y2="8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="7" y1="16" x2="17" y2="16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="12" y1="11" x2="12" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `),
};

function renderToolbarItemLabel(item) {
  if (item.cls?.includes("arrow-picker-tool")) {
    return (
      <span className="cme-toolbar-chevron-indicator" aria-hidden="true">
        ⏵
      </span>
    );
  }

  if (item.icon && TOOLBAR_ICON_IMAGES[item.icon]) {
    return (
      <span className="cme-toolbar-icon-image-wrapper" aria-hidden="true">
        <img
          className="cme-toolbar-icon-image"
          src={TOOLBAR_ICON_IMAGES[item.icon]}
          alt=""
        />
      </span>
    );
  }

  return item.label;
}

function TabIcon({ top, bottom = "", compact = false }) {
  return (
    <span className={`cme-tab-icon${compact ? " compact" : ""}`} aria-hidden="true">
      <span className="cme-tab-icon-top">{top}</span>
      {bottom ? <span className="cme-tab-icon-bottom">{bottom}</span> : null}
    </span>
  );
}

function RootFractionTabIcon() {
  return (
    <span className="cme-tab-icon cme-tab-icon--svg" aria-hidden="true">
      <svg className="cme-tab-svg-icon" viewBox="0 0 48 24" focusable="false">
        <path
          d="M2 13 L5 13 L7 18 L10 4 L20 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="13" y="7" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <rect x="31" y="3" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <line x1="29" y1="12" x2="39" y2="12" stroke="currentColor" strokeWidth="1.2" />
        <rect x="31" y="15" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Symbol / Template definitions
───────────────────────────────────────────────────────────── */
const MATH_GROUPS = [
  {
    label: <RootFractionTabIcon />,
    isTemplate: true,
    items: [
      { label: "a/b", insert: "\\frac{#0}{#?}" },
      { label: "xⁿ", insert: "#0^{#?}" },
      { label: "xₙ", insert: "#0_{#?}" },
      { label: "√x", insert: "\\sqrt{#0}" },
      { label: "ⁿ√x", insert: "\\sqrt[#?]{#0}" },
      { label: "()", insert: "\\left(#0\\right)" },
      { label: "[]", insert: "\\left[#0\\right]" },
      { label: "|x|", insert: "\\left|#0\\right|" },
      { label: "lim", insert: "\\lim_{#?}" },
      { label: "∫dx", insert: "\\int_{#?}^{#?}" },
      { label: "∑", insert: "\\sum_{#?}^{#?}" },
      { label: "matrix", insert: "\\left(\\begin{matrix} #? & #? \\\\ #? & #? \\end{matrix}\\right)" },
      { label: "vec", insert: "\\vec{#0}" },
      { label: "hat", insert: "\\hat{#0}" },
      { label: "bar", insert: "\\bar{#0}" },
    ],
  },
  {
    label: "αβγ",
    items: [
      { label: "α", insert: "\\alpha" },
      { label: "β", insert: "\\beta" },
      { label: "γ", insert: "\\gamma" },
      { label: "δ", insert: "\\delta" },
      { label: "ε", insert: "\\varepsilon" },
      { label: "ζ", insert: "\\zeta" },
      { label: "η", insert: "\\eta" },
      { label: "θ", insert: "\\theta" },
      { label: "λ", insert: "\\lambda" },
      { label: "μ", insert: "\\mu" },
      { label: "π", insert: "\\pi" },
      { label: "ρ", insert: "\\rho" },
      { label: "σ", insert: "\\sigma" },
      { label: "τ", insert: "\\tau" },
      { label: "φ", insert: "\\varphi" },
      { label: "ω", insert: "\\omega" },
      { label: "Γ", insert: "\\Gamma" },
      { label: "Δ", insert: "\\Delta" },
      { label: "Θ", insert: "\\Theta" },
      { label: "Λ", insert: "\\Lambda" },
      { label: "Σ", insert: "\\Sigma" },
      { label: "Φ", insert: "\\Phi" },
      { label: "Ω", insert: "\\Omega" },
    ],
  },
  {
    label: "±×÷",
    items: [
      { label: "±", insert: "\\pm" },
      { label: "×", insert: "\\times" },
      { label: "÷", insert: "\\div" },
      { label: "\\", insert: "\\backslash", title: "Slash", icon: "slash-operator-template-image" },
      { label: "﹨", insert: "﹨", title: "Reverse Solidus" },
      { label: "∓", insert: "\\mp", title: "Minus or Plus", icon: "minus-plus-operator-template-image" },
      { label: "≠", insert: "\\neq" },
      { label: "≤", insert: "\\leq" },
      { label: "≥", insert: "\\geq" },
      { label: "≈", insert: "\\approx" },
      { label: "∞", insert: "\\infty" },
      { label: "∑", insert: "\\sum" },
      { label: "∏", insert: "\\prod" },
      { label: "∫", insert: "\\int" },
      { label: "∮", insert: "\\oint" },
      { label: "∂", insert: "\\partial" },
      { label: "∇", insert: "\\nabla" },
      { label: "∈", insert: "\\in" },
      { label: "∉", insert: "\\notin" },
      { label: "⊂", insert: "\\subset" },
      { label: "∪", insert: "\\cup" },
      { label: "∩", insert: "\\cap" },
      { label: "∅", insert: "\\emptyset" },
      { label: "√", insert: "\\sqrt{#0}" },
      { label: "∛", insert: "\\sqrt[3]{#0}" },
    ],
  },
  {
    label: "sin/cos",
    items: [
      { label: "sin", insert: "\\sin" },
      { label: "cos", insert: "\\cos" },
      { label: "tan", insert: "\\tan" },
      { label: "cot", insert: "\\cot" },
      { label: "sec", insert: "\\sec" },
      { label: "csc", insert: "\\csc" },
      { label: "sin⁻¹", insert: "\\sin^{-1}" },
      { label: "cos⁻¹", insert: "\\cos^{-1}" },
      { label: "tan⁻¹", insert: "\\tan^{-1}" },
      { label: "log", insert: "\\log" },
      { label: "ln", insert: "\\ln" },
      { label: "exp", insert: "\\exp" },
    ],
  },
  {
    label: "→",
    items: [
      { label: "→", insert: "\\rightarrow" },
      { label: "←", insert: "\\leftarrow" },
      { label: "↔", insert: "\\leftrightarrow" },
      { label: "⇒", insert: "\\Rightarrow" },
      { label: "⇔", insert: "\\Leftrightarrow" },
      { label: "↑", insert: "\\uparrow" },
      { label: "↓", insert: "\\downarrow" },
    ],
  },
  {
    label: "∫",
    isTemplate: true,
    items: [
      { label: "∫□", insert: "\\int #0", title: "Integral Template", icon: "integral-template-image", cls: "integral-hero-template" },
      { label: "∫ₐᵇ", insert: "\\int_{#?}^{#?} #0", title: "Definite Integral Template", icon: "definite-integral-template-image", cls: "integral-hero-template" },
      { label: "∫dx", insert: "\\int #0 \\, d#?", title: "Integral with Differential", icon: "integral-with-differential-template-image", cls: "integral-hero-template" },
      { label: "∫ₐᵇdx", insert: "\\int_{#?}^{#?} #0 \\, d#?", title: "Definite Integral with Differential", icon: "definite-integral-with-differential-template-image", cls: "integral-hero-template" },
      { label: "∫", insert: "\\int" },
      { label: "∬", insert: "\\iint" },
      { label: "∭", insert: "\\iiint" },
      { label: "∮", insert: "\\oint" },
      { label: "∯", insert: "\\oiint" },
      { label: "∫∫dA", insert: "\\iint_{#?} #0 \\, dA" },
      { label: "∮C", insert: "\\oint_{#?} #0 \\, d#?" },
      { label: "∫∫∫dV", insert: "\\iiint_{#?} #0 \\, dV" },
      { label: "F(b)-F(a)", insert: "\\left[#0\\right]_{#?}^{#?}" },
      { label: "u-sub", insert: "\\int #0 \\, du" },
    ],
  },
  {
    label: "d/dx",
    isTemplate: true,
    items: [
      { label: "d/dx", insert: "\\frac{d}{dx}", icon: "derivative-first-template-image", cls: "derivative-hero-template" },
      { label: "d²/dx²", insert: "\\frac{d^{2}}{dx^{2}}", icon: "derivative-second-template-image", cls: "derivative-hero-template" },
      { label: "∂/∂x", insert: "\\frac{\\partial}{\\partial x}", icon: "partial-derivative-first-template-image", cls: "derivative-hero-template" },
      { label: "∂²/∂x²", insert: "\\frac{\\partial^{2}}{\\partial x^{2}}", icon: "partial-derivative-second-template-image", cls: "derivative-hero-template" },
      { label: "dy/dx", insert: "\\frac{dy}{dx}" },
      { label: "d²y/dx²", insert: "\\frac{d^{2}y}{dx^{2}}" },
      { label: "dⁿy/dxⁿ", insert: "\\frac{d^{#?}#0}{dx^{#?}}" },
      { label: "∂f/∂x", insert: "\\frac{\\partial #0}{\\partial x}" },
      { label: "∂²f/∂x²", insert: "\\frac{\\partial^{2} #0}{\\partial x^{2}}" },
      { label: "∂²f/∂x∂y", insert: "\\frac{\\partial^{2} #0}{\\partial x \\partial y}" },
      { label: "f'(x)", insert: "#0^{\\prime}(#?)" },
      { label: "f''(x)", insert: "#0^{\\prime\\prime}(#?)" },
      { label: "ẋ", insert: "\\dot{#0}" },
      { label: "ẍ", insert: "\\ddot{#0}" },
      { label: "∇f", insert: "\\nabla #0" },
      { label: "∇²f", insert: "\\nabla^{2} #0" },
    ],
  },
  {
    label: "log/ln",
    isTemplate: true,
    items: [
      { label: "log", insert: "\\log" },
      { label: "ln", insert: "\\ln" },
      { label: "log₁₀", insert: "\\log_{10}" },
      { label: "log₂", insert: "\\log_{2}" },
      { label: "logₐ", insert: "\\log_{#?}" },
      { label: "logₐ(x)", insert: "\\log_{#?}\\left(#0\\right)" },
      { label: "ln(x)", insert: "\\ln\\left(#0\\right)" },
      { label: "log|x|", insert: "\\log\\left|#0\\right|" },
      { label: "eˣ", insert: "e^{#0}" },
      { label: "aˣ", insert: "#?^{#0}" },
      { label: "log(ab)", insert: "\\log\\left(#0 \\cdot #?\\right)" },
      { label: "log(a/b)", insert: "\\log\\left(\\frac{#0}{#?}\\right)" },
      { label: "log(aⁿ)", insert: "\\log\\left(#0^{#?}\\right)" },
    ],
  },
  {
    label: "π,e",
    items: [
      { label: "e", insert: "e" },
      { label: "i", insert: "i" },
      { label: "ℝ", insert: "\\mathbb{R}" },
      { label: "ℤ", insert: "\\mathbb{Z}" },
      { label: "ℕ", insert: "\\mathbb{N}" },
      { label: "ℚ", insert: "\\mathbb{Q}" },
    ],
  },
  {
    label: "∈∪∩",
    items: [
      { label: "Ω", title: "Insert Special Character", action: "SPECIAL_CHARS" },
      { label: "⊆", insert: "\\subseteq" },
      { label: "⊇", insert: "\\supseteq" },
      { label: "﹨", insert: "﹨" },
      { label: "∩", insert: "\\cap" },
      { label: "∪", insert: "\\cup" },
      { label: "∅", insert: "\\emptyset" },
    ],
  },
  {
    label: "∀∃",
    items: [
      { label: "∀", insert: "\\forall" },
      { label: "∃", insert: "\\exists" },
      { label: "¬", insert: "\\neg" },
      { label: "∧", insert: "\\land" },
      { label: "∨", insert: "\\lor" },
    ],
  },
  {
    label: "Matrices",
    isMatrix: true,
    items: [
      { label: "Plain", insert: "matrix", cls: "template" },
      { label: "[]", insert: "bmatrix", cls: "template" },
      { label: "()", insert: "pmatrix", cls: "template" },
      { label: "||", insert: "vmatrix", cls: "template" },
      { label: "3 column row", insert: "\\begin{matrix} #? & #? & #? \\end{matrix}", cls: "template", directInsert: true },
      { label: "2 row column []", insert: MATRIX_BMATRIX_TWO_ROW_COLUMN_INSERT, cls: "template", directInsert: true },
      { label: "2 column row []", insert: "\\left[\\begin{matrix} #? & #? \\end{matrix}\\right]", cls: "template", directInsert: true },
      { label: "2 row column ()", insert: MATRIX_PMATRIX_TWO_ROW_COLUMN_INSERT, cls: "template", directInsert: true },
      { label: "2 column row ()", insert: "\\left(\\begin{matrix} #? & #? \\end{matrix}\\right)", cls: "template", directInsert: true },
    ],
  },
];

const CHEM_GROUPS = [
  {
    id: "chem-period-1",
    label: <TabIcon top={"H-Ne"} bottom={"elem"} />,
    isChem: true,
    items: ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne"].map((el) => ({
      label: el, insert: el, cls: "chem-element",
    })),
  },
  {
    id: "chem-period-2",
    label: <TabIcon top={"Na-Ca"} bottom={"elem"} />,
    isChem: true,
    items: ["Na", "Mg", "Al", "Si", "P", "S", "Cl", "Ar", "K", "Ca"].map((el) => ({
      label: el, insert: el, cls: "chem-element",
    })),
  },
  {
    id: "chem-metals",
    label: <TabIcon top={"Fe-Zn"} bottom={"metals"} />,
    isChem: true,
    items: ["Fe", "Cu", "Zn", "Mn", "Cr", "Ni", "Co", "Ag", "Au", "Hg", "Pb", "Sn", "Br", "I", "Ba", "Pt", "Xe"].map(
      (el) => ({ label: el, insert: el, cls: "chem-element" })
    ),
  },
  {
    id: "chem-arrows",
    label: <TabIcon top={"\u2192 \u21cc"} bottom={"react"} />,
    isChem: true,
    items: [
      { label: "\u2192", insert: "->", cls: "chem-arrow" },
      { label: "\u21cc", insert: "<=>", cls: "chem-arrow" },
      { label: "\u2190", insert: "<-", cls: "chem-arrow" },
      { label: "\u21c4", insert: "<->", cls: "chem-arrow" },
      { label: "\u2191", insert: "^", cls: "chem-arrow" },
      { label: "\u2193", insert: "v", cls: "chem-arrow" },
      { label: "+", insert: " + ", cls: "chem-arrow" },
      { label: "\u2192(\u0394)", insert: "->[\\Delta]", cls: "chem-arrow" },
      { label: "\u2192(aq)", insert: "->[aq]", cls: "chem-arrow" },
    ],
  },
  {
    id: "chem-states",
    label: <TabIcon top={"(s)(l)"} bottom={"state"} />,
    isChem: true,
    items: [
      { label: "(s)", insert: "(s)", cls: "chem-state" },
      { label: "(l)", insert: "(l)", cls: "chem-state" },
      { label: "(g)", insert: "(g)", cls: "chem-state" },
      { label: "(aq)", insert: "(aq)", cls: "chem-state" },
      { label: "(conc)", insert: "(conc)", cls: "chem-state" },
      { label: "(dil)", insert: "(dil)", cls: "chem-state" },
      { label: "(ppt)", insert: "(ppt)", cls: "chem-state" },
    ],
  },
  {
    id: "chem-charge",
    label: <TabIcon top={"\u207a \u207b"} bottom={"\u2082 \u2083"} />,
    isChem: true,
    items: [
      { label: "\u207a", insert: "^{+}", cls: "chem-element" },
      { label: "\u207b", insert: "^{-}", cls: "chem-element" },
      { label: "\u00b2\u207a", insert: "^{2+}", cls: "chem-element" },
      { label: "\u00b2\u207b", insert: "^{2-}", cls: "chem-element" },
      { label: "\u00b3\u207a", insert: "^{3+}", cls: "chem-element" },
      { label: "\u00b3\u207b", insert: "^{3-}", cls: "chem-element" },
      { label: "\u2082", insert: "2", cls: "chem-element" },
      { label: "\u2083", insert: "3", cls: "chem-element" },
      { label: "\u2084", insert: "4", cls: "chem-element" },
      { label: "\u2085", insert: "5", cls: "chem-element" },
      { label: "\u2086", insert: "6", cls: "chem-element" },
      { label: "\u2087", insert: "7", cls: "chem-element" },
      { label: "\u2088", insert: "8", cls: "chem-element" },
      { label: "\u2093", insert: "x", cls: "chem-element" },
      { label: "\u2099", insert: "n", cls: "chem-element" },
    ],
  },
  {
    id: "chem-molecules",
    label: <TabIcon top={"H\u2082O"} bottom={"ions"} />,
    isChem: true,
    items: [
      { label: "H\u2082O", insert: "H2O", cls: "chem-element" },
      { label: "CO\u2082", insert: "CO2", cls: "chem-element" },
      { label: "NH\u2083", insert: "NH3", cls: "chem-element" },
      { label: "H\u2082SO\u2084", insert: "H2SO4", cls: "chem-element" },
      { label: "HCl", insert: "HCl", cls: "chem-element" },
      { label: "NaOH", insert: "NaOH", cls: "chem-element" },
      { label: "NaCl", insert: "NaCl", cls: "chem-element" },
      { label: "CaCO\u2083", insert: "CaCO3", cls: "chem-element" },
      { label: "HNO\u2083", insert: "HNO3", cls: "chem-element" },
      { label: "H\u2083PO\u2084", insert: "H3PO4", cls: "chem-element" },
      { label: "CH\u2083COOH", insert: "CH3COOH", cls: "chem-element" },
      { label: "C\u2086H\u2081\u2082O\u2086", insert: "C6H12O6", cls: "chem-element" },
      { label: "CH\u2084", insert: "CH4", cls: "chem-element" },
      { label: "C\u2082H\u2085OH", insert: "C2H5OH", cls: "chem-element" },
      { label: "CO\u2083\u00b2\u207b", insert: "CO3^{2-}", cls: "chem-element" },
      { label: "SO\u2084\u00b2\u207b", insert: "SO4^{2-}", cls: "chem-element" },
      { label: "NO\u2083\u207b", insert: "NO3^-", cls: "chem-element" },
      { label: "PO\u2084\u00b3\u207b", insert: "PO4^{3-}", cls: "chem-element" },
      { label: "NH\u2084\u207a", insert: "NH4^+", cls: "chem-element" },
      { label: "OH\u207b", insert: "OH^-", cls: "chem-element" },
    ],
  },
];

function MatrixHoverGrid({ x, y, onSelect, onMouseEnter, onMouseLeave }) {
  const [hoverGrid, setHoverGrid] = useState({ r: 2, c: 2 });

  return (
    <div
      className="cme-matrix-hover-popover"
      style={{ top: `${y}px`, left: `${x}px` }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="cme-matrix-hover-grid">
        {Array.from({ length: 6 }).map((_, rIndex) => (
          <div key={rIndex} className="cme-matrix-hover-row">
            {Array.from({ length: 6 }).map((_, cIndex) => {
              const isSelected = rIndex < hoverGrid.r && cIndex < hoverGrid.c;
              return (
                <div
                  key={`${rIndex}-${cIndex}`}
                  className={`cme-matrix-hover-cell${isSelected ? ' selected' : ''}`}
                  onMouseEnter={() => setHoverGrid({ r: rIndex + 1, c: cIndex + 1 })}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(rIndex + 1, cIndex + 1);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="cme-matrix-hover-footer">
        <div className="cme-matrix-counter">
          <span>Rows</span>
          <span className="cme-counter-val">{hoverGrid.r}</span>
          <div className="cme-counter-btns">
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, r: Math.min(10, prev.r + 1) }))}>▲</button>
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, r: Math.max(1, prev.r - 1) }))}>▼</button>
          </div>
        </div>
        <div className="cme-matrix-counter">
          <span>Cols</span>
          <span className="cme-counter-val">{hoverGrid.c}</span>
          <div className="cme-counter-btns">
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, c: Math.min(10, prev.c + 1) }))}>▲</button>
            <button type="button" onClick={() => setHoverGrid(prev => ({ ...prev, c: Math.max(1, prev.c - 1) }))}>▼</button>
          </div>
        </div>
        <button
          type="button"
          className="cme-matrix-insert-btn"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect(hoverGrid.r, hoverGrid.c);
          }}
        >
          Insert
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Main Component
   ───────────────────────────────────────────────────────────── */
export default function CustomMathEditor({ value = "", onChange }) {
  const [mode, setMode] = useState("math");       // "math" | "chem"
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [popupWindowMode, setPopupWindowMode] = useState("normal");
  const [popupPosition, setPopupPosition] = useState(null);

  const mainTextEditorRef = useRef(null);
  const popupMfRef = useRef(null);
  const popupRef = useRef(null);
  const popupPositionRef = useRef(null);
  const dragStateRef = useRef(null);
  const removeDragListenersRef = useRef(() => { });

  const [activeMathGroup, setActiveMathGroup] = useState(0);
  const [activeChemGroup, setActiveChemGroup] = useState(0);
  const [activeMatrix, setActiveMatrix] = useState(null); // { type, x, y }
  const [showSpecialChars, setShowSpecialChars] = useState(null); // { x, y } or null

  useEffect(() => {
    if (!activeMatrix) return;
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.cme-matrix-hover-popover') && !e.target.closest('.cme-matrix-btn-wrapper')) {
        setActiveMatrix(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick, true);
    return () => window.removeEventListener('mousedown', handleOutsideClick, true);
  }, [activeMatrix]);


  const clampPopupPosition = useCallback((nextX, nextY) => {
    const popupEl = popupRef.current;
    const width = popupEl?.offsetWidth || 720;
    const height = popupEl?.offsetHeight || 384;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);

    return {
      x: Math.min(Math.max(12, nextX), maxX),
      y: Math.min(Math.max(12, nextY), maxY),
    };
  }, []);

  const stopDragging = useCallback(() => {
    removeDragListenersRef.current();
    removeDragListenersRef.current = () => { };
    dragStateRef.current = null;
  }, []);

  useEffect(() => () => stopDragging(), [stopDragging]);

  useEffect(() => {
    popupPositionRef.current = popupPosition;
  }, [popupPosition]);
  const getDefaultPopupPosition = useCallback((nextMode = "normal") => {
    const isSmallViewport = window.innerWidth <= 640;
    const edgeX = isSmallViewport ? 12 : 24;
    const edgeY = isSmallViewport ? 12 : 24;
    const width = nextMode === "minimized"
      ? Math.min(420, window.innerWidth - 24)
      : Math.min(720, window.innerWidth - 24);
    const height = nextMode === "minimized"
      ? 32
      : isSmallViewport
        ? Math.min(384, window.innerHeight - 24)
        : 384;
    const maxX = Math.max(12, window.innerWidth - width - 12);
    const maxY = Math.max(12, window.innerHeight - height - 12);

    return {
      x: Math.min(Math.max(12, window.innerWidth - width - edgeX), maxX),
      y: Math.min(Math.max(12, window.innerHeight - height - edgeY), maxY),
    };
  }, []);

  const resetPopupPosition = useCallback(() => {
    popupPositionRef.current = null;
    setPopupPosition(null);
  }, []);

  const setDefaultPopupPosition = useCallback((nextMode = "normal") => {
    const next = getDefaultPopupPosition(nextMode);
    popupPositionRef.current = next;
    setPopupPosition(next);
  }, [getDefaultPopupPosition]);

  const handleMinimizeWindow = useCallback(() => {
    stopDragging();
    if (popupWindowMode === "minimized") {
      setDefaultPopupPosition("normal");
      setPopupWindowMode("normal");
      return;
    }
    resetPopupPosition();
    setPopupWindowMode("minimized");
  }, [popupWindowMode, resetPopupPosition, setDefaultPopupPosition, stopDragging]);

  const handleMaximizeWindow = useCallback(() => {
    stopDragging();
    if (popupWindowMode === "maximized") {
      setDefaultPopupPosition("normal");
      setPopupWindowMode("normal");
      return;
    }
    resetPopupPosition();
    setPopupWindowMode("maximized");
  }, [popupWindowMode, resetPopupPosition, setDefaultPopupPosition, stopDragging]);

  useEffect(() => {
    if (!isEditorOpen || popupWindowMode === "maximized") return;

    const syncPopupPosition = () => {
      const popupEl = popupRef.current;
      if (!popupEl) return;

      const current = popupPositionRef.current;
      if (current) {
        setPopupPosition(current);
        return;
      }

      const rect = popupEl.getBoundingClientRect();
      const next = clampPopupPosition(
        window.innerWidth - rect.width - 24,
        window.innerHeight - rect.height - 24,
      );
      popupPositionRef.current = next;
      setPopupPosition(next);
    };

    const frameId = requestAnimationFrame(syncPopupPosition);
    return () => cancelAnimationFrame(frameId);
  }, [clampPopupPosition, isEditorOpen, popupWindowMode]);

  useEffect(() => {
    if (!isEditorOpen || popupWindowMode === "maximized") return;

    const handleResize = () => {
      const current = popupPositionRef.current;
      if (!current) return;
      const clamped = clampPopupPosition(current.x, current.y);
      popupPositionRef.current = clamped;
      setPopupPosition(clamped);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPopupPosition, isEditorOpen, popupWindowMode]);

  const handlePopupDragStart = useCallback((event) => {
    if (popupWindowMode === "maximized") return;
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest(".cme-popup-actions")) return;

    const popupEl = popupRef.current;
    if (!popupEl) return;

    event.preventDefault();

    const rect = popupEl.getBoundingClientRect();
    const startPosition = popupPositionRef.current || { x: rect.left, y: rect.top };
    popupPositionRef.current = startPosition;
    setPopupPosition(startPosition);

    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    const handlePointerMove = (moveEvent) => {
      if (!dragStateRef.current) return;
      moveEvent.preventDefault();

      const next = clampPopupPosition(
        moveEvent.clientX - dragStateRef.current.offsetX,
        moveEvent.clientY - dragStateRef.current.offsetY,
      );

      popupPositionRef.current = next;
      setPopupPosition(next);
    };

    const handlePointerUp = () => stopDragging();

    removeDragListenersRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }, [clampPopupPosition, popupWindowMode, stopDragging]);

  /* ── Configure popup math-field when mode switches ── */
  useEffect(() => {
    const popupMf = popupMfRef.current;
    if (!popupMf || !isEditorOpen) return;
    popupMf.defaultMode = mode === "chem" ? "text" : "math";
    popupMf.letterShapeStyle = "upright";
    popupMf.smartMode = true;
    popupMf.smartFence = false;
    if ("inlineShortcuts" in popupMf) popupMf.inlineShortcuts = {};
    popupMf.style.color = "#000000";
    popupMf.style.setProperty("--primary-color", "#000000");
    popupMf.style.setProperty("--caret-color", "#000000");
    popupMf.style.setProperty("--smart-fence-color", "#000000");
    installMatrixShadowStyles(popupMf);
    requestAnimationFrame(() => popupMf.focus());
  }, [mode, isEditorOpen]);

  /* ── Keyboard shortcuts for Popup ── */
  useEffect(() => {
    const popupMf = popupMfRef.current;
    if (!popupMf) return;

    const handleKeyDown = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        if (mode === "chem") {
          popupMf.executeCommand(["insert", "\\, "]);
        } else {
          popupMf.executeCommand(["insert", "\\, "]);
        }
      } else if (e.key === "Enter") {
        if (mode === "chem") return;
        e.preventDefault();
        popupMf.executeCommand(["insert", "\\\\"]);
      }
    };

    popupMf.addEventListener("keydown", handleKeyDown);
    return () => popupMf.removeEventListener("keydown", handleKeyDown);
  }, [isEditorOpen, mode]);

  /* ── Auto-scroll caret into view ── */
  useEffect(() => {
    const popupMf = popupMfRef.current;
    if (!popupMf || !isEditorOpen) return;

    const handleSelectionChange = () => {
      // Small timeout to let MathLive update the DOM caret position first
      setTimeout(() => {
        const shadow = popupMf.shadowRoot;
        if (!shadow) return;
        const caret = shadow.querySelector(".ML__caret") || shadow.querySelector('[class*="caret"]');
        if (caret) {
          caret.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
        }
      }, 0);
    };

    popupMf.addEventListener("selection-change", handleSelectionChange);
    popupMf.addEventListener("input", handleSelectionChange);
    popupMf.addEventListener("keydown", handleSelectionChange);

    return () => {
      popupMf.removeEventListener("selection-change", handleSelectionChange);
      popupMf.removeEventListener("input", handleSelectionChange);
      popupMf.removeEventListener("keydown", handleSelectionChange);
    };
  }, [isEditorOpen]);

  /* ── Insert symbol / template into popup math-field ── */
  const insertAtCursor = useCallback((insertText) => {
    const popupMf = popupMfRef.current;
    if (!popupMf) return;

    const hasPlaceholders = /#(?:\d+|\?|@)/.test(insertText);
    const currentSelection = popupMf.selection || popupMf.model?.selection;
    const hasExpandedSelection = hasExpandedMathSelection(currentSelection);
    const shouldReplaceSelection = hasPlaceholders || hasExpandedSelection;
    const shouldAdvanceToPrimarySlot = !hasExpandedSelection;
    const primarySlotAdvanceCount = shouldAdvanceToPrimarySlot
      ? countPlaceholdersBeforePrimarySlot(insertText)
      : 0;

    popupMf.focus();
    if (typeof popupMf.insert === "function") {
      popupMf.insert(insertText, {
        format: "latex",
        insertionMode: shouldReplaceSelection ? "replaceSelection" : "insert",
        selectionMode: hasPlaceholders ? "placeholder" : "after",
      });
    } else {
      popupMf.executeCommand(["insert", insertText]);
    }

    requestAnimationFrame(() => {
      popupMf.focus?.();
      moveToNextMathPlaceholder(popupMf, primarySlotAdvanceCount);
    });
  }, []);
  const handleMatrixInsert = useCallback((type, rows, cols) => {
    insertAtCursor(buildMatrixInsertLatex(type, rows, cols));
  }, [insertAtCursor]);

  const toggleEditor = (newMode) => {
    if (isEditorOpen && mode === newMode) {
      setIsEditorOpen(false);
      setPopupWindowMode("normal");
      resetPopupPosition();
      requestAnimationFrame(() => mainTextEditorRef.current?.focus());
      return;
    }
    setMode(newMode);
    setPopupWindowMode("normal");
    resetPopupPosition();
    setIsEditorOpen(true);
  };

  /* ── Insert from popup into main editor ── */
  const handleInsert = () => {
    const popupMf = popupMfRef.current;
    const mainTextEditor = mainTextEditorRef.current;
    if (!popupMf || !mainTextEditor) return;

    let latex = popupMf.getValue ? popupMf.getValue() : popupMf.value;
    if (mode === "chem" && latex) {
      latex = serializeChemValue(latex);
    }

    if (!latex || latex.trim() === "") {
      if (popupMf.setValue) popupMf.setValue("");
      else popupMf.value = "";
      setIsEditorOpen(false);
      return;
    }

    mainTextEditor.insertMath(latex);

    if (popupMf.setValue) popupMf.setValue("");
    else popupMf.value = "";

    requestAnimationFrame(() => mainTextEditor.focus());
  };

  const handleClose = () => {
    stopDragging();
    setIsEditorOpen(false);
    setPopupWindowMode("normal");
    resetPopupPosition();
  };

  const groups = mode === "math" ? MATH_GROUPS : CHEM_GROUPS;
  const activeGroupIndex = mode === "math" ? activeMathGroup : activeChemGroup;
  const activeGroup = groups[activeGroupIndex] || {};
  const isPopupTabMode = mode === "math" || mode === "chem";
  const isFirstMathTab = mode === "math" && activeGroupIndex === 0;
  const isIntegralHeroTab =
    mode === "math" &&
    Array.isArray(activeGroup.items) &&
    activeGroup.items.some((item) => item.cls === "integral-hero-template");
  const isDerivativeHeroTab =
    mode === "math" &&
    Array.isArray(activeGroup.items) &&
    activeGroup.items.some((item) => item.cls === "derivative-hero-template");
  const toolbarChunkSize = 4;
  const toolbarItems = activeGroup.items || [];
  const toolbarChunks = [];
  for (let i = 0; i < toolbarItems.length; i += toolbarChunkSize) {
    toolbarChunks.push(toolbarItems.slice(i, i + toolbarChunkSize));
  }
  const popupStyle =
    popupWindowMode === "normal" && popupPosition
      ? {
        left: `${popupPosition.x}px`,
        top: `${popupPosition.y}px`,
        right: "auto",
        bottom: "auto",
      }
      : undefined;


  return (
    <div className="cme-wrapper">
      <div className="Input-question-box">
        <CustomTextEditor
          ref={mainTextEditorRef}
          value={value}
          onChange={onChange}
          placeholder="Enter text here..."
          onMathType={() => toggleEditor("math")}
          onChemType={() => toggleEditor("chem")}
          mathTypeActive={isEditorOpen && mode === "math"}
          chemTypeActive={isEditorOpen && mode === "chem"}
        />
      </div>

      {/* ── MathLive Visual Editor Popup ──────────────────── */}
      {isEditorOpen && (
        <div ref={popupRef} className={`cme-editor-popup ${popupWindowMode}`} style={popupStyle}>
          <div className="cme-popup-header" onPointerDown={handlePopupDragStart}>
            <span>{mode === "math" ? "MathType" : "ChemType"}</span>
            <div className="cme-popup-actions" onPointerDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="cme-popup-window-btn"
                aria-label={popupWindowMode === "minimized" ? "Restore window" : "Minimize window"}
                onClick={handleMinimizeWindow}
              >
                {popupWindowMode === "minimized" ? "+" : "-"}
              </button>
              <button
                type="button"
                className="cme-popup-window-btn"
                aria-label={popupWindowMode === "maximized" ? "Restore window" : "Maximize window"}
                onClick={handleMaximizeWindow}
              >
                {popupWindowMode === "maximized" ? "o" : "[]"}
              </button>
              <button type="button" className="cme-popup-close" onClick={handleClose}>
                x
              </button>
            </div>
          </div>

          {/* Symbol / Template Toolbar */}
          <div className="cme-toolbar" role="toolbar" aria-label="Symbol palette">
            <div className="cme-toolbar-groups">
              {groups.map((group, index) => {
                const isActive = mode === "math" ? activeMathGroup === index : activeChemGroup === index;
                return (
                  <button
                    key={group.id || index}
                    className={`cme-group-tab${isPopupTabMode ? " cme-group-tab--popup" : ""}${mode === "math" ? " cme-group-tab--math" : ""}${mode === "chem" ? " cme-group-tab--chem" : ""}${isActive ? " active" : ""}`}
                    type="button"
                    onClick={() => {
                      if (mode === "math") setActiveMathGroup(index);
                      else setActiveChemGroup(index);
                      setActiveMatrix(null);
                    }}
                  >
                    <span className="cme-group-tab-label">{group.label}</span>
                  </button>
                );
              })}
            </div>

            <div className={`cme-toolbar-items${isFirstMathTab ? " cme-toolbar-items--first-tab" : ""}${(isIntegralHeroTab || isDerivativeHeroTab) ? " cme-toolbar-items--integral-templates" : ""}${isPopupTabMode ? " cme-toolbar-items--popup-compact" : ""}`}>
              {toolbarChunks.map((chunk, chunkIndex) => (
                <div key={chunkIndex} className={`cme-symbol-subgroup${isPopupTabMode ? " cme-symbol-subgroup--compact" : ""}`}>
                  {chunk.map((item, i) => {
                    const isTouchedButton = activeMatrix?.type === item.insert;
                    if (activeGroup.isMatrix && !item.directInsert) {
                      return (
                        <div
                          key={i}
                          className="cme-matrix-btn-wrapper"
                        >
                          <button
                            type="button"
                            className={`cme-btn template${isPopupTabMode ? " cme-btn--compact" : ""}${item.cls ? ` ${item.cls}` : ""}${isTouchedButton ? " active" : ""}`}
                            title={item.insert}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (activeMatrix?.type === item.insert) {
                                setActiveMatrix(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveMatrix({
                                  type: item.insert,
                                  x: rect.left + rect.width / 2,
                                  y: rect.bottom
                                });
                              }
                            }}
                          >
                            {renderToolbarItemLabel(item)}
                          </button>
                        </div>
                      );
                    }

                    return (
                      <button
                        key={`${activeGroup.id || activeGroupIndex}-${chunkIndex * toolbarChunkSize + i}`}
                        type="button"
                        className={`cme-btn${activeGroup.isTemplate ? " template" : ""}${isPopupTabMode ? " cme-btn--compact" : ""}${item.cls ? ` ${item.cls}` : ""}`}
                        title={item.title || item.insert}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (item.action === "SPECIAL_CHARS") {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setShowSpecialChars({ x: rect.left, y: rect.bottom + 4 });
                          } else {
                            insertAtCursor(item.insert);
                          }
                        }}
                      >
                        {renderToolbarItemLabel(item)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div
            className="cme-mathfield-container"
            onMouseDown={(e) => {
              // If the click landed on the math-field itself, let the browser
              // handle focus + caret placement natively (do NOT preventDefault).
              // If click landed on container padding, preventDefault to stop
              // focus theft, then manually focus the math-field.
              if (e.target === popupMfRef.current ||
                (popupMfRef.current && popupMfRef.current.contains(e.target))) {
                return; // browser handles it
              }
              e.preventDefault();
              requestAnimationFrame(() => {
                try { popupMfRef.current?.focus(); } catch { /* Ignore focus races while closing. */ }
              });
            }}
          >
            <math-field
              ref={popupMfRef}
              class="cme-mathfield"
              letter-shape-style="upright"
              tabIndex={0}
              math-virtual-keyboard-policy="manual"
              placeholder={
                mode === "math"
                  ? ""
                  : ""
              }
            />
          </div>

          {/* cancel and insert div */}
          <div className="cme-popup-footer">
            <button type="button" className="cme-cancel-btn" onClick={handleClose}>
              Cancel
            </button>
            <button type="button" className="cme-insert-btn" onClick={handleInsert}>
              Insert
            </button>
          </div>

          {activeMatrix && (
            <MatrixHoverGrid
              matrixType={activeMatrix.type}
              x={activeMatrix.x}
              y={activeMatrix.y}
              onSelect={(r, c) => {
                handleMatrixInsert(activeMatrix.type, r, c);
                setActiveMatrix(null);
              }}
              onMouseEnter={() => { }}
              onMouseLeave={() => { }}
            />
          )}

          {showSpecialChars && (
            <SpecialCharacterModal
              isOpen={!!showSpecialChars}
              position={showSpecialChars}
              onClose={() => setShowSpecialChars(null)}
              onInsert={(char) => {
                insertAtCursor(char);
                setShowSpecialChars(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
