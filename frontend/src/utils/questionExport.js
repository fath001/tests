import { MathMLToLaTeX } from "mathml-to-latex";

const MATH_OPEN = "\u00A7MATH\u00A7";
const MATH_CLOSE = "\u00A7END\u00A7";

const blockTags = new Set(["DIV", "P", "BR", "LI", "TR", "H1", "H2", "H3", "H4"]);

const superscriptMap = {
  0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};

const subscriptMap = {
  0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ",
  j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
};

function decodeHtml(value = "") {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function cleanLatex(latex = "") {
  return String(latex || "")
    .replace(/\\placeholder\{\}/g, "")
    .replace(/#\?/g, "□")
    .replace(/#0/g, "□")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBraceContent(value, startIndex) {
  if (value[startIndex] !== "{") return { content: "", end: startIndex };

  let depth = 0;
  let content = "";
  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") {
      depth += 1;
      if (depth > 1) content += char;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return { content, end: index };
      content += char;
    } else {
      content += char;
    }
  }

  return { content, end: value.length - 1 };
}

function mapScript(value, map) {
  return String(value || "")
    .split("")
    .map((char) => map[char] || char)
    .join("");
}

function consumeCommandWithBrace(source, command, formatter) {
  let result = "";

  for (let index = 0; index < source.length;) {
    if (source.startsWith(command, index)) {
      let cursor = index + command.length;
      while (source[cursor] === " ") cursor += 1;

      if (source[cursor] === "{") {
        const body = extractBraceContent(source, cursor);
        result += formatter(latexToSpreadsheetText(body.content));
        index = body.end + 1;
      } else if (source[cursor]) {
        result += formatter(latexToSpreadsheetText(source[cursor]));
        index = cursor + 1;
      } else {
        result += command;
        index = cursor;
      }
    } else {
      result += source[index];
      index += 1;
    }
  }

  return result;
}

function consumeTwoBraceCommand(source, command, formatter) {
  let result = "";

  for (let index = 0; index < source.length;) {
    if (source.startsWith(command, index)) {
      let cursor = index + command.length;
      while (source[cursor] === " ") cursor += 1;

      if (source[cursor] !== "{") {
        result += command;
        index = cursor;
        continue;
      }

      const first = extractBraceContent(source, cursor);
      cursor = first.end + 1;
      while (source[cursor] === " ") cursor += 1;

      if (source[cursor] !== "{") {
        result += formatter(first.content, "");
        index = cursor;
        continue;
      }

      const second = extractBraceContent(source, cursor);
      result += formatter(first.content, latexToSpreadsheetText(second.content));
      index = second.end + 1;
    } else {
      result += source[index];
      index += 1;
    }
  }

  return result;
}

export function latexToSpreadsheetText(latex = "") {
  let value = cleanLatex(latex);
  if (!value) return "";

  value = value
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\;/g, " ")
    .replace(/\\:/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\ /g, " ");

  value = consumeTwoBraceCommand(value, "\\htmlStyle", (_style, body) => body);
  value = consumeTwoBraceCommand(value, "\\class", (_className, body) => body);
  value = consumeTwoBraceCommand(value, "\\raisebox", (_amount, body) => body);
  value = consumeCommandWithBrace(value, "\\sqrt", (body) => `√(${body})`);
  value = consumeCommandWithBrace(value, "\\text", (body) => body);
  value = consumeCommandWithBrace(value, "\\mathrm", (body) => body);
  value = consumeCommandWithBrace(value, "\\mathbf", (body) => body);
  value = consumeCommandWithBrace(value, "\\mathit", (body) => body);

  let result = "";
  for (let index = 0; index < value.length;) {
    if (value.startsWith("\\frac", index)) {
      let cursor = index + "\\frac".length;
      while (value[cursor] === " ") cursor += 1;

      let numerator = "";
      let denominator = "";
      if (value[cursor] === "{") {
        const body = extractBraceContent(value, cursor);
        numerator = body.content;
        cursor = body.end + 1;
      } else {
        numerator = value[cursor] || "";
        cursor += 1;
      }

      while (value[cursor] === " ") cursor += 1;
      if (value[cursor] === "{") {
        const body = extractBraceContent(value, cursor);
        denominator = body.content;
        cursor = body.end + 1;
      } else {
        denominator = value[cursor] || "";
        cursor += 1;
      }

      result += `${latexToSpreadsheetText(numerator)}⁄${latexToSpreadsheetText(denominator)}`;
      index = cursor;
    } else if (value.startsWith("\\xrightarrow", index) || value.startsWith("\\xleftarrow", index)) {
      const isRight = value.startsWith("\\xrightarrow", index);
      let cursor = index + (isRight ? "\\xrightarrow".length : "\\xleftarrow".length);
      while (value[cursor] === " ") cursor += 1;

      let label = "";
      if (value[cursor] === "{") {
        const body = extractBraceContent(value, cursor);
        label = latexToSpreadsheetText(body.content);
        cursor = body.end + 1;
      }

      result += label ? `${isRight ? "⟶" : "⟵"}[${label}]` : isRight ? "→" : "←";
      index = cursor;
    } else if (value[index] === "^" || value[index] === "_") {
      const isSup = value[index] === "^";
      let cursor = index + 1;
      let script = "";

      if (value[cursor] === "{") {
        const body = extractBraceContent(value, cursor);
        script = body.content;
        cursor = body.end + 1;
      } else {
        script = value[cursor] || "";
        cursor += 1;
      }

      result += mapScript(latexToSpreadsheetText(script), isSup ? superscriptMap : subscriptMap);
      index = cursor;
    } else {
      result += value[index];
      index += 1;
    }
  }

  return result
    .replace(/\\rightarrow/g, "→")
    .replace(/\\leftarrow/g, "←")
    .replace(/\\leftrightarrow/g, "↔")
    .replace(/\\Rightarrow/g, "⇒")
    .replace(/\\Leftarrow/g, "⇐")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\mp/g, "∓")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\neq?/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\infty/g, "∞")
    .replace(/\\sum/g, "Σ")
    .replace(/\\prod/g, "Π")
    .replace(/\\int/g, "∫")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ")
    .replace(/\\theta/g, "θ")
    .replace(/\\lambda/g, "λ")
    .replace(/\\mu/g, "μ")
    .replace(/\\pi/g, "π")
    .replace(/\\rho/g, "ρ")
    .replace(/\\sigma/g, "σ")
    .replace(/\\phi/g, "φ")
    .replace(/\\omega/g, "ω")
    .replace(/\\\{/g, "\uE001")
    .replace(/\\\}/g, "\uE002")
    .replace(/\\[a-zA-Z]+\*?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\uE001/g, "{")
    .replace(/\uE002/g, "}")
    .replace(/\s+/g, " ")
    .trim();
}

