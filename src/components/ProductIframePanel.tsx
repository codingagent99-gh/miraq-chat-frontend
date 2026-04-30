/**
 * ProductIframePanel
 *
 * Renders the product permalink inside an iframe overlay.
 *
 * ── Header/footer clipping ───────────────────────────────────────────────────
 * Cross-origin iframes block JS/CSS injection, so we can't hide the site's
 * header and footer directly. Instead we use the overflow-clip trick:
 *
 *   • The iframe is taller than its container by (HEADER_PX + FOOTER_PX).
 *   • A negative top margin shifts it upward so the site header scrolls out
 *     of the visible area.
 *   • The container is overflow:hidden, so the footer is clipped at the bottom.
 *
 * Tune HEADER_PX and FOOTER_PX by measuring the header/footer heights on
 * your WooCommerce site (DevTools → inspect element → computed height).
 *
 * ── Cleaner alternative (if you control the WP site) ────────────────────────
 * Add this to your theme's functions.php:
 *
 *   add_action('template_redirect', function () {
 *     if (isset($_GET['iframe'])) {
 *       add_filter('show_admin_bar', '__return_false');
 *       add_action('wp_head', function () {
 *         echo '<style>header,footer,.site-header,.site-footer{display:none!important}</style>';
 *       });
 *     }
 *   });
 *
 * Then set QUERY_PARAM = "iframe" below and the panel will automatically
 * append ?iframe=1 to every product URL, giving a fully clean stripped page.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { useState } from "react";
import { FiX, FiExternalLink } from "react-icons/fi";
import type { Product } from "../types/api";

// ── Tune these to match your site's header / footer heights ──────────────────
// Open DevTools on wgc.net.in/wip, inspect <header> → computed height.
const HEADER_PX = 0; // WP removes header via CSS — no clipping needed // px clipped from the top   (your site's header height)
const FOOTER_PX = 0; // WP removes footer via CSS — no clipping needed // px clipped from the bottom (your site's footer height)

// ── Set to "iframe" once you've added the functions.php snippet above ─────────
// Leave as "" to use the plain permalink with no extra query param.
const QUERY_PARAM = "iframe"; // appends ?iframe=1 → triggers WP iframe mode  →  appends ?iframe=1

// ── Padding inside the panel around the iframe ───────────────────────────────
const IFRAME_PADDING = "10px";

interface ProductIframePanelProps {
  product: Product;
  onClose: () => void;
}

function buildUrl(permalink: string): string {
  if (!QUERY_PARAM) return permalink;
  const sep = permalink.includes("?") ? "&" : "?";
  return `${permalink}${sep}${QUERY_PARAM}=1`;
}

export function ProductIframePanel({
  product,
  onClose,
}: ProductIframePanelProps) {
  const [loaded, setLoaded] = useState(false);

  const rawUrl = product.permalink as string | undefined;
  const url = rawUrl ? buildUrl(rawUrl) : undefined;

  return (
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
      {/* ── Panel header bar ─────────────────────────────────────────────── */}
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

        {rawUrl && (
          <a
            href={rawUrl}
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

      {/* ── iframe area ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          padding: IFRAME_PADDING,
          overflow: "hidden",
          position: "relative",
          background: "#fff",
        }}
      >
        {/* Loading spinner */}
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
              zIndex: 1,
            }}
          >
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
            <style>{`@keyframes miraq-spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {url ? (
          /*
           * Clip wrapper — overflow:hidden clips the iframe to its own bounds.
           *
           * The iframe is shifted up by HEADER_PX (negative marginTop) so the
           * site's header scrolls out of the visible area, and its height is
           * increased by (HEADER_PX + FOOTER_PX) so the footer is pushed below
           * the clipped edge.
           *
           * If both constants are 0 the iframe simply fills the padded area.
           */
          <div
            style={{
              width: "100%",
              height: "100%",
              overflow: "hidden",
              borderRadius: "8px",
              position: "relative",
            }}
          >
            <iframe
              src={url}
              title={product.name}
              onLoad={() => setLoaded(true)}
              style={{
                width: "100%",
                height: `calc(100% + ${HEADER_PX + FOOTER_PX}px)`,
                border: "none",
                display: "block",
                marginTop: `-${HEADER_PX}px`,
                opacity: loaded ? 1 : 0,
                transition: "opacity 0.2s",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: "13px",
              color: "#888",
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
