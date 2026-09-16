import { useState } from "react";
import type { Product } from "../types/api";
import { ProductCards } from "./ProductCards";

export interface TopSellerGroup {
  slug: string;
  name: string;
  total_units: number;
  products: Product[];
}

interface TopSellersByCollectionCardProps {
  groups: TopSellerGroup[];
  windowLabel?: string;
  onProductClick?: (product: Product) => void;
  onShowSimilar?: (product: Product) => void;
  loadingSimilarId?: number | null;
}

/**
 * Per-collection best sellers, one expandable section per collection.
 *
 * Collapsed by default past the first group: six collections x five products
 * is thirty cards, which buries the overall top-5 rendered above this card.
 * The first group opens so the card never reads as an empty accordion.
 *
 * Groups arrive pre-ranked from the backend (collections by total units, then
 * products by units within each). This component does not re-sort — the
 * ranking is the answer, and re-deriving it here would let the two drift.
 */
export function TopSellersByCollectionCard({
  groups,
  windowLabel,
  onProductClick,
  onShowSimilar,
  loadingSimilarId,
}: TopSellersByCollectionCardProps) {
  const [openSlugs, setOpenSlugs] = useState<Set<string>>(
    () => new Set(groups.length > 0 ? [groups[0].slug] : []),
  );

  if (!groups || groups.length === 0) return null;

  const toggle = (slug: string) => {
    setOpenSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="xpert-top-sellers-by-collection">
      <p className="xpert-top-sellers-heading">
        By collection{windowLabel ? ` · ${windowLabel}` : ""}
      </p>

      {groups.map((group) => {
        const isOpen = openSlugs.has(group.slug);
        return (
          <div key={group.slug} className="xpert-top-sellers-group">
            <button
              type="button"
              className="xpert-top-sellers-group-toggle"
              onClick={() => toggle(group.slug)}
              aria-expanded={isOpen}
            >
              <span className="xpert-top-sellers-group-name">{group.name}</span>
              <span className="xpert-top-sellers-group-count">
                {group.total_units} sold
              </span>
              <span aria-hidden="true">{isOpen ? "−" : "+"}</span>
            </button>

            {isOpen && (
              <ProductCards
                products={group.products}
                onProductClick={onProductClick}
                onShowSimilar={onShowSimilar}
                loadingSimilarId={loadingSimilarId}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
