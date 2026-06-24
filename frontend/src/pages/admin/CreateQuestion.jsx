import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AdminTabs from "../../components/AdminTabs";
import CkEditor from "../../components/Ckeditor";
import Navbar from "../../components/Navbar";
import QuestionPreview from "../../components/QuestionPreview";
import API from "../../services/api";

export default function CreateQuestion() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedExamId = searchParams.get("examId") || "";
  const [exams, setExams] = useState([]);
  const [existingQuestions, setExistingQuestions] = useState([]);
  const [questionType, setQuestionType] = useState("multiple_choice");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState({ A: "", B: "", C: "", D: "" });
  const [correctAnswer, setCorrectAnswer] = useState("A");

  const selectedExam = useMemo(
    () => exams.find((exam) => exam._id === selectedExamId),
    [exams, selectedExamId],
  );

  useEffect(() => {
    let ignore = false;

    async function loadExams() {
      try {
        const token = localStorage.getItem("token");
        const res = await API.get("/exams", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setExams(res.data);

          if (!selectedExamId && res.data[0]?._id) {
            setSearchParams({ examId: res.data[0]._id });
          }
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadExams();

    return () => {
      ignore = true;
    };
  }, [selectedExamId, setSearchParams]);

  useEffect(() => {
    let ignore = false;

    async function loadQuestions() {
      if (!selectedExamId) {
        setExistingQuestions([]);
        return;
      }

      try {
        const token = localStorage.getItem("token");
        const res = await API.get(`/questions/exam/${selectedExamId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setExistingQuestions(res.data);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadQuestions();

    return () => {
      ignore = true;
    };
  }, [selectedExamId]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const token = localStorage.getItem("token");
      const payloadOptions =
        questionType === "true_false"
          ? { A: "True", B: "False" }
          : options;

      await API.post(
        "/questions/create",
        {
          examId: selectedExamId,
          question,
          questionType,
          options: payloadOptions,
          correctAnswer,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      alert("Question Created");
      setQuestion("");
      setQuestionType("multiple_choice");
      setOptions({ A: "", B: "", C: "", D: "" });
      setCorrectAnswer("A");

      const res = await API.get(`/questions/exam/${selectedExamId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setExistingQuestions(res.data);
    } catch (error) {
      console.log(error);
      alert(error.response?.data?.message || "Question create failed");
    }
  };

  const trueFalseOptions = {
    A: "True",
    B: "False",
  };

  const visibleOptionKeys = questionType === "true_false" ? ["A", "B"] : ["A", "B", "C", "D"];
  const displayedOptions = questionType === "true_false" ? trueFalseOptions : options;

  return (
    <>
      <Navbar />
      <main className="page admin-page stack">
        <AdminTabs />

        <section className="content-card admin-question-card">
          <div className="admin-question-top">
            <div className="section-heading">
              <h1>Create Questions</h1>
              {selectedExam && (
                <p>
                  {existingQuestions.length} of {selectedExam.totalQuestions} questions added
                </p>
              )}
            </div>

            <label className="admin-inline-select">
              Select Exam
              <select
                value={selectedExamId}
                onChange={(event) => setSearchParams({ examId: event.target.value })}
                required
              >
                <option value="">Choose exam</option>
                {exams.map((exam) => (
                  <option key={exam._id} value={exam._id}>
                    {exam.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <form className="stack admin-question-form" onSubmit={handleSubmit}>
            <div className="admin-form-block">
              <span className="admin-block-label">Question Type</span>
              <div className="question-type-switch">
                <button
                  type="button"
                  className={questionType === "multiple_choice" ? "active" : ""}
                  onClick={() => {
                    setQuestionType("multiple_choice");
                    setCorrectAnswer("A");
                  }}
                >
                  Multiple Choice (4 Options)
                </button>
                <button
                  type="button"
                  className={questionType === "true_false" ? "active" : ""}
                  onClick={() => {
                    setQuestionType("true_false");
                    setCorrectAnswer((current) => (current === "B" ? "B" : "A"));
                  }}
                >
                  True / False
                </button>
              </div>
            </div>

            <div className="admin-form-block">
              <span className="admin-block-label">Question Prompt</span>
              <div className="admin-editor-wrap">
                <CkEditor className="admin-ck-editor" value={question} onChange={setQuestion} />
              </div>
            </div>

            <div className="admin-form-block">
              <span className="admin-block-label">
                {questionType === "true_false"
                  ? "Select the correct True / False answer"
                  : "Define MCQ options & select correct choice"}
              </span>
              <div className="admin-option-list">
                {visibleOptionKeys.map((optionKey) => (
                  <label className="admin-option-row" key={optionKey}>
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={correctAnswer === optionKey}
                      onChange={() => setCorrectAnswer(optionKey)}
                    />
                    <span className="admin-option-letter">{optionKey}:</span>
                    {questionType === "true_false" ? (
                      <div className="admin-fixed-option">{displayedOptions[optionKey]}</div>
                    ) : (
                      <input
                        placeholder={`Option ${optionKey} text`}
                        value={displayedOptions[optionKey]}
                        onChange={(event) =>
                          setOptions((current) => ({
                            ...current,
                            [optionKey]: event.target.value,
                          }))
                        }
                        required
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>

            <button className="button primary admin-cta" type="submit" disabled={!selectedExamId}>
              Save and Create MCQ Question
            </button>
          </form>

          <div className="admin-divider" />

          <section className="stack">
            <div className="section-heading">
              <h2>Current Questions List</h2>
            </div>

            {existingQuestions.length === 0 ? (
              <p className="admin-empty-state">No questions added yet.</p>
            ) : (
              existingQuestions.map((item, index) => (
                <article className="question-preview admin-question-preview" key={item._id}>
                  <div className="admin-question-preview-title">
                    <strong>{index + 1}.</strong>
                    <QuestionPreview value={item.question} />
                  </div>
                  <p>Correct answer: Option {item.correctAnswer}</p>
                </article>
              ))
            )}
          </section>
        </section>
      </main>
    </>
  );
}
