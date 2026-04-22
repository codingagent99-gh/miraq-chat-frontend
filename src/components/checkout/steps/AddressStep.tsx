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
  return !!(addr?.address_1?.trim() && addr?.city?.trim() && addr?.postcode?.trim() && addr?.country?.trim());
}

export function AddressStep({
  cart,
  cartToken,
  isLoading,
  error,
  updateCustomer,
  setStep,
}: AddressStepProps) {
  const savedBilling = cart?.billing_address;
  const hasSavedAddress = isSavedAddress(savedBilling);

  // When hasSavedAddress: show confirmation card first
  // When user clicks "Enter a different address": hide card, show empty form
  const [showForm, setShowForm] = useState(!hasSavedAddress);

  async function handleUseSaved() {
    if (!savedBilling) return;
    await updateCustomer({
      billing_address: savedBilling,
      shipping_address: savedBilling,
    });
    clearAddressDraft(cartToken);
    setStep("selecting_rate");
  }

  async function handleFormSubmit(address: AddressDict) {
    await updateCustomer({
      billing_address: address,
      shipping_address: address,
    });
    clearAddressDraft(cartToken);
    setStep("selecting_rate");
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
        Shipping Address
      </h3>

      {/* Saved address confirmation card */}
      {hasSavedAddress && !showForm && (
        <SavedAddressConfirmCard
          address={savedBilling!}
          title="Saved Address"
          primaryLabel="Use this address"
          secondaryLabel="Enter a different address"
          onPrimary={handleUseSaved}
          onSecondary={() => setShowForm(true)}
          isLoading={isLoading}
        />
      )}

      {/* Address form */}
      {showForm && (
        <AddressForm
          cartToken={cartToken}
          fieldError={error ? { field: error.field, message: error.message } : null}
          isLoading={isLoading}
          onSubmit={handleFormSubmit}
        />
      )}
    </div>
  );
}
