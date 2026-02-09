import ProductCard from "./ProductCard";
import OrderCard from "./OrderCard";
import type { ChatMessage } from "../types/api";
import styles from "./MessageBubble.module.css";

interface Props {
  message: ChatMessage;
  onSuggestion: (text: string) => void;
}

/* simple markdown-lite: bold **text** and line-breaks */
function renderText(raw: string) {
  const html = raw
    .replace(/\n/g, "<br/>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function MessageBubble({ message, onSuggestion }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`${styles.row} ${isUser ? styles.rowUser : styles.rowBot}`}>
      {/* avatar */}
      {/* {!isUser && <div className={styles.avatar}>☕</div>} */}
      {!isUser && <div className={styles.avatar}></div>}

      <div className={styles.wrap}>
        {/* text bubble */}
        <div
          className={`${styles.bubble} ${isUser ? styles.bubbleUser : styles.bubbleBot}`}
        >
          {renderText(message.text)}
        </div>

        {/* product strip */}
        {message.products && message.products.length > 0 && (
          <div className={styles.productStrip}>
            {message.products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}

        {/* order strip */}
        {message.orders && message.orders.length > 0 && (
          <div className={styles.productStrip}>
            {message.orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}

        {/* purchase info */}
        {message.purchase_info && (
          <div className={styles.purchaseInfo}>
            {message.purchase_info.purchased ? (
              <div className={styles.purchasedYes}>
                ✅ <strong>Yes, you've purchased this</strong>
                <div className={styles.purchaseDetails}>
                  {message.purchase_info.last_purchase_date && (
                    <span>
                      Last:{" "}
                      {new Date(
                        message.purchase_info.last_purchase_date,
                      ).toLocaleDateString()}
                    </span>
                  )}
                  {message.purchase_info.total_purchases > 1 && (
                    <span>({message.purchase_info.total_purchases} times)</span>
                  )}
                </div>
              </div>
            ) : (
              <div className={styles.purchasedNo}>
                ℹ️ <strong>No previous purchase found</strong>
              </div>
            )}
          </div>
        )}

        {/* suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className={styles.suggestions}>
            {message.suggestions.map((s) => (
              <button
                key={s}
                className={styles.suggestionPill}
                onClick={() => onSuggestion(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* timestamp */}
        <span className={`${styles.time} ${isUser ? styles.timeUser : ""}`}>
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
