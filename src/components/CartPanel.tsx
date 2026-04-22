import "./CartPanel.css";
import {
  FiX,
  FiTrash2,
  FiPlus,
  FiMinus,
  FiShoppingCart,
  FiArrowRight,
} from "react-icons/fi";
import type { WCCart } from "../hooks/useCart";

interface CartPanelProps {
  cart: WCCart | null;
  loading: boolean;
  error: string | null;
  siteOrigin: string;
  onClose: () => void;
  onRemove: (key: string) => void;
  onUpdateQuantity: (key: string, quantity: number) => void;
  /** When provided, renders a "Checkout" CTA that opens the checkout panel. */
  onCheckout?: () => void;
}

function formatPrice(
  minorStr: string,
  symbol: string,
  minorUnit: number,
): string {
  const value = parseInt(minorStr, 10) / Math.pow(10, minorUnit);
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: minorUnit > 0 ? 2 : 0,
    maximumFractionDigits: minorUnit > 0 ? 2 : 0,
  })}`;
}

/** Decode HTML entities like &#8243; → ″, &amp; → &, etc. */
function decodeHtml(str: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

export function CartPanel({
  cart,
  loading,
  error,
  siteOrigin,
  onClose,
  onRemove,
  onUpdateQuantity,
  onCheckout,
}: CartPanelProps) {
  const isEmpty = !cart || cart.items.length === 0;
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;
  const symbol = cart?.totals.currency_symbol ?? "₹";

  return (
    <div className="miraq-cart-panel">
      {/* ── Header ── */}
      <div className="miraq-cart-header">
        <div className="miraq-cart-title">
          <FiShoppingCart size={16} color="#1c1c1a" />
          <span className="miraq-cart-title-text">Your Cart</span>
          {cart && cart.items_count > 0 && (
            <span className="miraq-cart-badge">{cart.items_count}</span>
          )}
        </div>
        <button
          className="miraq-cart-close"
          onClick={onClose}
          aria-label="Close cart"
        >
          <FiX size={16} />
        </button>
      </div>

      {/* ── Body ── */}
      <div className="miraq-cart-body">
        {loading && (
          <div className="miraq-cart-loading">
            <div className="dot-loader">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="miraq-cart-empty">
            <p style={{ color: "#ef4444" }}>{error}</p>
          </div>
        )}

        {!loading && !error && isEmpty && (
          <div className="miraq-cart-empty">
            <div className="miraq-cart-empty-icon">
              <FiShoppingCart size={22} />
            </div>
            <p>Your cart is empty</p>
          </div>
        )}

        {!loading &&
          !isEmpty &&
          cart!.items.map((item, i) => {
            const unitPrice = formatPrice(item.prices.price, symbol, minorUnit);
            const lineTotal = formatPrice(
              item.totals.line_total,
              symbol,
              minorUnit,
            );
            const hasVariant = item.variation && item.variation.length > 0;

            return (
              <div
                key={item.key}
                className="miraq-cart-item"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                {/* Thumbnail */}
                {item.images[0]?.thumbnail ? (
                  <img
                    src={item.images[0].thumbnail}
                    alt={item.name}
                    className="miraq-cart-item-img"
                  />
                ) : (
                  <div className="miraq-cart-item-img" />
                )}

                {/* Info */}
                <div className="miraq-cart-item-info">
                  <p className="miraq-cart-item-name">
                    {decodeHtml(item.name)}
                  </p>

                  {hasVariant && (
                    <p className="miraq-cart-item-variation">
                      {item.variation
                        .map((v) => decodeHtml(v.value))
                        .join(" · ")}
                    </p>
                  )}

                  <p className="miraq-cart-item-price">{unitPrice} each</p>

                  <div className="miraq-cart-item-qty">
                    <button
                      onClick={() =>
                        onUpdateQuantity(item.key, item.quantity - 1)
                      }
                      aria-label="Decrease quantity"
                    >
                      <FiMinus size={10} />
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      onClick={() =>
                        onUpdateQuantity(item.key, item.quantity + 1)
                      }
                      aria-label="Increase quantity"
                    >
                      <FiPlus size={10} />
                    </button>
                  </div>
                </div>

                {/* Right */}
                <div className="miraq-cart-item-right">
                  <span className="miraq-cart-item-total">{lineTotal}</span>
                  <button
                    className="miraq-cart-item-remove"
                    onClick={() => onRemove(item.key)}
                    aria-label="Remove item"
                  >
                    <FiTrash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* ── Footer ── */}
      {!isEmpty && cart && (
        <div className="miraq-cart-footer">
          <div className="miraq-cart-totals">
            <div className="miraq-cart-total-row">
              <span>Subtotal</span>
              <span>
                {formatPrice(cart.totals.total_items, symbol, minorUnit)}
              </span>
            </div>

            {parseInt(cart.totals.total_shipping, 10) > 0 && (
              <div className="miraq-cart-total-row">
                <span>Shipping</span>
                <span>
                  {formatPrice(cart.totals.total_shipping, symbol, minorUnit)}
                </span>
              </div>
            )}

            {parseInt(cart.totals.total_tax, 10) > 0 && (
              <div className="miraq-cart-total-row">
                <span>Tax</span>
                <span>
                  {formatPrice(cart.totals.total_tax, symbol, minorUnit)}
                </span>
              </div>
            )}

            <div className="miraq-cart-total-row miraq-cart-grand-total">
              <span>Total</span>
              <span>
                {formatPrice(cart.totals.total_price, symbol, minorUnit)}
              </span>
            </div>
          </div>

          <a
            href={`${siteOrigin}/checkout`}
            className="miraq-cart-checkout-btn"
          >
            Proceed to Checkout <FiArrowRight size={14} />
          </a>

          {onCheckout && (
            <button
              className="miraq-cart-checkout-btn"
              onClick={onCheckout}
              disabled={cart.items_count === 0}
              style={{ marginTop: 0, cursor: cart.items_count === 0 ? "not-allowed" : "pointer" }}
              type="button"
            >
              Checkout <FiArrowRight size={14} />
            </button>
          )}

          <button className="miraq-cart-continue-btn" onClick={onClose}>
            Continue Shopping
          </button>
        </div>
      )}
    </div>
  );
}
