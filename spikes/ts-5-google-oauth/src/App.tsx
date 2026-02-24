import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  status: string;
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState("Checking auth status...");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const authed = await invoke<boolean>("check_auth_status");
      setIsAuthenticated(authed);
      setStatus(authed ? "Connected to Google Calendar" : "Not connected");
      if (authed) {
        fetchEvents();
      }
    } catch (e) {
      setStatus(`Error checking auth: ${e}`);
    }
  }

  async function startAuth() {
    setLoading(true);
    setStatus("Opening browser for Google sign-in...");
    try {
      const result = await invoke<string>("start_auth");
      setStatus(result);
      setIsAuthenticated(true);
      fetchEvents();
    } catch (e) {
      setStatus(`Auth failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function fetchEvents() {
    setLoading(true);
    setStatus("Fetching events...");
    try {
      const result = await invoke<CalendarEvent[]>("fetch_events");
      setEvents(result);
      setStatus(`Found ${result.length} events in the next 24 hours`);
    } catch (e) {
      setStatus(`Fetch failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function forceRefresh() {
    setLoading(true);
    setStatus("Refreshing token...");
    try {
      const result = await invoke<string>("force_refresh");
      setStatus(result);
    } catch (e) {
      setStatus(`Refresh failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    try {
      await invoke<string>("disconnect");
      setIsAuthenticated(false);
      setEvents([]);
      setStatus("Disconnected");
    } catch (e) {
      setStatus(`Disconnect failed: ${e}`);
    }
  }

  function formatTime(isoString: string): string {
    if (!isoString || isoString.length <= 10) return isoString;
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <main className="container">
      <h1>Morph - Google Calendar OAuth Spike</h1>

      <div className="status-bar">
        <span className={`status-dot ${isAuthenticated ? "green" : "red"}`} />
        <span>{status}</span>
      </div>

      <div className="actions">
        {!isAuthenticated ? (
          <button onClick={startAuth} disabled={loading}>
            {loading ? "Waiting for authorization..." : "Connect Google Calendar"}
          </button>
        ) : (
          <>
            <button onClick={fetchEvents} disabled={loading}>
              Refresh Events
            </button>
            <button onClick={forceRefresh} disabled={loading}>
              Force Token Refresh
            </button>
            <button onClick={disconnect} className="danger">
              Disconnect
            </button>
          </>
        )}
      </div>

      {events.length > 0 && (
        <div className="events">
          <h2>Upcoming Events (Next 24 Hours)</h2>
          <ul>
            {events.map((event) => (
              <li key={event.id} className="event-item">
                <strong>{event.summary}</strong>
                <span className="event-time">
                  {formatTime(event.start)} - {formatTime(event.end)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isAuthenticated && events.length === 0 && !loading && (
        <p className="empty">No events in the next 24 hours.</p>
      )}
    </main>
  );
}

export default App;
