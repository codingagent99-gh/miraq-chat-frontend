import type { AddressDict } from "../types/actions";

const KEY = (cartToken: string) => `miraq_address_draft:${cartToken}`;

/**
 * Load a previously saved address draft from sessionStorage.
 * Returns null if not found, storage is unavailable, or the token is null.
 */
export function loadAddressDraft(cartToken: string | null): AddressDict | null {
  if (!cartToken) return null;
  try {
    const raw = sessionStorage.getItem(KEY(cartToken));
    if (!raw) return null;
    return JSON.parse(raw) as AddressDict;
  } catch {
    return null;
  }
}

/**
 * Persist an address draft to sessionStorage keyed by cart token.
 * Silently ignores errors (storage full, private browsing restrictions, etc.).
 */
export function saveAddressDraft(
  cartToken: string | null,
  draft: AddressDict,
): void {
  if (!cartToken) return;
  try {
    sessionStorage.setItem(KEY(cartToken), JSON.stringify(draft));
  } catch {
    // sessionStorage can throw in some embedded/private contexts — ignore
  }
}

/**
 * Remove the address draft for the given cart token.
 */
export function clearAddressDraft(cartToken: string | null): void {
  if (!cartToken) return;
  try {
    sessionStorage.removeItem(KEY(cartToken));
  } catch {
    // ignore
  }
}
