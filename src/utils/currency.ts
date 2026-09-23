/**
 * The store's currency symbol, as reported by the backend.
 *
 * Set once from /widget-config (WooCommerce). Product cards prefer the symbol
 * that arrives on each product (`product.currency_symbol`, which also covers
 * Shopify); cart and checkout prefer the store's own cart totals. This is only
 * the fallback for when those are missing — it replaces the hardcoded "₹" / "$"
 * fallbacks, which were wrong for every store in another currency.
 *
 * Empty until known: showing no symbol is better than showing a wrong one.
 */
let storeSymbol = "";

/** WooCommerce sends symbols HTML-encoded ("&#36;", "&#8377;", "&euro;"). */
export function decodeCurrency(raw: string | null | undefined): string {
  if (!raw) return "";
  if (!raw.includes("&")) return raw;
  const el = document.createElement("textarea");
  el.innerHTML = raw;
  return el.value;
}

export function setStoreCurrency(raw: string | null | undefined): void {
  const decoded = decodeCurrency(raw);
  if (decoded) storeSymbol = decoded;
}

export function storeCurrency(): string {
  return storeSymbol;
}
