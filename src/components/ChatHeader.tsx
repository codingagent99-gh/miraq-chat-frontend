import { FiMinus, FiShoppingCart } from "react-icons/fi";

interface ChatHeaderProps {
  cartCount: number;
  customerName?: string;
  customerRole?: string;
  onBack: () => void;
  onClose: () => void;
  logoUrl?: string;
  headerText?: string;
}

export function ChatHeader({
  cartCount,
  customerName,
  customerRole,
  onBack,
  logoUrl,
  headerText,
}: ChatHeaderProps) {
  // Capitalise role: "customer" → "Customer"
  const displayRole = customerRole
    ? customerRole.charAt(0).toUpperCase() + customerRole.slice(1)
    : null;

  return (
    <div className="xpert-chat-header">
      <button
        className="xpert-icon-btn"
        onClick={onBack}
        aria-label="Back to home"
      >
        <FiMinus size={20} />
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
        <h3 className="xpert-chat-header-title">
          {headerText || "MiraQ Commerce Assistant"}
        </h3>
        {customerName ? (
          <p className="xpert-chat-header-sub">
            Hi, {customerName}
            {displayRole ? ` (${displayRole})` : ""}
          </p>
        ) : (
          <p className="xpert-chat-header-sub">Online • Ready to help</p>
        )}
      </div>

      {cartCount > 0 && (
        <div className="xpert-cart-badge">
          <FiShoppingCart size={20} />
          <span className="xpert-cart-count">{cartCount}</span>
        </div>
      )}
    </div>
  );
}
