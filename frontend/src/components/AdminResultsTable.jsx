function formatCompletionDate(value) {
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

function getPercentage(result) {
  if (!result.totalQuestions) {
    return "0.0";
  }

  return ((result.correctAnswers / result.totalQuestions) * 100).toFixed(1);
}

export default function AdminResultsTable({
  results,
  title = "Results Management Table",
  emptyMessage = "No results submitted yet.",
}) {
  return (
    <section className="content-card admin-results-card">
      <div className="admin-results-heading">
        <h2>{title}</h2>
      </div>

      {results.length === 0 ? (
        <p className="admin-empty-state">{emptyMessage}</p>
      ) : (
        <div className="table-wrap admin-table-wrap">
          <table className="admin-results-table">
            <thead>
              <tr>
                <th>Student Name</th>
                <th>Exam Name</th>
                <th>Marks Secured</th>
                <th>Percentage</th>
                <th>Completion Date</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result) => (
                <tr key={result._id}>
                  <td>{result.student?.name || "-"}</td>
                  <td>{result.exam?.name || "-"}</td>
                  <td>
                    <span className="admin-score">
                      {result.correctAnswers} / {result.totalQuestions}
                    </span>
                  </td>
                  <td>
                    <span className="admin-percentage-pill">
                      {getPercentage(result)}%
                    </span>
                  </td>
                  <td>{formatCompletionDate(result.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
