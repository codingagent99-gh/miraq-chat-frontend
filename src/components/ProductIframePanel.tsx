/**
 * ProductIframePanel
 *
 * Temporary replacement for ProductDetailPanel.
 * Opens the product's own permalink in an iframe overlay
 * inside the chat widget — no extra API calls needed.
 *
 * To restore the old panel later, just swap the import in ChatWidget.tsx.
 */
import { useState } from "react";
import { FiX, FiExternalLink } from "react-icons/fi";
import type { Product } from "../types/api";

interface ProductIframePanelProps {
  product: Product;
  onClose: () => void;
}

export function ProductIframePanel({
  product,
  onClose,
}: ProductIframePanelProps) {
  const [loaded, setLoaded] = useState(false);

  // permalink comes straight from the WooCommerce REST response,
  // e.g. "https://wgc.net.in/wip/product/britannia-winkin-cow-cold-coffee/"
  const url = product.permalink as string | undefined;

  return (
    /* Full overlay — sits on top of the chat window exactly like ProductDetailPanel */
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderRadius: "inherit",
        overflow: "hidden",
      }}
    >
      {/* ── Header bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "12px 14px",
          borderBottom: "1px solid #e8e6e0",
          flexShrink: 0,
          background: "#fafaf8",
        }}
      >
        {/* Back / close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close product view"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "30px",
            height: "30px",
            border: "1.5px solid #e8e6e0",
            borderRadius: "8px",
            background: "#fff",
            cursor: "pointer",
            color: "#555",
            flexShrink: 0,
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "#1c1c1a";
            e.currentTarget.style.color = "#1c1c1a";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "#e8e6e0";
            e.currentTarget.style.color = "#555";
          }}
        >
          <FiX size={14} />
        </button>

        {/* Product name */}
        <span
          style={{
            flex: 1,
            fontSize: "13px",
            fontWeight: 600,
            color: "#1c1c1a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {product.name}
        </span>

        {/* Open in new tab */}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in new tab"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
              border: "1.5px solid #e8e6e0",
              borderRadius: "8px",
              background: "#fff",
              color: "#555",
              flexShrink: 0,
              textDecoration: "none",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor =
                "#1c1c1a";
              (e.currentTarget as HTMLAnchorElement).style.color = "#1c1c1a";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.borderColor =
                "#e8e6e0";
              (e.currentTarget as HTMLAnchorElement).style.color = "#555";
            }}
          >
            <FiExternalLink size={13} />
          </a>
        )}
      </div>

      {/* ── iframe area ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Spinner shown until iframe fires onLoad */}
        {!loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              background: "#fafaf8",
            }}
          >
            {/* Simple CSS spinner — no extra dep */}
            <div
              style={{
                width: "32px",
                height: "32px",
                border: "3px solid #e8e6e0",
                borderTopColor: "#1c1c1a",
                borderRadius: "50%",
                animation: "miraq-spin 0.7s linear infinite",
              }}
            />
            <span style={{ fontSize: "12px", color: "#888" }}>
              Loading product…
            </span>
            {/* Keyframe injected inline once */}
            <style>{`@keyframes miraq-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {url ? (
          <iframe
            src={url}
            title={product.name}
            onLoad={() => setLoaded(true)}
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              display: "block",
              // Keep invisible until loaded so spinner shows cleanly
              opacity: loaded ? 1 : 0,
              transition: "opacity 0.2s",
            }}
          />
        ) : (
          /* No permalink — graceful fallback */
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: "13px",
              color: "#888",
              padding: "24px",
              textAlign: "center",
            }}
          >
            Product page not available.
          </div>
        )}
      </div>
    </div>
  );
}
