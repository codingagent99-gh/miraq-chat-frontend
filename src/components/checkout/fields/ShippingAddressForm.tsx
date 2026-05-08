/**
 * ShippingAddressForm
 *
 * Public component for the shipping address step.
 * Field order matches the CS site shipping form HTML exactly:
 *   first_name · last_name | company | country | address_1 | address_2 |
 *   city | state | postcode
 *
 * No phone, email, or project_rep — those live on the billing form only.
 */
import { AddressForm } from "./AddressForm";
import type { AddressFormProps, FieldOverrides } from "./AddressForm";
import type { AddressDict } from "../../../types/actions";
import type { WpCountry } from "../../../hooks/useCheckoutFields";

/** Fields shown on the shipping form. Matches CS site HTML exactly. */
const SHIPPING_FIELDS: (keyof AddressDict)[] = [
  "first_name",
  "last_name",
  "company",
  "country",
  "address_1",
  "address_2",
  "city",
  "state",
  "postcode",
  "order_notes",
];

// ── Label-only overrides ─────────────────────────────────────────────────────
//
// These are UI strings — they don't change based on WooCommerce config, so
// they're still hardcoded here. The `required` flags for every field are
// supplied via the `fieldOverrides` prop, which is derived from the live
// /checkout-fields API response in useCheckoutFields → AddressStep.
//
// Keeping labels here and required flags in the API is the clean split:
//   labels   = design decision → component
//   required = business rule   → WooCommerce / API

const SHIPPING_LABEL_OVERRIDES: FieldOverrides = {
  state: { label: "County (optional)" },
};

// visibleFields is intentionally omitted from the public props —
// callers never need to touch it.
type ShippingAddressFormProps = Omit<AddressFormProps, "visibleFields"> & {
  /** Live country list from useCheckoutFields — passed down from AddressStep. */
  countries?: WpCountry[];
  /**
   * Per-field required flags derived from /checkout-fields by useCheckoutFields.
   * Merged with SHIPPING_LABEL_OVERRIDES — API required flags take precedence,
   * state label is always kept regardless of what the API returns for
   * shipping_state.
   */
  fieldOverrides?: FieldOverrides;
};

export function ShippingAddressForm({
  submitLabel = "Continue to Payment →",
  countries,
  fieldOverrides,
  ...rest
}: ShippingAddressFormProps) {
  // Merge label-only overrides with API-supplied required flags.
  // Spread order:
  //   1. SHIPPING_LABEL_OVERRIDES  — base labels
  //   2. fieldOverrides            — API required flags (may also carry labels)
  //   3. state label re-assertion  — always keep "County (optional)" regardless
  //                                  of what the API returns for shipping_state
  const mergedOverrides: FieldOverrides = {
    ...SHIPPING_LABEL_OVERRIDES,
    ...fieldOverrides,
    state: {
      label: "County (optional)",
      ...fieldOverrides?.state,
    },
  };

  return (
    <AddressForm
      {...rest}
      visibleFields={SHIPPING_FIELDS}
      fieldOverrides={mergedOverrides}
      submitLabel={submitLabel}
      countries={countries}
    />
  );
}