export function mathmlToLatex(mathml = "") {
  if (!mathml) return "";

  try {
    return cleanLatex(MathMLToLaTeX.convert(mathml));
  } catch (error) {
    console.log("Failed to convert MathML to LaTeX", error);
    return "";
  }
}

function tableToAsciiTable(node, converterFn) {
  const trs = Array.from(node.querySelectorAll("tr"));
  if (trs.length === 0) return "";

  const grid = trs.map((tr) => {
    const cells = Array.from(tr.querySelectorAll("th, td"));
    return cells.map((cell) => {
      const cellContent = Array.from(cell.childNodes).map(converterFn).join("");
      return cellContent.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    });
  });

  if (grid.length === 0 || grid[0].length === 0) return "";

  const colCount = grid.reduce((max, r) => Math.max(max, r.length), 0);
  const maxLenPerCol = new Array(colCount).fill(0);

  grid.forEach((row) => {
    row.forEach((cellText, colIdx) => {
      maxLenPerCol[colIdx] = Math.max(maxLenPerCol[colIdx], (cellText || "").length);
    });
  });

  const colInnerWidths = maxLenPerCol.map((maxLen) => {
    return maxLen === 1 ? 5 : maxLen + 2;
  });

  const divider = "+" + colInnerWidths.map((w) => "-".repeat(w)).join("+") + "+";

  const asciiRows = [divider];

  grid.forEach((row) => {
    const formattedCells = [];
    for (let i = 0; i < colCount; i++) {
      const cellText = row[i] || "";
      const targetWidth = colInnerWidths[i];
      const totalPadding = targetWidth - cellText.length;
      const leftPadding = Math.floor(totalPadding / 2);
      const rightPadding = Math.ceil(totalPadding / 2);

      const padded = " ".repeat(leftPadding) + cellText + " ".repeat(rightPadding);
      formattedCells.push(padded);
    }
    asciiRows.push("|" + formattedCells.join("|") + "|");
    asciiRows.push(divider);
  });

  return "\n" + asciiRows.join("\n") + "\n";
}

function nodeToSpreadsheetText(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.nodeName.toUpperCase();

  if (tag === "MATH-FIELD") {
    const latex =
      (typeof node.getValue === "function" && node.getValue()) ||
      node.value ||
      node.getAttribute("data-latex") ||
      node.getAttribute("value") ||
      node.textContent ||
      "";
    return ` \u200E${latexToSpreadsheetText(latex)}\u200E `;
  }

  if (tag === "SPAN" && node.classList.contains("math-tex")) {
    const latex = node.getAttribute("data-latex") || node.getAttribute("value") || node.textContent || "";
    return ` \u200E${latexToSpreadsheetText(decodeHtml(latex))}\u200E `;
  }

  if (tag === "MATH") {
    const latex = mathmlToLatex(node.outerHTML);
    return latex ? ` \u200E${latexToSpreadsheetText(latex)}\u200E ` : node.textContent || "";
  }

  if (tag === "TABLE") {
    return tableToAsciiTable(node, nodeToSpreadsheetText);
  }

  if (tag === "SUP") {
    const text = Array.from(node.childNodes).map(nodeToSpreadsheetText).join("");
    return mapScript(text, superscriptMap);
  }

  if (tag === "SUB") {
    const text = Array.from(node.childNodes).map(nodeToSpreadsheetText).join("");
    return mapScript(text, subscriptMap);
  }

  if (tag === "BR") {
    return "\n";
  }

  const text = Array.from(node.childNodes).map(nodeToSpreadsheetText).join("");
  if (tag === "LI") return `\n- ${text}\n`;
  if (blockTags.has(tag)) return `${text}\n`;
  if (tag === "TD" || tag === "TH") return `${text}\t`;
  return text;
}


