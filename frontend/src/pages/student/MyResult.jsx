import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import "mathlive";
import Navbar from "../../components/Navbar";
import API from "../../services/api";

const MATH_OPEN = "§MATH§";
const MATH_CLOSE = "§END§";

function QuestionPreview({ value = "" }) {
  const containerRef = useRef(null);

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
        appendHtmlContent(el, value.slice(lastIndex, match.index));
      }

      el.appendChild(createPreviewMathField(match[1]));
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < value.length) {
      appendHtmlContent(el, value.slice(lastIndex));
    }

    el.querySelectorAll("span.math-tex").forEach((span) => {
      const latex = span.getAttribute("data-latex") || span.textContent || "";
      if (latex) {
        span.replaceWith(createPreviewMathField(latex));
      }
    });
  }, [value]);

  return (
    <span
      ref={containerRef}
      style={{ display: "inline", lineHeight: 1.7, verticalAlign: "middle" }}
    />
  );
}

const EMPTY_MATH_SLOT_LATEX = "\\phantom{0}";

function renderEmptyMathPlaceholders(latex = "") {
  const normalized = String(latex || "").replace(/\\placeholder\{\}/g, EMPTY_MATH_SLOT_LATEX);
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

function createPreviewMathField(latex) {
  const mf = document.createElement("math-field");
  scheduleMathFieldShadowStyles(mf);
  const displayLatex = renderEmptyMathPlaceholders(latex);
  mf.setAttribute("read-only", "");
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
      "--primary-color:#0f766e",
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function appendHtmlContent(parent, html) {
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
          dest.appendChild(node.cloneNode(true));
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
          ["style", "class", "colspan", "rowspan"].forEach((attr) => {
            if (node.getAttribute(attr)) {
              el.setAttribute(attr, node.getAttribute(attr));
            }
          });
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

function formatCompletedDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getPercentage(result) {
  if (!result?.totalQuestions) {
    return "0.0";
  }

  return ((result.correctAnswers / result.totalQuestions) * 100).toFixed(1);
}

export default function MyResult() {
  const [results, setResults] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const selectedExamId = searchParams.get("examId") || "";

  useEffect(() => {
    let ignore = false;

    async function loadResult() {
      try {
        const token = localStorage.getItem("token");
        const res = await API.get("/results/my-result", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setResults(res.data);
          setIsLoading(false);
        }
      } catch (error) {
        console.log(error);
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    loadResult();

    return () => {
      ignore = true;
    };
  }, []);

  const selectedResult = useMemo(() => {
    if (!selectedExamId) {
      return null;
    }

    return results.find((result) => (result.exam?._id || result.exam) === selectedExamId) || null;
  }, [results, selectedExamId]);

  useEffect(() => {
    let ignore = false;

    async function loadQuestions() {
      if (!selectedResult) {
        setQuestions([]);
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const res = await API.get(`/exams/${selectedExamId}/questions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setQuestions(res.data.questions);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadQuestions();

    return () => {
      ignore = true;
    };
  }, [selectedExamId, selectedResult]);

  if (selectedResult) {
    const answerMap = new Map(
      (selectedResult.answers || []).map((answer) => [answer.questionId, answer.selectedAnswer]),
    );

    return (
      <>
        <Navbar />
        <main className="page student-page stack">
          <section className="content-card student-review-shell">
            <header className="student-review-header">
              <div>
                <h1>Results Review: {selectedResult.exam?.name}</h1>
                <p>Completed on {formatCompletedDate(selectedResult.createdAt)}</p>
              </div>
              <div className="student-score-pill">
                Score: {selectedResult.correctAnswers} / {selectedResult.totalQuestions} (
                {getPercentage(selectedResult)}%)
              </div>
            </header>

            <div className="student-review-actions">
              <Link className="button secondary student-back-button" to="/student">
                Back to Portal Dashboard
              </Link>
            </div>

            <section className="student-question-review-list">
              {questions.map((question, index) => {
                const selectedAnswer = answerMap.get(question._id);
                const isCorrect = selectedAnswer === question.correctAnswer;

                return (
                  <article className="student-question-review-card" key={question._id}>
                    <div className="student-question-status">
                      Q{index + 1}. {isCorrect ? "Correct" : "Review"}
                    </div>

                    <div className="student-question-prompt">
                      <QuestionPreview value={question.question} />
                    </div>

                    <div className="student-answer-list">
                      {Object.entries(question.options || {})
                        .filter(([, value]) => value)
                        .map(([key, value]) => {
                        const isCorrectAnswer = question.correctAnswer === key;
                        const isSelected = selectedAnswer === key;

                        return (
                          <div
                            className={`student-answer-option ${isCorrectAnswer ? "correct" : ""} ${isSelected && !isCorrectAnswer ? "selected" : ""}`}
                            key={key}
                          >
                            <span className="student-answer-badge">{key}</span>
                            <span className="student-answer-text">{value}</span>
                            {isCorrectAnswer ? (
                              <span className="student-answer-state">Correct Answer</span>
                            ) : isSelected ? (
                              <span className="student-answer-state">Your Answer</span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </section>
          </section>
        </main>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Navbar />
        <main className="page student-page stack">
          <section className="content-card student-results-shell">
            <p className="admin-empty-state">Loading results...</p>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="page student-page stack">
        <section className="content-card student-results-shell">
          <div className="student-results-heading">
            <h1>My Results</h1>
          </div>

          {results.length > 0 ? (
            <div className="student-exam-grid">
              {results.map((result) => (
                <article className="student-exam-card" key={result._id}>
                  <div className="student-exam-top">
                    <span className="student-status done">Completed</span>
                    <strong>Score: {result.correctAnswers} / {result.totalQuestions}</strong>
                  </div>

                    <h3>{result.exam?.name}</h3>

                  <div className="student-exam-meta">
                    <p>Date: {formatShortDate(result.exam?.examDate)}</p>
                    <p>Questions: {result.totalQuestions} MCQs</p>
                  </div>

                  <Link
                    className="button secondary student-result-button"
                    to={`/my-result?examId=${result.exam?._id || result.exam}`}
                  >
                    View My Results
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-empty-state">No result found.</p>
          )}
        </section>
      </main>
    </>
  );
}
