import { useState } from "react";
import type { CSSProperties } from "react";
import { FiEdit2 } from "react-icons/fi";
import type { AddressDict } from "../../../types/actions";
import type { WCCart } from "../../../hooks/useCart";
import type { CheckoutStep } from "../../../types/checkout";
import { ShippingAddressForm } from "../fields/ShippingAddressForm";
import { clearAddressDraft } from "../../../utils/addressDraft";
import { useCheckoutFields } from "../../../hooks/useCheckoutFields";
import { BillingAddressForm } from "../fields/BillingAddressForm";
import { SavedAddressConfirmCard } from "../SavedAddressConfirmCard";

interface AddressStepProps {
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  updateCustomer: (data: {
    billing_address?: AddressDict;
    shipping_address?: AddressDict;
  }) => Promise<WCCart>;
  setStep: (step: CheckoutStep) => void;
  // State lifted to CheckoutPanel
  confirmedBilling: AddressDict | null;
  setConfirmedBilling: (address: AddressDict | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSavedAddress(addr: AddressDict | undefined): addr is AddressDict {
  return !!(
    addr?.address_1?.trim() &&
    addr?.city?.trim() &&
    addr?.postcode?.trim() &&
    addr?.country?.trim()
  );
}

function nextStepAfter(updated: WCCart): CheckoutStep {
  const needsShipping = updated.needs_shipping !== false;
  const needsPayment = updated.needs_payment !== false;
  if (!needsShipping && !needsPayment) return "placing_order";
  if (!needsShipping) return "awaiting_payment";
  return "selecting_rate";
}

function formatAddressSummary(addr: AddressDict): string {
  return [
    [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    addr.address_1,
    addr.city,
    addr.state,
    addr.postcode,
    addr.country,
  ]
    .filter(Boolean)
    .join(", ");
}

// ── Styles ────────────────────────────────────────────────────────────────────

const heading: CSSProperties = {
  fontFamily: "'DM Serif Display', serif",
  fontSize: "16px",
  fontWeight: 400,
  color: "#1c1c1a",
  margin: "0 0 14px 0",
};

const subHeading: CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  margin: "0 0 12px 0",
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

const pillLabel: CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "#888",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  margin: "0 0 4px 0",
};

const pillText: CSSProperties = {
  fontSize: "13px",
  color: "#1c1c1a",
  lineHeight: 1.6,
  margin: 0,
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
  transition: "border-color 0.15s, color 0.15s",
};

const toggleRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "11px",
  cursor: "pointer",
  userSelect: "none",
  marginBottom: "14px",
  transition: "background 0.15s, border-color 0.15s",
};

const continueBtn = (disabled: boolean): CSSProperties => ({
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
});

const divider: CSSProperties = {
  height: "1px",
  background: "#e8e6e0",
  margin: "20px 0",
};

const backLink: CSSProperties = {
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
};

// ── Edit button mouse handlers ────────────────────────────────────────────────

function onEditEnter(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = "#1c1c1a";
  e.currentTarget.style.color = "#1c1c1a";
}
function onEditLeave(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.borderColor = "#e8e6e0";
  e.currentTarget.style.color = "#555";
}

// ── ConfirmedPill ─────────────────────────────────────────────────────────────

function ConfirmedPill({
  label,
  address,
  onEdit,
}: {
  label: string;
  address: AddressDict;
  onEdit: () => void;
}) {
  return (
    <div style={pillBox}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={pillLabel}>{label}</p>
        <p style={pillText}>{formatAddressSummary(address)}</p>
      </div>
      <button
        type="button"
        title={`Edit ${label.toLowerCase()}`}
        onClick={onEdit}
        style={editBtnStyle}
        onMouseEnter={onEditEnter}
        onMouseLeave={onEditLeave}
      >
        <FiEdit2 size={13} />
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BillingSubStep
// ═════════════════════════════════════════════════════════════════════════════

type AddressPhase = "confirm_saved" | "form" | "confirm_draft";

interface BillingSubStepProps {
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  onConfirmed: (billing: AddressDict) => void;
  countries: ReturnType<typeof useCheckoutFields>["countries"];
  repOptions: ReturnType<typeof useCheckoutFields>["reps"];
  orderTypeOptions: ReturnType<typeof useCheckoutFields>["orderTypeOptions"];
  fieldOverrides: ReturnType<typeof useCheckoutFields>["billingFieldOverrides"];
  prefillValues?: AddressDict | null;
}

function BillingSubStep({
  cart,
  cartToken,
  isLoading,
  error,
  onConfirmed,
  countries,
  repOptions,
  orderTypeOptions,
  fieldOverrides,
  prefillValues,
}: BillingSubStepProps) {
  const savedBilling = prefillValues ?? cart?.billing_address;
  const hasSavedBilling = isSavedAddress(savedBilling);

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Billing Details</h3>
      <BillingAddressForm
        cartToken={cartToken}
        initialValues={hasSavedBilling ? savedBilling : undefined}
        fieldError={
          error ? { field: error.field, message: error.message } : null
        }
        isLoading={isLoading}
        submitLabel="Continue →"
        onSubmit={onConfirmed}
        countries={countries}
        repOptions={repOptions}
        orderTypeOptions={orderTypeOptions}
        fieldOverrides={fieldOverrides}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ShippingSubStep
// ═════════════════════════════════════════════════════════════════════════════

interface ShippingSubStepProps {
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  onConfirmed: (address: AddressDict) => void;
  countries: ReturnType<typeof useCheckoutFields>["countries"];
  fieldOverrides: ReturnType<
    typeof useCheckoutFields
  >["shippingFieldOverrides"];
}

function ShippingSubStep({
  cart,
  cartToken,
  isLoading,
  error,
  onConfirmed,
  countries,
  fieldOverrides,
}: ShippingSubStepProps) {
  const savedShipping = cart?.shipping_address;
  const hasSavedShipping = isSavedAddress(savedShipping);

  const [phase, setPhase] = useState<AddressPhase>(
    hasSavedShipping ? "confirm_saved" : "form",
  );
  const [draft, setDraft] = useState<AddressDict | null>(null);

  function handleFormSubmit(address: AddressDict) {
    setDraft(address);
    setPhase("confirm_draft");
  }

  return (
    <div>
      {phase === "confirm_saved" && hasSavedShipping && (
        <SavedAddressConfirmCard
          address={savedShipping!}
          title="Saved Shipping Address"
          primaryLabel="Use this address"
          secondaryLabel="Enter a different address"
          onPrimary={() => onConfirmed(savedShipping!)}
          onSecondary={() => setPhase("form")}
          isLoading={isLoading}
        />
      )}

      {phase === "form" && (
        <ShippingAddressForm
          cartToken={cartToken}
          initialValues={
            draft ?? (hasSavedShipping ? savedShipping : undefined)
          }
          fieldError={
            error ? { field: error.field, message: error.message } : null
          }
          isLoading={isLoading}
          submitLabel="Continue to Payment →"
          onSubmit={handleFormSubmit}
          countries={countries}
          fieldOverrides={fieldOverrides}
        />
      )}

      {phase === "confirm_draft" && draft && (
        <>
          <ConfirmedPill
            label="Shipping address"
            address={draft}
            onEdit={() => setPhase("form")}
          />
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onConfirmed(draft)}
            style={continueBtn(isLoading)}
          >
            {isLoading ? "Saving…" : "Continue to Payment →"}
          </button>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AddressStep
// ═════════════════════════════════════════════════════════════════════════════

export function AddressStep({
  cart,
  cartToken,
  isLoading,
  error,
  updateCustomer,
  setStep,
  confirmedBilling,
  setConfirmedBilling,
}: AddressStepProps) {
  const siteOrigin =
    (import.meta as any).env?.VITE_WP_BASE_URL || window.location.origin;

  const {
    countries,
    reps,
    orderTypeOptions,
    billingFieldOverrides,
    shippingFieldOverrides,
  } = useCheckoutFields(siteOrigin);

  const [view, setView] = useState<"billing" | "shipping">("billing");
  const [sameAsBilling, setSameAsBilling] = useState(true);

  async function handleShippingConfirmed(shipping: AddressDict) {
    if (!confirmedBilling) return;
    const updated = await updateCustomer({
      billing_address: confirmedBilling,
      shipping_address: shipping,
    });
    clearAddressDraft(cartToken);
    setStep(nextStepAfter(updated));
  }

  // ── Step 1: Billing ────────────────────────────────────────────────────────

  if (view === "billing") {
    return (
      <BillingSubStep
        cart={cart}
        cartToken={cartToken}
        isLoading={isLoading}
        error={error}
        onConfirmed={(billing) => {
          setConfirmedBilling(billing);
          setView("shipping");
        }}
        countries={countries}
        repOptions={reps}
        orderTypeOptions={orderTypeOptions}
        fieldOverrides={billingFieldOverrides}
        prefillValues={confirmedBilling}
      />
    );
  }

  // ── Step 2: Shipping ───────────────────────────────────────────────────────

  return (
    <div style={{ padding: "16px" }}>
      <button type="button" onClick={() => setView("billing")} style={backLink}>
        ← Edit billing details
      </button>

      <ConfirmedPill
        label="Billing address"
        address={confirmedBilling!}
        onEdit={() => setView("billing")}
      />

      <div style={divider} />

      <h3 style={{ ...heading, marginBottom: "14px" }}>Shipping Address</h3>

      <label
        style={{
          ...toggleRow,
          background: sameAsBilling ? "#f0fdf4" : "#fff",
          border: `1.5px solid ${sameAsBilling ? "#10b981" : "#e8e6e0"}`,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            width: "20px",
            height: "20px",
            borderRadius: "6px",
            border: `2px solid ${sameAsBilling ? "#10b981" : "#ccc"}`,
            background: sameAsBilling ? "#10b981" : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s",
          }}
        >
          {sameAsBilling && (
            <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
              <path
                d="M1 4.5L4 7.5L10 1"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <input
          type="checkbox"
          checked={sameAsBilling}
          onChange={(e) => setSameAsBilling(e.target.checked)}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        />
        <div>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: sameAsBilling ? "#065f46" : "#1c1c1a",
              display: "block",
              transition: "color 0.15s",
            }}
          >
            Same as billing address
          </span>
          <span
            style={{
              fontSize: "11px",
              color: sameAsBilling ? "#10b981" : "#aaa",
              marginTop: "2px",
              display: "block",
              transition: "color 0.15s",
            }}
          >
            {sameAsBilling
              ? "✓ Your order will ship to your billing address"
              : "Uncheck — enter a separate shipping address below"}
          </span>
        </div>
      </label>

      {sameAsBilling && (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => handleShippingConfirmed(confirmedBilling!)}
          style={continueBtn(isLoading)}
        >
          {isLoading ? "Saving…" : "Continue to Payment →"}
        </button>
      )}

      {!sameAsBilling && (
        <>
          <div style={subHeading as CSSProperties}>Enter shipping address</div>
          <ShippingSubStep
            cart={cart}
            cartToken={cartToken}
            isLoading={isLoading}
            error={error}
            onConfirmed={handleShippingConfirmed}
            countries={countries}
            fieldOverrides={shippingFieldOverrides}
          />
        </>
      )}
    </div>
  );
}
