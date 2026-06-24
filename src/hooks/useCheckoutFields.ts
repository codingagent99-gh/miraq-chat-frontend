/**
 * useCheckoutFields
 *
 * Single /checkout-fields fetch drives both field lists and required-flag maps.
 * Replaces the two separate fetchBillingFieldMeta / fetchShippingFieldMeta calls.
 *
 * Endpoints consumed:
 *   GET /wp-json/custom-api/v1/countries
 *   GET /wp-json/custom-api/v1/reps
 *   GET /wp-json/custom-api/v1/order-types
 *   GET /wp-json/custom-api/v1/checkout-fields   ← one fetch, all groups
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

// ── Public field descriptor ───────────────────────────────────────────────────

export interface CheckoutField {
  /** Form-state key (short).  e.g. "first_name", "billing_field_type". */
  key: string;
  /** Original WooCommerce key.  e.g. "billing_first_name". */
  wcKey: string;
  label: string;
  required: boolean;
  /** WC field type: "text" | "select" | "country" | "state" | "tel" | "email" | "textarea". */
  type: string;
  priority: number;
  /** Renderer hint for special dropdowns. */
  kind?: "rep" | "orderType" | "country" | "state";
}

// ── Key normalisation ─────────────────────────────────────────────────────────

// THWCFE custom fields whose names START with "billing_" but must keep the full
// name in form state — stripping the prefix would make them ambiguous / break
// the downstream __BULK_ADDR__ consumer that looks for these exact keys.
const BILLING_KEEP_PREFIX = new Set(["billing_field_type", "billing_project"]);

// THWCFE sometimes registers "shipping_company_name" instead of the standard
// "shipping_company". Normalise it so the form state always uses "company".
const SHIPPING_KEY_REMAP: Record<string, string> = {
  shipping_company_name: "company",
};

function formKey(wcKey: string, group: "billing" | "shipping"): string {
  if (group === "billing" && BILLING_KEEP_PREFIX.has(wcKey)) return wcKey;
  const remap = SHIPPING_KEY_REMAP[wcKey];
  if (remap) return remap;
  const prefix = `${group}_`;
  return wcKey.startsWith(prefix) ? wcKey.slice(prefix.length) : wcKey;
}

// ── kind derivation ───────────────────────────────────────────────────────────

function kindFor(wcKey: string, type: string): CheckoutField["kind"] {
  if (type === "country") return "country";
  if (type === "state") return "state";
  if (wcKey === "project_rep" || wcKey === "billing_project_rep") return "rep";
  if (wcKey === "billing_field_type") return "orderType";
  return undefined;
}

// ── Raw API shape ─────────────────────────────────────────────────────────────

interface RawWcField {
  label?: string;
  required?: boolean;
  type?: string;
  priority?: number;
  options?: Record<string, string>;
}

// ── Group parser ──────────────────────────────────────────────────────────────

function parseGroup(
  raw: Record<string, RawWcField>,
  group: "billing" | "shipping",
): CheckoutField[] {
  return Object.entries(raw)
    .map(([wcKey, cfg]) => ({
      key: formKey(wcKey, group),
      wcKey,
      label: cfg.label ?? wcKey,
      required: cfg.required ?? false,
      type: cfg.type ?? "text",
      priority: cfg.priority ?? 999,
      kind: kindFor(wcKey, cfg.type ?? ""),
    }))
    .sort((a, b) => a.priority - b.priority);
}

// ── Fallbacks (used when the fetch fails) ─────────────────────────────────────

