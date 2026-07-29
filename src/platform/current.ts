/**
 * platform/current.ts
 *
 * THE single source of truth for which e-commerce platform this build targets.
 *
 * Why this exists
 * ───────────────
 * Platform selection used to be split-brained: hooks/useCart.ts and
 * hooks/useStoreApi.ts resolved it at BUILD time from VITE_PLATFORM, while
 * ChatWidget.tsx resolved it at RUNTIME from `!!shopDomain`. Those two can
 * disagree — e.g. a WooCommerce build handed a shopDomain would render the
 * Shopify container and checkout panel while the cart hook still talked to the
 * WooCommerce Store API. The result is a half-working widget that fails deep
 * in a cart or checkout call rather than at startup, which is far harder to
 * diagnose than a refusal to start.
 *
 * The deployment model is one platform per build (per-store toggle), so the
 * build-time value wins and runtime props are validated against it.
 */

export type Platform = "woocommerce" | "shopify";

const RAW_PLATFORM = (import.meta.env.VITE_PLATFORM ?? "woocommerce") as string;

const VALID: readonly Platform[] = ["woocommerce", "shopify"] as const;

function resolvePlatform(raw: string): Platform {
  if ((VALID as readonly string[]).includes(raw)) return raw as Platform;
  // A typo'd VITE_PLATFORM silently defaulting to WooCommerce would ship a
  // Woo build to a Shopify store. Say so loudly, then default — refusing to
  // build isn't an option at module-eval time.
  console.error(
    `[MiraQ] Invalid VITE_PLATFORM="${raw}". Expected one of ${VALID.join(
      " | ",
    )}. Falling back to "woocommerce" — this is almost certainly a ` +
      `misconfiguration.`,
  );
  return "woocommerce";
}

export const PLATFORM: Platform = resolvePlatform(RAW_PLATFORM);

export const IS_SHOPIFY = PLATFORM === "shopify";

/**
 * Validates the runtime init options against the build's platform.
 *
 * Returns an error string when the two disagree, or null when consistent.
 * Callers should refuse to mount on error: a mismatched widget cannot work,
 * and failing at startup with a clear message beats failing later inside an
 * add-to-cart call with a 404.
 */
export function checkPlatformConfig(opts: {
  shopDomain?: string;
}): string | null {
  const hasShopDomain = !!opts.shopDomain;

  if (IS_SHOPIFY && !hasShopDomain) {
    return (
      'This is a Shopify build (VITE_PLATFORM="shopify") but init() received ' +
      "no shopDomain. The Shopify widget needs the shop domain (e.g. " +
      '"your-store.myshopify.com") — check the app embed settings.'
    );
  }

  if (!IS_SHOPIFY && hasShopDomain) {
    return (
      'This is a WooCommerce build (VITE_PLATFORM="woocommerce") but init() ' +
      "received a shopDomain. Deploy the Shopify build to a Shopify store, or " +
      "remove shopDomain."
    );
  }

  return null;
}
