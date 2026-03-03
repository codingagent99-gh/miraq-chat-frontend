import { useState } from "react";
import { FiSend } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useChat } from "./hooks/useChat";
import { WidgetContainer } from "./components/WidgetContainer";
import { HomeScreen } from "./components/HomeScreen";
import { ChatHeader } from "./components/ChatHeader";
import { MessageRow } from "./components/MessageRow";

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
    sendFilterSuggestion,
    bottomRef,
    inputRef,
    pagination,
    loadMore,
    orderPagination,
    loadMoreOrders,
  } = useChat({ apiUrl, apiKey, customerId, customerEmail });

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

  // Find the most recent bot message
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
      <WidgetContainer panelOpen={panelOpen} setPanelOpen={setPanelOpen}>
        <div className="xpert-chat-window">
          <ChatHeader
            cartCount={cartCount}
            onBack={() => setScreen("home")}
            onClose={() => setPanelOpen(false)}
          />

          {/* Messages */}
          <div className="xpert-chat-messages">
            {messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                onSuggestion={handleSuggestionClick}
                onFilterSuggestion={sendFilterSuggestion}
                onOrderClick={(orderId, orderNumber) => {
                  console.log(orderId);
                  sendMessage(`show me order #${orderNumber}`);
                }}
                miraQIcon={MiraQIcon}
              />
            ))}

            {/* Load More Products */}
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

            {/* Load More Orders */}
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
