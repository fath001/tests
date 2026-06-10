import { Link, useNavigate } from "react-router-dom";

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="nav-shield">
      <path
        fill="currentColor"
        d="M24 4.5c5.6 4.1 11.6 6.3 18 6.8v12.1c0 10.6-6 17.6-18 21.1C12 41 6 34 6 23.4V11.3c6.4-.5 12.4-2.7 18-6.8Z"
      />
    </svg>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const role = localStorage.getItem("role") || "student";
  const isAdmin = role === "admin";
  const roleLabel = isAdmin ? "Administrator" : "Student";

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  };

  return (
    <nav className={`app-nav ${isAdmin ? "admin-nav" : "student-nav"}`}>
      <div className="app-nav-inner">
        <Link className="nav-brand" to={isAdmin ? "/admin" : "/student"}>
          <ShieldIcon />
          <div className="nav-brand-copy">
            <strong>ExamPortal</strong>
            <small>{isAdmin ? "Admin Console" : "Student Portal"}</small>
          </div>
        </Link>

        <div className="admin-nav-actions">
          <div className={`admin-account ${role}`}>
            <strong>{role}</strong>
            <span>{roleLabel}</span>
          </div>
          <button className="button secondary nav-logout" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
