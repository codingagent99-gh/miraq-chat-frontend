import ReactDOM from "react-dom/client";
import "./index.css";
import { ChatWidget } from "./ChatWidget";
import type { WidgetOptions } from "./types/api";

declare global {
  interface Window {
    SilfraChatWidget?: {
      init: (options?: WidgetOptions) => void;
    };
  }
}

// Capture the script element immediately (only available at parse time)
const _currentScript = document.currentScript as HTMLScriptElement | null;

function getAssetBaseUrl(script: HTMLScriptElement | null): string {
  if (!script?.src) return "https://silfratech.in/chatbot/";
  const src = script.src;
  return src.substring(0, src.lastIndexOf("/") + 1);
}

function mountWidget(options?: WidgetOptions, assetBaseUrl?: string) {
  console.log("SilfraChatWidget mountWidget", options);
  let container = document.getElementById("silfra-chat-widget-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "silfra-chat-widget-root";
    document.body.appendChild(container);
  }

  const apiKey = options?.apiKey || "";
  const apiUrl = options?.apiUrl || "";
  const customerName = options?.customerName || "";

  const customerId = options?.customerId
    ? typeof options.customerId === "string"
      ? parseInt(options.customerId, 10)
      : options.customerId
    : undefined;

  const customerEmail = options?.customerEmail || "";
  const customerRole = options?.customerRole || "";

  console.log("Widget initialized with:", {
    apiUrl,
    customerId,
    customerEmail,
    customerName,
    assetBaseUrl,
  });

  ReactDOM.createRoot(container).render(
    <ChatWidget
      apiKey={apiKey}
      apiUrl={apiUrl}
      customerId={customerId}
      customerEmail={customerEmail}
      customerName={customerName}
      customerRole={customerRole}
      assetBaseUrl={assetBaseUrl}
      nonce={options?.nonce}
      nonceExpires={options?.nonceExpires}
      cartToken={options?.cartToken}
    />,
  );
}

window.SilfraChatWidget = {
  init: (options?: WidgetOptions) => {
    const assetBaseUrl = getAssetBaseUrl(_currentScript);
    mountWidget(options, assetBaseUrl);
  },
};

(function autoInit() {
  // 1. Safely grab the global config object, defaulting to an empty object
  const config = (window as any).__silfraWidgetConfig || {};

  // Debugging: This will tell us immediately if PHP successfully passed the data
  console.log("[SilfraChatWidget] Loaded Global Config:", config);

  const script = _currentScript;

  // 2. Extract values: Prefer the global config first, then dataset, then empty strings
  const apiUrl = config.apiUrl || script?.dataset.apiUrl || "";
  const customerId = config.customerId || script?.dataset.customerId || "";
  const customerEmail =
    config.customerEmail || script?.dataset.customerEmail || "";
  const customerName =
    config.customerName || script?.dataset.customerName || "";
  const customerRole =
    config.customerRole || script?.dataset.customerRole || "guest";
  const nonce = config.nonce || script?.dataset.nonce || "";

  const nonceExpires = config.nonceExpires
    ? parseInt(config.nonceExpires, 10)
    : script?.dataset.nonceExpires
      ? parseInt(script.dataset.nonceExpires, 10)
      : 0;

  // 3. Fallback for assetBaseUrl in case document.currentScript is null
  // (If script is deferred, _currentScript is null, so we hardcode your production URL as a ultimate fallback)
  const assetBaseUrl = config.assetBaseUrl
    ? config.assetBaseUrl
    : script?.src
      ? getAssetBaseUrl(script)
      : "https://silfratech.in/chatbot-geoffg7/";

  if (!apiUrl) {
    console.warn(
      "[SilfraChatWidget] No API URL found — widget not initialized.",
    );
    return; // Stop execution if we don't at least have the API URL
  }

  // ── Inject CSS ──────────────────────────────────────────────
  if (script?.src) {
    const cssUrl = script.src.replace(/\.js$/, ".css");
    if (!document.querySelector(`link[href="${cssUrl}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = cssUrl;
      document.head.appendChild(link);
    }
  } else {
    // Ultimate fallback for CSS if script tag isn't detected
    const fallbackCssUrl = `${assetBaseUrl}woocommerce-chat-widget.css`;
    if (!document.querySelector(`link[href="${fallbackCssUrl}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = fallbackCssUrl;
      document.head.appendChild(link);
    }
  }
  // ────────────────────────────────────────────────────────────

  mountWidget(
    {
      apiUrl,
      customerId,
      customerEmail,
      customerName,
      customerRole,
      nonce,
      nonceExpires,
    },
    assetBaseUrl,
  );
})();
