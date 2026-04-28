import { FiX } from "react-icons/fi";

interface AiOptInScreenProps {
  logoUrl: string;
  onClose: () => void;
  aiEnabled: boolean;
  onToggle: (value: boolean) => void;
}

export function AiOptInScreen({
  logoUrl,
  onClose,
  aiEnabled,
  onToggle,
}: AiOptInScreenProps) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "2rem",
        textAlign: "center",
        backgroundColor: "#fff",
      }}
    >
      {/* ── Close button ─────────────────────────────────────────────────── */}
      <button
        onClick={onClose}
        style={{
          position: "absolute",
          top: "16px",
          right: "16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#666",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 1,
        }}
        aria-label="Close widget"
        type="button"
      >
        <FiX size={20} />
      </button>

      {/* ── Brand logo ───────────────────────────────────────────────────── */}
      <img
        src={logoUrl}
        alt="Brand logo"
        style={{
          width: "64px",
          height: "64px",
          marginBottom: "1.5rem",
          borderRadius: "50%",
          objectFit: "contain",
        }}
      />

      {/* ── Opt-in message ───────────────────────────────────────────────── */}
      <p
        style={{
          margin: "0 0 2rem 0",
          color: "#333",
          fontSize: "15px",
          lineHeight: "1.6",
          maxWidth: "240px",
        }}
      >
        Hi there! Thanks for Visiting — would you like to try the MiraQ AI Chat?
      </p>

      {/* ── Toggle row: No ── [switch] ── Yes ────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "14px",
          border: "1.5px solid #e5e7eb",
          borderRadius: "50px",
          padding: "10px 24px",
        }}
      >
        {/* "No" label */}
        <span
          style={{
            fontSize: "14px",
            fontWeight: aiEnabled ? 400 : 600,
            color: aiEnabled ? "#aaa" : "#111",
            transition: "color 0.2s, font-weight 0.2s",
            userSelect: "none",
            minWidth: "20px",
          }}
        >
          No
        </span>

        {/* Toggle switch */}
        <button
          onClick={() => onToggle(!aiEnabled)}
          aria-label={aiEnabled ? "Disable AI mode" : "Enable AI mode"}
          aria-checked={aiEnabled}
          role="switch"
          type="button"
          style={{
            width: "50px",
            height: "28px",
            borderRadius: "14px",
            border: "none",
            background: aiEnabled ? "#6366f1" : "#d1d5db",
            cursor: "pointer",
            position: "relative",
            transition: "background 0.25s ease",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "4px",
              left: aiEnabled ? "24px" : "4px",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.25s ease",
              boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
              display: "block",
            }}
          />
        </button>

        {/* "Yes" label */}
        <span
          style={{
            fontSize: "14px",
            fontWeight: aiEnabled ? 600 : 400,
            color: aiEnabled ? "#111" : "#aaa",
            transition: "color 0.2s, font-weight 0.2s",
            userSelect: "none",
            minWidth: "22px",
          }}
        >
          Yes
        </span>
      </div>
    </div>
  );
}
