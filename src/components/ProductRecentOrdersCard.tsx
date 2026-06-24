import type { ProductOrderHistoryItem } from "../types/actions";

interface ProductRecentOrdersCardProps {
  orders: ProductOrderHistoryItem[];
  /** Sends a message to the chat — used to trigger the reorder via __PRODUCT_REORDER__ */
  onReorder: (message: string) => void;
}

/** Format "2026-05-25" → "25 May 2026" */
function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function ProductRecentOrdersCard({
  orders,
  onReorder,
}: ProductRecentOrdersCardProps) {
  if (!orders || orders.length === 0) return null;

  const handleReorder = (order: ProductOrderHistoryItem) => {
    const payload = JSON.stringify({
      order_id: order.order_id,
      order_number: order.order_number,
      customer_id: order.customer_id,
      customer_display_name: order.customer_display_name,
      items: order.items,
    });
    onReorder(`__PRODUCT_REORDER__${payload}`);
  };

  return (
    <div className="xpert-product-recent-orders">
      <p className="xpert-product-recent-orders__heading">
        Previously ordered:
      </p>

      <div className="xpert-product-recent-orders__list">
        {orders.map((order, idx) => {
          const itemsText = order.items
            .map((item) => `${item.product_name} ×${item.quantity}`)
            .join(", ");

          return (
            <button
              key={order.order_id || idx}
              className="xpert-product-recent-orders__item"
              onClick={() => handleReorder(order)}
              type="button"
            >
              <div className="xpert-product-recent-orders__item-meta">
                <span className="xpert-product-recent-orders__order-number">
                  Order #{order.order_number}
                </span>
                <span className="xpert-product-recent-orders__date">
                  {formatDate(order.date_created)}
                </span>
              </div>

              <div className="xpert-product-recent-orders__item-detail">
                <span className="xpert-product-recent-orders__customer">
                  {order.customer_display_name}
                </span>
                {order.customer_email && (
                  <span className="xpert-product-recent-orders__email">
                    {order.customer_email}
                  </span>
                )}
                <span className="xpert-product-recent-orders__items-text">
                  {itemsText}
                </span>
              </div>

              <span className="xpert-product-recent-orders__reorder-cta">
                Reorder ↗
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