export function questionHtmlToSpreadsheetText(html = "") {
  if (!html || typeof html !== "string") return "";

  const chunks = [];
  const regex = new RegExp(`${MATH_OPEN}([\\s\\S]*?)${MATH_CLOSE}`, "g");
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      chunks.push(questionHtmlFragmentToSpreadsheetText(html.slice(lastIndex, match.index)));
    }

    chunks.push(` \u200E${latexToSpreadsheetText(match[1])}\u200E `);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    chunks.push(questionHtmlFragmentToSpreadsheetText(html.slice(lastIndex)));
  }

  const result = chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return sanitizeForSpreadsheet(result);
}


function questionHtmlFragmentToSpreadsheetText(html = "") {
  const template = document.createElement("template");
  template.innerHTML = html;

  return Array.from(template.content.childNodes)
    .map(nodeToSpreadsheetText)
    .join("");
}

const GREEK_MAP = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε",
  zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ",
  mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ",
  upsilon: "υ", phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω"
};

const SYMBOL_MAP = {
  pm: "±", mp: "∓", times: "×", div: "÷", backslash: "\\", neq: "≠", ne: "≠",
  leq: "≤", le: "≤", geq: "≥", ge: "≥", approx: "≈", infty: "∞", partial: "∂",
  nabla: "∇", in: "∈", notin: "∉", subset: "⊂", cup: "∪", cap: "∩",
  emptyset: "∅", empty: "∅", subseteq: "⊆", supseteq: "⊇",
  forall: "∀", exists: "∃", neg: "¬", land: "∧", lor: "∨",
  rightarrow: "→", to: "→", leftarrow: "←", gets: "←",
  leftrightarrow: "↔", Rightarrow: "⇒", Leftarrow: "⇐",
  Leftrightarrow: "⇔", iff: "⇔", uparrow: "↑", downward: "↓",
  downarrow: "↓", cdot: "·", prime: "′",
  mathbbR: "ℝ", mathbbZ: "ℤ", mathbbN: "ℕ", mathbbQ: "ℚ",
  mathbbC: "ℂ",
  int: "∫", iint: "∬", iiint: "∭", oint: "∮", oiint: "∯",
  sum: "∑", prod: "∏", lim: "lim",
  sin: "sin", cos: "cos", tan: "tan", cot: "cot", sec: "sec", csc: "csc",
  log: "log", ln: "ln", exp: "exp",
  sim: "∼", cong: "≅", propto: "∝", equiv: "≡", gg: "≫", ll: "≪",
  succ: "≻", prec: "≺", lhd: "⊲", rhd: "▷", oplus: "⊕", otimes: "⊗",
  odot: "⊙", aleph: "ℵ", degree: "°", ast: "*", bullet: "•", bigcirc: "○"
};

export function sanitizeForSpreadsheet(text = "") {
  if (!text || typeof text !== "string") return "";
  const trimmed = text.trim();
  if (trimmed.startsWith("=") || trimmed.startsWith("+") || trimmed.startsWith("-") || trimmed.startsWith("@")) {
    return `'${text}`;
  }
  return text;
}


const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴲ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ',
  '□': 'ⁿ'
};

const SUBSCRIPT_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', 'y': 'ᵧ'
};

function toSuperscript(str) {
  let res = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (SUPERSCRIPT_MAP[char]) {
      res += SUPERSCRIPT_MAP[char];
    } else {
      return `^(${str})`;
    }
  }
  return res;
}

function toSubscript(str) {
  let res = "";
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (SUBSCRIPT_MAP[char]) {
      res += SUBSCRIPT_MAP[char];
    } else {
      return `_(${str})`;
    }
  }
  return res;
}

