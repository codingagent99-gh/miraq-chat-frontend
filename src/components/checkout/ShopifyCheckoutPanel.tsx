/**
 * components/checkout/ShopifyCheckoutPanel.tsx
 *
 * Four-step in-widget checkout panel for the Shopify platform.
 *
 * Step 1 — "Shipping":  contact info + delivery address. When a
 *                        customerAccessToken is supplied, saved Shopify
 *                        addresses are offered as selectable cards; the
 *                        default is pre-filled automatically.
 * Step 2 — "Delivery":  delivery options fetched from the Storefront API;
 *                        selection locked via cartSelectedDeliveryOptionsUpdate.
 * Step 3 — "Payment":   billing address — either same as shipping or a
 *                        separate address whose fields are appended to the
 *                        Shopify checkout URL as pre-fill params.
 * Step 4 — "Review":    full order summary, then cartBuyerIdentityUpdate →
 *                        open checkoutUrl in a new tab.
 *
 * Payment is handled on Shopify's hosted checkout.
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
  DeliveryGroup,
  DeliveryOption,
  SavedAddress,
  BillingOption,
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

const STEPS = [
  { label: "Shipping", key: "collecting_shipping" },
  { label: "Delivery", key: "selecting_shipping" },
  { label: "Payment", key: "collecting_billing" },
  { label: "Review", key: "review" },
] as const;

type VisibleStepKey = (typeof STEPS)[number]["key"];

function stepToIndex(key: string): number {
  const map: Record<string, number> = {
    collecting_shipping: 0,
    selecting_shipping: 1,
    collecting_billing: 2,
    review: 3,
    redirecting: 3,
    error: 3,
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

/**
 * Builds a compact single-line label from a ContactAddress.
 * Used for saved-address card labels and the billing "same as shipping" summary.
 */
