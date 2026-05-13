import { useEffect, useState } from "react";

interface WidgetContainerProps {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  assetBaseUrl: string;
  children: React.ReactNode;
  overlayClickCloses?: boolean;
}

const MOBILE_BREAKPOINT = 768;
const OVERLAY_ID = "silfra-overlay";

function ensureGlobalStyles() {
  if (document.getElementById("silfra-global-styles")) return;
  const scrollbarWidth =
    window.innerWidth - document.documentElement.clientWidth;
  const contentWidth = `calc(100vw - ${scrollbarWidth}px - max(25vw, 320px))`;
  const style = document.createElement("style");
  style.id = "silfra-global-styles";
  style.textContent = `
    #main-container {
      transition: max-width 0.3s ease !important;
    }
    #wpadminbar,
    [data-sticky="yes"],
    [data-sticky="yes:shrink"] {
      transition: width 0.3s ease, max-width 0.3s ease !important;
    }

    body.silfra-panel-open #main-container {
      max-width: ${contentWidth} !important;
    }

    body.silfra-panel-open #wpadminbar,
    body.silfra-panel-open [data-sticky="yes"],
    body.silfra-panel-open [data-sticky="yes:shrink"] {
      width: ${contentWidth} !important;
      max-width: ${contentWidth} !important;
    }

    #${OVERLAY_ID} {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 99999;
      pointer-events: all;
      transition: opacity 0.3s ease;
    }
  `;
  document.head.appendChild(style);
}

function mountOverlay(onClick: (() => void) | null) {
  if (document.getElementById(OVERLAY_ID)) return;
  const el = document.createElement("div");
  el.id = OVERLAY_ID;
  if (onClick) el.addEventListener("click", onClick);
  document.body.appendChild(el);
}

function unmountOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();
}

export function WidgetContainer({
  panelOpen,
  setPanelOpen,
  children,
  assetBaseUrl,
  overlayClickCloses = false,
}: WidgetContainerProps) {
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;

  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth <= MOBILE_BREAKPOINT,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Desktop: body class + content squeeze ────────────────────────────────
  useEffect(() => {
    if (isMobile) {
      document.body.classList.remove("silfra-panel-open");
      return;
    }
    ensureGlobalStyles();
    document.body.classList.toggle("silfra-panel-open", panelOpen);
    return () => {
      document.body.classList.remove("silfra-panel-open");
    };
  }, [panelOpen, isMobile]);

  // ── Overlay: mount when panel is open, unmount when closed ───────────────
  useEffect(() => {
    if (panelOpen) {
      ensureGlobalStyles(); // ensures overlay CSS exists
      mountOverlay(overlayClickCloses ? () => setPanelOpen(false) : null);
    } else {
      unmountOverlay();
    }
    return () => unmountOverlay(); // clean up on component unmount
  }, [panelOpen, setPanelOpen]);

  // ── Mobile: original floating button + popup ─────────────────────────────
  if (isMobile) {
    return (
      <>
        {!panelOpen && (
          <button
            className="xpert-floating-btn"
            onClick={() => setPanelOpen(true)}
            aria-label="Open chat"
          >
            <img src={MiraQIcon} height={24} width={24} alt="MiraQ" />
          </button>
        )}
        {panelOpen && <div className="xpert-panel">{children}</div>}
      </>
    );
  }

  // ── Desktop: side panel ───────────────────────────────────────────────────
  return (
    <>
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
      {panelOpen && (
        <div className="xpert-panel xpert-panel--side">{children}</div>
      )}
    </>
  );
}