export function latexToUnicodeMath(str = "") {
  str = String(str || "")
    .replace(/\\placeholder\{\}/g, "□")
    .replace(/#\?/g, "□")
    .replace(/#0/g, "□")
    .trim();

  // Normalize Nth Root templates {}^{n}\!\sqrt{x} -> \sqrt[n]{x}
  str = str
    .replace(/\{\}\^\{([^{}]+)\}\\!\\sqrt/g, "\\sqrt[$1]")
    .replace(/\{\}\^([a-zA-Z0-9□])\\!\\sqrt/g, "\\sqrt[$1]");

  let pos = 0;

  function peek() {
    return str[pos] || "";
  }

  function next() {
    return str[pos++];
  }

  function parseExpression() {
    let nodes = [];
    while (pos < str.length) {
      let char = peek();
      if (char === "}" || char === "]") {
        break;
      }

      let parsedNode = parseSingleNode();
      if (parsedNode) {
        if (parsedNode.type === "script_indicator") {
          let lastNode = nodes[nodes.length - 1];
          if (lastNode && (lastNode.type === "script" || lastNode.type === "command" || lastNode.type === "text" || lastNode.type === "group" || lastNode.type === "matrix")) {
            if (lastNode.type === "script") {
              if (parsedNode.isSup) lastNode.sup = parsedNode.node;
              else lastNode.sub = parsedNode.node;
            } else {
              nodes[nodes.length - 1] = {
                type: "script",
                base: lastNode,
                sup: parsedNode.isSup ? parsedNode.node : null,
                sub: parsedNode.isSup ? null : parsedNode.node
              };
            }
          } else {
            nodes.push({
              type: "script",
              base: { type: "text", value: "" },
              sup: parsedNode.isSup ? parsedNode.node : null,
              sub: parsedNode.isSup ? null : parsedNode.node
            });
          }
        } else {
          nodes.push(parsedNode);
        }
      }
    }
    return nodes;
  }

  function parseSingleNode() {
    if (pos >= str.length) return null;

    let char = peek();
    if (char === "}" || char === "]") return null;

    if (char === "{" || char === "[") {
      next();
      let isBrace = char === "{";
      let groupNodes = parseExpression();
      if (peek() === (isBrace ? "}" : "]")) next();
      return { type: "group", children: groupNodes };
    }

    if (char === "\\") {
      next();
      let cmd = "";
      while (pos < str.length && /[a-zA-Z]/.test(peek())) {
        cmd += next();
      }
      if (!cmd) {
        let nextChar = next();
        if (nextChar === "{" || nextChar === "}") {
          return { type: "text", value: nextChar };
        } else if (nextChar === "," || nextChar === ";" || nextChar === "!" || nextChar === " ") {
          return { type: "text", value: " " };
        } else {
          return { type: "command", name: nextChar, args: [] };
        }
      }

      if (cmd === "begin") {
        let args = [];
        let tempPos = pos;
        while (str[tempPos] === " ") tempPos++;
        if (str[tempPos] === "{") {
          pos = tempPos + 1;
          let mandNodes = parseExpression();
          if (peek() === "}") next();
          args.push({ type: "mandatory", children: mandNodes });
        }
        let envName = args[0] ? evaluateNodes(args[0].children).trim() : "";
        if (envName === "array") {
          let skipPos = pos;
          while (str[skipPos] === " ") skipPos++;
          if (str[skipPos] === "{") {
            pos = skipPos + 1;
            parseExpression();
            if (peek() === "}") next();
          }
        }
        let rows = [];
        let currentRow = [ { type: "group", children: [] } ];

        while (pos < str.length) {
          let tempPos = pos;
          while (str[tempPos] === " ") tempPos++;
          if (str.startsWith("\\end", tempPos)) {
            pos = tempPos + "\\end".length;
            while (str[pos] === " ") pos++;
            if (str[pos] === "{") {
              pos++;
              let endEnv = parseExpression();
              if (peek() === "}") next();
            }
            break;
          }

          if (peek() === "&") {
            next();
            currentRow.push({ type: "group", children: [] });
          } else if (str.startsWith("\\\\", pos)) {
            pos += 2;
            let skipPos = pos;
            while (str[skipPos] === " ") skipPos++;
            if (str[skipPos] === "[") {
              pos = skipPos + 1;
              let optNodes = parseExpression();
              if (peek() === "]") next();
            }
            rows.push(currentRow);
            currentRow = [ { type: "group", children: [] } ];
          } else {
            let item = parseSingleNode();
            if (item) {
              currentRow[currentRow.length - 1].children.push(item);
            }
          }
        }
        rows.push(currentRow);
        return { type: "matrix", env: envName, rows: rows };
      }

      if (cmd === "hskip" || cmd === "hspace" || cmd === "kern") {
        let tempPos = pos;
        while (str[tempPos] === " ") tempPos++;
        let dimMatch = str.slice(tempPos).match(/^[-+]?[0-9]*\.?[0-9]+(px|em|mu|pt|ex|in|cm|mm)/i);
        if (dimMatch) {
          pos = tempPos + dimMatch[0].length;
        }
      }

      // Parse arguments
      let args = [];
      while (true) {
        let tempPos = pos;
        while (str[tempPos] === " ") tempPos++;
        let nextNonSpace = str[tempPos];
        if (nextNonSpace === "[") {
          pos = tempPos + 1;
          let optNodes = parseExpression();
          if (peek() === "]") next();
          args.push({ type: "optional", children: optNodes });
        } else if (nextNonSpace === "{") {
          pos = tempPos + 1;
          let mandNodes = parseExpression();
          if (peek() === "}") next();
          args.push({ type: "mandatory", children: mandNodes });
        } else {
          break;
        }
      }

      return { type: "command", name: cmd, args: args };
    }

    if (char === "^" || char === "_") {
      next();
      let isSup = char === "^";
      let nextPos = pos;
      while (str[nextPos] === " ") nextPos++;
      let argNode;
      if (str[nextPos] === "{" || str[nextPos] === "[") {
        pos = nextPos + 1;
        let isBrace = str[nextPos] === "{";
        let groupNodes = parseExpression();
        if (peek() === (isBrace ? "}" : "]")) next();
        argNode = { type: "group", children: groupNodes };
      } else {
        pos = nextPos;
        argNode = { type: "text", value: next() };
      }
      return { type: "script_indicator", isSup: isSup, node: argNode };
    }

    return { type: "text", value: next() };
  }

  function evaluateNodes(nodes) {
    return nodes.map(evaluateNode).join("");
  }

  const hasClass = (n, cls) => {
    if (!n) return false;
    if (n.type === "command" && n.name === "class") {
      const clsName = n.args[0] ? evaluateNode(n.args[0]) : "";
      if (clsName.includes(cls)) return true;
    }
    if (n.type === "matrix" && n.rows) {
      if (n.rows.some(row => row.some(cell => hasClass(cell, cls)))) return true;
    }
    if (n.children && n.children.some(c => hasClass(c, cls))) return true;
    if (n.args && n.args.some(a => hasClass(a, cls))) return true;
    return false;
  };

  function evaluateNode(node) {
    if (!node) return "";
    switch (node.type) {
      case "text":
        return node.value;
      case "group":
        return evaluateNodes(node.children);
      case "script": {
        let baseStr = evaluateNode(node.base);
        let supStr = node.sup ? evaluateNode(node.sup) : "";
        let subStr = node.sub ? evaluateNode(node.sub) : "";

        let res = baseStr;
        if (subStr) {
          let subscriptIndex = toSubscript(subStr);
          if (subscriptIndex.startsWith("_(")) {
            res += `_(${subStr})`;
          } else {
            res += subscriptIndex;
          }
        }
        if (supStr) {
          let superscriptIndex = toSuperscript(supStr);
          if (superscriptIndex.startsWith("^(")) {
            res += `^(${supStr})`;
          } else {
            res += superscriptIndex;
          }
        }
        return res;
      }
      case "matrix": {
        let env = node.env;

        // Check if this matrix is actually a mixed fraction template:
        if (hasClass(node, "cme-mixed-fraction-whole")) {
          let whole = "";
          let num = "";
          let den = "";

          const findMixedFractionSlots = (n) => {
            if (!n) return;
            if (n.type === "command" && n.name === "class") {
              const clsName = n.args[0] ? evaluateNode(n.args[0]).trim() : "";
              const clsBody = n.args[1] ? evaluateNode(n.args[1]).trim() : "";
              if (clsName.includes("cme-mixed-fraction-whole")) whole = clsBody;
              else if (clsName.includes("cme-mixed-fraction-slot")) num = clsBody;
              else if (clsName.includes("cme-mixed-fraction-denominator")) den = clsBody;
            } else if (n.type === "matrix" && n.rows) {
              n.rows.forEach(row => row.forEach(cell => findMixedFractionSlots(cell)));
            } else if (n.children) {
              n.children.forEach(findMixedFractionSlots);
            } else if (n.args) {
              n.args.forEach(findMixedFractionSlots);
            }
          };

          findMixedFractionSlots(node);
          return `${whole} ${num}/${den}`;
        }

        // Check if this matrix is a split fraction template:
        if (hasClass(node, "cme-split-fraction-slot")) {
          let lefts = [];
          let num = "";
          let den = "";

          const findSplitFractionSlots = (n) => {
            if (!n) return;
            if (n.type === "command" && n.name === "class") {
              const clsName = n.args[0] ? evaluateNode(n.args[0]).trim() : "";
              const clsBody = n.args[1] ? evaluateNode(n.args[1]).trim() : "";
              if (clsName.includes("cme-split-fraction-left")) lefts.push(clsBody);
              else if (clsName.includes("cme-split-fraction-slot")) num = clsBody;
              else if (clsName.includes("cme-split-fraction-denominator")) den = clsBody;
            } else if (n.type === "matrix" && n.rows) {
              n.rows.forEach(row => row.forEach(cell => findSplitFractionSlots(cell)));
            } else if (n.children) {
              n.children.forEach(findSplitFractionSlots);
            } else if (n.args) {
              n.args.forEach(findSplitFractionSlots);
            }
          };

          findSplitFractionSlots(node);
          return `${lefts[0] || ""} ${num}/${lefts[1] || ""} ${den}`.trim().replace(/\s+/g, " ");
        }

        let rowStrings = node.rows.map(row => {
          return row.map(cell => evaluateNodes(cell.children).trim()).join(", ");
        });
        let body = rowStrings.join("; ");

        if (env === "bmatrix") {
          return `[${body}]`;
        }
        if (env === "pmatrix") {
          return `(${body})`;
        }
        if (env === "vmatrix") {
          return `|${body}|`;
        }
        return `[${body}]`;
      }
      case "command": {
        const name = node.name;
        if (GREEK_MAP[name]) {
          return GREEK_MAP[name];
        }
        if (SYMBOL_MAP[name]) {
          return SYMBOL_MAP[name];
        }

        if (name === "frac") {
          let hasColumnLayout = false;
          let matrixNode = null;

          const findMatrix = (n) => {
            if (!n) return;
            if (n.type === "matrix") {
              if (hasClass(n, "cme-column-layout-slot-1")) {
                hasColumnLayout = true;
                matrixNode = n;
              }
            } else if (n.children) {
              n.children.forEach(findMatrix);
            } else if (n.args) {
              n.args.forEach(findMatrix);
            }
          };
          findMatrix(node.args[0]);

          if (hasColumnLayout && matrixNode) {
            let slot1 = matrixNode.rows[0] ? matrixNode.rows[0].map(c => evaluateNodes(c.children).trim()).join(" ") : "";
            let slot2 = matrixNode.rows[1] ? matrixNode.rows[1].map(c => evaluateNodes(c.children).trim()).join(" ") : "";
            let slot3 = node.args[1] ? evaluateNode(node.args[1]).trim() : "";

            slot2 = slot2.replace(/\\\\/g, "").trim();
            if (slot2.startsWith("\\")) {
              slot2 = latexToUnicodeMath(slot2).trim();
            }
            const hasOp = /^[+\-−×÷=]/.test(slot2) || slot2.startsWith("×") || slot2.startsWith("÷") || slot2.startsWith("±") || slot2.startsWith("∓");
            if (hasOp) {
              return `${slot1} ${slot2} = ${slot3}`;
            } else {
              return `${slot1} + ${slot2} = ${slot3}`;
            }
          }

          let num = node.args[0] ? evaluateNode(node.args[0]) : "";
          let den = node.args[1] ? evaluateNode(node.args[1]) : "";

          const needsParens = (str) => {
            if (!str) return false;
            str = str.trim();
            if (str.length <= 1) return false;
            if (/^[a-zA-Z0-9α-ωΑ-Ω]+$/.test(str)) return false;
            return true;
          };

          let formattedNum = needsParens(num) ? `(${num})` : num;
          let formattedDen = needsParens(den) ? `(${den})` : den;
          return `${formattedNum}/${formattedDen}`;
        }

        if (name === "sqrt") {
          let index = "";
          let body = "";
          if (node.args.length === 2) {
            index = evaluateNode(node.args[0]);
            body = evaluateNode(node.args[1]);
          } else if (node.args.length === 1) {
            body = evaluateNode(node.args[0]);
          }

          const needsParens = (str) => {
            if (!str) return false;
            str = str.trim();
            if (str.length <= 1) return false;
            if (/^[a-zA-Z0-9α-ωΑ-Ω]+$/.test(str)) return false;
            return true;
          };

          let formattedBody = needsParens(body) ? `(${body})` : body;

          if (index) {
            let superscriptIndex = toSuperscript(index);
            if (superscriptIndex.startsWith("^(")) {
              superscriptIndex = index;
            }
            return `${superscriptIndex}√${formattedBody}`;
          }
          return `√${formattedBody}`;
        }

        if (name === "left" || name === "right") {
          return "";
        }

        if (name === "class" || name === "htmlStyle") {
          let arg0 = node.args[0] ? evaluateNode(node.args[0]) : "";
          let body = node.args[1] ? evaluateNode(node.args[1]) : "";

          if (name === "class") {
            const className = arg0.trim();
            if (className.includes("cme-longdiv-wrapper")) {
              let divisor = "";
              let quotient = "";
              let dividend = "";
              let remainder = "";

              const findDivParts = (n) => {
                if (!n) return;
                if (n.type === "command" && n.name === "class") {
                  const clsName = n.args[0] ? evaluateNode(n.args[0]).trim() : "";
                  const clsBody = n.args[1] ? evaluateNode(n.args[1]).trim() : "";
                  if (clsName.includes("cme-longdiv-divisor")) divisor = clsBody;
                  else if (clsName.includes("cme-longdiv-quotient")) quotient = clsBody;
                  else if (clsName.includes("cme-longdiv-dividend")) dividend = clsBody;
                  else if (clsName.includes("cme-longdiv-remainder")) remainder = clsBody;
                } else if (n.type === "matrix" && n.rows) {
                  n.rows.forEach(row => row.forEach(cell => findDivParts(cell)));
                } else if (n.children) {
                  n.children.forEach(findDivParts);
                } else if (n.args) {
                  n.args.forEach(findDivParts);
                }
              };

              findDivParts(node.args[1]);
              let res = `${divisor} ⟌ ${dividend}`;
              if (quotient) res += ` (quotient: ${quotient})`;
              if (remainder) res += ` (remainder: ${remainder})`;
              return res;
            }
            if (className.includes("cme-cases-left-template")) {
              if (body.startsWith("{") && body.endsWith("}")) return body;
              if ((body.startsWith("[") || body.startsWith("(")) && (body.endsWith("]") || body.endsWith(")"))) return `{${body.slice(1, -1)}}`;
              return `{${body}}`;
            }
            if (className.includes("cme-cases-right-template")) {
              if (body.endsWith("}")) return body;
              if (body.startsWith("{") && body.endsWith("}")) return body.slice(1);
              if ((body.startsWith("[") || body.startsWith("(")) && (body.endsWith("]") || body.endsWith(")"))) return `${body.slice(1, -1)}}`;
              return `${body}}`;
            }
            if (className.includes("cme-bmatrix-")) {
              if (body.startsWith("[") && body.endsWith("]")) return body;
              if (body.startsWith("(") && body.endsWith(")")) return `[${body.slice(1, -1)}]`;
              return `[${body}]`;
            }
            if (className.includes("cme-pmatrix-")) {
              if (body.startsWith("(") && body.endsWith(")")) return body;
              if (body.startsWith("[") && body.endsWith("]")) return `(${body.slice(1, -1)})`;
              return `(${body})`;
            }
            if (className.includes("cme-vmatrix-")) {
              if (body.startsWith("|") && body.endsWith("|")) return body;
              if ((body.startsWith("[") || body.startsWith("(")) && (body.endsWith("]") || body.endsWith(")"))) return `|${body.slice(1, -1)}|`;
              return `|${body}|`;
            }
          }
          return body;
        }

        if (name === "text" || name === "mathrm" || name === "mathbf" || name === "mathit" || name === "ce") {
          return node.args[0] ? evaluateNode(node.args[0]) : "";
        }

        if (name === "mathbb") {
          let body = node.args[0] ? evaluateNode(node.args[0]).trim() : "";
          const map = {
            'A': '𝔸', 'B': '𝔹', 'C': 'ℂ', 'D': '𝔻', 'E': '𝔼', 'F': '𝔽',
            'G': '𝔾', 'H': 'ℍ', 'I': '𝕀', 'J': '𝕁', 'K': '𝕂', 'L': '𝕃',
            'M': '𝕄', 'N': 'ℕ', 'O': '𝕆', 'P': 'ℙ', 'Q': 'ℚ', 'R': 'ℝ',
            'S': '𝕊', 'T': '𝕋', 'U': '𝕌', 'V': '𝕍', 'W': '𝕎', 'X': '𝕏',
            'Y': '𝕐', 'Z': 'ℤ',
            'a': '𝕒', 'b': '𝕓', 'c': '𝕔', 'd': '𝕕', 'e': '𝕖', 'f': '𝕗',
            'g': '𝕘', 'h': '𝕙', 'i': '𝕚', 'j': '𝕛', 'k': '𝕜', 'l': '𝕝',
            'm': '𝕞', 'n': '𝕟', 'o': '𝕠', 'p': '𝕡', 'q': '𝕢', 'r': '𝕣',
            's': '𝕤', 't': '𝕥', 'u': '𝕦', 'v': '𝕧', 'w': '𝕨', 'x': '𝕩',
            'y': '𝕪', 'z': '𝕫'
          };
          let res = "";
          for (let i = 0; i < body.length; i++) {
            const char = body[i];
            res += map[char] || char;
          }
          return res;
        }

        if (name === "overset") {
          let top = node.args[0] ? evaluateNode(node.args[0]) : "";
          let base = node.args[1] ? evaluateNode(node.args[1]) : "";
          top = top.replace(/\$/g, "").trim();
          base = base.replace(/\$/g, "").trim();
          return `${base}(${top})`;
        }

        if (name === "underset") {
          let bottom = node.args[0] ? evaluateNode(node.args[0]) : "";
          let base = node.args[1] ? evaluateNode(node.args[1]) : "";
          bottom = bottom.replace(/\$/g, "").trim();
          base = base.replace(/\$/g, "").trim();
          return `${base}(${bottom})`;
        }

        if (name === "raisebox") {
          if (node.args.length === 2) {
            return evaluateNode(node.args[1]);
          }
          return node.args[0] ? evaluateNode(node.args[0]) : "";
        }

        if (name === "rule") {
          return "";
        }

        if (name === "hskip" || name === "hspace" || name === "kern") {
          return " ";
        }

        if (name === "hphantom" || name === "vphantom" || name === "phantom") {
          return " ";
        }

        if (name === "displaystyle" || name === "limits" || name === "nolimits") {
          if (node.args.length > 0) {
            return node.args.map(evaluateNode).join("");
          }
          return "";
        }

        if (name === "vec" || name === "overrightharpoon" || name === "overrightarrow") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          return body ? body + "\u20D7" : "";
        }

        if (name === "hat" || name === "tilde" || name === "widetilde") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          const accent = name === "hat" ? "\u0302" : "\u0303";
          return body ? body + accent : "";
        }

        if (name === "bar" || name === "overline") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          return body ? body + "\u0304" : "";
        }

        if (name === "overleftrightarrow") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          return body ? body + "\u20E1" : "";
        }

        if (name === "dot") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          return body ? body + "\u0307" : "";
        }

        if (name === "ddot") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          return body ? body + "\u0308" : "";
        }

        if (name === "style" || name === "mathop") {
          return node.args[node.args.length - 1] ? evaluateNode(node.args[node.args.length - 1]) : "";
        }

        if (name === "mkern") {
          return "";
        }

        if (name === "cancel") {
          let body = node.args[0] ? evaluateNode(node.args[0]) : "";
          return `cancel(${body})`;
        }

        if (name === "xrightarrow" || name === "xleftarrow") {
          let top = "";
          let bottom = "";
          for (const arg of node.args) {
            if (arg.type === "optional") bottom = evaluateNode(arg);
            else if (arg.type === "mandatory") top = evaluateNode(arg);
          }
          const dirChar = name === "xrightarrow" ? "→" : "←";
          if (top && bottom) return ` ⎯${dirChar}⎯(${top} / ${bottom}) `;
          if (top) return ` ⎯${dirChar}⎯(${top}) `;
          if (bottom) return ` ⎯${dirChar}⎯( / ${bottom}) `;
          return ` ${dirChar} `;
        }

        if (node.args.length > 0) {
          return node.args.map(evaluateNode).join("");
        }
        return "";
      }
      case "optional":
      case "mandatory":
        return evaluateNodes(node.children);
      default:
        return "";
    }
  }

  const rootNodes = parseExpression();
  return evaluateNodes(rootNodes);
}

