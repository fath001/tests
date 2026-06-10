import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../../components/Navbar";
import API from "../../services/api";
import Exam from "./Exam";

function formatExamDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function getScoreLabel(result) {
  if (!result) {
    return null;
  }

  return `${result.correctAnswers} / ${result.totalQuestions}`;
}

export default function StudentDashboard({ mode }) {
  const [exams, setExams] = useState([]);

  useEffect(() => {
    if (mode === "exam") {
      return undefined;
    }

    let ignore = false;

    async function loadStudentDashboard() {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const [assignedExamsRes, resultsRes] = await Promise.all([
          API.get("/exams/assigned", { headers }),
          API.get("/results/my-result", { headers }),
        ]);

        const resultMap = new Map(
          resultsRes.data.map((result) => [result.exam?._id || result.exam, result]),
        );

        const merged = assignedExamsRes.data.map((exam) => ({
          ...exam,
          result: resultMap.get(exam._id) || null,
        }));

        if (!ignore) {
          setExams(merged);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadStudentDashboard();

    return () => {
      ignore = true;
    };
  }, [mode]);

  if (mode === "exam") {
    return <Exam />;
  }

  return (
    <>
      <Navbar />
      <main className="page student-page stack">
        <section className="student-welcome">
          <h1>Welcome, student</h1>
        </section>

        <section className="content-card student-results-shell">
          <div className="student-results-heading">
            <h2>Assigned Exams & Results</h2>
          </div>

          {exams.length === 0 ? (
            <p className="admin-empty-state">No exams assigned yet.</p>
          ) : (
            <div className="student-exam-grid">
              {exams.map((exam) => {
                const scoreLabel = getScoreLabel(exam.result);

                return (
                  <article className="student-exam-card" key={exam._id}>
                    <div className="student-exam-top">
                      <span className={`student-status ${exam.completed ? "done" : exam.ready ? "ready" : "pending"}`}>
                        {exam.completed ? "Completed" : exam.ready ? "Ready" : "Pending"}
                      </span>
                      {scoreLabel ? <strong>Score: {scoreLabel}</strong> : null}
                    </div>

                    <h3>{exam.name}</h3>

                    <div className="student-exam-meta">
                      <p>Date: {formatExamDate(exam.examDate)}</p>
                      <p>Questions: {exam.totalQuestions} MCQs</p>
                    </div>

                    {exam.completed ? (
                      <Link className="button secondary student-result-button" to={`/my-result?examId=${exam._id}`}>
                        View My Results
                      </Link>
                    ) : !exam.ready ? (
                      <button className="button secondary student-result-button" type="button" disabled>
                        Exam Not Ready
                      </button>
                    ) : (
                      <Link className="button primary student-result-button" to={`/student/exams/${exam._id}`}>
                        Start Exam
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
