import { useEffect, useState } from "react";
import AdminResultsTable from "../../components/AdminResultsTable";
import AdminTabs from "../../components/AdminTabs";
import Navbar from "../../components/Navbar";
import API from "../../services/api";

const statCards = [
  {
    key: "totalStudents",
    label: "Total Students",
    icon: "ST",
    accent: "blue",
  },
  {
    key: "totalExams",
    label: "Exams Created",
    icon: "EX",
    accent: "pink",
  },
  {
    key: "totalCompletedExams",
    label: "Completed Exams",
    icon: "OK",
    accent: "green",
  },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalExams: 0,
    totalCompletedExams: 0,
    recentResults: [],
  });

  useEffect(() => {
    let ignore = false;

    async function loadStats() {
      try {
        const token = localStorage.getItem("token");
        const res = await API.get("/exams/dashboard", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setStats(res.data);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadStats();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <>
      <Navbar />
      <main className="page admin-page stack">
        <AdminTabs />

        <section className="admin-stat-grid" aria-label="Admin overview">
          {statCards.map((card) => (
            <article key={card.key} className={`admin-stat-card ${card.accent}`}>
              <div className="admin-stat-icon" aria-hidden="true">
                {card.icon}
              </div>
              <div className="admin-stat-copy">
                <span>{card.label}</span>
                <strong>{stats[card.key]}</strong>
              </div>
            </article>
          ))}
        </section>

        <AdminResultsTable
          results={stats.recentResults}
          title="Results Management Table"
          emptyMessage="No completed exams yet."
        />
      </main>
    </>
  );
}
