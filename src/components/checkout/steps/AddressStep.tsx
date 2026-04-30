import { useState } from "react";
import type { CSSProperties } from "react";
import { FiEdit2 } from "react-icons/fi";
import type { AddressDict } from "../../../types/actions";
import type { WCCart } from "../../../hooks/useCart";
import type { CheckoutStep } from "../../../types/checkout";
import { SavedAddressConfirmCard } from "../SavedAddressConfirmCard";
import { ShippingAddressForm } from "../fields/ShippingAddressForm";
import { BillingAddressForm } from "../fields/BillingAddressForm";
import { clearAddressDraft } from "../../../utils/addressDraft";
import { useCheckoutFields } from "../../../hooks/useCheckoutFields";

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
// Collects billing details.
// Three internal phases:
//   confirm_saved → show SavedAddressConfirmCard
//   form          → show BillingAddressForm
//   confirm_draft → show ConfirmedPill + Continue button
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
}

function BillingSubStep({
  cart,
  cartToken,
  isLoading,
  error,
  onConfirmed,
  countries,
  repOptions,
}: BillingSubStepProps) {
  const savedBilling = cart?.billing_address;
  const hasSavedBilling = isSavedAddress(savedBilling);

  const [phase, setPhase] = useState<AddressPhase>(
    hasSavedBilling ? "confirm_saved" : "form",
  );
  const [draft, setDraft] = useState<AddressDict | null>(null);

  function handleFormSubmit(address: AddressDict) {
    setDraft(address);
    setPhase("confirm_draft");
  }

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Billing Details</h3>

      {/* Phase: existing billing address on file */}
      {phase === "confirm_saved" && hasSavedBilling && (
        <SavedAddressConfirmCard
          address={savedBilling!}
          title="Saved Billing Address"
          primaryLabel="Use this address"
          secondaryLabel="Enter a different address"
          onPrimary={() => onConfirmed(savedBilling!)}
          onSecondary={() => setPhase("form")}
          isLoading={isLoading}
        />
      )}

      {/* Phase: billing form — entering new or editing draft.
          When coming from confirm_saved (hasSavedBilling), seed the form with
          the existing address so the user only edits what they need to change. */}
      {phase === "form" && (
        <BillingAddressForm
          cartToken={cartToken}
          initialValues={draft ?? (hasSavedBilling ? savedBilling : undefined)}
          fieldError={
            error ? { field: error.field, message: error.message } : null
          }
          isLoading={isLoading}
          submitLabel="Continue →"
          onSubmit={handleFormSubmit}
          countries={countries}
          repOptions={repOptions}
        />
      )}

      {/* Phase: review billing draft before continuing */}
      {phase === "confirm_draft" && draft && (
        <>
          <ConfirmedPill
            label="Billing address"
            address={draft}
            onEdit={() => setPhase("form")}
          />
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onConfirmed(draft)}
            style={continueBtn(isLoading)}
          >
            {isLoading ? "Saving…" : "Continue →"}
          </button>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ShippingSubStep
// Always rendered as the second step after billing is confirmed.
// Three internal phases identical to BillingSubStep.
// ═════════════════════════════════════════════════════════════════════════════

interface ShippingSubStepProps {
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  onConfirmed: (address: AddressDict) => void;
  countries: ReturnType<typeof useCheckoutFields>["countries"];
}

function ShippingSubStep({
  cart,
  cartToken,
  isLoading,
  error,
  onConfirmed,
  countries,
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
    // No outer padding — the parent shipping view already provides it.
    <div>
      {/* Phase: existing shipping address on file */}
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

      {/* Phase: shipping form — entering new or editing draft.
          When coming from confirm_saved (hasSavedShipping), seed the form with
          the existing address so the user only edits what they need to change. */}
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
        />
      )}

      {/* Phase: review the draft before continuing */}
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
// AddressStep — thin orchestrator
//
// Flow:
//   1. "billing"  → BillingSubStep collects billing details
//   2. "shipping" → Always shown after billing is confirmed.
//                   A "Same as billing address" checkbox (checked by default)
//                   lets the user reuse their billing address without
//                   re-entering it. Unchecking reveals ShippingSubStep for
//                   a distinct shipping address.
//
// A single updateCustomer call fires at the very end with both addresses.
// ═════════════════════════════════════════════════════════════════════════════

export function AddressStep({
  cart,
  cartToken,
  isLoading,
  error,
  updateCustomer,
  setStep,
}: AddressStepProps) {
  // Site origin: same logic as useChat — widget runs ON the WP site
  const siteOrigin =
    (import.meta as any).env?.VITE_WP_BASE_URL || window.location.origin;

  // Fetch countries (with states) + rep options from the WP plugin endpoints
  const { countries, reps } = useCheckoutFields(siteOrigin);

  // "billing" → "shipping" — two sequential steps, always both shown
  const [view, setView] = useState<"billing" | "shipping">("billing");
  const [confirmedBilling, setConfirmedBilling] = useState<AddressDict | null>(
    null,
  );
  // Default: shipping address = billing address (most common case)
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
      />
    );
  }

  // ── Step 2: Shipping ───────────────────────────────────────────────────────

  return (
    <div style={{ padding: "16px" }}>
      {/* Back to billing */}
      <button type="button" onClick={() => setView("billing")} style={backLink}>
        ← Edit billing details
      </button>

      {/* Confirmed billing summary — always visible as context */}
      <ConfirmedPill
        label="Billing address"
        address={confirmedBilling!}
        onEdit={() => setView("billing")}
      />

      <div style={divider} />

      {/* Shipping heading */}
      <h3 style={{ ...heading, marginBottom: "14px" }}>Shipping Address</h3>

      {/* "Same as billing address" toggle — checked by default */}
      <label
        style={{
          ...toggleRow,
          background: sameAsBilling ? "#f5f4f1" : "#fff",
          border: `1.5px solid ${sameAsBilling ? "#1c1c1a" : "#e8e6e0"}`,
        }}
      >
        <input
          type="checkbox"
          checked={sameAsBilling}
          onChange={(e) => setSameAsBilling(e.target.checked)}
          style={{
            accentColor: "#1c1c1a",
            width: "15px",
            height: "15px",
            flexShrink: 0,
          }}
        />
        <div>
          <span
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#1c1c1a",
              display: "block",
            }}
          >
            Same as billing address
          </span>
          {sameAsBilling && (
            <span
              style={{
                fontSize: "11px",
                color: "#888",
                marginTop: "2px",
                display: "block",
              }}
            >
              Your order will ship to your billing address
            </span>
          )}
        </div>
      </label>

      {/* Path A: same address — single Continue button */}
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

      {/* Path B: different shipping address — reveal shipping form */}
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
          />
        </>
      )}
    </div>
  );
}
