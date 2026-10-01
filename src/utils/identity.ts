/**
 * Signed identity for backend requests (WooCommerce).
 *
 * The WordPress plugin signs the logged-in user's id/role/email into a token
 * (includes/class-identity.php) and prints it in the page config. The backend
 * trusts only this token — the plain customerId / customerRole it used to
 * read from the request are ignored — so it is sent as X-MiraQ-Identity on
 * every API call. Guests have no token and are served as guests.
 *
 * Shopify needs none of this: identity there comes from Shopify's own signed
 * App Proxy parameters.
 */
let token = "";
let expiresAt = 0; // unix seconds
let wpBase = "";
let refreshing: Promise<string> | null = null;

export function setIdentity(
  identityToken: string | undefined,
  identityExpires: number | string | undefined,
  wpBaseUrl: string | undefined,
): void {
  token = identityToken || "";
  expiresAt = Number(identityExpires) || 0;
  wpBase = wpBaseUrl || "";
}

export function identityToken(): string {
  return token;
}

/** True when the token's own expiry has passed (so refresh before sending). */
export function identityExpired(): boolean {
  return !!token && expiresAt > 0 && Date.now() / 1000 >= expiresAt;
}

/**
 * Fetch a fresh token after the backend reports "identity_expired" (a tab
 * left open past the token's 12h lifetime). Uses the plugin's cookie-
 * authenticated endpoint; concurrent callers share one request. Resolves to
 * the new token, or "" if the user is no longer logged in — in which case
 * requests continue as a guest.
 */
export function refreshIdentity(
  fetcher: (wpBase: string) => Promise<{ token?: string; expires?: number } | null>,
): Promise<string> {
  if (!wpBase) return Promise.resolve("");
  if (!refreshing) {
    refreshing = fetcher(wpBase)
      .then((fresh) => {
        token = fresh?.token || "";
        expiresAt = fresh?.expires || 0;
        return token;
      })
      .catch(() => {
        token = "";
        expiresAt = 0;
        return "";
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}
