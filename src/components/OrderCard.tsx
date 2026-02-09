import { Card, Badge, ListGroup } from "react-bootstrap";
import type { Order } from "../types/api";
import styles from "./OrderCard.module.css";

interface Props {
  order: Order;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    completed: "success",
    processing: "primary",
    pending: "warning",
    "on-hold": "secondary",
    cancelled: "danger",
    refunded: "info",
    failed: "danger",
  };
  return map[status] || "secondary";
}

function getStatusIcon(status: string): string {
  const map: Record<string, string> = {
    completed: "✅",
    processing: "⚙️",
    pending: "⏳",
    "on-hold": "⏸️",
    cancelled: "❌",
    refunded: "💸",
    failed: "⚠️",
  };
  return map[status] || "📦";
}

export default function OrderCard({ order }: Props) {
  return (
    <Card className={styles.card}>
      {/* Header */}
      <Card.Header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.orderIcon}>
            {getStatusIcon(order.status)}
          </span>
          <div>
            <div className={styles.orderNumber}>#{order.order_number}</div>
            <div className={styles.orderDate}>
              {formatDate(order.date_created)}
            </div>
          </div>
        </div>
        <Badge bg={getStatusColor(order.status)} className={styles.statusBadge}>
          {order.status}
        </Badge>
      </Card.Header>

      {/* Order Items */}
      <ListGroup variant="flush">
        {order.items.slice(0, 3).map((item, idx) => (
          <ListGroup.Item key={idx} className={styles.item}>
            <div className={styles.itemInfo}>
              <span className={styles.itemName}>{item.name}</span>
              <span className={styles.itemQty}>x{item.quantity}</span>
            </div>
            <span className={styles.itemPrice}>
              ${(item.price * item.quantity).toFixed(2)}
            </span>
          </ListGroup.Item>
        ))}
        {order.items.length > 3 && (
          <ListGroup.Item className={styles.moreItems}>
            + {order.items.length - 3} more item(s)
          </ListGroup.Item>
        )}
      </ListGroup>

      {/* Footer - Total */}
      <Card.Footer className={styles.footer}>
        <span className={styles.totalLabel}>Total:</span>
        <span className={styles.totalAmount}>${order.total.toFixed(2)}</span>
      </Card.Footer>
    </Card>
  );
}
