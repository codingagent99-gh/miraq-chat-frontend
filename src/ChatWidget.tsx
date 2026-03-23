import { useState, useCallback, useRef } from "react";
import { FiSend, FiX } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useChat } from "./hooks/useChat";
import { createApiClient } from "./services/api";
import { WidgetContainer } from "./components/WidgetContainer";
import { HomeScreen } from "./components/HomeScreen";
import { ChatHeader } from "./components/ChatHeader";
import { MessageRow } from "./components/MessageRow";
import { ProductDetailPanel } from "./components/ProductDetailPanel";
import type { Product } from "./types/api";

interface ChatWidgetProps {
  apiKey?: string;
  apiUrl?: string;
  customerId?: number;
  customerEmail?: string;
  customerName?: string;
  customerRole?: string;
  assetBaseUrl?: string;
}

export function ChatWidget({
  apiKey,
  apiUrl,
  customerId,
  customerEmail,
  customerName,
  customerRole,
  assetBaseUrl,
}: ChatWidgetProps) {
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;

  // Widget is only functional when customer info is present
  const isLoggedIn = !!(customerId || customerEmail);

  const [screen, setScreen] = useState<"home" | "chat">("home");
  const [panelOpen, setPanelOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Product detail state ──
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Keep a stable reference to the API client for product fetches
  const apiClientRef = useRef(createApiClient(apiUrl, apiKey));

  const {
    messages,
    loading,
    sendMessage,
    editMessage,
    sendFilterSuggestion,
    bottomRef,
    inputRef,
    pagination,
    loadMore,
    orderPagination,
    loadMoreOrders,
  } = useChat({ apiUrl, apiKey, customerId, customerEmail, customerRole });

  const cartCount = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].cart) return messages[i].cart!.item_count;
    }
    return 0;
  })();

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || loading) return;
    if (editingId) {
      editMessage(editingId, inputValue);
      setEditingId(null);
    } else {
      sendMessage(inputValue);
    }
    setInputValue("");
  }, [inputValue, loading, editingId, editMessage, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && editingId) {
      handleCancelEdit();
    }
  };

  const handleSuggestionClick = (text: string) => {
    if (editingId) {
      setEditingId(null);
      setInputValue("");
    }
    sendMessage(text);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleEditClick = useCallback(
    (id: string, text: string) => {
      if (loading) return;
      setEditingId(id);
      setInputValue(text);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = text.length;
          inputRef.current.setSelectionRange(len, len);
        }
      }, 50);
    },
    [loading, inputRef],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setInputValue("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [inputRef]);

  // ── Product click handler ──
  const handleProductClick = useCallback((product: Product) => {
    setSelectedProduct(product);
  }, []);

  const handleProductDetailClose = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  const handleAskAbout = useCallback(
    (productName: string) => {
      setSelectedProduct(null);
      sendMessage(`Tell me more about ${productName}`);
    },
    [sendMessage],
  );

  const handleOrderProduct = useCallback(
    (productName: string) => {
      setSelectedProduct(null);
      sendMessage(`I want to order ${productName}`);
    },
    [sendMessage],
  );

  const fetchProductDetail = useCallback(
    (id: number) => apiClientRef.current.fetchProduct(id),
    [],
  );

  if (screen === "home") {
    return (
      <div id="silfra-chat-widget-container">
        <WidgetContainer
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          assetBaseUrl={assetBaseUrl || ""}
        >
          {!isLoggedIn ? (
            /* ── THE GUEST "LOGIN REQUIRED" SCREEN ── */
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                padding: "2rem",
                textAlign: "center",
                backgroundColor: "#fff",
              }}
            >
              {/* ── Close Button ── */}
              <button
                onClick={() => setPanelOpen(false)}
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "#666",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                aria-label="Close widget"
              >
                <FiX size={20} />
              </button>

              <img
                src={MiraQIcon}
                alt="MiraQ"
                style={{
                  width: "64px",
                  height: "64px",
                  marginBottom: "1.5rem",
                  borderRadius: "50%",
                }}
              />
              <h3
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "#111",
                  fontSize: "18px",
                }}
              >
                Welcome! 👋
              </h3>
              <p
                style={{
                  margin: "0",
                  color: "#666",
                  fontSize: "14px",
                  lineHeight: "1.5",
                }}
              >
                Please log in to your account to use our AI shopping assistant,
                track your orders, and get personalized recommendations.
              </p>
            </div>
          ) : (
            /* ── THE LOGGED-IN HOME SCREEN ── */
            <HomeScreen
              onStartChat={() => setScreen("chat")}
              onClose={() => setPanelOpen(false)}
              miraQIcon={MiraQIcon}
              customerName={customerName}
              isLoggedIn={isLoggedIn}
            />
          )}
        </WidgetContainer>
      </div>
    );
  }

  const lastBotMessage = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "bot") return messages[i];
    }
    return null;
  })();

  const lastProductBotMessage =
    !loading && lastBotMessage?.products && lastBotMessage.products.length > 0
      ? lastBotMessage
      : null;

  const activePagination = lastProductBotMessage?.pagination ?? pagination;
  const showServerLoadMore =
    activePagination?.has_more && !loading && lastProductBotMessage != null;

  const lastOrderBotMessage =
    !loading && lastBotMessage?.orders && lastBotMessage.orders.length > 1
      ? lastBotMessage
      : null;

  const activeOrderPagination =
    lastOrderBotMessage?.orderPagination ?? orderPagination;
  const showOrderLoadMore =
    activeOrderPagination?.has_more && !loading && lastOrderBotMessage != null;

  return (
    <div id="silfra-chat-widget-container">
      <WidgetContainer
        panelOpen={panelOpen}
        setPanelOpen={setPanelOpen}
        assetBaseUrl={assetBaseUrl || ""}
      >
        <div className="xpert-chat-window">
          <ChatHeader
            cartCount={cartCount}
            customerName={customerName}
            customerRole={customerRole}
            onBack={() => setScreen("home")}
            onClose={() => false}
          />
          <div className="xpert-chat-messages">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                isBeingEdited={message.id === editingId}
                onSuggestion={handleSuggestionClick}
                onFilterSuggestion={sendFilterSuggestion}
                onEdit={handleEditClick}
                onOrderClick={(_orderId, orderNumber) => {
                  sendMessage(`show me order #${orderNumber}`);
                }}
                onProductClick={handleProductClick}
                miraQIcon={MiraQIcon}
              />
            ))}

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

            {showOrderLoadMore && (
              <div className="xpert-pagination-controls">
                {activeOrderPagination!.total_items != null &&
                  activeOrderPagination!.total_pages != null && (
                    <p className="xpert-pagination-info">
                      Showing page {activeOrderPagination!.page} of{" "}
                      {activeOrderPagination!.total_pages} •{" "}
                      {activeOrderPagination!.total_items} total orders
                    </p>
                  )}
                <button
                  className="xpert-load-more-btn"
                  onClick={loadMoreOrders}
                  type="button"
                >
                  Load More Orders ↓
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
          {editingId && (
            <div className="xpert-edit-indicator">
              <span className="xpert-edit-indicator-label">
                ✏️ Editing message
              </span>
              <button
                className="xpert-edit-cancel-btn"
                onClick={handleCancelEdit}
                aria-label="Cancel edit"
                type="button"
              >
                <FiX size={14} /> Cancel
              </button>
            </div>
          )}
          <div
            className={`xpert-chat-input-area${editingId ? " xpert-chat-input-area--editing" : ""}`}
          >
            <textarea
              ref={inputRef}
              className="xpert-chat-input"
              placeholder={
                editingId
                  ? "Edit your message… (Enter to send, Esc to cancel)"
                  : "Ask about products, orders, or your cart..."
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading}
              autoFocus
              spellCheck={true}
            />
            <button
              className="xpert-send-btn"
              onClick={handleSend}
              disabled={!inputValue.trim() || loading}
              aria-label={editingId ? "Send edited message" : "Send message"}
              type="button"
            >
              <FiSend size={18} />
            </button>
          </div>
          <p className="xpert-footer-hint">
            Powered by AI • Shopping made simple
          </p>
          {/* ── Product Detail Overlay ── */}
          {selectedProduct && (
            <ProductDetailPanel
              productId={selectedProduct.id}
              initialProduct={selectedProduct}
              fetchProduct={fetchProductDetail}
              onClose={handleProductDetailClose}
              onAskAbout={handleAskAbout}
              onOrder={handleOrderProduct}
            />
          )}
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