const BILLING_FIELDS_FALLBACK: CheckoutField[] = [
  {
    key: "first_name",
    wcKey: "billing_first_name",
    label: "First name",
    required: true,
    type: "text",
    priority: 10,
  },
  {
    key: "last_name",
    wcKey: "billing_last_name",
    label: "Last name",
    required: true,
    type: "text",
    priority: 20,
  },
  {
    key: "company",
    wcKey: "billing_company",
    label: "Company name",
    required: true,
    type: "text",
    priority: 30,
  },
  {
    key: "billing_field_type",
    wcKey: "billing_field_type",
    label: "Order Type",
    required: true,
    type: "select",
    priority: 35,
    kind: "orderType",
  },
  {
    key: "billing_project",
    wcKey: "billing_project",
    label: "Project Name",
    required: true,
    type: "text",
    priority: 37,
  },
  {
    key: "country",
    wcKey: "billing_country",
    label: "Country",
    required: true,
    type: "country",
    priority: 40,
    kind: "country",
  },
  {
    key: "address_1",
    wcKey: "billing_address_1",
    label: "Address 1",
    required: true,
    type: "text",
    priority: 50,
  },
  {
    key: "address_2",
    wcKey: "billing_address_2",
    label: "Address 2",
    required: false,
    type: "text",
    priority: 60,
  },
  {
    key: "city",
    wcKey: "billing_city",
    label: "City",
    required: true,
    type: "text",
    priority: 70,
  },
  {
    key: "state",
    wcKey: "billing_state",
    label: "State",
    required: true,
    type: "state",
    priority: 80,
    kind: "state",
  },
  {
    key: "postcode",
    wcKey: "billing_postcode",
    label: "Postcode",
    required: true,
    type: "text",
    priority: 90,
  },
  {
    key: "phone",
    wcKey: "billing_phone",
    label: "Phone",
    required: false,
    type: "tel",
    priority: 100,
  },
  {
    key: "email",
    wcKey: "billing_email",
    label: "Email",
    required: true,
    type: "email",
    priority: 110,
  },
  {
    key: "project_rep",
    wcKey: "project_rep",
    label: "Your Rep",
    required: true,
    type: "select",
    priority: 120,
    kind: "rep",
  },
];

const SHIPPING_FIELDS_FALLBACK: CheckoutField[] = [
  {
    key: "company",
    wcKey: "shipping_company",
    label: "Company name",
    required: true,
    type: "text",
    priority: -1,
  },
  {
    key: "first_name",
    wcKey: "shipping_first_name",
    label: "First name",
    required: true,
    type: "text",
    priority: 10,
  },
  {
    key: "last_name",
    wcKey: "shipping_last_name",
    label: "Last name",
    required: true,
    type: "text",
    priority: 20,
  },
  {
    key: "country",
    wcKey: "shipping_country",
    label: "Country",
    required: true,
    type: "country",
    priority: 40,
    kind: "country",
  },
  {
    key: "address_1",
    wcKey: "shipping_address_1",
    label: "Address 1",
    required: true,
    type: "text",
    priority: 50,
  },
  {
    key: "address_2",
    wcKey: "shipping_address_2",
    label: "Address 2",
    required: false,
    type: "text",
    priority: 60,
  },
  {
    key: "city",
    wcKey: "shipping_city",
    label: "City",
    required: true,
    type: "text",
    priority: 70,
  },
  {
    key: "state",
    wcKey: "shipping_state",
    label: "State",
    required: true,
    type: "state",
    priority: 80,
    kind: "state",
  },
  {
    key: "postcode",
    wcKey: "shipping_postcode",
    label: "Postcode",
    required: true,
    type: "text",
    priority: 90,
  },
  {
    key: "phone",
    wcKey: "shipping_phone",
    label: "Phone",
    required: false,
    type: "tel",
    priority: 100,
  },
  {
    key: "email",
    wcKey: "shipping_email",
    label: "Shipping Email",
    required: true,
    type: "email",
    priority: 110,
  },
  {
    key: "order_notes",
    wcKey: "order_comments",
    label: "Order notes",
    required: false,
    type: "textarea",
    priority: 9999,
  },
];

const BILLING_REQUIRED_FALLBACK: Record<string, { required?: boolean }> = {
  company: { required: true },
  billing_field_type: { required: true },
  billing_project: { required: true },
  project_rep: { required: true },
  state: { required: true },
};

const SHIPPING_REQUIRED_FALLBACK: Record<string, { required?: boolean }> = {
  company: { required: true },
  state: { required: false },
};

// ── Single fetch ──────────────────────────────────────────────────────────────

