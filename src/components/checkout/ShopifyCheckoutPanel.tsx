/**
 * components/checkout/ShopifyCheckoutPanel.tsx
 *
 * Shopify checkout panel — REVIEW AND REDIRECT.
 *
 * Step 1 — "Shipping": contact info + delivery address, validated here. When
 *                      the customer is logged in, saved Shopify addresses are
 *                      offered as selectable cards (fetched via the backend
 *                      /customer-addresses route) and the default is applied.
 * Step 2 — "Review":   cart summary + the address we collected, then hand off
 *                      to Shopify's hosted checkout.
 *
 * Delivery rates, taxes, billing address and payment are all owned by
 * Shopify's checkout. The cart total shown here is therefore a SUBTOTAL, and
 * the review step says so — see the "Next: delivery & payment" note.
 *
 * Shares CheckoutPanel.css with the WooCommerce panel unchanged.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import type { CSSProperties } from "react";
import {
  FiPackage,
  FiX,
  FiMaximize2,
  FiMinimize2,
  FiExternalLink,
  FiEdit2,
  FiPlus,
} from "react-icons/fi";
import type { PlatformCart } from "../../platform/types";
import { useCheckout } from "../../platform/shopify/useCheckout";
import type {
  ContactAddress,
  DeliveryOption,
  SavedAddress,
  AvailableCountry,
} from "../../platform/shopify/useCheckout";
import "./CheckoutPanel.css";

// ─── Props ────────────────────────────────────────────────────────────────────

/**
 * useCart (Shopify) adds checkoutUrl to PlatformCart at runtime.
 * Typed here to avoid the `as unknown` cast throughout the component.
 */
interface ShopifyPlatformCart extends PlatformCart {
  checkoutUrl?: string;
}

interface ShopifyCheckoutPanelProps {
  cart: PlatformCart | null;
  onClose: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  /** Shopify store domain, e.g. "mystore.myshopify.com". */
  shopDomain: string;
  /** Shopify Storefront public access token. */
  storefrontToken: string;
  /** Pre-fill the email field from the logged-in customer. */
  customerEmail?: string;
  /**
   * Pre-fill the name fields. Accepts "First Last" — split on first space.
   * Passed from ChatWidget's customerName prop.
   */
  customerName?: string;

  customerId?: string | number;
  apiUrl?: string;
}

// ─── Step config ──────────────────────────────────────────────────────────────

// Review-and-redirect: the widget collects and validates the shipping details,
// then hands off to Shopify's hosted checkout, which owns delivery rates,
// taxes, billing and payment.
//
// The former "Delivery" step could not work — rates require a Storefront cart
// and the widget deliberately shares the theme's Ajax session cart instead.
// The former "Payment" step collected a billing address that Shopify asks for
// again at payment time; billing is a payment-time concern, so it is no longer
// requested here. (To restore it, re-add the entry below, point the shipping
// step's onContinue at "collecting_billing", and restore the BillingStep
// component — the hook still holds billingOption/billingAddress state.)
const STEPS = [
  { label: "Shipping", key: "collecting_shipping" },
  { label: "Review", key: "review" },
] as const;

type VisibleStepKey = (typeof STEPS)[number]["key"];

