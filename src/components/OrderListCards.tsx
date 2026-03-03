import type { Order } from "../types/api";

const STATUS_COLOR: Record<string, string> = {
  completed: "#22c55e",
  processing: "#3b82f6",
  "on-hold": "#f59e0b",
  cancelled: "#ef4444",
  refunded: "#8b5cf6",
  pending: "#94a3b8",
  failed: "#ef4444",
};

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

interface OrderListCardsProps {
  orders: Order[];
  onOrderClick: (orderId: number, orderNumber: string) => void;
}

export function OrderListCards({ orders, onOrderClick }: OrderListCardsProps) {
  return (
    <div className="xpert-order-list">
      {orders.map((order) => {
        const statusColor =
          STATUS_COLOR[order.status?.toLowerCase()] ?? "#94a3b8";
        const statusBg = statusColor + "18";
        const itemCount = order.item_count ?? order.items?.length ?? 0;
        const totalStr =
          typeof order.total === "number"
            ? order.total.toFixed(2)
            : order.total;
        return (
          <button
            key={order.id}
            className="xpert-order-card"
            onClick={() => onOrderClick(order.id, order.order_number)}
            type="button"
          >
            <div className="xpert-order-card-header">
              <span className="xpert-order-card-number">
                Order #{order.order_number}
              </span>
              <span
                className="xpert-order-card-status"
                style={{ color: statusColor, background: statusBg }}
              >
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
            </div>
            <div className="xpert-order-card-date">
              {formatDate(order.date_created)}
            </div>
            <div className="xpert-order-card-footer">
              <span>
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </span>
              <span className="xpert-order-card-total">
                {order.currency ?? "₹"}
                {totalStr}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
