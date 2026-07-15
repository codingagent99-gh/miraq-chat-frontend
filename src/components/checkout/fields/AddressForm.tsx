/**
 * AddressForm — internal base component.
 *
 * Don't use this directly in page-level code. Use:
 *   <BillingAddressForm />  — all fields including phone + email
 *   <ShippingAddressForm /> — address fields only (matches CS site shipping HTML)
 */
import { useState, useEffect, useRef } from "react";
import type { AddressDict } from "../../../types/actions";
import {
  loadAddressDraft,
  saveAddressDraft,
} from "../../../utils/addressDraft";
import { InlineFieldError } from "./InlineFieldError";
import type {
  WpCountry,
  WpRep,
  WpOrderTypeOption,
} from "../../../hooks/useCheckoutFields";

/** All custom (non-AddressDict) fields supported by this form. */
export type CustomField =
  | "project_rep" // Your Rep — select from /wp-json/custom-api/v1/reps
  | "billing_field_type" // Order Type — select from /wp-json/custom-api/v1/checkout-fields
  | "billing_project" // Project Name — free-text input
  | "order_notes"; // Order Notes — optional textarea (shipping step)

/** Per-field overrides for label text and/or required status. */
export type FieldOverrides = Partial<
  Record<
    keyof AddressDict | CustomField,
    { label?: string; required?: boolean }
  >
>;

/**
 * Internal form values — extends AddressDict with custom WooCommerce fields
 * that aren't part of the standard address schema.
 */
type FormValues = AddressDict & {
  project_rep?: string;
  billing_field_type?: string; // Order Type
  billing_project?: string; // Project Name
  order_notes?: string;
};

export interface AddressFormProps {
  cartToken: string | null;
  initialValues?: AddressDict;
  fieldError?: { field?: string; message: string } | null;
  isLoading?: boolean;
  submitLabel?: string;
  /** Provided by BillingAddressForm / ShippingAddressForm — don't pass manually. */
  visibleFields: (keyof AddressDict | CustomField)[];
  /**
   * Per-field label / required overrides.
   * Provided by BillingAddressForm / ShippingAddressForm — don't pass manually.
   */
  fieldOverrides?: FieldOverrides;
  onSubmit: (address: AddressDict) => void;
  /**
   * Live country list from /wp-json/custom-api/v1/countries.
   * Each entry includes a `states` array. When empty, falls back to the
   * built-in COUNTRIES constant (no state dropdowns).
   */
  countries?: WpCountry[];
  /**
   * Order Type options from /wp-json/custom-api/v1/checkout-fields.
   * When provided (billing only), renders the "Order Type" dropdown.
   */
  orderTypeOptions?: WpOrderTypeOption[];
  /**
   * CS rep options from /wp-json/custom-api/v1/reps.
   * When provided (billing only), renders the "Your Rep" dropdown.
   */
  repOptions?: WpRep[];
}

export const EMPTY: AddressDict = {
  first_name: "",
  last_name: "",
  company: "",
  address_1: "",
  address_2: "",
  city: "",
  state: "",
  postcode: "",
  country: "",
  email: "",
  phone: "",
};

/** Full EMPTY with custom billing/shipping fields */
const EMPTY_EXTENDED: FormValues = {
  ...EMPTY,
  project_rep: "",
  billing_field_type: "",
  billing_project: "",
  order_notes: "",
};

export function fieldLabel(key: keyof AddressDict | CustomField): string {
  const labels: Record<string, string> = {
    first_name: "First Name",
    last_name: "Last Name",
    company: "Company Name",
    address_1: "Street address",
    address_2: "Apartment, suite, unit, etc. (optional)",
    city: "Town / City",
    state: "State / County",
    postcode: "Postcode / ZIP",
    country: "Country / Region",
    email: "Email address",
    phone: "Phone",
    project_rep: "Your Rep",
    billing_field_type: "Order Type",
    billing_project: "Project Name",
    order_notes: "Order Notes (optional)",
  };
  return labels[key] ?? key;
}

/**
 * Fields that are required whenever they appear in the rendered form.
 * phone + email are required only on billing (they're absent on shipping).
 */
const ALWAYS_REQUIRED: (keyof AddressDict)[] = [
  "first_name",
  "last_name",
  "address_1",
  "city",
  "postcode",
  "country",
  "email",
  "phone",
];

// first_name + last_name sit side-by-side; every other field spans full width
const HALF_WIDTH_FIELDS: (keyof AddressDict)[] = ["first_name", "last_name"];

const INPUT_BASE: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: "9px",
  fontSize: "13px",
  fontFamily: "inherit",
  background: "#fff",
  color: "#1c1c1a",
  outline: "none",
  transition: "border-color 0.15s",
  width: "100%",
  boxSizing: "border-box",
};