function nodeToUnicodeMath(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const tag = node.nodeName.toUpperCase();

  if (tag === "MATH-FIELD") {
    const latex =
      (typeof node.getValue === "function" && node.getValue()) ||
      node.value ||
      node.getAttribute("data-latex") ||
      node.getAttribute("value") ||
      node.textContent ||
      "";
    return ` \u200E${latexToUnicodeMath(latex)}\u200E `;
  }

  if (tag === "SPAN" && node.classList.contains("math-tex")) {
    const latex = node.getAttribute("data-latex") || node.getAttribute("value") || node.textContent || "";
    return ` \u200E${latexToUnicodeMath(decodeHtml(latex))}\u200E `;
  }

  if (tag === "MATH") {
    const latex = mathmlToLatex(node.outerHTML);
    return latex ? ` \u200E${latexToUnicodeMath(latex)}\u200E ` : node.textContent || "";
  }

  if (tag === "TABLE") {
    return tableToAsciiTable(node, nodeToUnicodeMath);
  }

  if (tag === "SUP") {
    const text = Array.from(node.childNodes).map(nodeToUnicodeMath).join("");
    return toSuperscript(text);
  }

  if (tag === "SUB") {
    const text = Array.from(node.childNodes).map(nodeToUnicodeMath).join("");
    return toSubscript(text);
  }

  if (tag === "BR") {
    return "\n";
  }

  const text = Array.from(node.childNodes).map(nodeToUnicodeMath).join("");
  if (tag === "LI") return `\n- ${text}\n`;
  if (blockTags.has(tag)) return `${text}\n`;
  if (tag === "TD" || tag === "TH") return `${text}\t`;
  return text;
}

