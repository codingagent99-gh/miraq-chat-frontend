import { useState, useEffect, useCallback } from "react";
import {
  FiArrowLeft,
  FiX,
  FiExternalLink,
  FiShoppingCart,
  FiChevronLeft,
  FiChevronRight,
} from "react-icons/fi";
import type { Product } from "../types/api";

interface ProductDetailPanelProps {
  productId: number;
  /** Pre-loaded product from the chat message (compact data) */
  initialProduct?: Product;
  /** Fetch full product details by ID */
  fetchProduct: (id: number) => Promise<Product>;
  onClose: () => void;
  onAskAbout: (productName: string) => void;
  onOrder: (productName: string) => void;
}

type LoadState = "loading" | "loaded" | "error";

export function ProductDetailPanel({
  productId,
  initialProduct,
  fetchProduct,
  onClose,
  onAskAbout,
  onOrder,
}: ProductDetailPanelProps) {
  const [product, setProduct] = useState<Product | null>(
    initialProduct ?? null,
  );
  const [loadState, setLoadState] = useState<LoadState>(
    initialProduct ? "loaded" : "loading",
  );
  const [imageIndex, setImageIndex] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);

  // Fetch full product details
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadState("loading");
      try {
        const full = await fetchProduct(productId);
        if (!cancelled) {
          setProduct(full);
          setLoadState("loaded");
        }
      } catch {
        if (!cancelled) {
          if (initialProduct) {
            setLoadState("loaded");
          } else {
            setLoadState("error");
          }
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [productId, fetchProduct, initialProduct]);

  // Keyboard: Escape to close, arrow keys for images
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prevImage();
      if (e.key === "ArrowRight") nextImage();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const images = product?.images ?? [];
  const nextImage = useCallback(() => {
    setImageIndex((i) => (i + 1) % Math.max(images.length, 1));
  }, [images.length]);
  const prevImage = useCallback(() => {
    setImageIndex((i) => (i - 1 + images.length) % Math.max(images.length, 1));
  }, [images.length]);

  // ── Loading state ──
  if (loadState === "loading" && !product) {
    return (
      <div className="xpert-product-detail-overlay">
        <div className="xpert-product-detail-panel">
          <div className="xpert-detail-header">
            <button
              className="xpert-icon-btn"
              onClick={onClose}
              aria-label="Back"
              type="button"
            >
              <FiArrowLeft size={20} />
            </button>
            <span className="xpert-detail-header-title">Product Details</span>
            <button
              className="xpert-icon-btn xpert-detail-close-btn"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              <FiX size={20} />
            </button>
          </div>
          <div className="xpert-detail-loading">
            <div className="dot-loader">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p>Loading product details…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (loadState === "error" || !product) {
    return (
      <div className="xpert-product-detail-overlay">
        <div className="xpert-product-detail-panel">
          <div className="xpert-detail-header">
            <button
              className="xpert-icon-btn"
              onClick={onClose}
              aria-label="Back"
              type="button"
            >
              <FiArrowLeft size={20} />
            </button>
            <span className="xpert-detail-header-title">Product Details</span>
            <button
              className="xpert-icon-btn xpert-detail-close-btn"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              <FiX size={20} />
            </button>
          </div>
          <div className="xpert-detail-error">
            <p>😕 Unable to load product details.</p>
            <button
              className="xpert-detail-retry-btn"
              onClick={() => {
                setLoadState("loading");
                fetchProduct(productId)
                  .then((p) => {
                    setProduct(p);
                    setLoadState("loaded");
                  })
                  .catch(() => setLoadState("error"));
              }}
              type="button"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loaded state ──
  const stockLabel = product.in_stock ? "In Stock" : "Out of Stock";
  const stockClass = product.in_stock
    ? "xpert-detail-stock--in"
    : "xpert-detail-stock--out";

  const ratingNum = parseFloat(product.average_rating || "0");
  const fullStars = Math.floor(ratingNum);
  const halfStar = ratingNum - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  return (
    <div className="xpert-product-detail-overlay">
      <div className="xpert-product-detail-panel">
        {/* ── Header with back ← AND close ✕ ── */}
        <div className="xpert-detail-header">
          <button
            className="xpert-icon-btn"
            onClick={onClose}
            aria-label="Back"
            type="button"
          >
            <FiArrowLeft size={20} />
          </button>
          <span className="xpert-detail-header-title">Product Details</span>
          <button
            className="xpert-icon-btn xpert-detail-close-btn"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div className="xpert-detail-content">
          {/* Image gallery */}
          {images.length > 0 && (
            <div className="xpert-detail-gallery">
              <img
                src={images[imageIndex]}
                alt={product.name}
                className="xpert-detail-image"
              />
              {images.length > 1 && (
                <>
                  <button
                    className="xpert-gallery-btn xpert-gallery-btn--prev"
                    onClick={prevImage}
                    aria-label="Previous image"
                    type="button"
                  >
                    <FiChevronLeft size={20} />
                  </button>
                  <button
                    className="xpert-gallery-btn xpert-gallery-btn--next"
                    onClick={nextImage}
                    aria-label="Next image"
                    type="button"
                  >
                    <FiChevronRight size={20} />
                  </button>
                  <div className="xpert-gallery-dots">
                    {images.map((_, idx) => (
                      <span
                        key={idx}
                        className={`xpert-gallery-dot${idx === imageIndex ? " active" : ""}`}
                        onClick={() => setImageIndex(idx)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Name */}
          <h3 className="xpert-detail-name">{product.name}</h3>

          {/* Price */}
          <div className="xpert-detail-price">
            {product.on_sale &&
            product.sale_price != null &&
            product.sale_price > 0 ? (
              <>
                <span className="xpert-detail-price-sale">
                  ${product.sale_price}
                </span>
                {product.regular_price > 0 && (
                  <span className="xpert-detail-price-regular">
                    ${product.regular_price}
                  </span>
                )}
                <span className="xpert-sale-badge">SALE</span>
              </>
            ) : (
              product.price > 0 && (
                <span className="xpert-detail-price-current">
                  ${product.price}
                </span>
              )
            )}
          </div>

          {/* Stock + SKU row */}
          <div className="xpert-detail-meta-row">
            <span className={`xpert-detail-stock ${stockClass}`}>
              {stockLabel}
            </span>
            {product.sku && (
              <span className="xpert-detail-sku">SKU: {product.sku}</span>
            )}
          </div>

          {/* Rating */}
          {ratingNum > 0 && (
            <div className="xpert-detail-rating">
              <span className="xpert-detail-stars">
                {"★".repeat(fullStars)}
                {halfStar ? "½" : ""}
                {"☆".repeat(emptyStars)}
              </span>
              <span className="xpert-detail-rating-text">
                {product.average_rating} ({product.rating_count} review
                {product.rating_count !== 1 ? "s" : ""})
              </span>
            </div>
          )}

          {/* Categories */}
          {product.categories && product.categories.length > 0 && (
            <div className="xpert-detail-categories">
              {product.categories.map((cat, idx) => (
                <span key={idx} className="xpert-detail-category-chip">
                  {cat}
                </span>
              ))}
            </div>
          )}

          {/* Short description */}
          {product.short_description && (
            <div className="xpert-detail-short-desc">
              <p>{product.short_description}</p>
            </div>
          )}

          {/* Attributes */}
          {product.attributes && product.attributes.length > 0 && (
            <div className="xpert-detail-attributes">
              <h4 className="xpert-detail-section-title">Specifications</h4>
              {product.attributes.map((attr, idx) => (
                <div key={idx} className="xpert-detail-attr-row">
                  <span className="xpert-detail-attr-name">{attr.name}</span>
                  <span className="xpert-detail-attr-value">
                    {attr.options.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Full description (collapsible) */}
          {product.description && (
            <div className="xpert-detail-full-desc">
              <button
                className="xpert-detail-desc-toggle"
                onClick={() => setDescExpanded(!descExpanded)}
                type="button"
              >
                {descExpanded ? "Hide Description ▲" : "Full Description ▼"}
              </button>
              {descExpanded && (
                <div className="xpert-detail-desc-body">
                  <p>{product.description}</p>
                </div>
              )}
            </div>
          )}

          {/* Dimensions / Weight */}
          {(product.weight ||
            (product.dimensions &&
              (product.dimensions.length ||
                product.dimensions.width ||
                product.dimensions.height))) && (
            <div className="xpert-detail-dimensions">
              <h4 className="xpert-detail-section-title">
                Dimensions & Weight
              </h4>
              {product.weight && (
                <div className="xpert-detail-attr-row">
                  <span className="xpert-detail-attr-name">Weight</span>
                  <span className="xpert-detail-attr-value">
                    {product.weight}
                  </span>
                </div>
              )}
              {product.dimensions?.length && (
                <div className="xpert-detail-attr-row">
                  <span className="xpert-detail-attr-name">Dimensions</span>
                  <span className="xpert-detail-attr-value">
                    {product.dimensions.length} × {product.dimensions.width} ×{" "}
                    {product.dimensions.height}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Action buttons (sticky at bottom) ── */}
        <div className="xpert-detail-actions">
          <button
            className="xpert-detail-action-btn xpert-detail-action-btn--primary"
            onClick={() => onOrder(product.name)}
            type="button"
          >
            <FiShoppingCart size={16} /> Order This
          </button>
          <button
            className="xpert-detail-action-btn xpert-detail-action-btn--secondary"
            onClick={() => onAskAbout(product.name)}
            type="button"
          >
            💬 Ask About This
          </button>
          {product.permalink && (
            <a
              href={product.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="xpert-detail-action-btn xpert-detail-action-btn--link"
            >
              <FiExternalLink size={14} /> View on Website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