interface FieldMeta {
  billingFields: CheckoutField[];
  shippingFields: CheckoutField[];
  billingFieldOverrides: Record<string, { required?: boolean }>;
  shippingFieldOverrides: Record<string, { required?: boolean }>;
}

async function fetchFieldMeta(wpBase: string): Promise<FieldMeta> {
  const fallback: FieldMeta = {
    billingFields: BILLING_FIELDS_FALLBACK,
    shippingFields: SHIPPING_FIELDS_FALLBACK,
    billingFieldOverrides: BILLING_REQUIRED_FALLBACK,
    shippingFieldOverrides: SHIPPING_REQUIRED_FALLBACK,
  };

  try {
    const res = await fetch(`${wpBase}/wp-json/custom-api/v1/checkout-fields`);
    if (!res.ok) return fallback;

    const data: Record<string, Record<string, RawWcField>> = await res.json();

    const billingFields = parseGroup(data.billing ?? {}, "billing");
    const shippingCore = parseGroup(data.shipping ?? {}, "shipping");

    // WC stores order_comments in the "order" group; append it to shipping fields.
    const orderRaw = data.order ?? {};
    const orderNotes: CheckoutField | null = orderRaw.order_comments
      ? {
          key: "order_notes",
          wcKey: "order_comments",
          label: orderRaw.order_comments.label ?? "Order notes",
          required: false,
          type: "textarea",
          priority: 9999,
        }
      : null;

    const shippingFields = orderNotes
      ? [...shippingCore, orderNotes]
      : shippingCore;

    if (!billingFields.length && !shippingFields.length) return fallback;

    // Derive override maps from parsed lists (backward-compat for other consumers).
    const billingFieldOverrides: Record<string, { required?: boolean }> = {};
    for (const f of billingFields)
      billingFieldOverrides[f.key] = { required: f.required };

    const shippingFieldOverrides: Record<string, { required?: boolean }> = {};
    for (const f of shippingFields)
      shippingFieldOverrides[f.key] = { required: f.required };

    return {
      billingFields: billingFields.length
        ? billingFields
        : BILLING_FIELDS_FALLBACK,
      shippingFields: shippingFields.length
        ? shippingFields
        : SHIPPING_FIELDS_FALLBACK,
      billingFieldOverrides,
      shippingFieldOverrides,
    };
  } catch {
    return fallback;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface CheckoutFieldsData {
  countries: WpCountry[];
  reps: WpRep[];
  orderTypeOptions: WpOrderTypeOption[];
  /** Full API-driven billing field list, sorted by WC priority. */
  billingFields: CheckoutField[];
  /** Full API-driven shipping field list, sorted by WC priority. */
  shippingFields: CheckoutField[];
  /** Required flags keyed by short form key — backward-compat for AddressForm. */
  billingFieldOverrides: Record<string, { required?: boolean }>;
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
  const [billingFields, setBillingFields] = useState<CheckoutField[]>(
    BILLING_FIELDS_FALLBACK,
  );
  const [shippingFields, setShippingFields] = useState<CheckoutField[]>(
    SHIPPING_FIELDS_FALLBACK,
  );
  const [billingFieldOverrides, setBillingFieldOverrides] = useState(
    BILLING_REQUIRED_FALLBACK,
  );
  const [shippingFieldOverrides, setShippingFieldOverrides] = useState(
    SHIPPING_REQUIRED_FALLBACK,
  );
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
      fetchFieldMeta(wpBase), // single fetch replaces two separate calls
    ])
      .then(([c, r, ot, meta]) => {
        if (cancelled) return;
        setCountries(c);
        setReps(r);
        setOrderTypeOptions(ot);
        setBillingFields(meta.billingFields);
        setShippingFields(meta.shippingFields);
        setBillingFieldOverrides(meta.billingFieldOverrides);
        setShippingFieldOverrides(meta.shippingFieldOverrides);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[useCheckoutFields] fetch failed:", err);
        setError(err?.message ?? "Failed to load checkout fields");
        // State stays as fallback initial values — forms remain functional.
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
    billingFields,
    shippingFields,
    billingFieldOverrides,
    shippingFieldOverrides,
    isLoading,
    error,
  };
}
