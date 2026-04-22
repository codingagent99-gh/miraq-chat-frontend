import { useState, useCallback, useRef, useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useChat } from "./hooks/useChat";
import { useChatActions } from "./hooks/useChatActions";
import { createApiClient } from "./services/api";
import { WidgetContainer } from "./components/WidgetContainer";
import { HomeScreen } from "./components/HomeScreen";
import { ChatHeader } from "./components/ChatHeader";
import { MessageRow } from "./components/MessageRow";
import { ProductDetailPanel } from "./components/ProductDetailPanel";
import type { Product, WidgetOptions } from "./types/api";
import { FiSend, FiX, FiMic, FiMicOff } from "react-icons/fi";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useCart } from "./hooks/useCart";
import { CartPanel } from "./components/CartPanel";
import { CheckoutPanel } from "./components/checkout/CheckoutPanel";
import { useStoreApi } from "./hooks/useStoreApi";

export interface ChatWidgetInterface extends WidgetOptions {
  onViewCart?: () => void;
}

export function ChatWidget({
  apiKey,
  apiUrl,
  customerId,
  customerEmail,
  customerName,
  customerRole,
  assetBaseUrl,
  nonce,
  cartToken,
  nonceExpires,
}: ChatWidgetInterface) {
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;
  const siteOrigin = import.meta.env.VITE_WP_BASE_URL || window.location.origin;

  const isLoggedIn = !!(customerId || customerEmail);

  const [screen, setScreen] = useState<"home" | "chat">("home");
  const [panelOpen, setPanelOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false); // ← cart panel toggle
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false); // ← checkout panel toggle
  const originalInputRef = useRef("");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const apiClientRef = useRef<any>(null);
  if (!apiClientRef.current) {
    apiClientRef.current = createApiClient(apiUrl, apiKey);
  }

  // ── Store API (shared nonce + fetch) ──────────────────────────────────────
  const { storeApiFetch } = useStoreApi({ nonce, nonceExpires, cartToken });

  // ── Cart state ────────────────────────────────────────────────────────────
  const {
    cart,
    loading: cartLoading,
    error: cartError,
    fetchCart,
    addItem,
    removeItem,
    updateQuantity,
    setCart,
  } = useCart(storeApiFetch);

  // ── Action dispatcher (new actions[] envelope) ────────────────────────────
  const { dispatchActions } = useChatActions({
    addItem,
    updateQuantity,
    removeItem,
    fetchCart,
    cartItems: cart?.items,
    setIsCartOpen,
    setIsCheckoutOpen,
  });

  // ── Chat ──────────────────────────────────────────────────────────────────
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
  } = useChat({
    apiUrl,
    apiKey,
    customerId:
      typeof customerId === "string" ? parseInt(customerId, 10) : customerId,
    customerEmail,
    customerRole,
    // New actions envelope — primary signal channel
    onActions: dispatchActions,
    // Backend fires "trigger_frontend_view_cart" → open panel + fetch latest
    onViewCart: () => {
      setIsCartOpen(true);
      fetchCart();
    },
    // Backend fires "trigger_frontend_cart_add" → add to real WC cart
    onAddToCart: async (
      productId,
      quantity,
      variationId,
      variationAttributes,
    ) => {
      await addItem(productId, quantity, variationId, variationAttributes);
    },
  });

  // Voice
  const { isListening, isSupported, transcript, toggleListening } =
    useSpeechRecognition();

  useEffect(() => {
    if (isListening) {
      setInputValue(originalInputRef.current + transcript);
    }
  }, [transcript, isListening]);

  const handleMicClick = () => {
    if (!isListening) {
      originalInputRef.current = inputValue + (inputValue.trim() ? " " : "");
    }
    toggleListening();
  };

  // Cart item count — prefer live cart, fall back to last message cart
  const cartCount = (() => {
    if (cart) return cart.items_count;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].cart) return messages[i].cart!.item_count;
    }
    return 0;
  })();

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || loading) return;
    if (isListening) toggleListening();
    originalInputRef.current = "";
    if (editingId) {
      editMessage(editingId, inputValue);
      setEditingId(null);
    } else {
      sendMessage(inputValue);
    }
    setInputValue("");
  }, [
    inputValue,
    loading,
    editingId,
    isListening,
    toggleListening,
    editMessage,
    sendMessage,
  ]);

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
          inputRef.current.setSelectionRange(text.length, text.length);
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

  const handleProductClick = useCallback(
    (product: Product) => setSelectedProduct(product),
    [],
  );
  const handleProductDetailClose = useCallback(
    () => setSelectedProduct(null),
    [],
  );

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

  // ── Home screen ──────────────────────────────────────────────────────────
  if (screen === "home") {
    return (
      <div id="silfra-chat-widget-container">
        <WidgetContainer
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          assetBaseUrl={assetBaseUrl || ""}
        >
          {!isLoggedIn ? (
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
              <h3 style={{ margin: "0 0 0.5rem 0" }}>Login Required</h3>
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

  // ── Chat screen ──────────────────────────────────────────────────────────
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
        <div className="xpert-chat-window" style={{ position: "relative" }}>
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
                onOrderClick={(_orderId, orderNumber) =>
                  sendMessage(`show me order #${orderNumber}`)
                }
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
                      <span />
                      <span />
                      <span />
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
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <textarea
              ref={inputRef}
              className="xpert-chat-input"
              placeholder={
                isListening
                  ? "Listening... Speak now"
                  : editingId
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
              style={{ flex: 1 }}
            />
            {isSupported && !editingId && (
              <button
                className={`xpert-mic-btn ${isListening ? "listening" : ""}`}
                onClick={handleMicClick}
                type="button"
                aria-label={
                  isListening ? "Stop listening" : "Start voice typing"
                }
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                  color: isListening ? "#ef4444" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "color 0.2s ease",
                }}
              >
                {isListening ? <FiMicOff size={20} /> : <FiMic size={20} />}
              </button>
            )}
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

          {/* ── Cart Panel Overlay ── */}
          {isCartOpen && (
            <CartPanel
              cart={cart}
              loading={cartLoading}
              error={cartError}
              siteOrigin={siteOrigin}
              onClose={() => setIsCartOpen(false)}
              onRemove={removeItem}
              onUpdateQuantity={updateQuantity}
              onCheckout={() => {
                setIsCartOpen(false);
                setIsCheckoutOpen(true);
              }}
            />
          )}

          {/* ── Checkout Panel Overlay ── */}
          {isCheckoutOpen && (
            <CheckoutPanel
              storeApiFetch={storeApiFetch}
              cart={cart}
              onCartUpdate={setCart}
              cartToken={cartToken ?? null}
              onClose={() => setIsCheckoutOpen(false)}
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
