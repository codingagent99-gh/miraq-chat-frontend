import type { Product } from "../types/api";

interface ProductCardsProps {
  products: Product[];
  onProductClick?: (product: Product) => void;
}

export function ProductCards({ products, onProductClick }: ProductCardsProps) {
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
              <h4 className="xpert-product-name">{product.name}</h4>
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
                ) : product.on_sale ? (
                  <span className="xpert-sale-badge">SALE</span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
