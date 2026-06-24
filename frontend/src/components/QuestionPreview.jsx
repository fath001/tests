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

function createPreviewMathField(latex) {
  const mf = document.createElement("math-field");
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
      "color:#f4f4fb",
      "--primary-color:#d8b4fe",
      "--caret-color:transparent",
      "--smart-fence-color:#d8b4fe",
    ].join(";"),
  );

  requestAnimationFrame(() => {
    if (mf.setValue) {
      mf.setValue(latex);
    } else {
      mf.value = latex;
    }
  });

  return mf;
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
          const latex =
            (typeof node.getValue === "function" && node.getValue()) ||
            node.value ||
            node.getAttribute("data-latex") ||
            node.textContent ||
            "";
          dest.appendChild(createPreviewMathField(latex));
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

export default function QuestionPreview({ value = "", className = "" }) {
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
      className={className}
      style={{ display: "inline", lineHeight: 1.7, verticalAlign: "middle", color: "#f2f2f8" }}
    />
  );
}