export function AddressForm({
  cartToken,
  initialValues,
  fieldError,
  isLoading,
  submitLabel = "Continue →",
  visibleFields,
  fieldOverrides,
  onSubmit,
  countries: wpCountries = [],
  repOptions = [],
  orderTypeOptions = [],
}: AddressFormProps) {
  // Use live WP countries when available, fall back to built-in list
  const countryList = wpCountries;

  // Fields required because they're always required AND present in this form,
  // plus any fields explicitly marked required via fieldOverrides.
  const requiredFields = visibleFields.filter(
    (f) =>
      ALWAYS_REQUIRED.includes(f as keyof AddressDict) ||
      (fieldOverrides as any)?.[f]?.required === true,
  );

  const [values, setValues] = useState<FormValues>(() => {
    if (initialValues && Object.keys(initialValues).length > 0) {
      return { ...EMPTY_EXTENDED, ...initialValues };
    }
    const draft = loadAddressDraft(cartToken);
    return { ...EMPTY_EXTENDED, ...(draft ?? {}) };
  });

  // Track whether the form was opened with prefilled data so we can show
  // the "clear fields" affordance. Only true on the initial render when
  // initialValues contains at least one non-empty field.
  const [isPrefillActive, setIsPrefillActive] = useState<boolean>(
    () =>
      !!(
        initialValues && Object.values(initialValues).some((v) => v?.trim?.())
      ),
  );

  const [touched, setTouched] = useState<
    Partial<Record<keyof FormValues, boolean>>
  >({});
  const [localErrors, setLocalErrors] = useState<
    Partial<Record<keyof FormValues, string>>
  >({});

  function handleClearFields() {
    setValues(EMPTY_EXTENDED);
    setTouched({});
    setLocalErrors({});
    setIsPrefillActive(false);
    // Also clear the draft so the empty state is persisted
    saveAddressDraft(cartToken, EMPTY_EXTENDED);
  }

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAddressDraft(cartToken, values);
    }, 300);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [values, cartToken]);

  function handleChange(field: string, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if ((touched as any)[field]) {
      setLocalErrors((prev) => ({
        ...prev,
        [field]: value.trim()
          ? undefined
          : requiredFields.includes(field as any)
            ? "This field is required."
            : undefined,
      }));
    }
    // Reset state when country changes
    if (field === "country") {
      setValues((prev) => ({ ...prev, country: value, state: "" }));
    }
  }

  function handleBlur(field: string) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (
      requiredFields.includes(field as any) &&
      !(values as any)[field]?.trim()
    ) {
      setLocalErrors((prev) => ({
        ...prev,
        [field]: "This field is required.",
      }));
    }
  }

  function validate(): boolean {
    const newErrors: Partial<Record<string, string>> = {};
    for (const field of requiredFields) {
      if (!(values as any)[field]?.trim()) {
        newErrors[field] = "This field is required.";
      }
    }
    setLocalErrors(newErrors as any);
    setTouched(requiredFields.reduce((acc, f) => ({ ...acc, [f]: true }), {}));
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    // Cast back — project_rep is included at runtime even if not in AddressDict type
    onSubmit(values as AddressDict);
  }

  const serverFieldError =
    fieldError?.field && (fieldError.field as string) in EMPTY
      ? { [fieldError.field as string]: fieldError.message }
      : {};

  const allErrors: Record<string, string | undefined> = {
    ...(localErrors as Record<string, string | undefined>),
    ...serverFieldError,
  };

  // True only when every required field has a non-empty value.
  // Used to disable the submit button until the form is completable.
  const isFormValid = requiredFields.every((f) => !!(values as any)[f]?.trim());

  // Derive available states from the currently selected country
  const selectedCountryData = countryList.find(
    (c) => "states" in c && c.code === values.country,
  ) as WpCountry | undefined;
  const availableStates = selectedCountryData?.states ?? [];

  // Select input shared styles
  const selectStyle = (hasError: boolean): React.CSSProperties => ({
    ...INPUT_BASE,
    border: `1.5px solid ${hasError ? "#ef4444" : "#e8e6e0"}`,
    appearance: "none",
    backgroundImage:
      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23555' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    paddingRight: "28px",
    cursor: "pointer",
  });

  return (
    <form onSubmit={handleSubmit} noValidate style={{ width: "100%" }}>
      {/* ── Prefill banner — shown when the form is seeded from a saved address ── */}
      {isPrefillActive && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            padding: "10px 12px",
            background: "#f5f4f1",
            borderRadius: "10px",
            marginBottom: "14px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#555", lineHeight: 1.4 }}>
            Editing your saved address — make any changes below.
          </span>
          <button
            type="button"
            onClick={handleClearFields}
            style={{
              flexShrink: 0,
              background: "none",
              border: "1.5px solid #d0cec9",
              borderRadius: "7px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 600,
              color: "#555",
              fontFamily: "inherit",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "border-color 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#1c1c1a";
              e.currentTarget.style.color = "#1c1c1a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#d0cec9";
              e.currentTarget.style.color = "#555";
            }}
          >
            Clear fields
          </button>
        </div>
      )}

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}
      >
        {visibleFields.map((field) => {
          const isFullWidth = !HALF_WIDTH_FIELDS.includes(
            field as keyof AddressDict,
          );
          const error = allErrors[field];
          const currentValue = (values as any)[field] ?? "";
          const label =
            (fieldOverrides as any)?.[field]?.label ?? fieldLabel(field);

          return (
            <div
              key={field}
              style={{
                gridColumn: isFullWidth ? "1 / -1" : undefined,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <label
                htmlFor={`addr-${field}`}
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#555",
                  marginBottom: "4px",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </label>

              {/* ── Country dropdown ── */}
              {field === "country" && (
                <select
                  id={`addr-${field}`}
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  style={selectStyle(!!error)}
                >
                  <option value="">Select a country…</option>
                  {countryList.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              {/* ── State: dropdown when WP returns states, text input otherwise ── */}
              {field === "state" && availableStates.length > 0 && (
                <select
                  id={`addr-${field}`}
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  style={selectStyle(!!error)}
                >
                  <option value="">Select a state…</option>
                  {availableStates.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              {field === "state" && availableStates.length === 0 && (
                <input
                  id={`addr-${field}`}
                  type="text"
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  style={{
                    ...INPUT_BASE,
                    border: `1.5px solid ${error ? "#ef4444" : "#e8e6e0"}`,
                  }}
                />
              )}

              {/* ── Your Rep dropdown (billing only) ── */}
              {field === "project_rep" && (
                <select
                  id={`addr-${field}`}
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  style={selectStyle(!!error)}
                >
                  <option value="">Select your rep…</option>
                  {repOptions.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}

              {/* ── Order Type dropdown (billing only — options from /checkout-fields) ── */}
              {field === "billing_field_type" && (
                <select
                  id={`addr-${field}`}
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  style={selectStyle(!!error)}
                >
                  <option value="">Select order type…</option>
                  {orderTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

              {/* ── Project Name text input (billing only) ── */}
              {field === "billing_project" && (
                <input
                  id={`addr-${field}`}
                  type="text"
                  placeholder="e.g. City Centre Hotel Refurb"
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  style={{
                    ...INPUT_BASE,
                    border: `1.5px solid ${error ? "#ef4444" : "#e8e6e0"}`,
                  }}
                />
              )}

              {/* ── Order Notes textarea (shipping step — optional) ── */}
              {field === "order_notes" && (
                <textarea
                  id={`addr-${field}`}
                  placeholder="Any special delivery instructions or notes about your order…"
                  value={currentValue}
                  onChange={(e) =>
                    handleChange(field as string, e.target.value)
                  }
                  onBlur={() => handleBlur(field as string)}
                  rows={3}
                  style={{
                    ...INPUT_BASE,
                    border: `1.5px solid ${error ? "#ef4444" : "#e8e6e0"}`,
                    resize: "vertical",
                    minHeight: "70px",
                  }}
                />
              )}

              {/* ── All other fields: email, phone, text inputs ── */}
              {field !== "country" &&
                field !== "state" &&
                field !== "project_rep" &&
                field !== "billing_field_type" &&
                field !== "billing_project" &&
                field !== "order_notes" && (
                  <input
                    id={`addr-${field}`}
                    type={
                      field === "email"
                        ? "email"
                        : field === "phone"
                          ? "tel"
                          : "text"
                    }
                    value={currentValue}
                    onChange={(e) =>
                      handleChange(field as string, e.target.value)
                    }
                    onBlur={() => handleBlur(field as string)}
                    style={{
                      ...INPUT_BASE,
                      border: `1.5px solid ${error ? "#ef4444" : "#e8e6e0"}`,
                    }}
                  />
                )}

              <InlineFieldError message={error} />
            </div>
          );
        })}
      </div>

      {/* Server-side non-field error */}
      {fieldError && !fieldError.field && (
        <p
          style={{
            marginTop: "10px",
            fontSize: "12px",
            color: "#ef4444",
            textAlign: "center",
          }}
        >
          {fieldError.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading || !isFormValid}
        style={{
          marginTop: "16px",
          width: "100%",
          padding: "12px",
          background: isFormValid && !isLoading ? "#1c1c1a" : "#ccc",
          color: "#fff",
          border: "none",
          borderRadius: "11px",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: isLoading || !isFormValid ? "not-allowed" : "pointer",
          opacity: isLoading || !isFormValid ? 0.65 : 1,
          transition: "opacity 0.2s, background 0.2s",
        }}
      >
        {isLoading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
