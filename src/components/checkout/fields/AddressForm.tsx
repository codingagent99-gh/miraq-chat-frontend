import { useState, useEffect, useRef } from "react";
import type { AddressDict } from "../../../types/actions";
import {
  loadAddressDraft,
  saveAddressDraft,
} from "../../../utils/addressDraft";
import { InlineFieldError } from "./InlineFieldError";

interface AddressFormProps {
  cartToken: string | null;
  initialValues?: AddressDict;
  fieldError?: { field?: string; message: string } | null;
  isLoading?: boolean;
  onSubmit: (address: AddressDict) => void;
}

const EMPTY: AddressDict = {
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

function fieldLabel(key: keyof AddressDict): string {
  const labels: Record<keyof AddressDict, string> = {
    first_name: "First Name",
    last_name: "Last Name",
    company: "Company (optional)",
    address_1: "Address Line 1",
    address_2: "Address Line 2 (optional)",
    city: "City",
    state: "State / Province",
    postcode: "Postcode / ZIP",
    country: "Country",
    email: "Email",
    phone: "Phone",
  };
  return labels[key] ?? key;
}

const REQUIRED_FIELDS: (keyof AddressDict)[] = [
  "first_name",
  "last_name",
  "address_1",
  "city",
  "postcode",
  "country",
  "email",
];

export function AddressForm({
  cartToken,
  initialValues,
  fieldError,
  isLoading,
  onSubmit,
}: AddressFormProps) {
  const [values, setValues] = useState<AddressDict>(() => {
    // Priority: initialValues (e.g. SavedAddressConfirmCard "enter different") → sessionStorage draft → empty
    if (initialValues && Object.keys(initialValues).length > 0) {
      return { ...EMPTY, ...initialValues };
    }
    const draft = loadAddressDraft(cartToken);
    return { ...EMPTY, ...(draft ?? {}) };
  });

  const [touched, setTouched] = useState<Partial<Record<keyof AddressDict, boolean>>>({});
  const [localErrors, setLocalErrors] = useState<Partial<Record<keyof AddressDict, string>>>({});

  // Debounce sessionStorage save
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

  function handleChange(field: keyof AddressDict, value: string) {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (touched[field]) {
      setLocalErrors((prev) => ({
        ...prev,
        [field]: value.trim() ? undefined : (REQUIRED_FIELDS.includes(field) ? "This field is required." : undefined),
      }));
    }
  }

  function handleBlur(field: keyof AddressDict) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (REQUIRED_FIELDS.includes(field) && !values[field]?.trim()) {
      setLocalErrors((prev) => ({ ...prev, [field]: "This field is required." }));
    }
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof AddressDict, string>> = {};
    for (const field of REQUIRED_FIELDS) {
      if (!values[field]?.trim()) {
        newErrors[field] = "This field is required.";
      }
    }
    setLocalErrors(newErrors);
    setTouched(
      REQUIRED_FIELDS.reduce((acc, f) => ({ ...acc, [f]: true }), {}),
    );
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(values);
  }

  const serverFieldError =
    fieldError?.field &&
    (fieldError.field as string) in EMPTY
      ? { [fieldError.field as keyof AddressDict]: fieldError.message }
      : {};

  const allErrors = { ...localErrors, ...serverFieldError };

  const fieldOrder: (keyof AddressDict)[] = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "company",
    "address_1",
    "address_2",
    "city",
    "state",
    "postcode",
    "country",
  ];

  return (
    <form onSubmit={handleSubmit} noValidate style={{ width: "100%" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
        }}
      >
        {fieldOrder.map((field) => {
          const isFullWidth = [
            "email",
            "company",
            "address_1",
            "address_2",
          ].includes(field);
          const error = allErrors[field];

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
                {fieldLabel(field)}
              </label>
              <input
                id={`addr-${field}`}
                type={field === "email" ? "email" : "text"}
                value={values[field] ?? ""}
                onChange={(e) => handleChange(field, e.target.value)}
                onBlur={() => handleBlur(field)}
                style={{
                  padding: "9px 11px",
                  borderRadius: "9px",
                  border: `1.5px solid ${error ? "#ef4444" : "#e8e6e0"}`,
                  fontSize: "13px",
                  fontFamily: "inherit",
                  background: "#fff",
                  color: "#1c1c1a",
                  outline: "none",
                  transition: "border-color 0.15s",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
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
        {isLoading ? "Saving…" : "Continue to Shipping →"}
      </button>
    </form>
  );
}
