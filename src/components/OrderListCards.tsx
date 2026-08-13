import type { Order } from "../types/api";
import {
  buildOrderCsv,
  buildOrdersCsv,
  csvFilename,
  downloadCsv,
} from "../utils/orderCsv";

const STATUS_COLOR: Record<string, string> = {
  completed: "#22c55e",
  processing: "#3b82f6",
  "on-hold": "#f59e0b",
  cancelled: "#ef4444",
  refunded: "#8b5cf6",
  pending: "#94a3b8",
  failed: "#ef4444",
};

function decodeCurrency(raw: string | undefined): string {
  if (!raw) return "₹";
  return raw.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(Number(code)),
  );
}

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
  /** Show CSV export controls. Admin-only surface. */
  allowDownload?: boolean;
}

export function OrderListCards({
  orders,
  onOrderClick,
  allowDownload = false,
}: OrderListCardsProps) {
  function downloadOne(order: Order) {
    downloadCsv(
      csvFilename(["order", order.order_number]),
      buildOrderCsv(order),
    );
  }

  function downloadAll() {
    downloadCsv(csvFilename(["orders"]), buildOrdersCsv(orders));
  }

  return (
    <div className="xpert-order-list">
      {allowDownload && orders.length > 0 && (
        <div className="xpert-order-list-toolbar">
          {/* Labelled with the count, not "all": this exports the orders
              currently loaded in the conversation, not every order in the
              chosen date range. Naming the number keeps the button honest. */}
          <button
            type="button"
            className="xpert-order-download-all"
            onClick={downloadAll}
          >
            ⬇ Download these {orders.length} orders (CSV)
          </button>
        </div>
      )}
      {orders.map((order) => {
        const statusColor =
          STATUS_COLOR[order.status?.toLowerCase()] ?? "#94a3b8";
        const statusBg = statusColor + "18";
        const itemCount = order.item_count ?? order.items?.length ?? 0;
        const totalNum =
          typeof order.total === "number"
            ? order.total
            : parseFloat(order.total);
        const totalStr =
          typeof order.total === "number"
            ? order.total.toFixed(2)
            : order.total;
        return (
          <div
            key={order.id}
            className="xpert-order-card"
            role="button"
            tabIndex={0}
            onClick={() => onOrderClick(order.id, order.order_number)}
            onKeyDown={(e) => {
              // Restores the Enter/Space activation a real <button> gave for
              // free. Dropped when the element changed to a div to allow the
              // nested download button.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOrderClick(order.id, order.order_number);
              }
            }}
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
            <div className="xpert-order-card-items">
              {order.items?.map((item, idx) => (
                <div key={idx} className="xpert-order-card-item">
                  <div className="xpert-order-card-item-line">
                    <span className="xpert-order-card-item-name">
                      {item.name}
                    </span>
                    <span className="xpert-order-card-item-qty">
                      × {item.quantity}
                    </span>
                  </div>
                  {item.variation_attributes &&
                    item.variation_attributes.length > 0 && (
                      <div className="xpert-order-card-item-variation">
                        {item.variation_attributes
                          .map((v) => v.value)
                          .join(" · ")}
                      </div>
                    )}
                </div>
              ))}
            </div>
            {order.shipping?.address_1 && (
              <div className="xpert-order-card-shipping">
                {[
                  [order.shipping.first_name, order.shipping.last_name]
                    .filter(Boolean)
                    .join(" "),
                  order.shipping.address_1,
                  order.shipping.city,
                  order.shipping.state,
                  order.shipping.postcode,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
            <div className="xpert-order-card-footer">
              <span>
                {itemCount} item{itemCount !== 1 ? "s" : ""}
              </span>
              {totalNum > 0 && (
                <span className="xpert-order-card-total">
                  {decodeCurrency(order.currency)}
                  {totalStr}
                </span>
              )}
            </div>
            {allowDownload && (
              <button
                type="button"
                className="xpert-order-download"
                onClick={(e) => {
                  // The card itself opens the order detail; without this the
                  // download would also navigate away behind the file save.
                  e.stopPropagation();
                  downloadOne(order);
                }}
              >
                ⬇ Download CSV
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
