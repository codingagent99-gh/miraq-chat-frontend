import { useState } from "react";
import type { CSSProperties } from "react";
import { FiEdit2 } from "react-icons/fi";
import type { AddressDict } from "../../../types/actions";
import type { WCCart } from "../../../hooks/useCart";
import type { CheckoutStep } from "../../../types/checkout";
import { SavedAddressConfirmCard } from "../SavedAddressConfirmCard";
import { AddressForm } from "../fields/AddressForm";
import { clearAddressDraft } from "../../../utils/addressDraft";

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
// Purely displays one address with an edit button.
// Each instance is independent — shipping pill edits shipping, billing pill edits billing.

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
// ShippingSubStep
// 100% self-contained. No billing UI. No billing state.
// Three internal phases:
//   confirm_saved → show SavedAddressConfirmCard
//   form          → show AddressForm
//   confirm_draft → show ConfirmedPill + Continue button
// ═════════════════════════════════════════════════════════════════════════════

type AddressPhase = "confirm_saved" | "form" | "confirm_draft";

interface ShippingSubStepProps {
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  onConfirmed: (address: AddressDict) => void;
}

function ShippingSubStep({
  cart,
  cartToken,
  isLoading,
  error,
  onConfirmed,
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
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Shipping Address</h3>

      {/* Phase: existing address on file */}
      {phase === "confirm_saved" && hasSavedShipping && (
        <SavedAddressConfirmCard
          address={savedShipping!}
          title="Saved Address"
          primaryLabel="Use this address"
          secondaryLabel="Enter a different address"
          onPrimary={() => onConfirmed(savedShipping!)}
          onSecondary={() => setPhase("form")}
          isLoading={isLoading}
        />
      )}

      {/* Phase: address form — entering new or editing draft */}
      {phase === "form" && (
        <AddressForm
          cartToken={cartToken}
          initialValues={draft ?? undefined}
          fieldError={
            error ? { field: error.field, message: error.message } : null
          }
          isLoading={isLoading}
          onSubmit={handleFormSubmit}
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
            {isLoading ? "Saving…" : "Continue to Billing →"}
          </button>
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BillingSubStep
// 100% self-contained. No shipping UI whatsoever — not even a read-only pill.
// The only shipping reference is the data value passed in for "same as shipping".
// Three internal phases — identical pattern to ShippingSubStep but for billing.
// ═════════════════════════════════════════════════════════════════════════════

interface BillingSubStepProps {
  confirmedShipping: AddressDict; // data only — never rendered as UI here
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  onBack: () => void;
  onConfirmed: (billing: AddressDict) => void;
}

function BillingSubStep({
  confirmedShipping,
  cart,
  cartToken,
  isLoading,
  error,
  onBack,
  onConfirmed,
}: BillingSubStepProps) {
  const savedBilling = cart?.billing_address;
  const hasSavedBilling = isSavedAddress(savedBilling);

  const [sameAsShipping, setSameAsShipping] = useState(true);

  const [phase, setPhase] = useState<AddressPhase>(
    hasSavedBilling ? "confirm_saved" : "form",
  );
  const [draft, setDraft] = useState<AddressDict | null>(null);

  function handleSameToggle(checked: boolean) {
    setSameAsShipping(checked);
    if (!checked) {
      // Reset billing to a clean slate every time the user unchecks
      setDraft(null);
      setPhase(hasSavedBilling ? "confirm_saved" : "form");
    }
  }

  function handleFormSubmit(address: AddressDict) {
    setDraft(address);
    setPhase("confirm_draft");
  }

  return (
    <div style={{ padding: "16px" }}>
      {/* Back to shipping — text only, no shipping address shown here */}
      <button type="button" onClick={onBack} style={backLink}>
        ← Edit shipping address
      </button>

      <h3 style={heading}>Billing Address</h3>

      {/* Same as shipping toggle */}
      <label
        style={{
          ...toggleRow,
          background: sameAsShipping ? "#f5f4f1" : "#fff",
          border: `1.5px solid ${sameAsShipping ? "#1c1c1a" : "#e8e6e0"}`,
        }}
      >
        <input
          type="checkbox"
          checked={sameAsShipping}
          onChange={(e) => handleSameToggle(e.target.checked)}
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
            Same as shipping address
          </span>
          {sameAsShipping && (
            <span
              style={{
                fontSize: "11px",
                color: "#888",
                marginTop: "2px",
                display: "block",
              }}
            >
              Billing will match your shipping address
            </span>
          )}
        </div>
      </label>

      {/* Path A: same as shipping */}
      {sameAsShipping && (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onConfirmed(confirmedShipping)}
          style={continueBtn(isLoading)}
        >
          {isLoading ? "Saving…" : "Continue →"}
        </button>
      )}

      {/* Path B: different billing — fully independent form/confirm cycle */}
      {!sameAsShipping && (
        <>
          <div style={divider} />
          <p style={subHeading}>Billing address</p>

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

          {/* Phase: billing form — entering new or editing draft */}
          {phase === "form" && (
            <AddressForm
              cartToken={cartToken}
              initialValues={draft ?? undefined}
              fieldError={
                error ? { field: error.field, message: error.message } : null
              }
              isLoading={isLoading}
              onSubmit={handleFormSubmit}
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
        </>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AddressStep — thin orchestrator
// Owns the sub-step navigation and the single updateCustomer call.
// The two sub-steps never touch each other's state or UI.
// ═════════════════════════════════════════════════════════════════════════════

export function AddressStep({
  cart,
  cartToken,
  isLoading,
  error,
  updateCustomer,
  setStep,
}: AddressStepProps) {
  const [subStep, setSubStep] = useState<"shipping" | "billing">("shipping");
  const [confirmedShipping, setConfirmedShipping] =
    useState<AddressDict | null>(null);

  async function handleBillingConfirmed(billing: AddressDict) {
    if (!confirmedShipping) return;
    const updated = await updateCustomer({
      shipping_address: confirmedShipping,
      billing_address: billing,
    });
    clearAddressDraft(cartToken);
    setStep(nextStepAfter(updated));
  }

  if (subStep === "shipping") {
    return (
      <ShippingSubStep
        cart={cart}
        cartToken={cartToken}
        isLoading={isLoading}
        error={error}
        onConfirmed={(shipping) => {
          setConfirmedShipping(shipping);
          setSubStep("billing");
        }}
      />
    );
  }

  return (
    <BillingSubStep
      confirmedShipping={confirmedShipping!}
      cart={cart}
      cartToken={cartToken}
      isLoading={isLoading}
      error={error}
      onBack={() => setSubStep("shipping")}
      onConfirmed={handleBillingConfirmed}
    />
  );
}
