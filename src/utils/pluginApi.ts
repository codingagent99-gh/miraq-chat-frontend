/**
 * Where the MiraQ WordPress plugin's own REST routes live, and which optional
 * features that plugin build supports (WooCommerce only).
 *
 * Plugin 1.0.6 moved its routes from `custom-api/v1` to `miraq/v1` and prints
 * the full base as `restBase` in __silfraWidgetConfig (class-widget.php, built
 * with rest_url(), so it is also correct on sites without pretty permalinks,
 * where it looks like `https://site/?rest_route=/miraq/v1/`). Older plugin
 * builds print no `restBase` and only answer on `custom-api/v1`, so that stays
 * the fallback.
 *
 * Set once at mount (widget-entry.tsx), read by every plugin call — same
 * pattern as utils/identity.ts.
 */

const LEGACY_NAMESPACE_PATH = "/wp-json/custom-api/v1";

/** Optional plugin features. Absent from older builds' config. */
export interface PluginFeatures {
  /**
   * Per-item "Ship to multiple addresses". Needs plugin-side code that saves
   * each shipment onto the order; builds without it would silently ship
   * everything to one address. Older plugin builds (which print no
   * `features`) all have that code, so absent means true.
   */
  multiShipping: boolean;
}

let restBase = "";
let features: PluginFeatures = { multiShipping: true };

export function setPluginConfig(
  base: string | undefined,
  pluginFeatures: Partial<PluginFeatures> | undefined,
): void {
  restBase = (base || "").trim();
  features = {
    multiShipping: pluginFeatures?.multiShipping ?? true,
  };
}

export function pluginFeatures(): PluginFeatures {
  return features;
}

/**
 * Full URL for a plugin route.
 *
 * @param wpBase WordPress origin (used only when no `restBase` was printed).
 * @param path   Route under the plugin namespace, with an optional query
 *               string, e.g. "/countries" or "/company-addresses?company=x".
 */
export function pluginApiUrl(wpBase: string, path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  const q = withSlash.indexOf("?");
  const route = q === -1 ? withSlash : withSlash.slice(0, q);
  const query = q === -1 ? "" : withSlash.slice(q + 1);

  if (!restBase) {
    const base = (wpBase || "").replace(/\/+$/, "");
    return `${base}${LEGACY_NAMESPACE_PATH}${route}${query ? `?${query}` : ""}`;
  }

  const base = restBase.replace(/\/+$/, "");
  // Plain-permalink sites: the route is itself a query parameter
  // (?rest_route=/miraq/v1), so further parameters join with "&".
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${route}${query ? `${joiner}${query}` : ""}`;
}
