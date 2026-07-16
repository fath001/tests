import { convertLatexToMarkup } from 'mathlive';

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
  log: "log", ln: "ln", exp: "exp"
};

const SUPERSCRIPT_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴲ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ'
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

      if (cmd === "begin") {
        let envName = args[0] ? evaluateNodes(args[0].children).trim() : "";
        let rows = [];
        let currentRow = [];
        let currentCellNodes = [];

        function commitCell() {
          currentRow.push({ type: "group", children: currentCellNodes });
          currentCellNodes = [];
        }

        function commitRow() {
          commitCell();
          rows.push(currentRow);
          currentRow = [];
        }

        while (pos < str.length) {
          let nextChar = peek();

          if (nextChar === "\\") {
            let savedPos = pos;
            next(); // '\'
            let peekCmd = "";
            while (pos < str.length && /[a-zA-Z]/.test(peek())) {
              peekCmd += next();
            }

            if (peekCmd === "end") {
              while (peek() === " ") next();
              if (peek() === "{") {
                next();
                let endEnvName = "";
                while (pos < str.length && peek() !== "}") {
                  endEnvName += next();
                }
                if (peek() === "}") next();

                if (endEnvName.trim() === envName) {
                  commitRow();
                  break;
                }
              }
            }

            pos = savedPos;
          }

          if (nextChar === "\\") {
            let savedPos = pos;
            next(); // '\'
            let nextNext = peek();
            if (nextNext === "\\") {
              next();
              while (peek() === " ") next();
              if (peek() === "[") {
                next();
                while (pos < str.length && peek() !== "]") next();
                if (peek() === "]") next();
              }
              commitRow();
              continue;
            } else {
              let crCmd = "";
              while (pos < str.length && /[a-zA-Z]/.test(peek())) {
                crCmd += next();
              }
              if (crCmd === "cr") {
                commitRow();
                continue;
              }
            }
            pos = savedPos;
          }

          if (nextChar === "&") {
            next();
            commitCell();
            continue;
          }

          let parsedNode = parseSingleNode();
          if (parsedNode) {
            currentCellNodes.push(parsedNode);
          }
        }

        return { type: "matrix", env: envName, rows: rows };
      }

      return { type: "command", name: cmd, args: args };
    }

    if (char === "^" || char === "_") {
      next();
      while (peek() === " ") next();
      let scriptNode;
      if (peek() === "{") {
        next();
        let groupNodes = parseExpression();
        if (peek() === "}") next();
        scriptNode = { type: "group", children: groupNodes };
      } else {
        scriptNode = parseSingleNode();
      }
      return { type: "script_indicator", isSup: char === "^", node: scriptNode };
    }

    return { type: "text", value: next() };
  }

  function evaluateNodes(nodes) {
    let result = "";
    for (let node of nodes) {
      result += evaluateNode(node);
    }
    return result;
  }

  function evaluateNode(node) {
    if (!node) return "";
    switch (node.type) {
      case "text":
        return node.value;
      case "group":
        return evaluateNodes(node.children);
      case "script": {
        let baseStr = evaluateNode(node.base);
        let subStr = node.sub ? evaluateNode(node.sub) : "";
        let supStr = node.sup ? evaluateNode(node.sup) : "";

        const baseClean = baseStr.trim();
        if (baseClean === "∫" || baseClean === "∬" || baseClean === "∭" || baseClean === "∮" || baseClean === "∯") {
          if (subStr && supStr) {
            return `${baseClean}[${subStr}, ${supStr}]`;
          } else if (subStr) {
            return `${baseClean}_${toSubscript(subStr)}`;
          } else if (supStr) {
            return `${baseClean}^${toSuperscript(supStr)}`;
          }
          return baseClean;
        }
        if (baseClean === "∑" || baseClean === "∏") {
          if (subStr && supStr) {
            return `${baseClean}[${subStr} to ${supStr}]`;
          } else if (subStr) {
            return `${baseClean}[${subStr}]`;
          } else if (supStr) {
            return `${baseClean}^${toSuperscript(supStr)}`;
          }
          return baseClean;
        }
        if (baseClean === "lim") {
          if (subStr) {
            return `lim(${subStr})`;
          }
          return baseClean;
        }

        let res = baseStr;
        if (subStr) {
          res += toSubscript(subStr);
        }
        if (supStr) {
          res += toSuperscript(supStr);
        }
        return res;
      }
      case "matrix": {
        let env = node.env;
        let rowStrings = node.rows.map(row => {
          return row.map(cell => evaluateNodes(cell.children).trim()).join(", ");
        });
        let body = rowStrings.join("; ");

        if (env === "bmatrix") {
          return `[${body}]`;
        } else if (env === "pmatrix") {
          return `(${body})`;
        } else if (env === "vmatrix") {
          return `|${body}|`;
        } else if (env === "cases") {
          return `{${body}}`;
        } else if (env === "rcases") {
          return `${body}}`;
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

// Tests
const testCases = [
  ["bevelled fraction 1/1", "\\htmlStyle{display:inline-block;vertical-align:0.28em;padding:0 0.06em;min-width:0.54em;line-height:1;text-align:center;}{1}\\htmlStyle{display:inline-block;vertical-align:-0.02em;font-size:1.3em;line-height:0.9;padding:0;color:#111;}{/}\\htmlStyle{display:inline-block;vertical-align:-0.28em;padding:0 0.06em;min-width:0.54em;line-height:1;text-align:center;}{1}"],
  ["alpha", "\\alpha"],
  ["beta", "\\beta"],
  ["sqrt simple", "\\sqrt{x}"],
  ["sqrt complex", "\\sqrt{x+y}"],
  ["nth root", "\\sqrt[n]{x}"],
  ["frac simple", "\\frac{a+b}{c}"],
  ["frac simple 2", "\\frac{2}{3}"],
  ["superscript simple", "x^2"],
  ["subscript simple", "x_1"],
  ["subscript complex", "x_{i+1}"],
  ["inequality", "a \\le b \\ge c"],
  ["times div", "a \\times b \\div c"],
  ["definite integral", "\\int_{a}^{b} f(x) dx"],
  ["summation", "\\sum_{i=1}^{n} i"],
  ["limit", "\\lim_{x \\to \\infty} f(x)"],
  ["trig", "\\sin\\theta + \\cos\\theta"],
  ["matrix bmatrix", "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}"],
  ["matrix array classes", "\\class{cme-two-row-matrix-template cme-bmatrix-two-row-template cme-bmatrix-narrow-columns-template}{\\begin{array}{cc} a & b \\\\[0.18em] c & d \\end{array}}"],
  ["piecewise left cases", "\\class{cme-cases-left-template cme-downward-template}{\\begin{array}{c} x \\\\ -x \\end{array}}"],
  ["piecewise right cases", "\\class{cme-cases-right-template cme-downward-template}{\\begin{array}{c} x \\\\ -x \\end{array}}"],
  ["set notation", "x \\in A \\cup B \\cap C"]
];

for (const [name, latex] of testCases) {
  console.log(`--- Test: ${name}`);
  console.log(`latex:  ${latex}`);
  console.log(`unicode: ${latexToUnicodeMath(latex)}`);
}
