import { useState } from "react";
import { FiSend, FiShoppingCart, FiX, FiMinus } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, Product, CartData, Order } from "./types/api";
import { useChat } from "./hooks/useChat";

interface ChatWidgetProps {
  apiKey?: string;
  apiUrl?: string;
  customerId?: number;
  customerEmail?: string;
  /** Base URL of the folder that hosts the widget assets (e.g. "https://silfratech.in/chatbot/"). */
  assetBaseUrl?: string;
}

export function ChatWidget({
  apiKey,
  apiUrl,
  customerId,
  customerEmail,
  assetBaseUrl = "https://silfratech.in/chatbot/",
}: ChatWidgetProps) {
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;

  const [screen, setScreen] = useState<"home" | "chat">("home");
  const [panelOpen, setPanelOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const {
    messages,
    loading,
    sendMessage,
    bottomRef,
    inputRef,
    pagination,
    loadMore,
  } = useChat({
    apiUrl,
    apiKey,
    customerId,
    customerEmail,
  });

  // Derive cart count from the most recent message that contains cart data
  const cartCount = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].cart) return messages[i].cart!.item_count;
    }
    return 0;
  })();

  const handleSend = () => {
    if (!inputValue.trim() || loading) return;
    sendMessage(inputValue);
    setInputValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (text: string) => {
    sendMessage(text);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (screen === "home") {
    return (
      <div id="silfra-chat-widget-container">
        <WidgetContainer panelOpen={panelOpen} setPanelOpen={setPanelOpen}>
          <HomeScreen
            onStartChat={() => setScreen("chat")}
            miraQIcon={MiraQIcon}
          />
        </WidgetContainer>
      </div>
    );
  }

  // Find the last bot message that has products — use ITS pagination data
  // This is more reliable than the hook-level pagination state because
  // it's stored directly on the message and doesn't depend on state timing.
  const lastProductBotMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (
        messages[i].role === "bot" &&
        messages[i].products &&
        messages[i].products!.length > 0
      ) {
        return messages[i];
      }
    }
    return null;
  })();

  // Use the message's own pagination data OR fall back to hook-level pagination
  const activePagination = lastProductBotMessage?.pagination ?? pagination;

  const showServerLoadMore =
    activePagination &&
    activePagination.has_more &&
    !loading &&
    lastProductBotMessage != null;

  return (
    <div id="silfra-chat-widget-container">
      <WidgetContainer panelOpen={panelOpen} setPanelOpen={setPanelOpen}>
        <div className="xpert-chat-window">
          {/* Header */}
          <div className="xpert-chat-header">
            <button
              className="xpert-icon-btn"
              onClick={() => setScreen("home")}
              aria-label="Back to home"
            >
              <FiMinus size={20} />
            </button>
            <div className="xpert-chat-header-info">
              <h3 className="xpert-chat-header-title">
                MiraQ Commerce Assistant
              </h3>
              <p className="xpert-chat-header-sub">Online • Ready to help</p>
            </div>
            {cartCount > 0 && (
              <div className="xpert-cart-badge">
                <FiShoppingCart size={20} />
                <span className="xpert-cart-count">{cartCount}</span>
              </div>
            )}
            <button
              className="xpert-icon-btn"
              onClick={() => setPanelOpen(false)}
              aria-label="Close chat"
            >
              <FiX size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="xpert-chat-messages">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                onSuggestion={handleSuggestionClick}
                miraQIcon={MiraQIcon}
              />
            ))}

            {/* Server-side "Load More" — fetch next backend page */}
            {showServerLoadMore && (
              <div className="xpert-pagination-controls">
                {activePagination!.total_items != null &&
                  activePagination!.total_pages != null && (
                    <p className="xpert-pagination-info">
                      Showing page {activePagination!.page} of{" "}
                      {activePagination!.total_pages} •{" "}
                      {activePagination!.total_items} total results
                    </p>
                  )}
                <button
                  className="xpert-load-more-btn"
                  onClick={loadMore}
                  type="button"
                >
                  Load More Products ↓
                </button>
              </div>
            )}

            {loading && (
              <div className="xpert-message-row assistant">
                <div className="xpert-bot-avatar">
                  <img
                    style={{ height: "100%", width: "100%" }}
                    src={MiraQIcon}
                    alt="MiraQ"
                  />
                </div>
                <div className="xpert-message-bubble">
                  <div className="xpert-bubble-content">
                    <div className="dot-loader">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="xpert-chat-input-area">
            <textarea
              ref={inputRef}
              className="xpert-chat-input"
              placeholder="Ask about products, orders, or your cart..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              rows={1}
              disabled={loading}
              autoFocus
            />
            <button
              className="xpert-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim() || loading}
              aria-label="Send message"
              type="button"
            >
              <FiSend size={18} />
            </button>
          </div>

          <p className="xpert-footer-hint">
            Powered by AI • Shopping made simple
          </p>
        </div>

        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          closeOnClick
          pauseOnHover
          draggable
        />
      </WidgetContainer>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Message Row
// ════════════════════════════════════════════════════════════════
function MessageRow({
  message,
  onSuggestion,
  miraQIcon,
}: {
  message: ChatMessage;
  onSuggestion: (text: string) => void;
  miraQIcon: string;
}) {
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
          <ReactMarkdown>{message.text}</ReactMarkdown>

          {message.products && message.products.length > 0 && (
            <ProductCards products={message.products} />
          )}

          {message.cart && <CartDisplay cart={message.cart} />}

          {message.orders && message.orders.length === 1 && (
            <OrderConfirmation
              order={message.orders[0]}
              paymentUrl={message.paymentUrl}
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

// ════════════════════════════════════════════════════════════════
// Product Cards — simple grid, no local pagination
// Server handles page size; "Load More" fetches next page.
// ════════════════════════════════════════════════════════════════
function ProductCards({ products }: { products: Product[] }) {
  return (
    <div className="xpert-product-grid">
      {products.map((product) => (
        <div key={product.id} className="xpert-product-card">
          {product.images && product.images[0] && (
            <img
              src={product.images[0]}
              alt={product.name}
              className="xpert-product-image"
              loading="lazy"
            />
          )}
          <div className="xpert-product-info">
            <h4 className="xpert-product-name">{product.name}</h4>
            <div className="xpert-product-price">
              {product.on_sale && product.sale_price ? (
                <>
                  {product.sale_price > 0 && (
                    <span className="xpert-price-sale">
                      ${product.sale_price}
                    </span>
                  )}
                  {product.price > 0 && (
                    <span className="xpert-price-regular">
                      ${product.price}
                    </span>
                  )}
                </>
              ) : (
                product.price > 0 && (
                  <span className="xpert-price">${product.price}</span>
                )
              )}
            </div>
            {product.on_sale && <span className="xpert-sale-badge">SALE</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Suggestion Chips
// ════════════════════════════════════════════════════════════════
function SuggestionChips({
  suggestions,
  isFlowPrompt,
  onSelect,
}: {
  suggestions: string[];
  isFlowPrompt?: boolean;
  onSelect: (s: string) => void;
}) {
  return (
    <div
      className={`xpert-suggestions ${isFlowPrompt ? "xpert-suggestions--flow" : ""}`}
    >
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          type="button"
          className={`xpert-suggestion-chip ${isFlowPrompt ? "xpert-suggestion-chip--flow" : ""}`}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Cart Display
// ════════════════════════════════════════════════════════════════
function CartDisplay({ cart }: { cart: CartData }) {
  if (cart.item_count === 0) {
    return (
      <div className="xpert-cart-empty">
        <FiShoppingCart size={32} />
        <p>Your cart is empty</p>
      </div>
    );
  }

  return (
    <div className="xpert-cart-summary">
      <h4 className="xpert-cart-title">
        <FiShoppingCart /> Your Cart ({cart.item_count} items)
      </h4>
      <div className="xpert-cart-items">
        {cart.items.map((item, idx) => (
          <div key={idx} className="xpert-cart-item">
            {item.image && (
              <img
                src={item.image}
                alt={item.name}
                className="xpert-cart-item-image"
              />
            )}
            <div className="xpert-cart-item-info">
              <p className="xpert-cart-item-name">{item.name}</p>
              <p className="xpert-cart-item-meta">
                ${item.price} x {item.quantity}
              </p>
            </div>
            <p className="xpert-cart-item-total">
              ${(item.price * item.quantity).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
      <div className="xpert-cart-totals">
        <div className="xpert-cart-total-row">
          <span>Subtotal:</span>
          <span>${cart.totals.subtotal.toFixed(2)}</span>
        </div>
        {cart.totals.shipping > 0 && (
          <div className="xpert-cart-total-row">
            <span>Shipping:</span>
            <span>${cart.totals.shipping.toFixed(2)}</span>
          </div>
        )}
        {cart.totals.tax > 0 && (
          <div className="xpert-cart-total-row">
            <span>Tax:</span>
            <span>${cart.totals.tax.toFixed(2)}</span>
          </div>
        )}
        <div className="xpert-cart-total-row xpert-cart-total-final">
          <span>Total:</span>
          <span>${cart.totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Order Confirmation
// ════════════════════════════════════════════════════════════════
function OrderConfirmation({
  order,
  paymentUrl,
}: {
  order: Order;
  paymentUrl?: string;
}) {
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

// ════════════════════════════════════════════════════════════════
// Home Screen
// ════════════════════════════════════════════════════════════════
function HomeScreen({
  onStartChat,
  miraQIcon,
}: {
  onStartChat: () => void;
  miraQIcon: string;
}) {
  return (
    <div className="xpert-home-screen">
      <div className="xpert-profile-card">
        <div className="xpert-profile-icon">
          <img
            style={{ height: "100%", width: "100%" }}
            src={miraQIcon}
            alt="MiraQ"
          />
        </div>
        <div className="xpert-profile-info">
          <p className="xpert-profile-label">Welcome to</p>
          <h2 className="xpert-profile-name">MiraQ Commerce Assistant</h2>
          <p className="xpert-profile-sub">AI-Powered Shopping Help</p>
        </div>
        <div className="xpert-ready-badge">● Ready</div>
      </div>

      <div className="xpert-main-content">
        <h3 className="xpert-content-title">How can I help you today?</h3>
        <p className="xpert-content-desc">
          I can help you find products, manage your cart, track orders, and
          more!
        </p>

        <div className="xpert-features-list">
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">🔍</span>
            <span className="xpert-feature-text">
              Search and discover products
            </span>
          </div>
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">🛒</span>
            <span className="xpert-feature-text">
              Add items to cart and checkout
            </span>
          </div>
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">📦</span>
            <span className="xpert-feature-text">
              View and track your orders
            </span>
          </div>
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">💬</span>
            <span className="xpert-feature-text">
              Get instant shopping assistance
            </span>
          </div>
        </div>

        <div className="xpert-bottom-actions single-button">
          <button className="xpert-start-chat-btn" onClick={onStartChat}>
            Start Shopping 🚀
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Widget Container
// ════════════════════════════════════════════════════════════════
function WidgetContainer({
  panelOpen,
  setPanelOpen,
  children,
}: {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      {!panelOpen && (
        <button
          className="xpert-floating-btn"
          onClick={() => setPanelOpen(true)}
          aria-label="Open chat"
        >
          <FiShoppingCart size={24} />
        </button>
      )}

      {panelOpen && <div className="xpert-panel">{children}</div>}
    </>
  );
}
