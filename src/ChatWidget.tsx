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
import { useHealthMonitor } from "./hooks/useHealthMonitor";
import { ServerDownOverlay } from "./components/ServerDownOverlay";
// Side-effect import: registers built-in payment adapters before PaymentStep renders
import "./components/checkout/payment";
import { LoginPanel } from "./components/LoginPanel";
import { PoweredByMiraQ } from "./components/PoweredByMiraQ";
import { IS_SHOPIFY } from "./platform/current";

// Must agree with MOBILE_BREAKPOINT in components/WidgetContainer.tsx
// and the max-width used by the mobile block in index.css.
const MOBILE_BREAKPOINT = 768;

export interface ChatWidgetInterface extends WidgetOptions {
  onViewCart?: () => void;
  storefrontToken?: string;
  shopDomain?: string;
}

export function ChatWidget({
  apiKey,
  apiUrl,
  customerId,
  customerEmail,
  customerName,
  customerRole,
  assetBaseUrl,
  wpBaseUrl,
  nonce,
  cartToken,
  nonceExpires,
  shopDomain,
  storefrontToken,
  loginUrl,
  brandingLogoUrl,
  brandingFooterText,
}: ChatWidgetInterface) {
  // True for Shopify builds — governs checkout routing, container, cart
  // implementation, and panel choice.
  //
  // Sourced from platform/current.ts's build-time IS_SHOPIFY, NOT from
  // `!!shopDomain` as this used to read. That was a second, independent
  // platform check living alongside the one hooks/useCart.ts and
  // hooks/useStoreApi.ts each already do at build time from VITE_PLATFORM —
  // exactly the "split-brained" hazard platform/current.ts's own docstring
  // describes and was written to close, except this component was never
  // migrated onto it. widget-entry.tsx's checkPlatformConfig() already
  // refuses to mount when IS_SHOPIFY and a runtime shopDomain disagree, so by
  // the time this component renders the two are guaranteed consistent —
  // which also means IS_SHOPIFY is the one that can't be silently undermined
  // by a shopDomain that failed to arrive at runtime for any reason (a stale
  // build, a missing data-shop-domain attribute, a config-loading race),
  // where !!shopDomain would have quietly rendered the wrong platform's UI
  // (including WooCommerce's LoginPanel, which posts to a WordPress endpoint
  // that doesn't exist on a Shopify store) instead of failing loudly.
  const isShopify = IS_SHOPIFY;
  const Container = isShopify ? ShopifyWidgetContainer : WidgetContainer;
  const DandellionBlueIcon = `${assetBaseUrl}DandellionBlue.png`;
  const DandellionWhiteIcon = `${assetBaseUrl}DandellionWhite.png`;

  const redirectingRef = useRef(false); // ← a navigation already committed for this page load
  // Runtime shopDomain (from Liquid data-shop-domain) is the source of truth.
  // WooCommerce: runtime wpBaseUrl from the injected config is the source of
  // truth, so one compiled bundle serves any install. VITE_WP_BASE_URL is kept
  // only as a dev fallback (vite dev against a remote WP injects no config).
  const siteOrigin = shopDomain
    ? `https://${shopDomain}`
    : wpBaseUrl || import.meta.env.VITE_WP_BASE_URL || window.location.origin;

  const isLoggedIn = !!(customerId || customerEmail);

  // Guest-login affordance (Shopify only — WooCommerce has its own in-widget
  // LoginPanel and needs no external link). Prefer the Liquid-supplied
  // routes.account_login_url (loginUrl prop); only fall back to guessing
  // "${siteOrigin}/account/login" if that's ever missing, since Liquid's own
  // route resolves correctly across classic accounts, new customer accounts,
  // and custom domains in a way a hand-built path might not.
  const shopifyLoginUrl =
    isShopify && !isLoggedIn
      ? loginUrl || `${siteOrigin}/account/login`
      : undefined;

  // Reactive so rotating a phone or resizing a desktop window re-evaluates.
  // The four `window.innerWidth <= 768` reads further down are one-shot
  // initialisers where a stale value is harmless; this one gates rendering,
  // so it has to track.
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= MOBILE_BREAKPOINT,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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

  // Expand/collapse is desktop-only: on mobile the panel is already full
  // screen, so the control would toggle nothing. Passing `undefined` rather
  // than hiding it in CSS means the button is never rendered at all — every
  // consumer (ChatHeader, HomeScreen, CartPanel, CheckoutPanel) already gates
  // on `onToggleExpand &&`, so this one value removes it from all four.
  const onToggleExpand = isMobile ? undefined : () => setIsExpanded((p) => !p);

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
    // Restoring a saved "AI on" screen only depends on aiStorageKey/
    // screenStorageKey, both of which already fall back to the "guest"
    // bucket when customerId/customerEmail are absent — it never needed
    // isLoggedIn. Gating on isLoggedIn broke Shopify, where anonymous
    // storefront visitors (no Shopify customer account) are guests by
    // design and should still resume "chat"/"home" across a reload.
    // WooCommerce guests are unaffected: they're pinned to LoginPanel at
    // render time regardless of `screen` (see the `!isLoggedIn && !isShopify`
    // branch below), so this never mattered for them either way.
    try {
      if (localStorage.getItem(aiStorageKey) === "true") {
        const saved = sessionStorage.getItem(screenStorageKey);
        if (saved === "chat" || saved === "home") return saved;
        return "chat";
      }
    } catch {
      // fall through to "ai-opt-in"
    }
    return "ai-opt-in";
  });

  const [panelOpen, setPanelOpen] = useState(() => {
    // A redirect the widget ITSELF initiated (cart / checkout) always resumes
    // with the panel open, on every viewport.
    //
    // Without this, mobile falls straight through to the guard below and the
    // shopper lands on /cart with the widget minimised — having never asked for
    // it to close. Worse, silfra_cart_open has no viewport guard, so it is read
    // AND consumed on the way in: the cart panel it was meant to restore is
    // discarded too, and reopening the widget by hand doesn't bring it back.
    try {
      if (sessionStorage.getItem("silfra_resume_open") === "true") return true;
    } catch {}
    // Plain refreshes still don't auto-open on mobile. The panel covers most of
    // a phone screen, so restoring it on every page load would be hostile —
    // that is what this guard is for, and it stays.
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
  // Consume the one-shot resume flag after mount, so it fires exactly once.
  //
  // Done in an effect rather than inside the useState initializer above because
  // React StrictMode invokes initializers twice in development: clearing it
  // there would leave the second invocation seeing an already-consumed flag.
  // (silfra_cart_open / silfra_checkout_open below do read-and-remove inline
  // and carry that same hazard — worth revisiting if StrictMode is ever
  // switched on.)
  useEffect(() => {
    try {
      sessionStorage.removeItem("silfra_resume_open");
    } catch {}
  }, []);
  // Expose an open trigger for launcher buttons injected outside the React
  // tree (e.g. a header/search-bar button placed via a theme snippet).
  // Kept as a ref-stable global so those buttons don't need to know
  // anything about React state — just call window.miraqOpenWidget().
  useEffect(() => {
    (window as any).miraqOpenWidget = () => setPanelOpen(true);
    return () => {
      delete (window as any).miraqOpenWidget;
    };
  }, []);
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
        // Marks this navigation as widget-initiated, so the panel reopens on
        // mobile too. silfra_panel_open alone is not enough: the mobile branch
        // of the panelOpen initializer never reads it.
        sessionStorage.setItem("silfra_resume_open", "true");
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
        // See the cart branch above — same reason.
        sessionStorage.setItem("silfra_resume_open", "true");
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

  // Store branding is live once either field comes back from /widget-config.
  // From that point widgetLogo has replaced the MiraQ mark on every surface —
  // launcher, header, avatar, home and opt-in cards — so the attribution bar is
  // the only place MiraQ is still named, and it has to be on every screen.
  const brandingActive = !!(widgetLogo || widgetText);

  const apiClientRef = useRef<any>(null);
  if (!apiClientRef.current) {
    apiClientRef.current = createApiClient(apiUrl, apiKey);
  }

  // ── Server-down overlay ───────────────────────────────────────────────────
  const health = useHealthMonitor(apiUrl);

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
    registerMessageRef,
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
    wpBaseUrl,
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
    if (isShopify) {
      // /widget-config is hardcoded to proxy a WordPress REST endpoint
      // (wp-json/wdget-logo-uploader/v1/data) that doesn't exist for a
      // Shopify store — the fetch would just fail every time and land on
      // the silent catch below, so branding never showed up at all.
      // Shopify branding instead comes from the merchant through the Theme
      // Editor (image_picker + text settings in miraq_widget.liquid),
      // threaded through widget-entry.tsx as these two props.
      if (brandingLogoUrl) setWidgetLogo(brandingLogoUrl);
      if (brandingFooterText) setWidgetText(brandingFooterText);
      return;
    }
    if (!apiUrl) return;
    fetch(`${apiUrl}/widget-config`)
      .then((r) => r.json())
      .then((data) => {
        if (data.image_url) setWidgetLogo(data.image_url);
        if (data.text) setWidgetText(data.text);
      })
      .catch(() => {
        // silently fall back to default DandellionBlueIcon
      });
  }, [apiUrl, isShopify, brandingLogoUrl, brandingFooterText]);
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
        // Skip the Home/"Start exploring" screen on first opt-in too — go
        // straight to chat. Home is still reachable afterwards via the
        // chat header's back button.
        setScreen("chat");
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
          logoUrl={widgetLogo}
          isExpanded={isExpanded}
        >
          {!isLoggedIn && !isShopify ? (
            // WooCommerce only. LoginPanel posts to /wp-json/custom-api/v1/*
            // on siteOrigin, which does not exist on a Shopify store — so a
            // Shopify guest was pinned to a login form that could never
            // succeed, and could never reach the chat screen at all (screen
            // only becomes "chat" via AiOptInScreen/HomeScreen, both of which
            // sit in the branch this condition shadowed).
            //
            // Shopify guests are supported by design (the Liquid block sends
            // data-customer-role="guest" and the backend BULK_ORDER gate lets
            // guest through), so they fall through to the normal opt-in →
            // chat flow and are offered login via the header pill instead —
            // see shopifyLoginUrl above.
            <LoginPanel
              siteOrigin={siteOrigin}
              fallbackLogoUrl={`${assetBaseUrl}store-logo.png`}
              miraQIcon={widgetLogo || DandellionBlueIcon}
              onClose={() => setPanelOpen(false)}
            />
          ) : screen === "ai-opt-in" ? (
            // ── AI mode opt-in (also the "AI off" resting state) ───────────
            <AiOptInScreen
              logoUrl={widgetLogo || DandellionBlueIcon}
              onClose={() => setPanelOpen(false)}
              aiEnabled={aiEnabled}
              onToggle={handleAiToggle}
            />
          ) : (
            // ── Home screen (AI enabled) ───────────────────────────────────
            <HomeScreen
              onStartChat={() => setScreen("chat")}
              onClose={() => setPanelOpen(false)}
              miraQIcon={widgetLogo || DandellionBlueIcon}
              customerName={customerName}
              isLoggedIn={isLoggedIn}
              aiMode={aiEnabled}
              onToggleAI={() => handleAiToggle(!aiEnabled)}
              isExpanded={isExpanded}
              onToggleExpand={onToggleExpand}
            />
          )}
          <PoweredByMiraQ
            show={brandingActive}
            text={widgetText}
            logoUrl={`${assetBaseUrl}MiraQ-icon.png`}
          />
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
        logoUrl={widgetLogo}
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
            logoUrl={widgetLogo || DandellionWhiteIcon}
            headerText="Dandelion"
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
            loginUrl={shopifyLoginUrl}
          />

          <div
            className="xpert-chat-body"
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
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
              {messages.map((message, _i) => (
                <div
                  key={message.id}
                  ref={(el) => registerMessageRef(message.id, el)}
                >
                  <MessageRow
                    message={message}
                    isLatest={_i === messages.length - 1}
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
                    currentUserEmail={customerEmail}
                    onPlaceOrder={() => {
                      handleSend();
                      setCanPlaceOrder(false);
                    }}
                    miraQIcon={widgetLogo || DandellionBlueIcon}
                  />
                </div>
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
                      src={widgetLogo || DandellionBlueIcon}
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
                disabled={loading || dailyLimitHit || health.blocking}
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
                disabled={
                  !inputValue.trim() ||
                  loading ||
                  dailyLimitHit ||
                  health.blocking
                }
                aria-label={editingId ? "Send edited message" : "Send message"}
                type="button"
              >
                <FiSend size={18} />
              </button>
            </div>

            {/* ── Server-down overlay — covers messages + input, not header ── */}
            <ServerDownOverlay health={health} />
          </div>

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
              onToggleExpand={onToggleExpand}
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
              onToggleExpand={onToggleExpand}
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
              onToggleExpand={onToggleExpand}
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

        {/* Sibling of .xpert-chat-window, not a child of it: the cart and
            checkout overlays are position:absolute inset:0 inside that window,
            so anything placed within it is covered while they are open. Here
            the bar stays visible on cart and checkout too. */}
        <PoweredByMiraQ
          show={brandingActive}
          text={widgetText}
          logoUrl={`${assetBaseUrl}MiraQ-icon.png`}
        />
      </Container>
    </div>
  );
}
