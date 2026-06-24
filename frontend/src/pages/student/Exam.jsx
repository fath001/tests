import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navbar from "../../components/Navbar";
import QuestionPreview from "../../components/QuestionPreview";
import API from "../../services/api";

export default function Exam() {
  const navigate = useNavigate();
  const { examId } = useParams();
  const [exam, setExam] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadQuestions() {
      try {
        const token = localStorage.getItem("token");

        const res = await API.get(`/exams/${examId}/questions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setExam(res.data.exam);
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
  }, [examId]);

  const handleAnswer = (questionId, selectedAnswer) => {
    const newAnswers = answers.filter((ans) => ans.questionId !== questionId);
    newAnswers.push({ questionId, selectedAnswer });
    setAnswers(newAnswers);
  };

  const handleSubmit = async () => {
    try {
      const token = localStorage.getItem("token");

      await API.post(
        "/results/submit",
        { examId, answers },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      alert("Exam Submitted");
      navigate("/my-result");
    } catch (error) {
      console.log(error);
      alert(error.response?.data?.message || "Exam submit failed");
    }
  };

  return (
    <>
      <Navbar />
      <main className="page stack">
        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">MCQ Exam</p>
            <h1>{exam?.name || "Exam"}</h1>
            {exam && <p>Exam Date: {new Date(exam.examDate).toLocaleDateString()}</p>}
          </div>
        </section>
        {questions.map((question, index) => (
          <article className="question-preview" key={question._id}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", flexWrap: "wrap" }}>
              <strong>{index + 1}.</strong>
              <QuestionPreview value={question.question} />
            </div>

            <div className="option-list">
              {Object.entries(question.options || {})
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <label className="option-row" key={key}>
                    <input
                      type="radio"
                      name={question._id}
                      value={key}
                      onChange={() => handleAnswer(question._id, key)}
                    />
                    <strong>{key}.</strong>
                    <span style={{ display: "inline", verticalAlign: "middle" }}>{value}</span>
                  </label>
                ))}
            </div>
          </article>
        ))}
        <button className="button primary" type="button" onClick={handleSubmit}>
          Submit Exam
        </button>
      </main>
    </>
  );
}
