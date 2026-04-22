import { useEffect, useRef } from "react";
import { FiCheck, FiExternalLink } from "react-icons/fi";
import type { OrderConfirmation } from "../../../types/checkout";

interface ConfirmationStepProps {
  order: OrderConfirmation;
  siteOrigin: string;
  onBackToChat: () => void;
  onPostBotMessage: (text: string) => void;
}

export function ConfirmationStep({
  order,
  siteOrigin,
  onBackToChat,
  onPostBotMessage,
}: ConfirmationStepProps) {
  const hasPosted = useRef(false);

  // Post the synthetic bot message exactly once (useRef guard protects against
  // React 19 strict-mode double-invokes).
  useEffect(() => {
    if (!hasPosted.current) {
      hasPosted.current = true;
      onPostBotMessage(
        `✅ Order #${order.order_id} placed — you'll receive an email shortly. Anything else?`,
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const viewOrderUrl = `${siteOrigin}/my-account/view-order/${order.order_id}`;

  return (
    <div
      style={{
        padding: "32px 20px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          background: "#d1fae5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FiCheck size={24} color="#10b981" />
      </div>

      <p
        style={{
          fontSize: "18px",
          fontFamily: "'DM Serif Display', serif",
          fontWeight: 400,
          color: "#1c1c1a",
          margin: 0,
        }}
      >
        ✅ Order placed!
      </p>

      <div style={{ fontSize: "13px", color: "#555" }}>
        <p style={{ margin: "0 0 4px 0", fontWeight: 600, color: "#1c1c1a" }}>
          Order #{order.order_id}
        </p>
        {order.total && (
          <p style={{ margin: "0 0 4px 0" }}>Total: {order.total}</p>
        )}
      </div>

      <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>
        A confirmation email is on its way.
      </p>

      <div style={{ display: "flex", gap: "8px", marginTop: "8px", width: "100%" }}>
        <a
          href={viewOrderUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            flex: 1,
            padding: "11px",
            background: "#f5f4f1",
            color: "#1c1c1a",
            border: "none",
            borderRadius: "11px",
            fontFamily: "inherit",
            fontSize: "13px",
            fontWeight: 600,
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          View order <FiExternalLink size={12} />
        </a>
        <button
          type="button"
          onClick={onBackToChat}
          style={{
            flex: 1,
            padding: "11px",
            background: "#1c1c1a",
            color: "#fff",
            border: "none",
            borderRadius: "11px",
            fontFamily: "inherit",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back to chat
        </button>
      </div>
    </div>
  );
}
