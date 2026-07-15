import { useState, useCallback, useRef, useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useChat } from "./hooks/useChat";
import { useChatActions } from "./hooks/useChatActions";
import { createApiClient } from "./services/api";
import { WidgetContainer } from "./components/WidgetContainer";
import { ShopifyWidgetContainer } from "./components/ShopifyWidgetContainer";
import { HomeScreen } from "./components/HomeScreen";
import { ChatHeader } from "./components/ChatHeader";
import { MessageRow } from "./components/MessageRow";
import type { Product, WidgetOptions } from "./types/api";
import { FiSend, FiX, FiMic, FiMicOff } from "react-icons/fi";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";
import { useCart } from "./hooks/useCart";
import { CartPanel } from "./components/CartPanel";
import { CheckoutPanel } from "./components/checkout/CheckoutPanel";
import { ShopifyCheckoutPanel } from "./components/checkout/ShopifyCheckoutPanel";
import { useStoreApi } from "./hooks/useStoreApi";
import { AiOptInScreen } from "./components/AiOptInScreen";
// Side-effect import: registers built-in payment adapters before PaymentStep renders
import "./components/checkout/payment";

export interface ChatWidgetInterface extends WidgetOptions {
  onViewCart?: () => void;
  storefrontToken?: string;
  shopDomain?: string;
  wpBaseUrl?: string;
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
  shopDomain,
  wpBaseUrl,
  storefrontToken,
  licenseId,
}: ChatWidgetInterface) {
  // True for Shopify builds — governs checkout routing and panel choice.
  // Shopify checkout stays in-widget (no page redirect); WC redirects to /checkout.
  const isShopify = !!shopDomain;
  const Container = isShopify ? ShopifyWidgetContainer : WidgetContainer;
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;
  const redirectingRef = useRef(false); // ← a navigation already committed for this page load

  // Runtime shopDomain (from Liquid data-shop-domain) is the source of truth.
  const siteOrigin = shopDomain
    ? `https://${shopDomain}`
    : wpBaseUrl || window.location.origin;
  const isLoggedIn = !!(customerId || customerEmail);
  const [isExpanded, setIsExpanded] = useState(() => {
    if (window.innerWidth <= 768) return false;
    try {
      const stored = sessionStorage.getItem("silfra_panel_expanded");
      // Default to expanded (large mode) when no preference has been saved yet
      return stored !== null ? stored === "true" : true;
    } catch {
      return true;
    }
  });

  // ── AI mode localStorage key (user-scoped) ───────────────────────────────
  const aiStorageKey = `silfra_ai_enabled_${customerId ?? customerEmail ?? "guest"}`;

  // ── AI enabled state — initialised from localStorage ────────────────────
  const [aiEnabled, setAiEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(aiStorageKey) === "true";
    } catch {
      return false;
    }
  });

  // ── Screen state ─────────────────────────────────────────────────────────
  // "ai-opt-in" → shown when not logged in (login prompt) OR when AI is off
  // "home"      → logged in + AI enabled, shows HomeScreen
  // "chat"      → active chat session
  const screenStorageKey = `silfra_screen_${customerId ?? customerEmail ?? "guest"}`;

  const [screen, setScreen] = useState<"ai-opt-in" | "home" | "chat">(() => {
    if (isLoggedIn) {
      try {
        if (localStorage.getItem(aiStorageKey) === "true") {
          const saved = sessionStorage.getItem(screenStorageKey);
          if (saved === "chat" || saved === "home") return saved;
          return "home";
        }
      } catch {
        // fall through to "ai-opt-in"
      }
    }
    return "ai-opt-in";
  });

  const [panelOpen, setPanelOpen] = useState(() => {
    if (window.innerWidth <= 768) return false;
    try {
      return sessionStorage.getItem("silfra_panel_open") === "true";
    } catch {
      return false;
    }
  });
  const [inputValue, setInputValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  /** True only when every variant axis in the current VariantPicker has a selection */
  const [canPlaceOrder, setCanPlaceOrder] = useState(false);
  useEffect(() => {
    if (window.innerWidth <= 768) return;
    try {
      sessionStorage.setItem("silfra_panel_expanded", String(isExpanded));
    } catch {}
  }, [isExpanded]);
  // Persist panel open state across refreshes (desktop only)
  useEffect(() => {
    if (window.innerWidth <= 768) return;
    try {
      sessionStorage.setItem("silfra_panel_open", String(panelOpen));
    } catch {}
  }, [panelOpen]);
  // Persist screen state so refreshes restore the user's last screen
  useEffect(() => {
    try {
      sessionStorage.setItem(screenStorageKey, screen);
    } catch {
      // sessionStorage unavailable
    }
  }, [screen, screenStorageKey]);

  const [isCartOpen, setIsCartOpen] = useState<boolean>(() => {
    try {
      const val = sessionStorage.getItem("silfra_cart_open") === "true";
      if (val) sessionStorage.removeItem("silfra_cart_open");
      return val;
    } catch {
      return false;
    }
  });
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(() => {
    try {
      const val = sessionStorage.getItem("silfra_checkout_open") === "true";
      if (val) sessionStorage.removeItem("silfra_checkout_open");
      return val;
    } catch {
      return false;
    }
  });
  const originalInputRef = useRef("");

  const [showBulkOrderBtn, setShowBulkOrderBtn] = useState(false);
  console.log(showBulkOrderBtn);
  // ── URL sync ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (redirectingRef.current) return; // navigation already in flight — don't thrash
    const normPath = window.location.pathname.replace(/\/$/, "");
    console.log("[MiraQ redirect]", {
      isCartOpen,
      isCheckoutOpen,
      isShopify,
      normPath,
    });
    if (isCartOpen) {
      if (normPath.endsWith("/cart")) return;
      try {
        sessionStorage.setItem("silfra_panel_open", "true");
        sessionStorage.setItem(screenStorageKey, screen);
        sessionStorage.setItem("silfra_cart_open", "true");
      } catch {}
      redirectingRef.current = true;
      window.location.href = `${siteOrigin}/cart`;
    } else if (isCheckoutOpen) {
      if (isShopify) return;
      if (normPath.endsWith("/checkout")) return;
      try {
        sessionStorage.setItem("silfra_panel_open", "true");
        sessionStorage.setItem(screenStorageKey, screen);
        sessionStorage.setItem("silfra_checkout_open", "true");
      } catch {}
      redirectingRef.current = true;
      if (!normPath.endsWith("/cart")) {
        window.location.href = `${siteOrigin}/cart`;
      } else {
        window.location.href = `${siteOrigin}/checkout`;
      }
    }
  }, [
    isCartOpen,
    isCheckoutOpen,
    isShopify,
    screen,
    screenStorageKey,
    siteOrigin,
  ]);
  // fetchCart is not called automatically; we need to trigger it here so the
  // CartPanel has data after a redirect restores isCartOpen = true.
  useEffect(() => {
    if (isCartOpen || isCheckoutOpen) fetchCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  // ── Widget config (logo + header text from backend) ──────────────────────
  const [widgetLogo, setWidgetLogo] = useState<string>("");
  const [widgetText, setWidgetText] = useState<string>("");
  console.log("[MiraQ DEBUG] licenseId prop:", licenseId);

  const apiClientRef = useRef<any>(null);
  if (
    !apiClientRef.current ||
    (licenseId &&
      !apiClientRef.current.defaults?.headers?.common?.["X-MiraQ-License-Id"])
  ) {
    apiClientRef.current = createApiClient(apiUrl, apiKey, licenseId);
  }
  console.log(
    "[MiraQ DEBUG] apiClient headers:",
    apiClientRef.current?.defaults?.headers,
  );
  type CartResultHandler = (opts: {
    success: boolean;
    name: string;
    quantity: number;
  }) => Promise<void>;

  const onCartResultRef = useRef<CartResultHandler | undefined>(undefined);

  // ── Store API (shared nonce + fetch) ──────────────────────────────────────
  const { storeApiFetch, resetCartToken } = useStoreApi({
    nonce,
    nonceExpires,
    cartToken,
    wpBaseUrl,
  });
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
    onCartResult: (opts) =>
      onCartResultRef.current?.(opts) ?? Promise.resolve(),
  });
  // ── Chat ──────────────────────────────────────────────────────────────────
  const {
    messages,
    loading,
    sendMessage,
    editMessage,
    sendFilterSuggestion,
    appendBotMessage,
    handleCartResult,
    getSessionId,
    bottomRef,
    inputRef,
    scrollToBottom,
    pagination,
    loadMore,
    orderPagination,
    loadMoreOrders,
    dailyLimitHit,
    limitResetAt,
    loadMoreHistory,
    hasMoreHistory,
    loadingHistory,
  } = useChat({
    apiUrl,
    apiKey,
    customerId:
      typeof customerId === "string" ? parseInt(customerId, 10) : customerId,
    customerEmail,
    customerRole,
    licenseId,
    wpBaseUrl,
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
    onSimilarProductsPrompt: (id, name) => {
      setTimeout(() => {
        appendBotMessage({ text: "", similarProductPrompt: { id, name } });
      }, 600);
    },
    platform: isShopify ? "shopify" : "woocommerce",
    onPersistentActions: (actions) => {
      for (const a of actions) {
        if (a.type === "SHOW_BULK_ORDER_BUTTON") setShowBulkOrderBtn(true);
      }
    },
  });
  onCartResultRef.current = handleCartResult;

  // Voice
  const { isListening, isSupported, transcript, toggleListening } =
    useSpeechRecognition();

  useEffect(() => {
    if (isListening) {
      setInputValue(originalInputRef.current + transcript);
    }
  }, [transcript, isListening]);

  // ── Scroll to bottom when panel opens OR screen switches to chat ──
  // screen is in deps so Home→Chat navigation (panelOpen already true) also triggers.
  // 120ms delay gives the chat DOM time to paint after a page reload.
  useEffect(() => {
    if (panelOpen && screen === "chat") {
      const id = setTimeout(() => {
        scrollToBottom("instant");
        inputRef.current?.focus({ preventScroll: true });
      }, 120);
      return () => clearTimeout(id);
    }
  }, [panelOpen, screen, scrollToBottom]);

  // ── Fetch widget config (logo + text) from backend ────────────────────────
  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/widget-config`, {
      headers: {
        "X-MiraQ-License-Id": licenseId || "",
      },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.image_url) setWidgetLogo(data.image_url);
        if (data.text) setWidgetText(data.text);
      })
      .catch(() => {
        // silently fall back to default MiraQIcon
      });
  }, [apiUrl, licenseId]);
  // ─────────────────────────────────────────────────────────────────────────

  // ── AI mode toggle handler ────────────────────────────────────────────────
  // Called from AiOptInScreen when the user flips the switch.
  // Persists to localStorage and — if enabling — advances to HomeScreen.
  const handleAiToggle = useCallback(
    (value: boolean) => {
      setAiEnabled(value);
      try {
        localStorage.setItem(aiStorageKey, String(value));
      } catch {
        // localStorage unavailable (private browsing, quota, etc.) — proceed anyway
      }
      if (value) {
        setScreen("home");
      } else {
        setScreen("ai-opt-in");
      } // If value is false the user stays on the opt-in screen (AI-off resting state)
    },
    [aiStorageKey],
  );
  // ─────────────────────────────────────────────────────────────────────────

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

  /** Populates the input box with the current variant selection — does NOT send. */
  const handleVariantSelect = (text: string) => {
    setInputValue(text);
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

  const handleProductClick = useCallback((product: Product) => {
    const url = (product as any).permalink as string | undefined;
    if (url) window.location.href = url;
  }, []);

  const [loadingSimilarId, setLoadingSimilarId] = useState<number | null>(null);

  const handleShowSimilar = useCallback(
    async (product: Product) => {
      setLoadingSimilarId(product.id);
      try {
        const { products, source } =
          await apiClientRef.current.fetchSimilarProducts(product.id);

        // ── Guard: nothing to show ──────────────────────────────────────────
        if (!products || products.length === 0) {
          appendBotMessage({
            text: `No similar products found for *${product.name.split(" — ")[0]}*.`,
            products: [],
          });
          return;
        }
        // ───────────────────────────────────────────────────────────────────

        const label =
          source === "cross_sell" ? "Pairing It With" : "You May Also Like";
        const text = `**${label}** — similar to *${product.name.split(" — ")[0]}*`;
        appendBotMessage({ text, products });
        // Persist to DB so it survives page reload
        try {
          await apiClientRef.current.saveSimilarMessage(
            getSessionId(),
            text,
            products,
          );
        } catch (saveErr) {
          console.warn(
            "[MiraQ] Failed to persist similar products message",
            saveErr,
          );
        }
      } catch (err) {
        console.error("[MiraQ] fetchSimilarProducts failed", err);
        appendBotMessage({
          text: "Sorry, I couldn't load similar products right now. Please try again.",
          products: [],
        });
      } finally {
        setLoadingSimilarId(null);
      }
    },
    [appendBotMessage, getSessionId],
  );

  // const handleAskAbout = useCallback(
  //   (productName: string) => {
  //     setSelectedProduct(null);
  //     sendMessage(`Tell me more about ${productName}`);
  //   },
  //   [sendMessage],
  // );

  // const handleOrderProduct = useCallback(
  //   (productName: string) => {
  //     setSelectedProduct(null);
  //     sendMessage(`I want to order ${productName}`);
  //   },
  //   [sendMessage],
  // );

  // const fetchProductDetail = useCallback(
  //   (id: number) => apiClientRef.current.fetchProduct(id),
  //   [],
  // );

  // ── Non-chat screens (ai-opt-in + home) ──────────────────────────────────
  if (screen !== "chat") {
    return (
      <div id="silfra-chat-widget-container">
        <Container
          panelOpen={panelOpen}
          setPanelOpen={setPanelOpen}
          assetBaseUrl={assetBaseUrl || ""}
          isExpanded={isExpanded}
        >
          {!isLoggedIn ? (
            // ── Login required ─────────────────────────────────────────────
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
                type="button"
              >
                <FiX size={20} />
              </button>
              <img
                src={widgetLogo || MiraQIcon}
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
          ) : screen === "ai-opt-in" ? (
            // ── AI mode opt-in (also the "AI off" resting state) ───────────
            <AiOptInScreen
              logoUrl={widgetLogo || MiraQIcon}
              onClose={() => setPanelOpen(false)}
              aiEnabled={aiEnabled}
              onToggle={handleAiToggle}
            />
          ) : (
            // ── Home screen (AI enabled) ───────────────────────────────────
            <HomeScreen
              onStartChat={() => setScreen("chat")}
              onClose={() => setPanelOpen(false)}
              miraQIcon={widgetLogo || MiraQIcon}
              customerName={customerName}
              isLoggedIn={isLoggedIn}
              aiMode={aiEnabled}
              onToggleAI={() => handleAiToggle(!aiEnabled)}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded((p) => !p)}
            />
          )}
        </Container>
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
      <Container
        panelOpen={panelOpen}
        setPanelOpen={setPanelOpen}
        assetBaseUrl={assetBaseUrl || ""}
        isExpanded={isExpanded}
      >
        <div
          className="xpert-chat-window"
          style={{ position: "relative", overflow: "hidden" }}
        >
          <ChatHeader
            cartCount={cartCount}
            customerName={customerName}
            customerRole={customerRole}
            onBack={() => setScreen("home")}
            onClose={() => setPanelOpen(false)}
            logoUrl={widgetLogo || MiraQIcon}
            headerText="MiraQ Commerce Assistant"
            isExpanded={isExpanded}
            onToggleExpand={() => setIsExpanded((p) => !p)}
          />

          <div
            className="xpert-chat-messages"
            onScroll={(e) => {
              if (
                e.currentTarget.scrollTop < 50 &&
                hasMoreHistory &&
                !loadingHistory
              ) {
                loadMoreHistory();
              }
            }}
          >
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
                onShowSimilar={handleShowSimilar}
                loadingSimilarId={loadingSimilarId}
                onVariantSelect={handleVariantSelect}
                onVariantAllSelected={setCanPlaceOrder}
                canPlaceOrder={canPlaceOrder}
                siteOrigin={siteOrigin}
                onPlaceOrder={() => {
                  handleSend();
                  setCanPlaceOrder(false);
                }}
                miraQIcon={widgetLogo || MiraQIcon}
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
                    src={widgetLogo || MiraQIcon}
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

          {dailyLimitHit && (
            <div className="miraq-limit-banner">
              <span className="miraq-limit-icon">🔒</span>
              <p className="miraq-limit-title">Daily limit reached</p>
              <p className="miraq-limit-subtitle">
                You've used all 25 free questions for today.
                {limitResetAt && <> Resets at midnight.</>}
              </p>
              {/* <button
                className="miraq-limit-upgrade-btn"
                onClick={() => window.open("/premium", "_blank", "noopener")}
                type="button"
              > */}
              <div
                className="miraq-limit-upgrade-btn"
                style={{ cursor: "default !important" }}
              >
                Upgrade for unlimited
              </div>

              {/* </button> */}
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
                dailyLimitHit
                  ? "Upgrade to keep chatting" // ← add
                  : isListening
                    ? "Listening... Speak now"
                    : editingId
                      ? "Edit your message… (Enter to send, Esc to cancel)"
                      : "Ask about products, orders, or your cart..."
              }
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={loading || dailyLimitHit}
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
              disabled={!inputValue.trim() || loading || dailyLimitHit} // ← add dailyLimitHit
              aria-label={editingId ? "Send edited message" : "Send message"}
              type="button"
            >
              <FiSend size={18} />
            </button>
          </div>

          <p className="xpert-footer-hint">{widgetText}</p>

          {/* ── Cart Panel Overlay ── */}
          {isCartOpen && (
            <CartPanel
              cart={cart}
              loading={cartLoading}
              error={cartError}
              siteOrigin={siteOrigin}
              onClose={() => setIsCartOpen(false)}
              onCloseWidget={() => {
                setPanelOpen(false);
              }}
              onRemove={removeItem}
              onUpdateQuantity={updateQuantity}
              onCheckout={() => {
                try {
                  sessionStorage.setItem("silfra_checkout_open", "true");
                  sessionStorage.removeItem("silfra_cart_open"); // prevent CartPanel from reopening on /cart
                } catch {}
                setIsCartOpen(false);
                setIsCheckoutOpen(true);
              }}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded((p) => !p)}
            />
          )}

          {/* ── Checkout Panel Overlay ── */}
          {isCheckoutOpen && isShopify && (
            <ShopifyCheckoutPanel
              cart={cart}
              shopDomain={shopDomain!}
              storefrontToken={storefrontToken ?? ""}
              customerEmail={customerEmail}
              customerName={customerName}
              customerId={customerId}
              apiUrl={apiUrl}
              onClose={() => setIsCheckoutOpen(false)}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded((p) => !p)}
            />
          )}

          {isCheckoutOpen && !isShopify && (
            <CheckoutPanel
              storeApiFetch={storeApiFetch}
              cart={cart}
              onCartUpdate={setCart}
              cartToken={cartToken ?? null}
              siteOrigin={siteOrigin}
              resetCartToken={resetCartToken}
              onClose={() => {
                setIsCheckoutOpen(false);
                fetchCart();
              }}
              onCloseWidget={() => {
                setPanelOpen(false);
              }}
              onPostBotMessage={appendBotMessage}
              onPersistOrderConfirmation={(orderId) =>
                apiClientRef.current.submitOrderConfirmation(
                  { session_id: getSessionId(), order_id: orderId },
                  getSessionId(),
                )
              }
              onOrderComplete={(productId, productName) => {
                setTimeout(() => {
                  appendBotMessage({
                    text: "",
                    similarProductPrompt: { id: productId, name: productName },
                  });
                }, 600);
              }}
              isExpanded={isExpanded}
              onToggleExpand={() => setIsExpanded((p) => !p)}
            />
          )}

          {/* ── Toast notifications — scoped within the widget ── */}
          <ToastContainer
            position="top-left"
            autoClose={3000}
            hideProgressBar={false}
            closeOnClick
            pauseOnHover
            draggable
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              right: "8px",
              width: "auto",
              zIndex: 9999,
            }}
            toastStyle={{
              background: "#fff",
              color: "#1c1c1a",
              boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
              borderRadius: "10px",
              fontSize: "12.5px",
              border: "1px solid #eeede8",
            }}
          />
        </div>
      </Container>
    </div>
  );
}
