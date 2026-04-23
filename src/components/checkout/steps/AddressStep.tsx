import { useState } from "react";
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

/** Heuristic: address is "saved" when address_1, city, postcode, and country are all non-empty */
function isSavedAddress(addr: AddressDict | undefined): addr is AddressDict {
  return !!(
    addr?.address_1?.trim() &&
    addr?.city?.trim() &&
    addr?.postcode?.trim() &&
    addr?.country?.trim()
  );
}

/**
 * Decide where to advance after the addresses are saved.
 *
 *   - If Woo says the cart doesn't need shipping (`needs_shipping === false`),
 *     skip the rate-selection step entirely and go straight to payment.
 *   - Otherwise, go to the shipping-rate selection step.
 *
 * Reads `needs_shipping` from the *fresh* cart returned by `updateCustomer`,
 * because the prop `cart` is stale at submission time.
 */
function nextStepAfter(updated: WCCart): CheckoutStep {
  const needsShipping = updated.needs_shipping !== false;
  const needsPayment = updated.needs_payment !== false;

  if (!needsShipping && !needsPayment) return "placing_order";
  if (!needsShipping) return "awaiting_payment";
  return "selecting_rate";
}

export function AddressStep({
  cart,
  cartToken,
  isLoading,
  error,
  updateCustomer,
  setStep,
}: AddressStepProps) {
  const savedShipping = cart?.shipping_address;
  const savedBilling = cart?.billing_address;
  const hasSavedShipping = isSavedAddress(savedShipping);

  // When hasSavedShipping: show confirmation card first.
  // When user clicks "Enter a different address": hide card, show empty form.
  const [showForm, setShowForm] = useState(!hasSavedShipping);

  // ── Multi-form state ────────────────────────────────────────────────────────
  // Default UX: collect ONE address (used as both billing + shipping).
  // If user unchecks the "billing same as shipping" box, we present a second
  // form for the billing address before committing both in a single POST.
  const [shippingDraft, setShippingDraft] = useState<AddressDict | null>(null);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);
  const [subStep, setSubStep] = useState<"shipping" | "billing">("shipping");

  async function handleUseSaved() {
    if (!savedShipping) return;
    const updated = await updateCustomer({
      billing_address:
        savedBilling && isSavedAddress(savedBilling)
          ? savedBilling
          : savedShipping,
      shipping_address: savedShipping,
    });
    clearAddressDraft(cartToken);
    setStep(nextStepAfter(updated));
  }

  async function handleShippingSubmit(address: AddressDict) {
    setShippingDraft(address);

    if (billingSameAsShipping) {
      // One-shot: save shipping + mirrored billing, then advance.
      const updated = await updateCustomer({
        billing_address: address,
        shipping_address: address,
      });
      clearAddressDraft(cartToken);
      setStep(nextStepAfter(updated));
      return;
    }

    // User wants a separate billing address — show the second form.
    setSubStep("billing");
  }

  async function handleBillingSubmit(address: AddressDict) {
    if (!shippingDraft) {
      // Shouldn't happen, but guard against losing state.
      setSubStep("shipping");
      return;
    }
    const updated = await updateCustomer({
      billing_address: address,
      shipping_address: shippingDraft,
    });
    clearAddressDraft(cartToken);
    setStep(nextStepAfter(updated));
  }

  return (
    <div style={{ padding: "16px" }}>
      <h3
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: "16px",
          fontWeight: 400,
          color: "#1c1c1a",
          margin: "0 0 14px 0",
        }}
      >
        {subStep === "shipping" ? "Shipping Address" : "Billing Address"}
      </h3>

      {/* Saved address confirmation card — only on initial shipping sub-step */}
      {subStep === "shipping" && hasSavedShipping && !showForm && (
        <SavedAddressConfirmCard
          address={savedShipping!}
          title="Saved Address"
          primaryLabel="Use this address"
          secondaryLabel="Enter a different address"
          onPrimary={handleUseSaved}
          onSecondary={() => setShowForm(true)}
          isLoading={isLoading}
        />
      )}

      {/* Shipping address form */}
      {subStep === "shipping" && showForm && (
        <>
          <AddressForm
            cartToken={cartToken}
            initialValues={shippingDraft ?? undefined}
            fieldError={
              error ? { field: error.field, message: error.message } : null
            }
            isLoading={isLoading}
            onSubmit={handleShippingSubmit}
          />

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "12px",
              fontSize: "13px",
              color: "#1c1c1a",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={billingSameAsShipping}
              onChange={(e) => setBillingSameAsShipping(e.target.checked)}
              style={{
                accentColor: "#1c1c1a",
                width: "15px",
                height: "15px",
              }}
            />
            Billing address is the same as shipping
          </label>
        </>
      )}

      {/* Billing form (only reached when "Same as shipping" is unchecked) */}
      {subStep === "billing" && (
        <>
          <AddressForm
            cartToken={cartToken}
            initialValues={
              savedBilling && isSavedAddress(savedBilling)
                ? savedBilling
                : undefined
            }
            fieldError={
              error ? { field: error.field, message: error.message } : null
            }
            isLoading={isLoading}
            onSubmit={handleBillingSubmit}
          />

          <button
            type="button"
            onClick={() => setSubStep("shipping")}
            disabled={isLoading}
            style={{
              marginTop: "10px",
              width: "100%",
              padding: "10px",
              background: "transparent",
              color: "#1c1c1a",
              border: "1px solid #e8e6e0",
              borderRadius: "11px",
              fontFamily: "inherit",
              fontSize: "12px",
              fontWeight: 500,
              cursor: isLoading ? "not-allowed" : "pointer",
            }}
          >
            ← Back to shipping address
          </button>
        </>
      )}
    </div>
  );
}
