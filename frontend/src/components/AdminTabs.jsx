import { Link, useLocation } from "react-router-dom";

const tabs = [
  {
    label: "Overview & Results",
    to: "/admin",
    match: (pathname) => pathname === "/admin" || pathname === "/results",
  },
  {
    label: "Manage Exams",
    to: "/admin/create-exam",
    match: (pathname) => pathname === "/admin/create-exam",
  },
  {
    label: "Add Questions",
    to: "/admin/questions",
    match: (pathname) => pathname === "/admin/questions",
  },
];

export default function AdminTabs() {
  const { pathname } = useLocation();

  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      {tabs.map((tab) => {
        const active = tab.match(pathname);

        return (
          <Link
            key={tab.to}
            className={`admin-tab ${active ? "active" : ""}`}
            to={tab.to}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
