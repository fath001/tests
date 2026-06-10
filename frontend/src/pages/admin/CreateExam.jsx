import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminTabs from "../../components/AdminTabs";
import Navbar from "../../components/Navbar";
import API from "../../services/api";

function formatExamDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function CreateExam() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [form, setForm] = useState({
    name: "",
    examDate: "",
    totalQuestions: "",
    assignedStudents: [],
  });

  useEffect(() => {
    let ignore = false;

    async function loadPageData() {
      try {
        const token = localStorage.getItem("token");
        const headers = { Authorization: `Bearer ${token}` };

        const [studentsRes, examsRes] = await Promise.all([
          API.get("/exams/students", { headers }),
          API.get("/exams", { headers }),
        ]);

        const examsWithCounts = await Promise.all(
          examsRes.data.map(async (exam) => {
            const questionsRes = await API.get(`/questions/exam/${exam._id}`, { headers });

            return {
              ...exam,
              questionCount: questionsRes.data.length,
            };
          }),
        );

        if (!ignore) {
          setStudents(studentsRes.data);
          setExams(examsWithCounts);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadPageData();

    return () => {
      ignore = true;
    };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const toggleStudent = (studentId) => {
    setForm((current) => {
      const assignedStudents = current.assignedStudents.includes(studentId)
        ? current.assignedStudents.filter((id) => id !== studentId)
        : [...current.assignedStudents, studentId];

      return { ...current, assignedStudents };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const token = localStorage.getItem("token");
      const res = await API.post(
        "/exams",
        {
          ...form,
          totalQuestions: Number(form.totalQuestions),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      setExams((current) => [{ ...res.data, questionCount: 0 }, ...current]);
      navigate(`/admin/questions?examId=${res.data._id}`);
    } catch (error) {
      console.log(error);
      alert(error.response?.data?.message || "Exam create failed");
    }
  };

  return (
    <>
      <Navbar />
      <main className="page admin-page stack">
        <AdminTabs />

        <section className="admin-workspace-grid">
          <form className="content-card stack admin-form-card" onSubmit={handleSubmit}>
            <div className="section-heading">
              <h1>Create New Exam</h1>
            </div>

            <label>
              Exam Title
              <input
                name="name"
                placeholder="e.g. Inorganic Chemistry Quiz"
                value={form.name}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Scheduled Date
              <input
                name="examDate"
                type="datetime-local"
                value={form.examDate}
                onChange={handleChange}
                required
              />
            </label>

            <label>
              Total Number of MCQs
              <input
                min="1"
                name="totalQuestions"
                type="number"
                placeholder="5"
                value={form.totalQuestions}
                onChange={handleChange}
                required
              />
            </label>

            <section className="student-picker admin-student-picker">
              <div className="admin-section-copy">
                <span>Assign Students</span>
                <p>{form.assignedStudents.length} selected for this exam</p>
              </div>

              {students.length === 0 ? (
                <p className="admin-empty-state">No students found.</p>
              ) : (
                <div className="student-grid admin-student-grid">
                  {students.map((student) => (
                    <label className="check-card admin-check-card" key={student._id}>
                      <input
                        type="checkbox"
                        checked={form.assignedStudents.includes(student._id)}
                        onChange={() => toggleStudent(student._id)}
                      />
                      <span>
                        <strong>{student.name}</strong>
                        <small>{student.email}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <button className="button primary admin-cta" type="submit">
              Create Exam Shell
            </button>
          </form>

          <section className="content-card stack admin-exams-card">
            <div className="section-heading">
              <h2>Exams Created</h2>
            </div>

            {exams.length === 0 ? (
              <p className="admin-empty-state">No exams created yet.</p>
            ) : (
              <div className="admin-exam-list">
                {exams.map((exam) => (
                  <article className="admin-exam-item" key={exam._id}>
                    <div className="admin-exam-top">
                      <h3>{exam.name}</h3>
                      <span className="admin-qs-badge">
                        {exam.questionCount} / {exam.totalQuestions} Qs
                      </span>
                    </div>

                    <p className="admin-exam-date">Scheduled: {formatExamDate(exam.examDate)}</p>

                    <div className="admin-exam-actions">
                      <Link className="button admin-link-button" to={`/admin/questions?examId=${exam._id}`}>
                        Add Questions
                      </Link>
                      <span className="admin-assign-pill">
                        {exam.assignedStudents?.length || 0} Assigned
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </>
  );
}
