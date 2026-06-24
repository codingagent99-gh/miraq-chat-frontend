import { useState, useEffect, useRef } from "react";

interface ShopifyWidgetContainerProps {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  isExpanded: boolean;
  assetBaseUrl: string;
  children: React.ReactNode;
}

const MOBILE_BREAKPOINT = 768;
const PANEL_WIDTH_NORMAL = 400;
const PANEL_WIDTH_EXPANDED = 540;
const WRAPPER_ID = "silfra-content-wrapper";
const STYLES_ID = "silfra-shopify-styles";

// Nodes that belong in the squeezable content wrapper
function shouldWrap(el: Element): boolean {
  if (el.tagName === "A" && el.classList.contains("skip-to-content-link"))
    return true;
  if (el.classList.contains("shopify-section")) return true;
  if (el.id === "MainContent") return true;
  return false;
}

function ensureGlobalStyles() {
  if (document.getElementById(STYLES_ID)) return;
  const style = document.createElement("style");
  style.id = STYLES_ID;
  style.textContent = `
    /* Content wrapper shrinks to make room for the fixed panel.
       Body stays in normal flow — no flex layout needed. */
    #${WRAPPER_ID} {
      transition: max-width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    }

    body.silfra-panel-open #${WRAPPER_ID} {
      max-width: calc(100vw - ${PANEL_WIDTH_NORMAL}px);
    }

    body.silfra-panel-open.silfra-panel-expanded #${WRAPPER_ID} {
      max-width: calc(100vw - ${PANEL_WIDTH_EXPANDED}px);
    }

    /* Panel: fixed to the right edge, full viewport height.
       position: fixed takes it out of document flow entirely —
       no blank space, no effect on page scroll. */
    #silfra-panel-root {
      position: fixed;
      right: 0;
      top: 0;
      width: ${PANEL_WIDTH_NORMAL}px;
      height: 100vh;
      overflow: hidden;
      z-index: 99999;
      transition: width 0.3s cubic-bezier(0.22, 1, 0.36, 1);
    }

    body.silfra-panel-open.silfra-panel-expanded #silfra-panel-root {
      width: ${PANEL_WIDTH_EXPANDED}px;
    }

    @keyframes silfra-slide-in {
      from { transform: translateX(24px); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }

    @keyframes silfra-slide-up {
      from { transform: translateY(16px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

// Wrap visible page content into a single div so we can squeeze it
function wrapBodyContent(widgetRoot: Element) {
  if (document.getElementById(WRAPPER_ID)) return;

  const nodesToWrap = [...document.body.children].filter(
    (el) => el !== widgetRoot && shouldWrap(el),
  );
  if (nodesToWrap.length === 0) return;

  const wrapper = document.createElement("div");
  wrapper.id = WRAPPER_ID;

  document.body.insertBefore(wrapper, nodesToWrap[0]);
  nodesToWrap.forEach((el) => wrapper.appendChild(el));
}

// Restore DOM to original flat structure
function unwrapBodyContent() {
  const wrapper = document.getElementById(WRAPPER_ID);
  if (!wrapper) return;
  while (wrapper.firstChild) {
    document.body.insertBefore(wrapper.firstChild, wrapper);
  }
  wrapper.remove();
}

export function ShopifyWidgetContainer({
  panelOpen,
  setPanelOpen,
  isExpanded,
  assetBaseUrl,
  children,
}: ShopifyWidgetContainerProps) {
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;
  const widgetRootRef = useRef<HTMLDivElement>(null);

  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= MOBILE_BREAKPOINT,
  );

  // Track mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Wrap content nodes once on mount, unwrap on unmount
  useEffect(() => {
    const root = widgetRootRef.current?.closest("[id]") ?? document.body;
    ensureGlobalStyles();
    wrapBodyContent(root);
    return () => {
      unwrapBodyContent();
      document.getElementById(STYLES_ID)?.remove();
    };
  }, []);

  // Toggle body classes to drive the CSS content squeeze
  useEffect(() => {
    if (isMobile) {
      document.body.classList.remove(
        "silfra-panel-open",
        "silfra-panel-expanded",
      );
      return;
    }
    document.body.classList.toggle("silfra-panel-open", panelOpen);
    document.body.classList.toggle(
      "silfra-panel-expanded",
      panelOpen && isExpanded,
    );
    return () => {
      document.body.classList.remove(
        "silfra-panel-open",
        "silfra-panel-expanded",
      );
    };
  }, [panelOpen, isExpanded, isMobile]);

  // ── Mobile: floating button + full-screen panel ────────────────────────
  if (isMobile) {
    return (
      <div ref={widgetRootRef}>
        {!panelOpen && (
          <button
            className="xpert-floating-btn"
            onClick={() => setPanelOpen(true)}
            aria-label="Open chat"
          >
            <img src={MiraQIcon} height={24} width={24} alt="MiraQ" />
          </button>
        )}
        {panelOpen && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
              animation: "silfra-slide-up 0.28s cubic-bezier(0.22,1,0.36,1)",
            }}
          >
            {children}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: fixed panel + squeezed content ───────────────────────────
  return (
    <div ref={widgetRootRef}>
      {/* Floating trigger button (visible when panel is closed) */}
      {!panelOpen && (
        <button
          className="xpert-side-tab"
          onClick={() => setPanelOpen(true)}
          aria-label="Open MiraQ chat"
        >
          <img src={MiraQIcon} height={28} width={28} alt="MiraQ" />
          <span className="xpert-side-tab-label">Chat</span>
        </button>
      )}

      {/* Side panel — position: fixed in CSS, so this div has zero layout impact */}
      {panelOpen && (
        <div
          id="silfra-panel-root"
          style={{
            animation: "silfra-slide-in 0.28s cubic-bezier(0.22,1,0.36,1)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
