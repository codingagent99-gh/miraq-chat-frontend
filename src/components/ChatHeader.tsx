import { FiMinus, FiShoppingCart, FiX } from "react-icons/fi";

interface ChatHeaderProps {
  cartCount: number;
  onBack: () => void;
  onClose: () => void;
}

export function ChatHeader({ cartCount, onBack, onClose }: ChatHeaderProps) {
  return (
    <div className="xpert-chat-header">
      <button
        className="xpert-icon-btn"
        onClick={onBack}
        aria-label="Back to home"
      >
        <FiMinus size={20} />
      </button>
      <div className="xpert-chat-header-info">
        <h3 className="xpert-chat-header-title">MiraQ Commerce Assistant</h3>
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
        onClick={onClose}
        aria-label="Close chat"
      >
        <FiX size={20} />
      </button>
    </div>
  );
}
