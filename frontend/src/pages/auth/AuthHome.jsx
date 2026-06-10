import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../../services/api";

function CapIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className="brand-mark">
      <path
        d="M31.6 10.4 8.4 21.9a2.8 2.8 0 0 0 0 5l23.2 11.5a2.8 2.8 0 0 0 2.5 0l20.4-10.1v11.8a5.2 5.2 0 0 0-2.2 4.3c0 1.6.7 3 1.9 3.9l-2.5 8.8a2 2 0 0 0 2 2.5h6a2 2 0 0 0 2-2.5l-2.5-8.8a5.2 5.2 0 0 0 1.9-3.9 5.2 5.2 0 0 0-2.5-4.5V25.1l4-2a2.8 2.8 0 0 0 0-5L34.1 10.4a2.8 2.8 0 0 0-2.5 0Z"
        fill="currentColor"
      />
      <path
        d="M19.2 33.1v8.4c0 2.6 5.8 7.8 12.8 7.8s12.8-5.2 12.8-7.8V33L35.3 37.7a7.4 7.4 0 0 1-6.6 0l-9.5-4.6Z"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  );
}

export default function AuthHome() {
  const navigate = useNavigate();
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const isAdmin = role === "admin";
  const signupPath = isAdmin ? "/admin-signup" : "/student-signup";

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await API.post("/auth/login", form);
      const loggedInRole = response.data.user.role;

      if (loggedInRole !== role) {
        alert(`This account is registered as ${loggedInRole}.`);
        return;
      }

      localStorage.setItem("token", response.data.token);
      localStorage.setItem("role", loggedInRole);
      navigate(loggedInRole === "admin" ? "/admin" : "/student");
    } catch (error) {
      console.log(error);
      alert(error.response?.data?.message || "Login failed");
    }
  };

  return (
    <main className="auth-home-shell">
      <section className="auth-home-card" aria-label="Portal login">
        <header className="auth-home-header">
          <div className="auth-home-brand">
            <CapIcon />
            <h1>ExamPortal</h1>
          </div>
          <p>Sign in to access your portal</p>
        </header>

        <div className="portal-switch" role="tablist" aria-label="Portal role">
          <button
            type="button"
            className={!isAdmin ? "active" : ""}
            aria-selected={!isAdmin}
            onClick={() => setRole("student")}
          >
            Student Portal
          </button>
          <button
            type="button"
            className={isAdmin ? "active" : ""}
            aria-selected={isAdmin}
            onClick={() => setRole("admin")}
          >
            Admin Portal
          </button>
        </div>

        <form className="auth-home-form" onSubmit={handleSubmit}>
          <label className="auth-home-field">
            <span>Email Address</span>
            <input
              type="email"
              name="email"
              value={form.email}
              placeholder="e.g. name@example.com"
              onChange={handleChange}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-home-field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              value={form.password}
              placeholder="........"
              onChange={handleChange}
              autoComplete="current-password"
              required
            />
          </label>

          <button className="button primary auth-home-submit" type="submit">
            {isAdmin ? "Log In to Admin Portal" : "Log In to Student Portal"}
          </button>
        </form>

        <p className="auth-home-footer">
          Don&apos;t have an account? <Link to={signupPath}>Sign Up here</Link>
        </p>
      </section>
    </main>
  );
}
