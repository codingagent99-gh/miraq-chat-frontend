import type { WCCart } from "../../../hooks/useCart";
import type { AddressDict } from "../../../types/actions";
import type { OrderConfirmation } from "../../../types/checkout";
import { FiCheck } from "react-icons/fi";

interface ReviewStepProps {
  cart: WCCart | null;
  customer: { billing: AddressDict; shipping: AddressDict } | null;
  order: OrderConfirmation | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
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
      <p style={{ fontSize: "12px", color: "#1c1c1a", lineHeight: 1.6, margin: 0 }}>
        {[address.first_name, address.last_name].filter(Boolean).join(" ")}
        {address.address_1 && <><br />{address.address_1}</>}
        {address.city && <><br />{[address.city, address.state, address.postcode].filter(Boolean).join(", ")}</>}
        {address.country && <><br />{address.country}</>}
      </p>
    </div>
  );
}

export function ReviewStep({ cart, customer, order, isLoading, error }: ReviewStepProps) {
  const symbol = cart?.totals.currency_symbol ?? "₹";
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;

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
        <p style={{ fontSize: "16px", fontWeight: 600, color: "#1c1c1a", margin: 0 }}>
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
                <p style={{ fontSize: "11px", color: "#999", margin: "2px 0 0 0" }}>
                  Qty: {item.quantity}
                </p>
              </div>
              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "#1c1c1a" }}>
                {formatPrice(item.totals.line_total, symbol, minorUnit)}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p style={{ fontSize: "12px", color: "#ef4444", margin: "0 0 8px 0" }}>
          {error.message}
        </p>
      )}

      {/* Place Order button — disabled in PR 3; payment integration arrives in PR 4 */}
      <button
        type="button"
        disabled
        title="Payment integration coming in next release"
        style={{
          width: "100%",
          padding: "12px",
          background: "#ccc",
          color: "#fff",
          border: "none",
          borderRadius: "11px",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: "not-allowed",
          opacity: isLoading ? 0.65 : 1,
        }}
      >
        Place Order
      </button>
      <p
        style={{
          fontSize: "11px",
          color: "#999",
          textAlign: "center",
          marginTop: "6px",
          marginBottom: 0,
        }}
      >
        Payment integration coming in next release
      </p>
    </div>
  );
}
