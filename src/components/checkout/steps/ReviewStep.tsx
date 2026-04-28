import { useState } from "react";
import type { WCCart } from "../../../hooks/useCart";
import type { AddressDict } from "../../../types/actions";
import type {
  OrderConfirmation,
  PaymentPayload,
  CheckoutStep,
} from "../../../types/checkout";
import type { PaymentGatewayAdapter } from "../payment/PaymentGatewayAdapter";
import { FiCheck } from "react-icons/fi";

interface ReviewStepProps {
  cart: WCCart | null;
  customer: { billing: AddressDict; shipping: AddressDict } | null;
  order: OrderConfirmation | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  paymentPayload: PaymentPayload | null;
  selectedAdapter: PaymentGatewayAdapter | null;
  onPlaceOrder: (payload: PaymentPayload) => Promise<void>;
  onSetStep: (step: CheckoutStep) => void;
  onClearError: () => void;
}

function formatPrice(
  minorStr: string,
  symbol: string,
  minorUnit: number,
): string {
  const value = parseInt(minorStr, 10) / Math.pow(10, minorUnit);
  if (isNaN(value)) return minorStr;
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: minorUnit > 0 ? 2 : 0,
    maximumFractionDigits: minorUnit > 0 ? 2 : 0,
  })}`;
}

function AddressSummary({
  address,
  label,
}: {
  address: AddressDict;
  label: string;
}) {
  return (
    <div style={{ flex: 1 }}>
      <p
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "#888",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: "4px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "#1c1c1a",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        {[address.first_name, address.last_name].filter(Boolean).join(" ")}
        {address.address_1 && (
          <>
            <br />
            {address.address_1}
          </>
        )}
        {address.city && (
          <>
            <br />
            {[address.city, address.state, address.postcode]
              .filter(Boolean)
              .join(", ")}
          </>
        )}
        {address.country && (
          <>
            <br />
            {address.country}
          </>
        )}
      </p>
    </div>
  );
}

/** Returns a human-readable explanation of why Place Order is disabled. */
function getDisabledReason(
  paymentPayload: PaymentPayload | null,
  isLoading: boolean,
): string | null {
  if (isLoading) return "Placing your order…";
  if (!paymentPayload)
    return "Complete the previous steps to place your order.";
  return null;
}

/** A wrapper that shows a tooltip over any disabled child element. */
function DisabledTooltip({
  label,
  children,
}: {
  label: string | null;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);

  if (!label) return <>{children}</>;

  return (
    <div
      style={{ position: "relative", display: "block" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#1c1c1a",
            color: "#fff",
            fontSize: "11.5px",
            lineHeight: 1.4,
            padding: "6px 10px",
            borderRadius: "7px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          }}
        >
          {label}
          {/* Arrow */}
          <span
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              borderWidth: "5px",
              borderStyle: "solid",
              borderColor: "#1c1c1a transparent transparent transparent",
            }}
          />
        </div>
      )}
    </div>
  );
}

export function ReviewStep({
  cart,
  customer,
  order,
  isLoading,
  error,
  paymentPayload,
  selectedAdapter,
  onPlaceOrder,
  onSetStep,
  onClearError,
}: ReviewStepProps) {
  const symbol = cart?.totals.currency_symbol ?? "₹";
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;

  const disabledReason = getDisabledReason(paymentPayload, isLoading);
  const isDisabled = disabledReason !== null;

  // Order complete state
  if (order) {
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
            fontSize: "16px",
            fontWeight: 600,
            color: "#1c1c1a",
            margin: 0,
          }}
        >
          Order Placed!
        </p>
        <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>
          Order #{order.order_id} — {order.status}
        </p>
      </div>
    );
  }

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
        Review Your Order
      </h3>

      {/* Address summary */}
      {customer && (
        <div
          style={{
            display: "flex",
            gap: "12px",
            padding: "12px 14px",
            background: "#f5f4f1",
            borderRadius: "11px",
            marginBottom: "14px",
          }}
        >
          <AddressSummary address={customer.billing} label="Billing" />
          <AddressSummary address={customer.shipping} label="Shipping" />
        </div>
      )}

      {/* Cart items */}
      {cart && cart.items.length > 0 && (
        <div
          style={{
            border: "1px solid #eeede8",
            borderRadius: "11px",
            overflow: "hidden",
            marginBottom: "14px",
          }}
        >
          {cart.items.map((item, i) => (
            <div
              key={item.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 12px",
                borderBottom:
                  i < cart.items.length - 1 ? "1px solid #eeede8" : "none",
                background: "#fff",
              }}
            >
              {item.images[0]?.thumbnail && (
                <img
                  src={item.images[0].thumbnail}
                  alt={item.name}
                  style={{
                    width: "40px",
                    height: "40px",
                    objectFit: "cover",
                    borderRadius: "7px",
                    flexShrink: 0,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "#1c1c1a",
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.name}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#999",
                    margin: "2px 0 0 0",
                  }}
                >
                  Qty: {item.quantity}
                </p>
              </div>
              <span
                style={{
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#1c1c1a",
                }}
              >
                {formatPrice(item.totals.line_total, symbol, minorUnit)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "11px",
            padding: "10px 12px",
            marginBottom: "10px",
          }}
        >
          <p
            style={{ fontSize: "12px", color: "#ef4444", margin: "0 0 6px 0" }}
          >
            ⚠️ {error.message}
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {error.field && /^(billing_|shipping_)/.test(error.field) && (
              <button
                type="button"
                onClick={() => {
                  onClearError();
                  onSetStep("collecting_address");
                }}
                style={{
                  fontSize: "11px",
                  color: "#ef4444",
                  background: "none",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Edit address
              </button>
            )}
            {error.field &&
              (error.field === "shipping_method" ||
                error.field === "shipping_rate") && (
                <button
                  type="button"
                  onClick={() => {
                    onClearError();
                    onSetStep("selecting_rate");
                  }}
                  style={{
                    fontSize: "11px",
                    color: "#ef4444",
                    background: "none",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    padding: "3px 8px",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Edit shipping
                </button>
              )}
            {(!error.field ||
              (!/^(billing_|shipping_)/.test(error.field) &&
                error.field !== "shipping_method" &&
                error.field !== "shipping_rate")) && (
              <button
                type="button"
                onClick={() => {
                  onClearError();
                  if (paymentPayload) onPlaceOrder(paymentPayload);
                }}
                style={{
                  fontSize: "11px",
                  color: "#ef4444",
                  background: "none",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Try again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Place Order button — wrapped in tooltip when disabled */}
      <DisabledTooltip label={disabledReason}>
        <button
          type="button"
          disabled={isDisabled}
          aria-disabled={isDisabled}
          onClick={async () => {
            if (!paymentPayload) return;
            if (selectedAdapter?.validate) {
              try {
                const ok = await selectedAdapter.validate(cart!);
                if (ok === false) return;
              } catch {
                return;
              }
            }
            await onPlaceOrder(paymentPayload);
          }}
          style={{
            width: "100%",
            padding: "12px",
            background: !isDisabled ? "#1c1c1a" : "#ccc",
            color: "#fff",
            border: "none",
            borderRadius: "11px",
            fontFamily: "inherit",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            cursor: isDisabled ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.65 : 1,
            // Ensure the disabled button is still hoverable so the tooltip fires
            pointerEvents: "auto",
          }}
        >
          {isLoading ? "Placing Order…" : "Place Order"}
        </button>
      </DisabledTooltip>
    </div>
  );
}
