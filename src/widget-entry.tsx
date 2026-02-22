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
}

// Capture the script element immediately (only available at parse time)
const _currentScript = document.currentScript as HTMLScriptElement | null;

// Derive asset base URL from the widget script's own src so images always
// load from silfratech.in regardless of which site embeds the widget.
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

  const customerId = options?.customerId
    ? typeof options.customerId === "string"
      ? parseInt(options.customerId, 10)
      : options.customerId
    : undefined;

  const customerEmail = options?.customerEmail || "";

  console.log("Widget initialized with:", {
    apiUrl,
    customerId,
    customerIdType: typeof customerId,
    customerEmail,
    assetBaseUrl,
  });

  ReactDOM.createRoot(container).render(
    <ChatWidget
      apiKey={apiKey}
      apiUrl={apiUrl}
      customerId={customerId}
      customerEmail={customerEmail}
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

  const assetBaseUrl = getAssetBaseUrl(script);

  console.log("Widget script data attributes:", {
    appId,
    apiKey,
    apiUrl,
    customerId,
    customerIdType: typeof customerId,
    customerEmail,
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
    },
    assetBaseUrl,
  );
})();
