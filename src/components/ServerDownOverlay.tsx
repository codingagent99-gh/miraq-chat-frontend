import type { HealthState } from "../hooks/useHealthMonitor";

export function ServerDownOverlay({ health }: { health: HealthState }) {
  if (!health.blocking) return null;

  const message = !health.components
    ? "We can't reach the store right now."
    : health.components.upstream === "down"
      ? "The assistant is offline right now."
      : "The store is temporarily unavailable.";

  return (
    <div
      className="miraq-server-down-overlay"
      role="alert"
      aria-live="assertive"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 10000, // above CartPanel/CheckoutPanel and the ToastContainer (9999)
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 24,
        textAlign: "center",
        background: "rgba(255,255,255,0.97)",
      }}
    >
      <div className="dot-loader">
        <span />
        <span />
        <span />
      </div>
      <p style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>
        Connection Lost
      </p>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 2px" }}>
        {message}
      </p>
      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
        We'll reconnect automatically — please wait a moment.
      </p>
    </div>
  );
}
