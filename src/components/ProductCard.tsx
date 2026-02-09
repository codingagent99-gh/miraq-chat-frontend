import { Card, Badge } from "react-bootstrap";
import type { Product } from "../types/api";
import styles from "./ProductCard.module.css";

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const savings =
    product.on_sale && product.regular_price
      ? product.regular_price - product.price
      : 0;

  const stars = parseFloat(product.average_rating);

  // ── debug: what does images actually look like at render time? ──
  const imgUrl =
    Array.isArray(product.images) && product.images.length > 0
      ? product.images[0]
      : null;

  return (
    <Card className={styles.card}>
      {/* image */}
      <div className={styles.imgWrap}>
        {imgUrl ? (
          <>
            <img
              src={imgUrl}
              alt={product.name}
              className={styles.img}
              loading="lazy"
              onError={(e) => {
                // if the remote server blocks the load, show the placeholder instead
                (e.currentTarget as HTMLImageElement).style.display = "none";
                const sibling = e.currentTarget
                  .nextElementSibling as HTMLElement | null;
                if (sibling) sibling.style.display = "flex";
              }}
            />
            {/* hidden fallback, shown only when onError fires */}
            <div className={styles.imgPlaceholder} style={{ display: "none" }}>
              ☕
            </div>
          </>
        ) : (
          <div className={styles.imgPlaceholder}>☕</div>
        )}
        {!product.in_stock && (
          <Badge bg="danger" className={styles.stockBadge}>
            Out of stock
          </Badge>
        )}
        {product.on_sale && (
          <Badge bg="success" className={styles.saleBadge}>
            −${savings.toFixed(0)}
          </Badge>
        )}
      </div>

      {/* body */}
      <Card.Body className={styles.body}>
        <Card.Title className={styles.title}>{product.name}</Card.Title>

        {/* categories */}
        {product.categories.length > 0 && (
          <div className={styles.cats}>
            {product.categories
              .filter((c) => c.toLowerCase() !== "uncategorized")
              .map((c) => (
                <Badge key={c} bg="secondary" className={styles.catBadge}>
                  {c}
                </Badge>
              ))}
          </div>
        )}

        {/* rating */}
        {stars > 0 && (
          <div className={styles.rating}>
            <span
              className={styles.starsFill}
              style={{ width: `${(stars / 5) * 100}%` }}
            />
            <span className={styles.starsEmpty}>★★★★★</span>
            <span className={styles.ratingNum}>({product.rating_count})</span>
          </div>
        )}

        {/* price row */}
        <div className={styles.priceRow}>
          <span className={styles.price}>${product.price.toFixed(2)}</span>
          {product.on_sale && product.regular_price > product.price && (
            <span className={styles.regularPrice}>
              ${product.regular_price.toFixed(2)}
            </span>
          )}
        </div>

        {/* short description */}
        {product.short_description && (
          <p className={styles.desc}>{product.short_description}</p>
        )}
      </Card.Body>

      {/* footer link */}
      <Card.Footer className={styles.footer}>
        <a
          href={product.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.viewLink}
        >
          View on Store →
        </a>
      </Card.Footer>
    </Card>
  );
}
