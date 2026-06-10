import { useEffect, useState } from "react";
import AdminResultsTable from "../../components/AdminResultsTable";
import AdminTabs from "../../components/AdminTabs";
import Navbar from "../../components/Navbar";
import API from "../../services/api";

export default function Results() {
  const [results, setResults] = useState([]);

  useEffect(() => {
    let ignore = false;

    async function loadResults() {
      try {
        const token = localStorage.getItem("token");
        const res = await API.get("/results", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!ignore) {
          setResults(res.data);
        }
      } catch (error) {
        console.log(error);
      }
    }

    loadResults();

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <>
      <Navbar />
      <main className="page admin-page stack">
        <AdminTabs />
        <AdminResultsTable results={results} title="Results Management Table" />
      </main>
    </>
  );
}
