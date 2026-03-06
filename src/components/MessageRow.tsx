import ReactMarkdown from "react-markdown";
import { FiEdit2 } from "react-icons/fi";
import type { ChatMessage, FilterSuggestion } from "../types/api";
import { ProductCards } from "./ProductCards";
import { CartDisplay } from "./CartDisplay";
import { OrderListCards } from "./OrderListCards";
import { OrderConfirmation } from "./OrderConfirmation";
import { SuggestionChips } from "./SuggestionChips";
import { FilterSuggestionChips } from "./FilterSuggestionChips";

interface MessageRowProps {
  message: ChatMessage;
  /** True when this message is currently loaded into the input for editing */
  isBeingEdited?: boolean;
  onSuggestion: (text: string) => void;
  onFilterSuggestion: (suggestion: FilterSuggestion) => void;
  onEdit: (id: string, text: string) => void;
  onOrderClick: (orderId: number, orderNumber: string) => void;
  miraQIcon: string;
}

export function MessageRow({
  message,
  isBeingEdited = false,
  onSuggestion,
  onFilterSuggestion,
  onEdit,
  onOrderClick,
  miraQIcon,
}: MessageRowProps) {
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

          {message.products && message.products.length > 0 && (
            <ProductCards products={message.products} />
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
      </div>
    </div>
  );
}
