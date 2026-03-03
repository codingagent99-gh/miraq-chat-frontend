import { useState } from "react";
import type { Order } from "../types/api";

interface OrderConfirmationProps {
  order: Order;
  paymentUrl?: string;
}

export function OrderConfirmation({ order, paymentUrl }: OrderConfirmationProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = () => {
    if (paymentUrl) {
      navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const totalQuantity =
    order.items && order.items.length > 0
      ? order.items.reduce((sum, item) => sum + item.quantity, 0)
      : (order.item_count ?? 1);

  return (
    <div className="xpert-order-confirmation">
      <div className="xpert-order-header">
        <h4>✅ Order Confirmed</h4>
        <p className="xpert-order-number">Order #{order.order_number}</p>
      </div>

      <div className="xpert-order-details">
        {order.items && order.items.length > 0 ? (
          order.items.map((item, idx) => (
            <div key={idx} className="xpert-order-detail-row">
              <span>{item.name}</span>
              <span>× {item.quantity}</span>
            </div>
          ))
        ) : (
          <div className="xpert-order-detail-row">
            <span>Quantity:</span>
            <span>× {totalQuantity}</span>
          </div>
        )}

        {order.items && order.items.length > 1 && (
          <div className="xpert-order-detail-row">
            <span>Total Items:</span>
            <span>{totalQuantity}</span>
          </div>
        )}

        <div className="xpert-order-detail-row">
          <span>Total:</span>
          <span className="xpert-order-total">${order.total.toFixed(2)}</span>
        </div>
      </div>

      {paymentUrl && (
        <div className="xpert-payment-section">
          <p className="xpert-payment-label">Complete Your Payment:</p>
          <a
            href={paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="xpert-payment-btn"
          >
            💳 Pay ${order.total.toFixed(2)}
          </a>
          <button onClick={copyLink} className="xpert-copy-link-btn">
            {copied ? "✓ Copied!" : "📋 Copy Payment Link"}
          </button>
        </div>
      )}
    </div>
  );
}