function buildSavedAddressLabel(a: ContactAddress): string {
  return [
    [a.firstName, a.lastName].filter(Boolean).join(" "),
    a.address1,
    [a.city, a.province, a.zip].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
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

const backBtnStyle: CSSProperties = {
  padding: "12px 16px",
  background: "transparent",
  color: "#555",
  border: "1.5px solid #e8e6e0",
  borderRadius: "11px",
  fontFamily: "inherit",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  cursor: "pointer",
  flexShrink: 0,
};

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
  isLoading: boolean;
  onContinue: () => void;
}

function ShippingAddressStep({
  address,
  onChange,
  savedAddresses,
  savedAddressesLoading,
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
    return (e: React.ChangeEvent<HTMLInputElement>) =>
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
                <label style={labelStyle}>Country code *</label>
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

// ─── ShippingStep ─────────────────────────────────────────────────────────────

interface ShippingStepProps {
  deliveryGroups: DeliveryGroup[];
  isLoading: boolean;
  error: string | null;
  currencySymbol: string;
  onFetch: () => Promise<void>;
  onSelect: (groupId: string, handle: string) => Promise<void>;
  onContinue: () => void;
  onBack: () => void;
}

function ShippingStep({
  deliveryGroups,
  isLoading,
  error,
  currencySymbol,
  onFetch,
  onSelect,
  onContinue,
  onBack,
}: ShippingStepProps) {
  // Fetch on mount — buyer identity was already set in the hook before we query.
  useEffect(() => {
    onFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select the only option when a group has exactly one choice.
  useEffect(() => {
    if (isLoading) return;
    for (const group of deliveryGroups) {
      if (group.options.length === 1 && group.selectedHandle === null) {
        onSelect(group.id, group.options[0].handle);
      }
    }
  }, [deliveryGroups, isLoading, onSelect]);

  const hasGroups = deliveryGroups.length > 0;
  const allGroupsSelected = deliveryGroups.every(
    (g) => g.options.length === 0 || g.selectedHandle !== null,
  );
  const canContinue = !isLoading && (!hasGroups || allGroupsSelected);

  // Loading skeleton — only shown while fetching and no groups have loaded yet.
  if (isLoading && !hasGroups) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center" }}>
        <p style={{ fontSize: "13px", color: "#888" }}>
          Loading shipping options…
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Choose shipping</h3>

      {/* Fallback when no options are available */}
      {!hasGroups && (
        <p
          style={{
            fontSize: "13px",
            color: "#888",
            lineHeight: 1.6,
            marginBottom: "20px",
          }}
        >
          {error
            ? "Couldn't load shipping options — you'll be able to choose on Shopify's checkout page."
            : "No shipping options available. You can select one at checkout."}
        </p>
      )}

      {/* Rate cards */}
      {deliveryGroups.map((group) => (
        <div key={group.id} style={{ marginBottom: "8px" }}>
          {group.options.map((opt) => {
            const isSelected = group.selectedHandle === opt.handle;
            return (
              <button
                key={opt.handle}
                type="button"
                onClick={() => onSelect(group.id, opt.handle)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  border: `1.5px solid ${isSelected ? "#1c1c1a" : "#e8e6e0"}`,
                  borderRadius: "11px",
                  marginBottom: "8px",
                  cursor: "pointer",
                  background: isSelected ? "#f5f4f1" : "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "10px",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  {/* Radio indicator */}
                  <div
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      border: `2px solid ${isSelected ? "#1c1c1a" : "#ccc"}`,
                      background: isSelected ? "#1c1c1a" : "transparent",
                      flexShrink: 0,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  />
                  <div>
                    <p
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#1c1c1a",
                        margin: 0,
                      }}
                    >
                      {opt.title}
                    </p>
                    {opt.description && (
                      <p
                        style={{
                          fontSize: "11px",
                          color: "#888",
                          margin: "2px 0 0",
                        }}
                      >
                        {opt.description}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#1c1c1a",
                    flexShrink: 0,
                  }}
                >
                  {formatShippingPrice(opt.amount, currencySymbol)}
                </span>
              </button>
            );
          })}
        </div>
      ))}

      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        <button type="button" onClick={onBack} style={backBtnStyle}>
          ← Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          style={{ ...continueBtnStyle(!canContinue), flex: 1 }}
        >
          Continue to Payment →
        </button>
      </div>
    </div>
  );
}

// ─── BillingStep ──────────────────────────────────────────────────────────────

interface BillingStepProps {
  shippingAddress: ContactAddress;
  billingOption: BillingOption;
  billingAddress: ContactAddress;
  onBillingOptionChange: (opt: BillingOption) => void;
  onBillingAddressChange: React.Dispatch<React.SetStateAction<ContactAddress>>;
  isLoading: boolean;
  onBack: () => void;
  onContinue: () => void;
}

function BillingStep({
  shippingAddress,
  billingOption,
  billingAddress,
  onBillingOptionChange,
  onBillingAddressChange,
  isLoading,
  onBack,
  onContinue,
}: BillingStepProps) {
  const [touched, setTouched] = useState<
    Partial<Record<keyof ContactAddress, true>>
  >({});
  const [submitted, setSubmitted] = useState(false);

  const billingErrors =
    billingOption === "different" ? validateAddress(billingAddress) : {};

  function fieldB(key: keyof ContactAddress) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      onBillingAddressChange((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function touch(key: keyof ContactAddress) {
    return () => setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function shouldShowError(key: keyof ValidationErrors): boolean {
    return submitted || !!touched[key];
  }

  const inputStyle = (key: keyof ValidationErrors): CSSProperties =>
    shouldShowError(key) && billingErrors[key] ? fieldError : fieldStyle;

  function handleContinue() {
    setSubmitted(true);
    if (Object.keys(billingErrors).length > 0) return;
    onContinue();
  }

  const shippingSummary = buildSavedAddressLabel(shippingAddress);

  const optionCards: {
    value: BillingOption;
    label: string;
    description: string;
  }[] = [
    {
      value: "same_as_shipping",
      label: "Same as shipping address",
      description: shippingSummary || "Your shipping address",
    },
    {
      value: "different",
      label: "Use a different billing address",
      description: "Enter a separate billing address",
    },
  ];

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Billing address</h3>

      {/* Option cards */}
      {optionCards.map((opt) => {
        const isSelected = billingOption === opt.value;
        return (
          <label
            key={opt.value}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "10px 12px",
              border: `1.5px solid ${isSelected ? "#1c1c1a" : "#e8e6e0"}`,
              borderRadius: "11px",
              background: isSelected ? "#f5f4f1" : "#fff",
              cursor: "pointer",
              marginBottom: "8px",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <input
              type="radio"
              name="billing_option"
              checked={isSelected}
              onChange={() => onBillingOptionChange(opt.value)}
              style={{
                marginTop: "3px",
                accentColor: "#1c1c1a",
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1c1c1a",
                  display: "block",
                }}
              >
                {opt.label}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color: "#888",
                  display: "block",
                  marginTop: "2px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.description}
              </span>
            </div>
          </label>
        );
      })}

      {/* Inline billing address form */}
      {billingOption === "different" && (
        <div style={{ marginTop: "14px" }}>
          <div style={fieldGroup}>
            <label style={labelStyle}>Company</label>
            <input
              type="text"
              value={billingAddress.company}
              onChange={fieldB("company")}
              placeholder="Company (optional)"
              style={fieldStyle}
              autoComplete="billing organization"
            />
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle}>Address line 1 *</label>
            <input
              type="text"
              value={billingAddress.address1}
              onChange={fieldB("address1")}
              onBlur={touch("address1")}
              placeholder="Street address, house number"
              style={inputStyle("address1")}
              autoComplete="billing address-line1"
            />
            {shouldShowError("address1") && billingErrors.address1 && (
              <p style={inlineErrorStyle}>{billingErrors.address1}</p>
            )}
          </div>

          <div style={fieldGroup}>
            <label style={labelStyle}>Address line 2</label>
            <input
              type="text"
              value={billingAddress.address2}
              onChange={fieldB("address2")}
              placeholder="Apartment, floor, suite (optional)"
              style={fieldStyle}
              autoComplete="billing address-line2"
            />
          </div>

          <div style={{ ...halfGrid, marginBottom: "12px" }}>
            <div>
              <label style={labelStyle}>City *</label>
              <input
                type="text"
                value={billingAddress.city}
                onChange={fieldB("city")}
                onBlur={touch("city")}
                placeholder="City"
                style={inputStyle("city")}
                autoComplete="billing address-level2"
              />
              {shouldShowError("city") && billingErrors.city && (
                <p style={inlineErrorStyle}>{billingErrors.city}</p>
              )}
            </div>
            <div>
              <label style={labelStyle}>State / Province *</label>
              <input
                type="text"
                value={billingAddress.province}
                onChange={fieldB("province")}
                onBlur={touch("province")}
                placeholder="e.g. Maharashtra"
                style={inputStyle("province")}
                autoComplete="billing address-level1"
              />
              {shouldShowError("province") && billingErrors.province && (
                <p style={inlineErrorStyle}>{billingErrors.province}</p>
              )}
            </div>
          </div>

          <div style={{ ...halfGrid, marginBottom: "12px" }}>
            <div>
              <label style={labelStyle}>ZIP / Postal code *</label>
              <input
                type="text"
                value={billingAddress.zip}
                onChange={fieldB("zip")}
                onBlur={touch("zip")}
                placeholder="400001"
                style={inputStyle("zip")}
                autoComplete="billing postal-code"
              />
              {shouldShowError("zip") && billingErrors.zip && (
                <p style={inlineErrorStyle}>{billingErrors.zip}</p>
              )}
            </div>
            <div>
              <label style={labelStyle}>Country code *</label>
              <input
                type="text"
                value={billingAddress.country}
                onChange={fieldB("country")}
                onBlur={touch("country")}
                placeholder="IN"
                maxLength={2}
                style={{
                  ...inputStyle("country"),
                  textTransform: "uppercase",
                }}
                autoComplete="billing country"
              />
              {shouldShowError("country") && billingErrors.country && (
                <p style={inlineErrorStyle}>{billingErrors.country}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
        <button type="button" onClick={onBack} style={backBtnStyle}>
          ← Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={isLoading}
          style={{ ...continueBtnStyle(isLoading), flex: 1 }}
        >
          Continue to Review →
        </button>
      </div>
    </div>
  );
}

// ─── ReviewStep ───────────────────────────────────────────────────────────────

interface ReviewStepProps {
  address: ContactAddress;
  checkoutUrl: string;
  isLoading: boolean;
  error: string | null;
  selectedDeliveryOption: DeliveryOption | null;
  currencySymbol: string;
  billingOption: BillingOption;
  billingAddress: ContactAddress;
  onEdit: () => void;
  onEditShipping: () => void;
  onEditBilling: () => void;
  onConfirm: () => void;
}

function ReviewStep({
  address,
  checkoutUrl,
  isLoading,
  error,
  selectedDeliveryOption,
  currencySymbol,
  billingOption,
  billingAddress,
  onEdit,
  onEditShipping,
  onEditBilling,
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

      {/* ── Billing address pill ── */}
      <p style={subHeading as CSSProperties}>Billing address</p>
      <div style={pillBox}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {billingOption === "same_as_shipping" ? (
            <p style={{ fontSize: "13px", color: "#1c1c1a", margin: 0 }}>
              Same as shipping address
            </p>
          ) : (
            <p
              style={{
                fontSize: "13px",
                color: "#1c1c1a",
                margin: 0,
                whiteSpace: "pre-line",
                lineHeight: 1.6,
              }}
            >
              {formatAddressSummary(billingAddress)}
            </p>
          )}
        </div>
        {billingOption === "different" && (
          <button
            type="button"
            title="Edit billing address"
            onClick={onEditBilling}
            style={editBtnStyle}
          >
            <FiEdit2 size={13} />
          </button>
        )}
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
            isLoading={checkout.isLoading}
            onContinue={() => checkout.setStep("selecting_shipping")}
          />
        );

      case "selecting_shipping":
        return (
          <ShippingStep
            deliveryGroups={checkout.deliveryGroups}
            isLoading={checkout.isLoading}
            error={checkout.error}
            currencySymbol={symbol}
            onFetch={checkout.fetchDeliveryOptions}
            onSelect={checkout.selectDeliveryOption}
            onContinue={() => {
              checkout.clearError();
              checkout.setStep("collecting_billing");
            }}
            onBack={() => checkout.setStep("collecting_shipping")}
          />
        );

      case "collecting_billing":
        return (
          <BillingStep
            shippingAddress={checkout.address}
            billingOption={checkout.billingOption}
            billingAddress={checkout.billingAddress}
            onBillingOptionChange={checkout.setBillingOption}
            onBillingAddressChange={checkout.setBillingAddress}
            isLoading={checkout.isLoading}
            onBack={() => checkout.setStep("selecting_shipping")}
            onContinue={() => {
              checkout.clearError();
              checkout.setStep("review");
            }}
          />
        );

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
            billingOption={checkout.billingOption}
            billingAddress={checkout.billingAddress}
            onEdit={() => checkout.setStep("collecting_shipping")}
            onEditShipping={() => checkout.setStep("selecting_shipping")}
            onEditBilling={() => checkout.setStep("collecting_billing")}
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