export function questionHtmlToUnicodeMath(html = "") {
  if (!html || typeof html !== "string") return "";

  const chunks = [];
  const regex = new RegExp(`${MATH_OPEN}([\\s\\S]*?)${MATH_CLOSE}`, "g");
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      chunks.push(questionHtmlFragmentToUnicodeMath(html.slice(lastIndex, match.index)));
    }

    chunks.push(` \u200E${latexToUnicodeMath(match[1])}\u200E `);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < html.length) {
    chunks.push(questionHtmlFragmentToUnicodeMath(html.slice(lastIndex)));
  }

  const result = chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return sanitizeForSpreadsheet(result);
}

function questionHtmlFragmentToUnicodeMath(html = "") {
  const template = document.createElement("template");
  template.innerHTML = html;

  return Array.from(template.content.childNodes)
    .map(nodeToUnicodeMath)
    .join("");
}

export function extractTablesFromHtml(html = "") {
  if (!html || typeof html !== "string") return [];
  const template = document.createElement("template");
  template.innerHTML = html;
  const tables = Array.from(template.content.querySelectorAll("table"));

  return tables.map((table) => {
    const trs = Array.from(table.querySelectorAll("tr"));
    const grid = trs.map((tr) => {
      const cells = Array.from(tr.querySelectorAll("th, td"));
      return cells.map((cell) => {
        const isHeader = cell.tagName.toUpperCase() === "TH" || !!cell.closest("thead");
        const text = questionHtmlFragmentToUnicodeMath(cell.innerHTML)
          .replace(/[\r\n]+/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        const align = cell.style.textAlign || cell.getAttribute("align") || (isHeader ? "center" : "left");
        const bold = isHeader || cell.querySelector("b, strong") !== null;
        return { text, isHeader, bold, align };
      });
    });

    return {
      rowCount: grid.length,
      colCount: grid.reduce((max, r) => Math.max(max, r.length), 0),
      grid,
      rows: grid.map((row) => row.map((cell) => cell.text)),
    };
  });
}

export function extractQuestionBlocks(html = "") {
  if (!html || typeof html !== "string") return [];
  const template = document.createElement("template");
  template.innerHTML = html;
  const blocks = [];

  Array.from(template.content.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        if (blocks.length > 0 && blocks[blocks.length - 1].type === "text") {
          blocks[blocks.length - 1].text += " " + text;
        } else {
          blocks.push({ type: "text", text });
        }
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.nodeName.toUpperCase();
    if (tag === "TABLE") {
      const trs = Array.from(node.querySelectorAll("tr"));
      const grid = trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td"));
        return cells.map((cell) => {
          const isHeader = cell.tagName.toUpperCase() === "TH" || !!cell.closest("thead");
          const text = questionHtmlFragmentToUnicodeMath(cell.innerHTML)
            .replace(/[\r\n]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          const align = cell.style.textAlign || cell.getAttribute("align") || (isHeader ? "center" : "left");
          const bold = isHeader || cell.querySelector("b, strong") !== null;
          return { text, isHeader, bold, align };
        });
      });

      blocks.push({
        type: "table",
        grid,
        rows: grid.map((row) => row.map((cell) => cell.text)),
        rowCount: grid.length,
        colCount: grid.reduce((max, r) => Math.max(max, r.length), 0),
      });
    } else {
      const text = questionHtmlFragmentToUnicodeMath(node.outerHTML || node.textContent || "").trim();
      if (text) {
        if (blocks.length > 0 && blocks[blocks.length - 1].type === "text") {
          blocks[blocks.length - 1].text += "\n" + text;
        } else {
          blocks.push({ type: "text", text });
        }
      }
    }
  });

  return blocks;
}