function stepToIndex(key: string): number {
  const map: Record<string, number> = {
    collecting_shipping: 0,
    // Retired steps map back to Shipping so a stale persisted step value can
    // never index past the end of STEPS.
    selecting_shipping: 0,
    collecting_billing: 0,
    review: 1,
    redirecting: 1,
    error: 1,
  };
  return map[key] ?? 0;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Formats a minor-unit amount string with the cart's currency symbol. */
function formatPrice(
  minorStr: string,
  symbol: string,
  minorUnit: number,
): string {
  const value = parseInt(minorStr, 10) / Math.pow(10, minorUnit);
  if (isNaN(value)) return minorStr;
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: minorUnit > 0 ? 2 : 0,
    maximumFractionDigits: minorUnit > 0 ? 2 : 0,
  })}`;
}

/** Formats a decimal shipping amount (e.g. "370.00") with the cart's currency symbol. */
function formatShippingPrice(amount: string, symbol: string): string {
  const value = parseFloat(amount);
  if (isNaN(value) || value === 0) return "Free";
  return `${symbol}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatAddressSummary(a: ContactAddress): string {
  return [
    [a.firstName, a.lastName].filter(Boolean).join(" "),
    a.company,
    a.address1,
    a.address2,
    [a.city, a.province, a.zip].filter(Boolean).join(", "),
    a.country,
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const heading: CSSProperties = {
  fontFamily: "'DM Serif Display', serif",
  fontSize: "16px",
  fontWeight: 400,
  color: "#1c1c1a",
  margin: "0 0 18px 0",
};

const subHeading: CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  margin: "0 0 10px 0",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  marginBottom: "5px",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1.5px solid #e8e6e0",
  borderRadius: "9px",
  fontFamily: "inherit",
  fontSize: "13px",
  color: "#1c1c1a",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const fieldError: CSSProperties = {
  ...fieldStyle,
  borderColor: "#e05c5c",
};

const fieldGroup: CSSProperties = { marginBottom: "12px" };

const halfGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "10px",
};

const continueBtnStyle = (disabled: boolean): CSSProperties => ({
  width: "100%",
  padding: "12px",
  background: disabled ? "#ccc" : "#1c1c1a",
  color: "#fff",
  border: "none",
  borderRadius: "11px",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.65 : 1,
  transition: "opacity 0.2s, background 0.2s",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
});

const pillBox: CSSProperties = {
  padding: "12px 14px",
  background: "#f5f4f1",
  borderRadius: "11px",
  marginBottom: "14px",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "10px",
};

const editBtnStyle: CSSProperties = {
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "30px",
  height: "30px",
  background: "#fff",
  border: "1.5px solid #e8e6e0",
  borderRadius: "8px",
  cursor: "pointer",
  color: "#555",
  marginTop: "2px",
};

const divider: CSSProperties = {
  height: "1px",
  background: "#e8e6e0",
  margin: "18px 0",
};

const inlineErrorStyle: CSSProperties = {
  fontSize: "12px",
  color: "#e05c5c",
  marginTop: "4px",
};

// ─── Validation ───────────────────────────────────────────────────────────────

interface ValidationErrors {
  email?: string;
  firstName?: string;
  lastName?: string;
  address1?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
}

/** Validates the contact section: email (required), firstName and lastName (required). */
function validateContact(a: ContactAddress): Partial<ValidationErrors> {
  const errors: Partial<ValidationErrors> = {};
  if (!a.email.trim()) {
    errors.email = "Email is required";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) {
    errors.email = "Enter a valid email address";
  }
  if (!a.firstName.trim()) errors.firstName = "First name is required";
  if (!a.lastName.trim()) errors.lastName = "Last name is required";
  return errors;
}

/** Validates the physical address fields. */
function validateAddress(a: ContactAddress): Partial<ValidationErrors> {
  const errors: Partial<ValidationErrors> = {};
  if (!a.address1.trim()) errors.address1 = "Address is required";
  if (!a.city.trim()) errors.city = "City is required";
  if (!a.province.trim()) errors.province = "State / province is required";
  if (!a.zip.trim()) errors.zip = "ZIP / postal code is required";
  if (!a.country.trim()) errors.country = "Country code is required";
  return errors;
}

// ─── ShippingAddressStep ──────────────────────────────────────────────────────

interface ShippingAddressStepProps {
  address: ContactAddress;
  onChange: React.Dispatch<React.SetStateAction<ContactAddress>>;
  savedAddresses: SavedAddress[];
  savedAddressesLoading: boolean;
  /** Live from the Storefront API — empty while loading or on fetch failure,
   *  in which case the country field falls back to plain text. */
  availableCountries: AvailableCountry[];
  isLoading: boolean;
  onContinue: () => void;
}

function ShippingAddressStep({
  address,
  onChange,
  savedAddresses,
  savedAddressesLoading,
  availableCountries,
  isLoading,
  onContinue,
}: ShippingAddressStepProps) {
  const [selectedSavedId, setSelectedSavedId] = useState<string | null>(
    () =>
      savedAddresses.find((a) => a.isDefault)?.id ??
      savedAddresses[0]?.id ??
      null,
  );
  const [showNewForm, setShowNewForm] = useState(savedAddresses.length === 0);
  const [touched, setTouched] = useState<
    Partial<Record<keyof ContactAddress, true>>
  >({});
  const [submitted, setSubmitted] = useState(false);

  // When saved addresses first arrive (async), switch to the picker view and
  // select the default so the user sees their addresses rather than a blank form.
  const didInitSaved = useRef(false);
  useEffect(() => {
    if (
      !savedAddressesLoading &&
      savedAddresses.length > 0 &&
      !didInitSaved.current
    ) {
      didInitSaved.current = true;
      const defaultOrFirst =
        savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
      setSelectedSavedId(defaultOrFirst.id);
      setShowNewForm(false);
    }
  }, [savedAddressesLoading, savedAddresses]);

  function field(key: keyof ContactAddress) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function touch(key: keyof ContactAddress) {
    return () => setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function shouldShowError(key: keyof ValidationErrors): boolean {
    return submitted || !!touched[key];
  }

  const contactErrors = validateContact(address);
  const addressErrors =
    showNewForm || savedAddresses.length === 0 ? validateAddress(address) : {};
  const allErrors: ValidationErrors = { ...contactErrors, ...addressErrors };

  const inputStyle = (key: keyof ValidationErrors): CSSProperties =>
    shouldShowError(key) && allErrors[key] ? fieldError : fieldStyle;

  function handleContinue() {
    setSubmitted(true);
    if (Object.keys(allErrors).length > 0) return;
    onContinue();
  }

  function selectSaved(saved: SavedAddress) {
    setSelectedSavedId(saved.id);
    // Merge into existing address to preserve the email/phone the user typed.
    onChange((prev) => ({
      ...saved.address,
      email: prev.email,
      phone: prev.phone,
    }));
  }

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Contact & Delivery</h3>

      {/* ── Contact ── */}
      <p style={subHeading as CSSProperties}>Contact</p>

      <div style={fieldGroup}>
        <label style={labelStyle}>Email *</label>
        <input
          type="email"
          value={address.email}
          onChange={field("email")}
          onBlur={touch("email")}
          placeholder="you@example.com"
          style={inputStyle("email")}
          autoComplete="email"
        />
        {shouldShowError("email") && allErrors.email && (
          <p style={inlineErrorStyle}>{allErrors.email}</p>
        )}
      </div>

      <div style={{ ...halfGrid, marginBottom: "12px" }}>
        <div>
          <label style={labelStyle}>First name *</label>
          <input
            type="text"
            value={address.firstName}
            onChange={field("firstName")}
            onBlur={touch("firstName")}
            placeholder="First name"
            style={inputStyle("firstName")}
            autoComplete="given-name"
          />
          {shouldShowError("firstName") && allErrors.firstName && (
            <p style={inlineErrorStyle}>{allErrors.firstName}</p>
          )}
        </div>
        <div>
          <label style={labelStyle}>Last name *</label>
          <input
            type="text"
            value={address.lastName}
            onChange={field("lastName")}
            onBlur={touch("lastName")}
            placeholder="Last name"
            style={inputStyle("lastName")}
            autoComplete="family-name"
          />
          {shouldShowError("lastName") && allErrors.lastName && (
            <p style={inlineErrorStyle}>{allErrors.lastName}</p>
          )}
        </div>
      </div>

      <div style={fieldGroup}>
        <label style={labelStyle}>Phone</label>
        <input
          type="tel"
          value={address.phone}
          onChange={field("phone")}
          placeholder="+91 99999 99999"
          style={fieldStyle}
          autoComplete="tel"
        />
      </div>

      <div style={divider} />

      {/* ── Delivery address ── */}
      <p style={subHeading as CSSProperties}>Delivery address</p>

      {/* Loading state */}
      {savedAddressesLoading && (
        <p style={{ fontSize: "13px", color: "#888", marginBottom: "16px" }}>
          Loading saved addresses…
        </p>
      )}

      {/* Saved address picker */}
      {!savedAddressesLoading && savedAddresses.length > 0 && !showNewForm && (
        <>
          {savedAddresses.map((saved) => {
            const isSelected = selectedSavedId === saved.id;
            return (
              <label
                key={saved.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  padding: "10px 12px",
                  border: `1.5px solid ${isSelected ? "#1c1c1a" : "#e8e6e0"}`,
                  borderRadius: "11px",
                  marginBottom: "8px",
                  cursor: "pointer",
                  background: isSelected ? "#f5f4f1" : "#fff",
                  transition: "border-color 0.15s, background 0.15s",
                  boxSizing: "border-box",
                  width: "100%",
                }}
              >
                <input
                  type="radio"
                  name="saved_address"
                  checked={isSelected}
                  onChange={() => selectSaved(saved)}
                  style={{
                    marginTop: "3px",
                    accentColor: "#1c1c1a",
                    flexShrink: 0,
                  }}
                />

                {/* Label */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#1c1c1a",
                        display: "block",
                      }}
                    >
                      {saved.label}
                    </span>
                    {saved.isDefault && (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 6px",
                          background: "#f5f4f1",
                          color: "#888",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 600,
                          letterSpacing: "0.04em",
                        }}
                      >
                        Default
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#888",
                      display: "block",
                      marginTop: "2px",
                    }}
                  >
                    {[saved.address.city, saved.address.country]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              </label>
            );
          })}

          {/* "Use a different address" dashed button */}
          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            style={{
              width: "100%",
              padding: "10px 14px",
              border: "1.5px dashed #c8c6c0",
              borderRadius: "11px",
              background: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              color: "#1c1c1a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              fontFamily: "inherit",
              marginTop: "4px",
              marginBottom: "4px",
            }}
          >
            <FiPlus size={14} />
            Use a different address
          </button>
        </>
      )}

      {/* Inline new-address form */}
      {!savedAddressesLoading &&
        (savedAddresses.length === 0 || showNewForm) && (
          <>
            {/* Back link — only when there are saved addresses to return to */}
            {showNewForm && savedAddresses.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewForm(false)}
                style={{
                  background: "none",
                  border: "none",
                  padding: "0 0 14px 0",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "#888",
                  fontFamily: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                ← Back to saved addresses
              </button>
            )}

            <div style={fieldGroup}>
              <label style={labelStyle}>Company</label>
              <input
                type="text"
                value={address.company}
                onChange={field("company")}
                placeholder="Company (optional)"
                style={fieldStyle}
                autoComplete="organization"
              />
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Address line 1 *</label>
              <input
                type="text"
                value={address.address1}
                onChange={field("address1")}
                onBlur={touch("address1")}
                placeholder="Street address, house number"
                style={inputStyle("address1")}
                autoComplete="address-line1"
              />
              {shouldShowError("address1") && allErrors.address1 && (
                <p style={inlineErrorStyle}>{allErrors.address1}</p>
              )}
            </div>

            <div style={fieldGroup}>
              <label style={labelStyle}>Address line 2</label>
              <input
                type="text"
                value={address.address2}
                onChange={field("address2")}
                placeholder="Apartment, floor, suite (optional)"
                style={fieldStyle}
                autoComplete="address-line2"
              />
            </div>

            <div style={{ ...halfGrid, marginBottom: "12px" }}>
              <div>
                <label style={labelStyle}>City *</label>
                <input
                  type="text"
                  value={address.city}
                  onChange={field("city")}
                  onBlur={touch("city")}
                  placeholder="City"
                  style={inputStyle("city")}
                  autoComplete="address-level2"
                />
                {shouldShowError("city") && allErrors.city && (
                  <p style={inlineErrorStyle}>{allErrors.city}</p>
                )}
              </div>
              <div>
                <label style={labelStyle}>State / Province *</label>
                <input
                  type="text"
                  value={address.province}
                  onChange={field("province")}
                  onBlur={touch("province")}
                  placeholder="e.g. Maharashtra"
                  style={inputStyle("province")}
                  autoComplete="address-level1"
                />
                {shouldShowError("province") && allErrors.province && (
                  <p style={inlineErrorStyle}>{allErrors.province}</p>
                )}
              </div>
            </div>

            <div style={{ ...halfGrid, marginBottom: "20px" }}>
              <div>
                <label style={labelStyle}>ZIP / Postal code *</label>
                <input
                  type="text"
                  value={address.zip}
                  onChange={field("zip")}
                  onBlur={touch("zip")}
                  placeholder="400001"
                  style={inputStyle("zip")}
                  autoComplete="postal-code"
                />
                {shouldShowError("zip") && allErrors.zip && (
                  <p style={inlineErrorStyle}>{allErrors.zip}</p>
                )}
              </div>
              <div>
                <label style={labelStyle}>Country *</label>
                {availableCountries.length > 0 ? (
                  <select
                    value={address.country}
                    onChange={field("country")}
                    onBlur={touch("country")}
                    style={inputStyle("country")}
                    autoComplete="country"
                  >
                    {/* The shop's own active country may not always be in
                        availableCountries (e.g. a saved address from a
                        country the shop no longer serves) — keep it
                        selectable rather than silently swapping it out from
                        under the shopper. */}
                    {!availableCountries.some(
                      (c) => c.isoCode === address.country,
                    ) &&
                      address.country && (
                        <option value={address.country}>
                          {address.country}
                        </option>
                      )}
                    {availableCountries.map((c) => (
                      <option key={c.isoCode} value={c.isoCode}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  // Fetch still loading, or failed — same plain text field
                  // this always was, so checkout is never blocked on it.
                  <input
                    type="text"
                    value={address.country}
                    onChange={field("country")}
                    onBlur={touch("country")}
                    placeholder="IN"
                    maxLength={2}
                    style={{
                      ...inputStyle("country"),
                      textTransform: "uppercase",
                    }}
                    autoComplete="country"
                  />
                )}
                {shouldShowError("country") && allErrors.country && (
                  <p style={inlineErrorStyle}>{allErrors.country}</p>
                )}
              </div>
            </div>
          </>
        )}

      <button
        type="button"
        disabled={isLoading}
        onClick={handleContinue}
        style={continueBtnStyle(isLoading)}
      >
        {isLoading ? "Saving…" : "Continue to Delivery →"}
      </button>
    </div>
  );
}

// ─── Retired steps ────────────────────────────────────────────────────────────
// The delivery-rate step (ShippingStep) and the billing-address step
// (BillingStep) were removed with the review-and-redirect flow:
//   • Delivery rates require a Storefront cart; the widget shares the theme's
//     Ajax session cart, so the step could only ever render empty.
//   • Billing is collected by Shopify at payment time; asking for it here made
//     the shopper enter it twice.
// Both live in git history if a future Storefront-backed flow needs them.

// ─── ReviewStep ───────────────────────────────────────────────────────────────

interface ReviewStepProps {
  address: ContactAddress;
  checkoutUrl: string;
  isLoading: boolean;
  error: string | null;
  selectedDeliveryOption: DeliveryOption | null;
  currencySymbol: string;
  onEdit: () => void;
  onEditShipping: () => void;
  onConfirm: () => void;
}

function ReviewStep({
  address,
  checkoutUrl,
  isLoading,
  error,
  selectedDeliveryOption,
  currencySymbol,
  onEdit,
  onEditShipping,
  onConfirm,
}: ReviewStepProps) {
  const summary = formatAddressSummary(address);

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Review your order</h3>

      {/* ── Delivery address pill ── */}
      <p style={subHeading as CSSProperties}>Delivering to</p>
      <div style={pillBox}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {address.email && (
            <p style={{ fontSize: "12px", color: "#888", margin: "0 0 4px" }}>
              {address.email}
            </p>
          )}
          <p
            style={{
              fontSize: "13px",
              color: "#1c1c1a",
              margin: 0,
              whiteSpace: "pre-line",
              lineHeight: 1.6,
            }}
          >
            {summary}
          </p>
        </div>
        <button
          type="button"
          title="Edit contact & address"
          onClick={onEdit}
          style={editBtnStyle}
        >
          <FiEdit2 size={13} />
        </button>
      </div>

      {/* ── Selected shipping method pill ── */}
      {selectedDeliveryOption && (
        <>
          <p style={subHeading as CSSProperties}>Shipping method</p>
          <div style={pillBox}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1c1c1a",
                  margin: "0 0 2px",
                }}
              >
                {selectedDeliveryOption.title}
              </p>
              {selectedDeliveryOption.description && (
                <p style={{ fontSize: "12px", color: "#888", margin: 0 }}>
                  {selectedDeliveryOption.description}
                </p>
              )}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexShrink: 0,
                marginTop: "2px",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1c1c1a",
                }}
              >
                {formatShippingPrice(
                  selectedDeliveryOption.amount,
                  currencySymbol,
                )}
              </span>
              <button
                type="button"
                title="Edit shipping method"
                onClick={onEditShipping}
                style={editBtnStyle}
              >
                <FiEdit2 size={13} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── What happens next ── */}
      {/* Billing address, delivery rates and taxes are collected and
          calculated on Shopify's checkout — we must not imply otherwise, and
          the cart total above is a subtotal. */}
      <p style={subHeading as CSSProperties}>Next: delivery &amp; payment</p>
      <div style={pillBox}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: "13px",
              color: "#1c1c1a",
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Delivery options, taxes and billing details are confirmed on the
            next page. Your total may change once shipping is calculated.
          </p>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          style={{
            padding: "10px 12px",
            background: "#fff0f0",
            border: "1.5px solid #e05c5c",
            borderRadius: "9px",
            fontSize: "13px",
            color: "#c0392b",
            marginBottom: "14px",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Payment note ── */}
      <p
        style={{
          fontSize: "12px",
          color: "#888",
          lineHeight: 1.6,
          margin: "0 0 18px",
        }}
      >
        Payment will be completed securely on Shopify&rsquo;s checkout page.
      </p>

      <button
        type="button"
        disabled={isLoading || !checkoutUrl}
        onClick={onConfirm}
        style={continueBtnStyle(isLoading || !checkoutUrl)}
      >
        <FiExternalLink size={14} />
        {isLoading ? "Opening checkout…" : "Proceed to Checkout"}
      </button>
    </div>
  );
}

