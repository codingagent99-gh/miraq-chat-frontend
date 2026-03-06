import ReactDOM from "react-dom/client";
import "./index.css";
import { ChatWidget } from "./ChatWidget";

declare global {
  interface Window {
    SilfraChatWidget?: {
      init: (options?: WidgetOptions) => void;
    };
  }
}

interface WidgetOptions {
  appId?: string;
  apiKey?: string;
  apiUrl?: string;
  customerId?: string | number;
  customerEmail?: string;
  customerName?: string;
  customerRole?: string;
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
  const script = _currentScript;
  if (!script) return;

  const appId = script.dataset.appId;
  const apiKey = script.dataset.apiKey;
  const apiUrl = script.dataset.apiUrl;
  const customerId = script.dataset.customerId;
  const customerEmail = script.dataset.customerEmail;
  const customerName = script.dataset.customerName;
  const customerRole = script.dataset.customerRole;

  const assetBaseUrl = getAssetBaseUrl(script);

  console.log("Widget script data attributes:", {
    appId,
    apiKey,
    apiUrl,
    customerId,
    customerEmail,
    customerName,
    assetBaseUrl,
  });

  // Inject CSS from the same origin as the script
  const cssUrl = script.src.replace(/\.js$/, ".css");
  if (!document.querySelector(`link[href="${cssUrl}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssUrl;
    document.head.appendChild(link);
  }

  mountWidget(
    {
      appId,
      apiKey,
      apiUrl,
      customerId,
      customerEmail,
      customerName,
      customerRole,
    },
    assetBaseUrl,
  );
})();
