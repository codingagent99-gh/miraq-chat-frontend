/**
 * useCheckoutFields
 *
 * Fetches countries (with embedded states), cs_rep users, order type options,
 * and billing + shipping field metadata (required flags) from the WooCommerce
 * plugin's custom REST endpoints:
 *   GET /wp-json/custom-api/v1/countries
 *   GET /wp-json/custom-api/v1/reps
 *   GET /wp-json/custom-api/v1/checkout-fields   ← order type options
 *   GET /wp-json/custom-api/v1/checkout-fields   ← billing field required flags
 *   GET /wp-json/custom-api/v1/checkout-fields   ← shipping field required flags
 *
 * Usage:
 *   const { countries, reps, isLoading, billingFieldOverrides, shippingFieldOverrides } =
 *     useCheckoutFields(siteOrigin);
 */
import { useState, useEffect } from "react";
import {
  fetchWpCountries,
  fetchWpReps,
  fetchWpOrderTypes,
  type WpCountry,
  type WpRep,
  type WpOrderTypeOption,
} from "../services/api";

export type { WpCountry, WpRep, WpOrderTypeOption };

// ── Billing field required flags ─────────────────────────────────────────────
//
// Maps WooCommerce's billing_ prefixed field keys to the shorter keys used
// inside the form (which match AddressDict / CustomField names).
//
// THWCFE fields (billing_field_type, billing_project) keep their full name
// because they're registered without a stripped version in our form.
// project_rep may appear with or without the billing_ prefix depending on
// how THWCFE registered it, so both variants are mapped to the same form key.

const BILLING_WC_KEY_MAP: Record<string, string> = {
  billing_company: "company",
  billing_state: "state",
  billing_field_type: "billing_field_type",
  billing_project: "billing_project",
  project_rep: "project_rep",
  billing_project_rep: "project_rep",
};

// Used when the /checkout-fields fetch fails — keeps the form working exactly
// as it did before while the issue is investigated.
const BILLING_REQUIRED_FALLBACK: Record<string, { required?: boolean }> = {
  company: { required: true },
  billing_field_type: { required: true },
  billing_project: { required: true },
  project_rep: { required: true },
  state: { required: true },
};

/**
 * Fetches /checkout-fields and extracts only the `required` flag for each
 * billing field that our form cares about.
 *
 * Returns the fallback map on any network or parse error so the form stays
 * functional even if this secondary fetch fails.
 */
async function fetchBillingFieldMeta(
  wpBase: string,
): Promise<Record<string, { required?: boolean }>> {
  try {
    const res = await fetch(`${wpBase}/wp-json/custom-api/v1/checkout-fields`);
    if (!res.ok) return BILLING_REQUIRED_FALLBACK;

    const data: Record<
      string,
      Record<string, { required?: boolean; label?: string }>
    > = await res.json();

    const billing = data?.billing ?? {};
    const result: Record<string, { required?: boolean }> = {};

    for (const [wcKey, formKey] of Object.entries(BILLING_WC_KEY_MAP)) {
      const config = billing[wcKey];
      if (config?.required !== undefined) {
        result[formKey] = { required: config.required };
      }
    }

    // If we couldn't map any fields (e.g. THWCFE stores them under a different
    // group key), fall back to the static list so required validation still fires.
    return Object.keys(result).length > 0 ? result : BILLING_REQUIRED_FALLBACK;
  } catch {
    return BILLING_REQUIRED_FALLBACK;
  }
}

// ── Shipping field required flags ─────────────────────────────────────────────
//
// Maps WooCommerce's shipping_ prefixed field keys to the shorter form keys.
// Only the fields our ShippingAddressForm actually renders are listed here —
// order_notes is not a WC address field so it's excluded from the map.

const SHIPPING_WC_KEY_MAP: Record<string, string> = {
  shipping_company: "company",
  shipping_state: "state",
};

// Used when the /checkout-fields fetch fails — matches the hardcoded behaviour
// that was in ShippingAddressForm before this dynamic fetch was added.
const SHIPPING_REQUIRED_FALLBACK: Record<string, { required?: boolean }> = {
  company: { required: true },
  state: { required: false },
};

