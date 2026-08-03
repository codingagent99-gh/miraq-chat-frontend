/**
 * Company address lookup.
 *
 * Debounced GET /company-addresses (login-required — see
 * get_my_company_addresses in class-api.php). Returns the saved shipping
 * addresses filed under a company name, sourced from the THWMA address book —
 * the same store the site's own shipping_address_selector reads, NOT the
 * customer's stock WooCommerce account address.
 *
 * Matching is PARTIAL and case-insensitive, so one search spans several
 * company spellings ("beck" → "BECK", "Beck Group", "The Beck Group
 * Architecture"). Rows are per-address, not per-customer, so one account can
 * contribute several entries; `id` is unique per row and `user_id` is not.
 *
 * This file used to also own the picker UI, rendering it inside the Company
 * Name field's container. That placement was the bug: the list appeared
 * directly beneath Company Name instead of at the Address Selector slot
 * further down the form. The fetch now lives in a hook so AddressForm can
 * call it once and render the picker wherever the Address Selector field
 * sits — and, critically, so AddressForm knows whether there are any matches
 * BEFORE it decides whether to render that field's label and input at all.
 */
import { useEffect, useRef, useState } from "react";
import {
  fetchCompanyAddresses,
  type WpCompanyAddress,
} from "../../../services/api";

const MIN_COMPANY_LENGTH = 3;
const DEBOUNCE_MS = 500;

/**
 * One-line summary of a saved address, used as the <option> text.
 *
 * Address only — the name and company are rendered separately by the caller,
 * so including them here would print them twice.
 */
export function formatShipping(addr: WpCompanyAddress["shipping"]): string {
  return [
    addr.address_1,
    addr.address_2,
    addr.city,
    addr.state,
    addr.postcode,
    addr.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export interface CompanyAddressesState {
  matches: WpCompanyAddress[];
  loading: boolean;
}

/**
 * Looks up saved addresses for `company`, debounced.
 *
 * Returns an empty `matches` array whenever the lookup is disabled, the
 * company field is too short, the request fails, or the company has no
 * address book — so callers can use `matches.length === 0` as the single
 * signal for "hide the picker entirely".
 *
 * `enabled` exists so the request only fires on stores that actually have an
 * Address Selector field. /company-addresses is a bespoke endpoint tied to
 * that field; on any other install there is nowhere to show the result, so
 * firing it on every Company Name keystroke would be pure waste. Callers pass
 * the result of a feature check on the rendered field list, which keeps this
 * self-disabling rather than hardcoded to one store.
 */
export function useCompanyAddresses(
  siteOrigin: string,
  company: string,
  enabled: boolean = true,
): CompanyAddressesState {
  const [matches, setMatches] = useState<WpCompanyAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = company.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Disabled, too short, or no origin yet: clear everything so the caller
    // hides the Address Selector field rather than leaving a stale list on
    // screen. No request is issued in any of these cases.
    if (!enabled || !siteOrigin || trimmed.length < MIN_COMPANY_LENGTH) {
      setMatches([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetchCompanyAddresses(siteOrigin, trimmed)
        .then((results) => setMatches(results))
        .catch(() => setMatches([]))
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [company, siteOrigin, enabled]);

  return { matches, loading };
}
