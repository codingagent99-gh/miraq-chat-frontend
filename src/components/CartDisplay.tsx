import { FiShoppingCart } from "react-icons/fi";
import type { CartData } from "../types/api";

interface CartDisplayProps {
  cart: CartData;
}

export function CartDisplay({ cart }: CartDisplayProps) {
  if (!cart || !cart.items || cart.items.length === 0) {
    return (
      <div className="xpert-cart-empty">
        <FiShoppingCart size={32} />
        <p>Your cart is empty</p>
      </div>
    );
  }

  return (
    <div className="xpert-cart-summary">
      <h4 className="xpert-cart-title">
        <FiShoppingCart /> Your Cart ({cart.item_count} items)
      </h4>
      <div className="xpert-cart-items">
        {cart.items.map((item, idx) => (
          <div key={idx} className="xpert-cart-item">
            {item.image && (
              <img
                src={item.image}
                alt={item.name}
                className="xpert-cart-item-image"
              />
            )}
            <div className="xpert-cart-item-info">
              <p className="xpert-cart-item-name">{item.name}</p>
              <p className="xpert-cart-item-meta">
                ${item.price} x {item.quantity}
              </p>
            </div>
            <p className="xpert-cart-item-total">
              ${(item.price * item.quantity).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
      <div className="xpert-cart-totals">
        <div className="xpert-cart-total-row">
          <span>Subtotal:</span>
          <span>${cart.totals.subtotal.toFixed(2)}</span>
        </div>
        {cart.totals.shipping > 0 && (
          <div className="xpert-cart-total-row">
            <span>Shipping:</span>
            <span>${cart.totals.shipping.toFixed(2)}</span>
          </div>
        )}
        {cart.totals.tax > 0 && (
          <div className="xpert-cart-total-row">
            <span>Tax:</span>
            <span>${cart.totals.tax.toFixed(2)}</span>
          </div>
        )}
        <div className="xpert-cart-total-row xpert-cart-total-final">
          <span>Total:</span>
          <span>${cart.totals.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
