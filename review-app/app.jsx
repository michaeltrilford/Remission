import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

function readRoute() {
  return {
    sessionId: window.location.pathname.startsWith("/session/")
      ? decodeURIComponent(window.location.pathname.replace("/session/", ""))
      : "",
    pathId: new URLSearchParams(window.location.search).get("path") || ""
  };
}

function App() {
  const [route, setRoute] = useState(readRoute());
  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    fetch("/api/sessions")
      .then((response) => response.json())
      .then((data) => setSessions(data.sessions || []))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!route.sessionId) {
      setSession(null);
      return;
    }

    fetch(`/api/session/${encodeURIComponent(route.sessionId)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Session not found");
        }
        return response.json();
      })
      .then((data) => {
        setSession(data);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [route.sessionId]);

  const selectedHypothesis = useMemo(() => {
    if (!session) {
      return null;
    }

    if (route.pathId) {
      return session.result?.hypotheses?.find((item) => item.id === route.pathId) || null;
    }

    return session.result?.hypotheses?.[0] || null;
  }, [route.pathId, session]);

  return (
    <div className="app-shell">
      <header className="page-header">
        <div className="eyebrow">Remission</div>
        <h1>Review</h1>
        <p className="lede">Local review surface for CLI-generated sessions and research directions.</p>
      </header>

      {error ? <p className="error">{error}</p> : null}

      <main className="layout">
        <aside className="panel session-list">
          <h2>Sessions</h2>
          {sessions.length === 0 ? (
            <p className="muted">No sessions yet. Generate a result in the CLI first.</p>
          ) : (
            <ul className="list">
              {sessions.map((item) => (
                <li key={item.id}>
                  <a href={`/session/${item.id}`} className={item.id === route.sessionId ? "active" : ""}>
                    <strong>{item.topic}</strong>
                    <span className="muted">{item.hypothesisCount} directions</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="panel detail">
          {session ? (
            <div>
              <div className="meta-row">
                <span className="pill">{session.topic}</span>
                <span className="muted">{new Date(session.createdAt).toLocaleString()}</span>
              </div>

              {selectedHypothesis ? (
                <div className="direction">
                  <h2>{selectedHypothesis.title}</h2>

                  <section>
                    <h3>How It Might Work</h3>
                    <p>{selectedHypothesis.mechanism}</p>
                  </section>

                  <section>
                    <h3>Why It May Matter</h3>
                    <p>{selectedHypothesis.rationale}</p>
                  </section>

                  <section>
                    <h3>Suggested Follow-Up</h3>
                    <p>{selectedHypothesis.next_test}</p>
                  </section>

                  <section>
                    <h3>Assessment</h3>
                    <p>Novelty {selectedHypothesis.novelty_score}/10</p>
                    <p>Plausibility {selectedHypothesis.plausibility_score}/10</p>
                  </section>

                  <section>
                    <h3>Linked Source Refs</h3>
                    <ul className="list">
                      {(selectedHypothesis.evidence_refs || []).map((ref) => (
                        <li key={ref}>{ref}</li>
                      ))}
                    </ul>
                  </section>
                </div>
              ) : (
                <p className="muted">No generated directions in this session.</p>
              )}
            </div>
          ) : (
            <p className="muted">Select a session to review its generated directions.</p>
          )}
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
