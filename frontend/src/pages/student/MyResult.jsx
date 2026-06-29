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
    .replace(/_\{\}/g, `_{${EMPTY_MATH_SLOT_LATEX}}`);
}

function createPreviewMathField(latex) {
  const mf = document.createElement("math-field");
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
