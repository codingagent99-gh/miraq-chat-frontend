import ReactMarkdown from "react-markdown";
import type { ChatMessage, FilterSuggestion } from "../types/api";
import { ProductCards } from "./ProductCards";
import { CartDisplay } from "./CartDisplay";
import { OrderListCards } from "./OrderListCards";
import { OrderConfirmation } from "./OrderConfirmation";
import { SuggestionChips } from "./SuggestionChips";
import { FilterSuggestionChips } from "./FilterSuggestionChips";

interface MessageRowProps {
  message: ChatMessage;
  onSuggestion: (text: string) => void;
  onFilterSuggestion: (suggestion: FilterSuggestion) => void;
  onOrderClick: (orderId: number, orderNumber: string) => void;
  miraQIcon: string;
}

export function MessageRow({
  message,
  onSuggestion,
  onFilterSuggestion,
  onOrderClick,
  miraQIcon,
}: MessageRowProps) {
  return (
    <div className={`xpert-message-row ${message.role}`}>
      {message.role === "bot" && (
        <div className="xpert-bot-avatar">
          <img
            style={{ height: "100%", width: "100%" }}
            src={miraQIcon}
            alt="MiraQ"
          />
        </div>
      )}

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

          {/* Order history: always show clickable cards (1 or more orders, no paymentUrl) */}
          {message.orders &&
            message.orders.length >= 1 &&
            !message.paymentUrl && (
              <OrderListCards
                orders={message.orders}
                onOrderClick={onOrderClick}
              />
            )}

          {/* Newly placed order: show confirmation UI with optional payment link */}
          {message.orders &&
            message.orders.length === 1 &&
            message.paymentUrl && (
              <OrderConfirmation
                order={message.orders[0]}
                paymentUrl={message.paymentUrl}
              />
            )}

          {/* Filter suggestions — shown on zero-result responses, above conversational chips */}
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