// ─── RedirectingStep ──────────────────────────────────────────────────────────

function RedirectingStep({
  checkoutUrl,
  onClose,
}: {
  checkoutUrl: string;
  onClose: () => void;
}) {
  return (
    <div style={{ padding: "32px 20px", textAlign: "center" }}>
      <div
        style={{
          width: "44px",
          height: "44px",
          background: "#f5f4f1",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 14px",
        }}
      >
        <FiExternalLink size={20} color="#1c1c1a" />
      </div>
      <p
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: "16px",
          fontWeight: 400,
          color: "#1c1c1a",
          margin: "0 0 8px",
        }}
      >
        Opening Shopify checkout…
      </p>
      <p style={{ fontSize: "12px", color: "#888", margin: "0 0 20px" }}>
        A new tab should have opened.{" "}
        {checkoutUrl && (
          <a
            href={checkoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#1c1c1a", fontWeight: 600 }}
          >
            Click here
          </a>
        )}{" "}
        if it didn&rsquo;t.
      </p>
      <button type="button" onClick={onClose} style={continueBtnStyle(false)}>
        Done
      </button>
    </div>
  );
}

// ─── ShopifyCheckoutPanel ─────────────────────────────────────────────────────

export function ShopifyCheckoutPanel({
  cart,
  onClose,
  isExpanded,
  onToggleExpand,
  shopDomain,
  storefrontToken,
  customerEmail,
  customerName,
  customerId,
  apiUrl,
}: ShopifyCheckoutPanelProps) {
  // Split "First Last" into firstName / lastName for address pre-fill.
  const [initialFirstName, initialLastName] = useMemo(() => {
    if (!customerName?.trim()) return ["", ""] as const;
    const parts = customerName.trim().split(/\s+/);
    return [parts[0] ?? "", parts.slice(1).join(" ")] as const;
  }, [customerName]);

  const checkout = useCheckout(shopDomain, storefrontToken, {
    email: customerEmail,
    firstName: initialFirstName,
    lastName: initialLastName,
    customerId,
    apiUrl,
  });

  // checkoutUrl is added to PlatformCart by useCart (Shopify) at runtime.
  const checkoutUrl = (cart as ShopifyPlatformCart | null)?.checkoutUrl ?? "";

  const activeIndex = stepToIndex(checkout.step);
  const symbol = cart?.totals.currency_symbol ?? "₹";
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;

  // Shipping cost in minor units for the total calculation.
  const shippingMinor = checkout.selectedDeliveryOption
    ? Math.round(parseFloat(checkout.selectedDeliveryOption.amount) * 100)
    : 0;
  const totalWithShipping =
    cart && shippingMinor > 0
      ? (parseInt(cart.totals.total_price, 10) + shippingMinor).toString()
      : (cart?.totals.total_price ?? "0");

  // Allow clicking back to a completed step.
  function handleStepClick(targetIndex: number) {
    if (targetIndex >= activeIndex) return;
    const key = STEPS[targetIndex].key as VisibleStepKey;
    checkout.setStep(key);
  }

  // ── Step rendering ──────────────────────────────────────────────────────
  function renderActiveStep() {
    if (checkout.step === "redirecting") {
      return <RedirectingStep checkoutUrl={checkoutUrl} onClose={onClose} />;
    }

    switch (checkout.step) {
      case "collecting_shipping":
        return (
          <ShippingAddressStep
            address={checkout.address}
            onChange={checkout.setAddress}
            savedAddresses={checkout.savedAddresses}
            savedAddressesLoading={checkout.savedAddressesLoading}
            availableCountries={checkout.availableCountries}
            isLoading={checkout.isLoading}
            onContinue={() => checkout.setStep("review")}
          />
        );

      // "selecting_shipping" (delivery rates) and "collecting_billing" are
      // retired — Shopify's checkout owns both. stepToIndex maps them back to
      // Shipping, and nothing sets them, so they cannot be reached.

      case "review":
      case "error":
        return (
          <ReviewStep
            address={checkout.address}
            checkoutUrl={checkoutUrl}
            isLoading={checkout.isLoading}
            error={checkout.step === "error" ? checkout.error : null}
            selectedDeliveryOption={checkout.selectedDeliveryOption}
            currencySymbol={symbol}
            onEdit={() => checkout.setStep("collecting_shipping")}
            // Delivery and billing are chosen on Shopify's checkout, so both
            // "edit" affordances point back to the one step we own.
            onEditShipping={() => checkout.setStep("collecting_shipping")}
            onConfirm={() => checkout.prefillAndRedirect(checkoutUrl)}
          />
        );

      default:
        return null;
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="miraq-checkout-panel">
      {/* Header */}
      <div className="miraq-checkout-header">
        <div className="miraq-checkout-title">
          <FiPackage size={16} color="#1c1c1a" />
          <span className="miraq-checkout-title-text">Checkout</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {onToggleExpand && (
            <button
              className="miraq-checkout-close"
              onClick={onToggleExpand}
              aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
            >
              {isExpanded ? (
                <FiMinimize2 size={16} />
              ) : (
                <FiMaximize2 size={16} />
              )}
            </button>
          )}
          <button
            className="miraq-checkout-close"
            onClick={() => {
              if (checkout.step === "redirecting") checkout.reset();
              onClose();
            }}
            aria-label="Close checkout"
          >
            <FiX size={16} />
          </button>
        </div>
      </div>

      {/* Step progress — hidden during redirect */}
      {checkout.step !== "redirecting" && (
        <div className="miraq-checkout-steps">
          {STEPS.map((s, i) => {
            const isActive = i === activeIndex;
            const isCompleted = i < activeIndex;
            return (
              <button
                key={s.label}
                type="button"
                className={`miraq-checkout-step ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                onClick={() => handleStepClick(i)}
                disabled={!isCompleted}
                aria-current={isActive ? "step" : undefined}
              >
                <span className="miraq-checkout-step-dot">
                  {isCompleted ? "✓" : i + 1}
                </span>
                <span className="miraq-checkout-step-label">{s.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="miraq-checkout-body">{renderActiveStep()}</div>

      {/* Order summary footer — hidden during redirect */}
      {cart && cart.items_count > 0 && checkout.step !== "redirecting" && (
        <div className="miraq-checkout-summary">
          <p className="miraq-checkout-summary-title">Order Summary</p>
          <div className="miraq-checkout-summary-divider" />

          {cart.items.map((item) => (
            <div key={item.key} className="miraq-checkout-summary-row">
              <span className="miraq-checkout-summary-item">
                {item.quantity} × {item.name}
              </span>
              <span>
                {formatPrice(item.totals.line_total, symbol, minorUnit)}
              </span>
            </div>
          ))}

          <div
            className="miraq-checkout-summary-divider"
            style={{ margin: "8px 0" }}
          />

          <div className="miraq-checkout-summary-row">
            <span>Subtotal</span>
            <span>
              {formatPrice(cart.totals.total_items, symbol, minorUnit)}
            </span>
          </div>

          {checkout.selectedDeliveryOption && (
            <div className="miraq-checkout-summary-row">
              <span>Shipping</span>
              <span>
                {formatShippingPrice(
                  checkout.selectedDeliveryOption.amount,
                  symbol,
                )}
              </span>
            </div>
          )}

          {parseInt(cart.totals.total_tax, 10) > 0 && (
            <div className="miraq-checkout-summary-row">
              <span>Tax</span>
              <span>
                {formatPrice(cart.totals.total_tax, symbol, minorUnit)}
              </span>
            </div>
          )}

          <div className="miraq-checkout-summary-row miraq-checkout-summary-total">
            <span>Total</span>
            <span>{formatPrice(totalWithShipping, symbol, minorUnit)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
