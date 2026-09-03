import { useState } from "react";
import type { Product } from "../types/api";
import { FiShoppingCart } from "react-icons/fi";

interface ProductCardsProps {
  products: Product[];
  onProductClick?: (product: Product) => void;
  onShowSimilar?: (product: Product) => void;
  onAddToCart?: (product: Product, quantity: number) => void;
  loadingSimilarId?: number | null;
}

export function ProductCards({
  products,
  onProductClick,
  onShowSimilar,
  onAddToCart,
  loadingSimilarId,
}: ProductCardsProps) {
  // Which product's card currently shows the manual quantity prompt.
  const [qtyPromptId, setQtyPromptId] = useState<number | null>(null);
  const [qtyValue, setQtyValue] = useState("");

  const confirmAddToCart = (product: Product) => {
    const qty = parseInt(qtyValue, 10);
    if (!qty || qty < 1) return;
    onAddToCart?.(product, qty);
    setQtyPromptId(null);
    setQtyValue("");
  };
  // 🚀 The exhaustive, safe extractor
  const getImgSrc = (product: any): string => {
    const candidates = [
      ...(Array.isArray(product.images) ? product.images : []),
      product.image,
    ].filter(Boolean);

    for (const img of candidates) {
      if (typeof img === "string" && img) return img;
      if (typeof img === "object" && img !== null) {
        const url = img.src || img.url || img.href || img.full || img.guid;
        if (url && typeof url === "string") return url;
      }
    }
    return "";
  };

  return (
    <div className="xpert-product-grid">
      {products.map((product) => {
        const imgSrc = getImgSrc(product);

        return (
          <div
            key={product.id}
            className={`xpert-product-card${onProductClick ? " xpert-product-card--clickable" : ""}`}
            onClick={() => onProductClick?.(product)}
            role={onProductClick ? "button" : undefined}
            tabIndex={onProductClick ? 0 : undefined}
            onKeyDown={(e) => {
              if (onProductClick && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onProductClick(product);
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* 🚀 BRUTE FORCE RENDERER: Bypasses external CSS to prevent Flexbox collapse */}
            {imgSrc ? (
              <div
                style={{
                  width: "100%",
                  minHeight:
                    "160px" /* Forces a physical height so CSS can't squash it */,
                  position: "relative",
                  backgroundColor: "#f1f5f9",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                <img
                  src={imgSrc}
                  alt={product.name}
                  /* Intentionally omitting className to prevent external stylesheet interference */
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </div>
            ) : (
              <div
                style={{
                  width: "100%",
                  minHeight: "160px",
                  backgroundColor: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  No Image
                </span>
              </div>
            )}

            <div className="xpert-product-info">
              <h4 className="xpert-product-name" title={product.name}>
                {product.name}
              </h4>

              {product.matched_against &&
                product.matched_against.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      flexWrap: "wrap",
                      marginTop: "2px",
                      marginBottom: "2px",
                    }}
                  >
                    {product.matched_against.map((label, i) => (
                      <span
                        key={i}
                        title={label}
                        style={{
                          fontSize: "10px",
                          fontWeight: 600,
                          color: "#3b82f6",
                          backgroundColor: "#eff6ff",
                          border: "1px solid #bfdbfe",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                )}

              {(product.on_sale
                ? (product.sale_price ?? 0) > 0 ||
                  (product.regular_price ?? 0) > 0
                : (product.price ?? 0) > 0) && (
                <div className="xpert-product-price">
                  {product.on_sale && product.sale_price ? (
                    <>
                      {product.sale_price > 0 && (
                        <span className="xpert-price-sale">
                          ${product.sale_price}
                        </span>
                      )}
                      {product.regular_price > 0 && (
                        <span className="xpert-price-regular">
                          ${product.regular_price}
                        </span>
                      )}
                    </>
                  ) : (
                    product.price > 0 && (
                      <span className="xpert-price">${product.price}</span>
                    )
                  )}
                </div>
              )}

              {(product.in_stock === false || product.on_sale) && (
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    marginTop: "4px",
                    flexWrap: "wrap",
                  }}
                >
                  {product.in_stock === false ? (
                    <span className="xpert-sale-badge">OUT OF STOCK</span>
                  ) : (
                    <span className="xpert-sale-badge">SALE</span>
                  )}
                </div>
              )}

              {/* Actions are class-driven rather than inline-styled. Inline
                  styles beat any stylesheet rule, so the layout was pinned to
                  a row at every card width and no media/container query could
                  ever adjust it — which is what forced the similar-products
                  button onto three lines in a 2-up grid on a phone. Moving it
                  to .xpert-card-actions makes that fixable in CSS; the rule
                  below currently reproduces the old row exactly, so this
                  change is behaviour-neutral until a query is added. */}
              {qtyPromptId === product.id ? (
                <div
                  className="xpert-cart-qty-row"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    className="xpert-cart-qty-input"
                    type="number"
                    min={1}
                    placeholder="Enter quantity"
                    value={qtyValue}
                    autoFocus
                    onChange={(e) => setQtyValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmAddToCart(product);
                      if (e.key === "Escape") {
                        setQtyPromptId(null);
                        setQtyValue("");
                      }
                    }}
                  />
                  <button
                    className="xpert-cart-qty-confirm"
                    onClick={() => confirmAddToCart(product)}
                    disabled={!qtyValue || parseInt(qtyValue, 10) < 1}
                    title="Confirm quantity"
                    aria-label="Confirm quantity"
                    type="button"
                  >
                    Add
                  </button>
                  <button
                    className="xpert-cart-qty-cancel"
                    onClick={() => {
                      setQtyPromptId(null);
                      setQtyValue("");
                    }}
                    title="Cancel"
                    aria-label="Cancel"
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="xpert-card-actions">
                  {onAddToCart && (
                    <button
                      className="xpert-add-to-cart-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQtyPromptId(product.id);
                        setQtyValue("");
                      }}
                      title="Add to Cart"
                      aria-label="Add to cart"
                      type="button"
                    >
                      <FiShoppingCart size={16} aria-hidden="true" />
                    </button>
                  )}
                  {onShowSimilar && (
                    <button
                      className="xpert-similar-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowSimilar(product);
                      }}
                      disabled={loadingSimilarId === product.id}
                      type="button"
                    >
                      {loadingSimilarId === product.id
                        ? "Loading…"
                        : "Show Similar Products"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