/**
 * Fetches /checkout-fields and extracts only the `required` flag for each
 * shipping field that our form cares about.
 *
 * Returns the fallback map on any network or parse error so the form stays
 * functional even if this secondary fetch fails.
 */
async function fetchShippingFieldMeta(
  wpBase: string,
): Promise<Record<string, { required?: boolean }>> {
  try {
    const res = await fetch(`${wpBase}/wp-json/custom-api/v1/checkout-fields`);
    if (!res.ok) return SHIPPING_REQUIRED_FALLBACK;

    const data: Record<
      string,
      Record<string, { required?: boolean; label?: string }>
    > = await res.json();

    const shipping = data?.shipping ?? {};
    const result: Record<string, { required?: boolean }> = {};

    for (const [wcKey, formKey] of Object.entries(SHIPPING_WC_KEY_MAP)) {
      const config = shipping[wcKey];
      if (config?.required !== undefined) {
        result[formKey] = { required: config.required };
      }
    }

    return Object.keys(result).length > 0 ? result : SHIPPING_REQUIRED_FALLBACK;
  } catch {
    return SHIPPING_REQUIRED_FALLBACK;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface CheckoutFieldsData {
  countries: WpCountry[];
  reps: WpRep[];
  orderTypeOptions: WpOrderTypeOption[];
  /**
   * Per-field `required` flags derived from WooCommerce's /checkout-fields
   * response for the billing address group.
   * Shape is compatible with AddressForm's FieldOverrides type.
   *
   * Keys use the form's short names (e.g. "company", not "billing_company").
   * Falls back to the static BILLING_REQUIRED_FALLBACK map on fetch failure.
   */
  billingFieldOverrides: Record<string, { required?: boolean }>;
  /**
   * Per-field `required` flags derived from WooCommerce's /checkout-fields
   * response for the shipping address group.
   * Shape is compatible with AddressForm's FieldOverrides type.
   *
   * Keys use the form's short names (e.g. "company", not "shipping_company").
   * Falls back to the static SHIPPING_REQUIRED_FALLBACK map on fetch failure.
   */
  shippingFieldOverrides: Record<string, { required?: boolean }>;
  isLoading: boolean;
  error: string | null;
}

export function useCheckoutFields(wpBase: string): CheckoutFieldsData {
  const [countries, setCountries] = useState<WpCountry[]>([]);
  const [reps, setReps] = useState<WpRep[]>([]);
  const [orderTypeOptions, setOrderTypeOptions] = useState<WpOrderTypeOption[]>(
    [],
  );
  // Initialise with fallbacks so the forms are never permissive while loading.
  const [billingFieldOverrides, setBillingFieldOverrides] = useState<
    Record<string, { required?: boolean }>
  >(BILLING_REQUIRED_FALLBACK);
  const [shippingFieldOverrides, setShippingFieldOverrides] = useState<
    Record<string, { required?: boolean }>
  >(SHIPPING_REQUIRED_FALLBACK);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!wpBase) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    Promise.all([
      fetchWpCountries(wpBase),
      fetchWpReps(wpBase),
      fetchWpOrderTypes(wpBase),
      fetchBillingFieldMeta(wpBase), // ← derives billing required flags from WC
      fetchShippingFieldMeta(wpBase), // ← derives shipping required flags from WC
    ])
      .then(
        ([
          countriesData,
          repsData,
          orderTypeData,
          billingMeta,
          shippingMeta,
        ]) => {
          if (cancelled) return;
          setCountries(countriesData);
          setReps(repsData);
          setOrderTypeOptions(orderTypeData);
          setBillingFieldOverrides(billingMeta);
          setShippingFieldOverrides(shippingMeta);
        },
      )
      .catch((err) => {
        if (cancelled) return;
        console.warn("[useCheckoutFields] Failed to fetch from WP:", err);
        setError(err?.message ?? "Failed to load checkout fields");
        // countries / reps / orderTypeOptions stay empty — AddressForm falls
        // back to built-in defaults.
        // billingFieldOverrides and shippingFieldOverrides stay as their
        // respective FALLBACK initial states so required validation still fires.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [wpBase]);

  return {
    countries,
    reps,
    orderTypeOptions,
    billingFieldOverrides,
    shippingFieldOverrides,
    isLoading,
    error,
  };
}
