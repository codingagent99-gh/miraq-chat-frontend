/**
 * Saved-address picker — the UI half of the company address lookup.
 *
 * `useCompanyAddresses` (CompanyAddressSelector.tsx) does the fetching; this
 * renders the result and reports the chosen address back as a plain address
 * patch. It is deliberately presentational: no fetching, no form state, no
 * styling opinions beyond what the caller passes in.
 *
 * It exists because the picker is needed in two places that render fields
 * completely differently — AddressForm (inline styles, grid layout) and
 * BulkAddressConfirmationCard (CSS classes, its own renderField). Duplicating
 * the <select> in both would duplicate the two non-obvious rules baked into
 * it, and those are exactly the parts that break silently:
 *
 *   1. option values are compared as STRINGS on both sides. `id` is a string
 *      ("<user_id>:<address_key>") on the current plugin but a NUMBER on
 *      older builds, and a DOM option value is always a string — a strict
 *      === against a numeric id is false forever, which reads to the user as
 *      "the picker does nothing when I select an address".
 *   2. company matching is PARTIAL, so one search spans several spellings
 *      ("beck" → "BECK", "Beck Group", "The Beck Group Architecture"). The
 *      row's own company has to appear in the option text or the list is
 *      ambiguous.
 *
 * Callers are responsible for hiding this entirely when `matches` is empty —
 * label included. See `shouldShowSavedAddressSelect`.
 */
import type { CSSProperties } from "react";
import { formatShipping } from "./CompanyAddressSelector";
import type { WpCompanyAddress } from "../../../services/api";

/**
 * Field keys that mean "saved address picker" rather than a real address
 * value. Matched AFTER useCheckoutFields strips the billing_/shipping_
 * prefix, so list the stripped form.
 */
export const ADDRESS_SELECTOR_FIELD_KEYS = [
  "address_selector",
  "company_address_selector",
  "saved_address_selector",
];

export function isAddressSelectorField(field: string): boolean {
  return (
    ADDRESS_SELECTOR_FIELD_KEYS.includes(field) ||
    /address.*select|select.*address/i.test(field)
  );
}

/** The address fields a picked row writes back into the form. */
export interface PickedAddress {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

/**
 * True when the picker has something to show.
 *
 * Callers use this as the single signal for "render the Address Selector
 * field at all" — no company typed, lookup still running, or no saved
 * addresses on file all collapse to the same answer: render nothing.
 */
export function shouldShowSavedAddressSelect(
  matches: WpCompanyAddress[],
): boolean {
  return matches.length > 0;
}

/** One-line option label: person · company — address. */
export function savedAddressLabel(m: WpCompanyAddress): string {
  const who =
    [m.shipping.first_name, m.shipping.last_name].filter(Boolean).join(" ") ||
    m.email;
  const head = [who, m.company].filter(Boolean).join(" · ");
  return `${head} — ${formatShipping(m.shipping)}`;
}

export interface SavedAddressSelectProps {
  matches: WpCompanyAddress[];
  /** Called with the address patch to merge into the form. */
  onPick: (addr: PickedAddress) => void;
  /**
   * Current company value, used only as the fallback when the picked row has
   * no company of its own — so choosing an address never blanks a company the
   * user already typed.
   */
  fallbackCompany?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
}

export function SavedAddressSelect({
  matches,
  onPick,
  fallbackCompany = "",
  id,
  className,
  style,
  placeholder = "Select a saved address…",
}: SavedAddressSelectProps) {
  return (
    <select
      id={id}
      className={className}
      style={style}
      // Always "" — this is an action, not a stored value. Keeping it
      // uncontrolled-looking lets the same row be picked twice in a row.
      value=""
      onChange={(e) => {
        const picked = matches.find((m) => String(m.id) === e.target.value);
        if (!picked) {
          // Not silent: an id-type mismatch here is invisible in the UI and
          // would otherwise look like a dead control.
          console.warn(
            "[SavedAddressSelect] no company address matched option value",
            e.target.value,
            matches.map((m) => m.id),
          );
          return;
        }
        onPick({
          first_name: picked.shipping.first_name,
          last_name: picked.shipping.last_name,
          company: picked.shipping.company || fallbackCompany,
          address_1: picked.shipping.address_1,
          address_2: picked.shipping.address_2,
          city: picked.shipping.city,
          state: picked.shipping.state,
          postcode: picked.shipping.postcode,
          country: picked.shipping.country,
        });
      }}
    >
      <option value="">{placeholder}</option>
      {matches.map((m) => (
        <option key={String(m.id)} value={String(m.id)}>
          {savedAddressLabel(m)}
        </option>
      ))}
    </select>
  );
}
