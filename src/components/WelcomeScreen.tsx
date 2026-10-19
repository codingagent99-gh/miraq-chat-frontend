import { useEffect, useState } from "react";
import {
  FiCheck,
  FiChevronRight,
  FiMessageCircle,
  FiPlus,
  FiShoppingCart,
} from "react-icons/fi";
import { HomeProfileCard, HomeScreen, firstNameOf } from "./HomeScreen";
import { decodeCurrency, storeCurrency } from "../utils/currency";
import type {
  BuyAgainItem,
  LastConversation,
  WelcomeProduct,
  WelcomeResponse,
} from "../types/api";

/**
 * Welcome screen for a LOGGED-IN shopper (requirements: MiraQ Welcome
 * Screen). Replaces the logged-in HomeScreen; guests never see it.
 *
 * Sections, each hidden when the backend has nothing for it:
 *   - What's new         (GET /chat/welcome → whats_new)
 *   - Continue last chat (→ last_conversation)
 *   - Buy again          (→ buy_again)
 *   - Start a new chat   (always)
 *
 * If /chat/welcome fails, this renders today's HomeScreen instead (FR-7.2):
 * the shopper can always get to the chat.
 */

interface WelcomeScreenProps {
  loadWelcome: (signal: AbortSignal) => Promise<WelcomeResponse>;
  onContinue: (conversationId: string) => void;
  onNewChat: () => void;
  /** Fallback screen's "Start exploring": resume the current conversation. */
  onStartChat: () => void;
  onOpenProduct: (product: WelcomeProduct) => void;
  /** Buy again: add the item's exact variant, quantity 1. Rejects on failure. */
  onAddToCart: (item: BuyAgainItem) => Promise<void>;
  /** Buy again: the variant is gone (or the store refused it) — pick in chat. */
  onChooseOptions: (item: BuyAgainItem) => void;
  /** Buy again: "See all orders" — the chat's order list. */
  onSeeOrders: () => void;
  /** Buy again: shown after an add, opens the cart panel. */
  onViewCart: () => void;
  cartCount: number;
  onClose: () => void;
  miraQIcon: string;
  customerName?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: WelcomeResponse }
  | { status: "failed" };

const WHATS_NEW_HEADING: Record<"since_last_visit" | "newest", string> = {
  since_last_visit: "New since your last visit",
  newest: "New in store",
};

