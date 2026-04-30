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
import type { WpCountry, WpRep } from "../../../hooks/useCheckoutFields";

/** Per-field overrides for label text and/or required status. */
export type FieldOverrides = Partial<
  Record<keyof AddressDict, { label?: string; required?: boolean }>
>;

/**
 * Internal form values — extends AddressDict with custom WooCommerce fields
 * that aren't part of the standard address schema (e.g. project_rep).
 */
type FormValues = AddressDict & { project_rep?: string };

export interface AddressFormProps {
  cartToken: string | null;
  initialValues?: AddressDict;
  fieldError?: { field?: string; message: string } | null;
  isLoading?: boolean;
  submitLabel?: string;
  /** Provided by BillingAddressForm / ShippingAddressForm — don't pass manually. */
  visibleFields: (keyof AddressDict | "project_rep")[];
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

/** Full EMPTY with custom billing fields */
const EMPTY_EXTENDED: FormValues = { ...EMPTY, project_rep: "" };

export function fieldLabel(key: keyof AddressDict | "project_rep"): string {
  const labels: Record<string, string> = {
    first_name: "First Name",
    last_name: "Last Name",
    company: "Company Name (optional)",
    address_1: "Street address",
    address_2: "Apartment, suite, unit, etc. (optional)",
    city: "Town / City",
    state: "State / County",
    postcode: "Postcode / ZIP",
    country: "Country / Region",
    email: "Email address",
    phone: "Phone",
    project_rep: "Your Rep",
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

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "AF", name: "Afghanistan" },
  { code: "AL", name: "Albania" },
  { code: "DZ", name: "Algeria" },
  { code: "AD", name: "Andorra" },
  { code: "AO", name: "Angola" },
  { code: "AG", name: "Antigua and Barbuda" },
  { code: "AR", name: "Argentina" },
  { code: "AM", name: "Armenia" },
  { code: "AU", name: "Australia" },
  { code: "AT", name: "Austria" },
  { code: "AZ", name: "Azerbaijan" },
  { code: "BS", name: "Bahamas" },
  { code: "BH", name: "Bahrain" },
  { code: "BD", name: "Bangladesh" },
  { code: "BB", name: "Barbados" },
  { code: "BY", name: "Belarus" },
  { code: "BE", name: "Belgium" },
  { code: "BZ", name: "Belize" },
  { code: "BJ", name: "Benin" },
  { code: "BT", name: "Bhutan" },
  { code: "BO", name: "Bolivia" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BW", name: "Botswana" },
  { code: "BR", name: "Brazil" },
  { code: "BN", name: "Brunei" },
  { code: "BG", name: "Bulgaria" },
  { code: "BF", name: "Burkina Faso" },
  { code: "BI", name: "Burundi" },
  { code: "CV", name: "Cabo Verde" },
  { code: "KH", name: "Cambodia" },
  { code: "CM", name: "Cameroon" },
  { code: "CA", name: "Canada" },
  { code: "CF", name: "Central African Republic" },
  { code: "TD", name: "Chad" },
  { code: "CL", name: "Chile" },
  { code: "CN", name: "China" },
  { code: "CO", name: "Colombia" },
  { code: "KM", name: "Comoros" },
  { code: "CG", name: "Congo" },
  { code: "CD", name: "Congo (DRC)" },
  { code: "CR", name: "Costa Rica" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "HR", name: "Croatia" },
  { code: "CU", name: "Cuba" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "DJ", name: "Djibouti" },
  { code: "DM", name: "Dominica" },
  { code: "DO", name: "Dominican Republic" },
  { code: "EC", name: "Ecuador" },
  { code: "EG", name: "Egypt" },
  { code: "SV", name: "El Salvador" },
  { code: "GQ", name: "Equatorial Guinea" },
  { code: "ER", name: "Eritrea" },
  { code: "EE", name: "Estonia" },
  { code: "SZ", name: "Eswatini" },
  { code: "ET", name: "Ethiopia" },
  { code: "FJ", name: "Fiji" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GA", name: "Gabon" },
  { code: "GM", name: "Gambia" },
  { code: "GE", name: "Georgia" },
  { code: "DE", name: "Germany" },
  { code: "GH", name: "Ghana" },
  { code: "GR", name: "Greece" },
  { code: "GD", name: "Grenada" },
  { code: "GT", name: "Guatemala" },
  { code: "GN", name: "Guinea" },
  { code: "GW", name: "Guinea-Bissau" },
  { code: "GY", name: "Guyana" },
  { code: "HT", name: "Haiti" },
  { code: "HN", name: "Honduras" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IN", name: "India" },
  { code: "ID", name: "Indonesia" },
  { code: "IR", name: "Iran" },
  { code: "IQ", name: "Iraq" },
  { code: "IE", name: "Ireland" },
  { code: "IL", name: "Israel" },
  { code: "IT", name: "Italy" },
  { code: "JM", name: "Jamaica" },
  { code: "JP", name: "Japan" },
  { code: "JO", name: "Jordan" },
  { code: "KZ", name: "Kazakhstan" },
  { code: "KE", name: "Kenya" },
  { code: "KI", name: "Kiribati" },
  { code: "KW", name: "Kuwait" },
  { code: "KG", name: "Kyrgyzstan" },
  { code: "LA", name: "Laos" },
  { code: "LV", name: "Latvia" },
  { code: "LB", name: "Lebanon" },
  { code: "LS", name: "Lesotho" },
  { code: "LR", name: "Liberia" },
  { code: "LY", name: "Libya" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MG", name: "Madagascar" },
  { code: "MW", name: "Malawi" },
  { code: "MY", name: "Malaysia" },
  { code: "MV", name: "Maldives" },
  { code: "ML", name: "Mali" },
  { code: "MT", name: "Malta" },
  { code: "MH", name: "Marshall Islands" },
  { code: "MR", name: "Mauritania" },
  { code: "MU", name: "Mauritius" },
  { code: "MX", name: "Mexico" },
  { code: "FM", name: "Micronesia" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "MN", name: "Mongolia" },
  { code: "ME", name: "Montenegro" },
  { code: "MA", name: "Morocco" },
  { code: "MZ", name: "Mozambique" },
  { code: "MM", name: "Myanmar" },
  { code: "NA", name: "Namibia" },
  { code: "NR", name: "Nauru" },
  { code: "NP", name: "Nepal" },
  { code: "NL", name: "Netherlands" },
  { code: "NZ", name: "New Zealand" },
  { code: "NI", name: "Nicaragua" },
  { code: "NE", name: "Niger" },
  { code: "NG", name: "Nigeria" },
  { code: "NO", name: "Norway" },
  { code: "OM", name: "Oman" },
  { code: "PK", name: "Pakistan" },
  { code: "PW", name: "Palau" },
  { code: "PA", name: "Panama" },
  { code: "PG", name: "Papua New Guinea" },
  { code: "PY", name: "Paraguay" },
  { code: "PE", name: "Peru" },
  { code: "PH", name: "Philippines" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "QA", name: "Qatar" },
  { code: "RO", name: "Romania" },
  { code: "RU", name: "Russia" },
  { code: "RW", name: "Rwanda" },
  { code: "KN", name: "Saint Kitts and Nevis" },
  { code: "LC", name: "Saint Lucia" },
  { code: "VC", name: "Saint Vincent and the Grenadines" },
  { code: "WS", name: "Samoa" },
  { code: "SM", name: "San Marino" },
  { code: "ST", name: "São Tomé and Príncipe" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "SN", name: "Senegal" },
  { code: "RS", name: "Serbia" },
  { code: "SC", name: "Seychelles" },
  { code: "SL", name: "Sierra Leone" },
  { code: "SG", name: "Singapore" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "SB", name: "Solomon Islands" },
  { code: "SO", name: "Somalia" },
  { code: "ZA", name: "South Africa" },
  { code: "SS", name: "South Sudan" },
  { code: "ES", name: "Spain" },
  { code: "LK", name: "Sri Lanka" },
  { code: "SD", name: "Sudan" },
  { code: "SR", name: "Suriname" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "SY", name: "Syria" },
  { code: "TW", name: "Taiwan" },
  { code: "TJ", name: "Tajikistan" },
  { code: "TZ", name: "Tanzania" },
  { code: "TH", name: "Thailand" },
  { code: "TL", name: "Timor-Leste" },
  { code: "TG", name: "Togo" },
  { code: "TO", name: "Tonga" },
  { code: "TT", name: "Trinidad and Tobago" },
  { code: "TN", name: "Tunisia" },
  { code: "TR", name: "Turkey" },
  { code: "TM", name: "Turkmenistan" },
  { code: "TV", name: "Tuvalu" },
  { code: "UG", name: "Uganda" },
  { code: "UA", name: "Ukraine" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "UY", name: "Uruguay" },
  { code: "UZ", name: "Uzbekistan" },
  { code: "VU", name: "Vanuatu" },
  { code: "VE", name: "Venezuela" },
  { code: "VN", name: "Vietnam" },
  { code: "YE", name: "Yemen" },
  { code: "ZM", name: "Zambia" },
  { code: "ZW", name: "Zimbabwe" },
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
}: AddressFormProps) {
  // Use live WP countries when available, fall back to built-in list
  const countryList = wpCountries.length > 0 ? wpCountries : COUNTRIES;

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

  const [touched, setTouched] = useState<
    Partial<Record<keyof FormValues, boolean>>
  >({});
  const [localErrors, setLocalErrors] = useState<
    Partial<Record<keyof FormValues, string>>
  >({});

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
                  onChange={(e) => handleChange(field, e.target.value)}
                  onBlur={() => handleBlur(field)}
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
                  onChange={(e) => handleChange(field, e.target.value)}
                  onBlur={() => handleBlur(field)}
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
                  onChange={(e) => handleChange(field, e.target.value)}
                  onBlur={() => handleBlur(field)}
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
                  onChange={(e) => handleChange(field, e.target.value)}
                  onBlur={() => handleBlur(field)}
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

              {/* ── All other fields: email, phone, text ── */}
              {field !== "country" &&
                field !== "state" &&
                field !== "project_rep" && (
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
                    onChange={(e) => handleChange(field, e.target.value)}
                    onBlur={() => handleBlur(field)}
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
        disabled={isLoading}
        style={{
          marginTop: "16px",
          width: "100%",
          padding: "12px",
          background: "#1c1c1a",
          color: "#fff",
          border: "none",
          borderRadius: "11px",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.65 : 1,
          transition: "opacity 0.2s, background 0.2s",
        }}
      >
        {isLoading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
