import type { HealthState } from "../hooks/useHealthMonitor";

export function ServerDownOverlay({
  health,
  tenantConfigError,
}: {
  health: HealthState;
  /** Set on a 400/404 tenant-config error from /chat (missing/unknown
   *  license). A config bug, not a transient outage — takes priority over
   *  the health-based overlay and never implies auto-reconnect. */
  tenantConfigError?: string | null;
}) {
  if (!tenantConfigError && !health.blocking) return null;

  const message = tenantConfigError
    ? "This widget isn't configured correctly."
    : !health.components
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
        {tenantConfigError ? "Configuration Error" : "Connection Lost"}
      </p>
      <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 2px" }}>
        {message}
      </p>
      <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
        {tenantConfigError
          ? "Please contact support."
          : "We'll reconnect automatically — please wait a moment."}
      </p>
    </div>
  );
}
