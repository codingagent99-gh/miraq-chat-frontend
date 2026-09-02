import {
  FiShoppingCart,
  FiChevronLeft,
  FiX,
  FiMaximize2,
  FiMinimize2,
  FiLogIn,
} from "react-icons/fi";
interface ChatHeaderProps {
  cartCount: number;
  customerName?: string;
  customerRole?: string;
  onBack: () => void;
  onClose: () => void;
  logoUrl?: string;
  headerText?: string;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  /** Shopify account login URL for a guest session. When set, a persistent
   *  "Log in" link is shown in the header — see ChatWidget.tsx for how it's
   *  resolved (guest + Shopify only; unset on WooCommerce and for a logged-in
   *  shopper on either platform). Opens in a new tab: navigating the page the
   *  widget lives on would tear the widget down mid-conversation. */
  loginUrl?: string;
}

export function ChatHeader({
  cartCount,
  customerName,
  customerRole,
  onBack,
  onClose,
  logoUrl,
  headerText,
  isExpanded,
  onToggleExpand,
  loginUrl,
}: ChatHeaderProps) {
  // Capitalise role: "customer" → "Customer"
  const displayRole = customerRole
    ? customerRole.charAt(0).toUpperCase() + customerRole.slice(1)
    : null;

  return (
    <div className="xpert-chat-header">
      {/* Updated Back Button */}
      <button
        className="xpert-icon-btn"
        onClick={onBack}
        aria-label="Back to home"
      >
        <FiChevronLeft size={24} />
      </button>

      {logoUrl && (
        <img
          src={logoUrl}
          alt="Logo"
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            objectFit: "cover",
            flexShrink: 0,
          }}
        />
      )}

      <div className="xpert-chat-header-info">
        <h3 className="xpert-chat-header-title">{headerText || "Dandelion"}</h3>
        {customerName ? (
          <p className="xpert-chat-header-sub">
            Hi, {customerName}
            {displayRole ? ` (${displayRole})` : ""}
          </p>
        ) : (
          <p className="xpert-chat-header-sub">Online • Ready to help</p>
        )}
      </div>

      {/* Right Side Actions Container */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {loginUrl && (
          // New tab, not a same-tab navigation: the widget is embedded in
          // the store's page, so navigating that page away would tear the
          // widget (and this conversation) down before the login redirect
          // ever completes.
          <a
            href={loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="xpert-header-login-btn"
            aria-label="Log in to your account"
          >
            <FiLogIn size={14} />
            Log in
          </a>
        )}
        {cartCount > 0 && (
          <div className="xpert-cart-badge">
            <FiShoppingCart size={20} />
            <span className="xpert-cart-count">{cartCount}</span>
          </div>
        )}
        {onToggleExpand && (
          <button
            className="xpert-icon-btn"
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
          >
            {isExpanded ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
          </button>
        )}
        {/* New Minimize Button */}
        <button
          className="xpert-icon-btn"
          onClick={onClose}
          aria-label="Minimize chat"
        >
          <FiX size={22} />
        </button>
      </div>
    </div>
  );
}