/** "2 days ago", "yesterday", "just now" in the shopper's browser locale. */
function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.round((then - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  try {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
    for (const [unit, size] of units) {
      if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
    }
  } catch {
    return "";
  }
  return "just now";
}

/** Same price rule as ProductCards: the product's own currency, sale first. */
function priceLabel(p: WelcomeProduct): string {
  const symbol = decodeCurrency(p.currency_symbol) || storeCurrency();
  const amount = p.on_sale && p.sale_price ? p.sale_price : p.price;
  return amount > 0 ? `${symbol}${amount}` : "";
}

function WhatsNew({
  items,
  mode,
  onOpenProduct,
}: {
  items: WelcomeProduct[];
  mode: "since_last_visit" | "newest";
  onOpenProduct: (p: WelcomeProduct) => void;
}) {
  return (
    <section className="xpert-welcome-section" aria-labelledby="xpert-wn-title">
      <h4 id="xpert-wn-title" className="xpert-welcome-section-title">
        ✨ {WHATS_NEW_HEADING[mode]}
      </h4>
      <ul className="xpert-welcome-products">
        {items.map((p) => {
          const price = priceLabel(p);
          const img = p.images?.[0];
          return (
            <li key={p.id}>
              <button
                type="button"
                className="xpert-welcome-product"
                onClick={() => onOpenProduct(p)}
                aria-label={price ? `${p.name}, ${price}` : p.name}
              >
                <span className="xpert-welcome-product-img">
                  {img ? (
                    <img src={img} alt={p.name} loading="lazy" />
                  ) : (
                    <span aria-hidden="true">🛍️</span>
                  )}
                  {p.on_sale && <span className="xpert-welcome-sale">SALE</span>}
                </span>
                <span className="xpert-welcome-product-name">{p.name}</span>
                {price && <span className="xpert-welcome-product-price">{price}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ContinueCard({
  conversation,
  onContinue,
}: {
  conversation: LastConversation;
  onContinue: (id: string) => void;
}) {
  const when = timeAgo(conversation.updated_at);
  return (
    <button
      type="button"
      className="xpert-welcome-continue"
      onClick={() => onContinue(conversation.id)}
    >
      <span className="xpert-welcome-continue-icon" aria-hidden="true">
        <FiMessageCircle size={18} />
      </span>
      <span className="xpert-welcome-continue-body">
        <span className="xpert-welcome-continue-title">
          Continue where you left off
        </span>
        {conversation.preview && (
          <span className="xpert-welcome-continue-preview">
            “{conversation.preview}”
          </span>
        )}
        {when && <span className="xpert-welcome-continue-time">{when}</span>}
      </span>
      <FiChevronRight className="xpert-welcome-chevron" size={18} aria-hidden="true" />
    </button>
  );
}

type AddState = "idle" | "adding" | "added" | "failed";

function BuyAgain({
  items,
  onAddToCart,
  onChooseOptions,
  onSeeOrders,
  onViewCart,
  cartCount,
}: {
  items: BuyAgainItem[];
  onAddToCart: (item: BuyAgainItem) => Promise<void>;
  onChooseOptions: (item: BuyAgainItem) => void;
  onSeeOrders: () => void;
  onViewCart: () => void;
  cartCount: number;
}) {
  const [states, setStates] = useState<Record<string, AddState>>({});
  const anyAdded = Object.values(states).includes("added");

  const add = async (item: BuyAgainItem) => {
    setStates((s) => ({ ...s, [item.key]: "adding" }));
    try {
      await onAddToCart(item);
      setStates((s) => ({ ...s, [item.key]: "added" }));
    } catch {
      // The store refused this exact variant (sold out, or its options no
      // longer match): the button turns into "Choose options".
      setStates((s) => ({ ...s, [item.key]: "failed" }));
    }
  };

  return (
    <section className="xpert-welcome-section" aria-labelledby="xpert-ba-title">
      <div className="xpert-welcome-section-head">
        <h4 id="xpert-ba-title" className="xpert-welcome-section-title">
          🔁 Buy again
        </h4>
        {anyAdded && cartCount > 0 ? (
          <button type="button" className="xpert-welcome-link" onClick={onViewCart}>
            <FiShoppingCart size={13} aria-hidden="true" /> View cart ({cartCount})
          </button>
        ) : (
          <button type="button" className="xpert-welcome-link" onClick={onSeeOrders}>
            See all orders
          </button>
        )}
      </div>
      <ul className="xpert-welcome-buy-list">
        {items.map((item) => {
          const state = states[item.key] ?? "idle";
          const pick = item.needs_options || !item.add || state === "failed";
          const price =
            item.price != null && Number(item.price) > 0
              ? `${decodeCurrency(item.currency_symbol) || storeCurrency()}${item.price}`
              : "";
          return (
            <li key={item.key} className="xpert-welcome-buy-row">
              <span className="xpert-welcome-buy-img">
                {item.image ? (
                  <img src={item.image} alt={item.name} loading="lazy" />
                ) : (
                  <span aria-hidden="true">🛍️</span>
                )}
              </span>
              <span className="xpert-welcome-buy-info">
                <span className="xpert-welcome-buy-name">{item.name}</span>
                {item.variant && (
                  <span className="xpert-welcome-buy-variant">{item.variant}</span>
                )}
                {state === "failed" ? (
                  <span className="xpert-welcome-buy-note" role="status">
                    Couldn't add this option — pick again
                  </span>
                ) : (
                  price && <span className="xpert-welcome-buy-price">{price}</span>
                )}
              </span>
              {pick ? (
                <button
                  type="button"
                  className="xpert-welcome-buy-btn xpert-welcome-buy-btn--ghost"
                  onClick={() => onChooseOptions(item)}
                  aria-label={`Choose options for ${item.name}`}
                >
                  Choose options
                </button>
              ) : state === "added" ? (
                <span className="xpert-welcome-buy-btn xpert-welcome-buy-btn--done" role="status">
                  <FiCheck size={14} aria-hidden="true" /> Added
                </span>
              ) : (
                <button
                  type="button"
                  className="xpert-welcome-buy-btn"
                  onClick={() => void add(item)}
                  disabled={state === "adding"}
                  aria-label={`Add ${item.name}${item.variant ? `, ${item.variant}` : ""} to cart`}
                >
                  {state === "adding" ? "Adding…" : "Add"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="xpert-welcome-skeleton" aria-hidden="true">
      <div className="xpert-skel xpert-skel-line" style={{ width: "40%" }} />
      <div className="xpert-welcome-products">
        {[0, 1, 2].map((i) => (
          <div key={i} className="xpert-skel xpert-skel-card" />
        ))}
      </div>
      <div className="xpert-skel xpert-skel-block" />
    </div>
  );
}

export function WelcomeScreen({
  loadWelcome,
  onContinue,
  onNewChat,
  onStartChat,
  onOpenProduct,
  onAddToCart,
  onChooseOptions,
  onSeeOrders,
  onViewCart,
  cartCount,
  onClose,
  miraQIcon,
  customerName,
  isExpanded,
  onToggleExpand,
}: WelcomeScreenProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    loadWelcome(ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ status: "ready", data });
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        console.warn("[MiraQ] /chat/welcome failed — showing home screen", err);
        setState({ status: "failed" });
      });
    return () => ctrl.abort();
    // Loads once per mount: every fresh open of the screen mounts it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "failed") {
    return (
      <HomeScreen
        onStartChat={onStartChat}
        onClose={onClose}
        miraQIcon={miraQIcon}
        customerName={customerName}
        isLoggedIn
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
      />
    );
  }

  const firstName = firstNameOf(customerName);
  const data = state.status === "ready" ? state.data : null;
  const lastConv = data?.last_conversation ?? null;
  const whatsNew = data?.whats_new ?? [];
  const mode = data?.whats_new_mode ?? null;
  const buyAgain = data?.buy_again ?? [];

  return (
    <div className="xpert-home-screen">
      <HomeProfileCard
        onClose={onClose}
        miraQIcon={miraQIcon}
        isExpanded={isExpanded}
        onToggleExpand={onToggleExpand}
      />
      <div className="xpert-main-content xpert-welcome" aria-busy={!data}>
        <h3 className="xpert-content-title">
          {firstName ? `Hey ${firstName}! 👋` : "Hey there! 👋"}
          {lastConv ? " Welcome back" : ""}
        </h3>
        <p className="xpert-content-desc">
          {lastConv
            ? "Pick up where you left off, or start something new."
            : "How can I help you today?"}
        </p>

        {!data ? (
          <Skeleton />
        ) : (
          <>
            {mode && whatsNew.length > 0 && (
              <WhatsNew items={whatsNew} mode={mode} onOpenProduct={onOpenProduct} />
            )}
            {lastConv && <ContinueCard conversation={lastConv} onContinue={onContinue} />}
            {buyAgain.length > 0 && (
              <BuyAgain
                items={buyAgain}
                onAddToCart={onAddToCart}
                onChooseOptions={onChooseOptions}
                onSeeOrders={onSeeOrders}
                onViewCart={onViewCart}
                cartCount={cartCount}
              />
            )}
          </>
        )}

        <div className="xpert-bottom-actions">
          <button
            type="button"
            className="xpert-start-chat-btn xpert-welcome-new-chat"
            onClick={onNewChat}
          >
            <FiPlus size={18} aria-hidden="true" /> Start a new chat
          </button>
        </div>
      </div>
    </div>
  );
}
