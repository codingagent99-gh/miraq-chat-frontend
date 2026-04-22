import ReactMarkdown from "react-markdown";
import { FiEdit2 } from "react-icons/fi";
import type { ChatMessage, FilterSuggestion, Product } from "../types/api";
import { ProductCards } from "./ProductCards";
import { CartDisplay } from "./CartDisplay";
import { OrderListCards } from "./OrderListCards";
import { OrderConfirmation } from "./OrderConfirmation";
import { SuggestionChips } from "./SuggestionChips";
import { FilterSuggestionChips } from "./FilterSuggestionChips";
import { CategoryGrid } from "./CategoryGrid";

interface MessageRowProps {
  message: ChatMessage;
  /** True when this message is currently loaded into the input for editing */
  isBeingEdited?: boolean;
  onSuggestion: (text: string) => void;
  onFilterSuggestion: (suggestion: FilterSuggestion) => void;
  onEdit: (id: string, text: string) => void;
  onOrderClick: (orderId: number, orderNumber: string) => void;
  onProductClick?: (product: Product) => void;
  miraQIcon: string;
}

/** Formats a Date into a human-readable chat timestamp.
 *  - Today      → "9:41 AM"
 *  - Yesterday  → "Yesterday 9:41 AM"
 *  - Older      → "Mar 25, 9:41 AM"
 */
function formatTimestamp(date: Date): string {
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return timeStr;
  if (isYesterday) return `Yesterday ${timeStr}`;

  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  return `${dateStr}, ${timeStr}`;
}

const timestampStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#94a3b8",
  marginTop: "4px",
  lineHeight: 1,
  userSelect: "none",
};

export function MessageRow({
  message,
  isBeingEdited = false,
  onSuggestion,
  onFilterSuggestion,
  onEdit,
  onOrderClick,
  onProductClick,
  miraQIcon,
}: MessageRowProps) {
  const formattedTime = formatTimestamp(new Date(message.timestamp));

  if (message.role === "user") {
    return (
      <div
        className={`xpert-message-row user${isBeingEdited ? " xpert-message-row--editing" : ""}`}
      >
        {/* Wrapper keeps the edit button and bubble together so button
            appears to the left of the bubble in the reversed row */}
        <div className="xpert-user-message-wrapper">
          <button
            className="xpert-edit-btn"
            onClick={() => onEdit(message.id, message.text)}
            aria-label="Edit this message"
            type="button"
            title="Edit message"
          >
            <FiEdit2 size={13} />
          </button>
          <div className="xpert-message-bubble">
            <div className="xpert-bubble-content">
              <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
            <p style={{ ...timestampStyle, textAlign: "right" }}>
              {formattedTime}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Bot message
  return (
    <div className="xpert-message-row bot">
      <div className="xpert-bot-avatar">
        <img
          style={{ height: "100%", width: "100%" }}
          src={miraQIcon}
          alt="MiraQ"
        />
      </div>

      <div className="xpert-message-bubble">
        <div className="xpert-bubble-content">
          {/* Suppress text when order list cards are shown — cards are the UI */}
          {!(
            message.orders &&
            message.orders.length >= 1 &&
            !message.paymentUrl
          ) && <ReactMarkdown>{message.text}</ReactMarkdown>}

          {message.categories && message.categories.length > 0 && (
            <CategoryGrid
              categories={message.categories}
              onCategoryClick={onSuggestion}
            />
          )}

          {message.products && message.products.length > 0 && (
            <ProductCards
              products={message.products}
              onProductClick={onProductClick}
            />
          )}

          {message.cart && <CartDisplay cart={message.cart} />}

          {message.orders &&
            message.orders.length >= 1 &&
            !message.paymentUrl && (
              <OrderListCards
                orders={message.orders}
                onOrderClick={onOrderClick}
              />
            )}

          {message.orders &&
            message.orders.length === 1 &&
            message.paymentUrl && (
              <OrderConfirmation
                order={message.orders[0]}
                paymentUrl={message.paymentUrl}
              />
            )}

          {message.filterSuggestions &&
            message.filterSuggestions.length > 0 && (
              <FilterSuggestionChips
                suggestions={message.filterSuggestions}
                onSelect={onFilterSuggestion}
              />
            )}

          {message.suggestions && message.suggestions.length > 0 && (
            <SuggestionChips
              suggestions={message.suggestions}
              isFlowPrompt={message.isFlowPrompt}
              onSelect={onSuggestion}
            />
          )}
        </div>
        <p style={{ ...timestampStyle, textAlign: "left" }}>{formattedTime}</p>
      </div>
    </div>
  );
}
