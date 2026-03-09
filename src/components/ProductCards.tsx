import type { Product } from "../types/api";

interface ProductCardsProps {
  products: Product[];
  onProductClick?: (product: Product) => void;
}

export function ProductCards({ products, onProductClick }: ProductCardsProps) {
  return (
    <div className="xpert-product-grid">
      {products.map((product) => (
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
        >
          {product.images && product.images[0] && (
            <img
              src={product.images[0]}
              alt={product.name}
              className="xpert-product-image"
              loading="lazy"
            />
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
                  {product.price > 0 && (
                    <span className="xpert-price-regular">
                      ${product.price}
                    </span>
                  )}
                </>
              ) : (
                product.price > 0 && (
                  <span className="xpert-price">${product.price}</span>
                )
              )}
            </div>
            {product.on_sale && <span className="xpert-sale-badge">SALE</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
