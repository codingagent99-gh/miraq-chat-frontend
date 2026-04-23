import { useState } from "react";
import type { WCCart } from "../../../hooks/useCart";
import type { PaymentPayload } from "../../../types/checkout";
import {
  getPaymentAdapter,
  type PaymentGatewayAdapter,
} from "../payment/PaymentGatewayAdapter";

interface PaymentStepProps {
  cart: WCCart;
  onPaymentPayloadChange: (payload: PaymentPayload | null) => void;
  isPayloadReady: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export function PaymentStep({
  cart,
  onPaymentPayloadChange,
  isPayloadReady,
  onBack,
  onContinue,
}: PaymentStepProps) {
  const availableMethods: PaymentGatewayAdapter[] = (cart.payment_methods ?? [])
    .map((slug: string) => getPaymentAdapter(slug))
    .filter((a): a is PaymentGatewayAdapter => Boolean(a));

  // Keep hooks unconditional — must be called before any early return
  const [selectedId, setSelectedId] = useState<string>(
    availableMethods[0]?.id ?? "",
  );

  // Zero-total cart — Woo says no payment is required at all.
  if (cart.needs_payment === false) {
    return (
      <div style={{ padding: "16px" }}>
        <h3
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: "16px",
            fontWeight: 400,
            color: "#1c1c1a",
            margin: "0 0 14px 0",
          }}
        >
          Payment
        </h3>

        <div
          style={{
            padding: "14px",
            background: "#f5f4f1",
            borderRadius: "11px",
            fontSize: "13px",
            color: "#1c1c1a",
            marginBottom: "12px",
          }}
        >
          No payment is required for this order. You can continue to review and
          place your order.
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: 1,
              padding: "12px",
              background: "transparent",
              color: "#1c1c1a",
              border: "1px solid #e8e6e0",
              borderRadius: "11px",
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onContinue}
            style={{
              flex: 2,
              padding: "12px",
              background: "#1c1c1a",
              color: "#fff",
              border: "none",
              borderRadius: "11px",
              fontFamily: "inherit",
              fontSize: "13px",
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: "pointer",
            }}
          >
            Continue to Review →
          </button>
        </div>
      </div>
    );
  }

  // Genuine "no gateways enabled in Woo admin" — keep original error.
  if (availableMethods.length === 0) {
    return (
      <div
        className="miraq-checkout-empty"
        style={{
          padding: "32px 20px",
          textAlign: "center",
          color: "#555",
          fontSize: "13px",
        }}
      >
        No supported payment methods are available. Please contact support.
      </div>
    );
  }

  const SelectedComponent =
    availableMethods.find((a) => a.id === selectedId)?.Component ??
    availableMethods[0].Component;

  function handleMethodChange(id: string) {
    // Clear payload so the new adapter's mount effect populates it fresh
    onPaymentPayloadChange(null);
    setSelectedId(id);
  }

  return (
    <div className="miraq-payment-step" style={{ padding: "16px" }}>
      <h3
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: "16px",
          fontWeight: 400,
          color: "#1c1c1a",
          margin: "0 0 14px 0",
        }}
      >
        Payment Method
      </h3>

      <ul
        className="miraq-payment-method-list"
        role="radiogroup"
        style={{ listStyle: "none", padding: 0, margin: "0 0 14px 0" }}
      >
        {availableMethods.map((a) => (
          <li
            key={a.id}
            style={{
              padding: "10px 12px",
              border: `1px solid ${selectedId === a.id ? "#1c1c1a" : "#eeede8"}`,
              borderRadius: "11px",
              marginBottom: "8px",
              background: selectedId === a.id ? "#f5f4f1" : "#fff",
              cursor: "pointer",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="payment_method"
                checked={selectedId === a.id}
                onChange={() => handleMethodChange(a.id)}
                style={{ marginTop: "2px", flexShrink: 0 }}
              />
              <div>
                <span
                  className="miraq-pm-label"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#1c1c1a",
                    display: "block",
                  }}
                >
                  {a.label}
                </span>
                {a.description && (
                  <span
                    className="miraq-pm-desc"
                    style={{
                      fontSize: "11px",
                      color: "#888",
                      display: "block",
                      marginTop: "2px",
                    }}
                  >
                    {a.description}
                  </span>
                )}
              </div>
            </label>
          </li>
        ))}
      </ul>

      <div
        className="miraq-payment-method-body"
        style={{ marginBottom: "16px" }}
      >
        <SelectedComponent
          cart={cart}
          onPayloadChange={onPaymentPayloadChange}
        />
      </div>

      <div className="miraq-step-nav" style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={onBack}
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
            cursor: "pointer",
          }}
        >
          Back
        </button>
        <button
          type="button"
          disabled={!isPayloadReady}
          onClick={onContinue}
          style={{
            flex: 2,
            padding: "11px",
            background: isPayloadReady ? "#1c1c1a" : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: "11px",
            fontFamily: "inherit",
            fontSize: "13px",
            fontWeight: 600,
            cursor: isPayloadReady ? "pointer" : "not-allowed",
          }}
        >
          Continue to Review
        </button>
      </div>
    </div>
  );
}
