import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { FiEdit2, FiX, FiPlus } from "react-icons/fi";
import type { AddressDict } from "../../../types/actions";
import type { WCCart } from "../../../hooks/useCart";
import type { CheckoutStep } from "../../../types/checkout";
import {
  makeAddressLabel,
  genAddressId,
  type ShipAddress,
} from "../../../types/multiAddress";
import { ShippingAddressForm } from "../fields/ShippingAddressForm";
import { clearAddressDraft } from "../../../utils/addressDraft";
import { useCheckoutFields } from "../../../hooks/useCheckoutFields";
import { BillingAddressForm } from "../fields/BillingAddressForm";
import { SavedAddressConfirmCard } from "../SavedAddressConfirmCard";
import { fetchWpSavedAddresses, saveWpAddress } from "../../../services/api";
import type { AddressFormProps, CustomField } from "../fields/AddressForm";
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
  // Lifted state from CheckoutPanel
  confirmedBilling: AddressDict | null;
  setConfirmedBilling: (address: AddressDict | null) => void;
  // Multi-address state — lifted to CheckoutPanel so it survives re-mounts
  multiAddressEnabled: boolean;
  setMultiAddressEnabled: (v: boolean) => void;
  savedShipAddresses: ShipAddress[];
  setSavedShipAddresses: (addrs: ShipAddress[]) => void;
  itemAddressMap: Record<string, string>; // cart_key → ShipAddress.id
  setItemAddressMap: (map: Record<string, string>) => void;
  siteOrigin: string;
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

// ── ShipModeOption ─────────────────────────────────────────────────────────────

type ShipMode = "billing" | "single" | "multi";

function ShipModeOption({
  mode,
  current,
  label,
  description,
  onChange,
}: {
  mode: ShipMode;
  current: ShipMode;
  label: string;
  description: string;
  onChange: (m: ShipMode) => void;
}) {
  const active = mode === current;
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "10px 12px",
        border: `1.5px solid ${active ? "#1c1c1a" : "#e8e6e0"}`,
        borderRadius: "11px",
        background: active ? "#f5f4f1" : "#fff",
        cursor: "pointer",
        marginBottom: "8px",
        transition: "border-color 0.15s, background 0.15s",
      }}
    >
      <input
        type="radio"
        name="ship_mode"
        checked={active}
        onChange={() => onChange(mode)}
        style={{ marginTop: "3px", accentColor: "#1c1c1a", flexShrink: 0 }}
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
          {label}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "#888",
            display: "block",
            marginTop: "2px",
          }}
        >
          {description}
        </span>
      </div>
    </label>
  );
}

// ── MultiAddressPanel ──────────────────────────────────────────────────────────
// Lets the user assign each cart item to a saved address, and add new addresses.

interface MultiAddressPanelProps {
  cart: WCCart | null;
  cartToken: string | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  savedAddresses: ShipAddress[];
  itemAddressMap: Record<string, string>;
  onAddAddress: (addr: ShipAddress) => void;
  onRemoveAddress: (id: string) => void;
  onAssign: (cartKey: string, addrId: string) => void;
  countries: ReturnType<typeof useCheckoutFields>["countries"];
  fieldOverrides: ReturnType<
    typeof useCheckoutFields
  >["shippingFieldOverrides"];
  /** WordPress site origin used to call the /saved-addresses API. */
  siteOrigin: string;
}

function MultiAddressPanel({
  cart,
  cartToken,
  isLoading,
  error,
  savedAddresses,
  itemAddressMap,
  onAddAddress,
  onRemoveAddress,
  onAssign,
  countries,
  fieldOverrides,
  siteOrigin,
}: MultiAddressPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const items = cart?.items ?? [];

  /**
   * Called when the user submits the new-address form.
   * Adds the address to local state immediately, then saves it to THWMA
   * in the background so it persists for future checkouts.
   */
  async function handleNewAddress(addr: AddressDict) {
    const id = genAddressId();
    onAddAddress({ id, label: makeAddressLabel(addr), address: addr });
    setShowForm(false);

    // Best-effort: save to THWMA address book for future checkouts
    setIsSaving(true);
    try {
      await saveWpAddress(
        siteOrigin,
        addr as Parameters<typeof saveWpAddress>[1],
      );
    } catch (e) {
      console.warn("[MiraQ] Could not persist address to THWMA:", e);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      {/* ── Item assignment table ── */}
      <p style={subHeading as CSSProperties}>Assign addresses to items</p>

      {items.length === 0 && (
        <p style={{ fontSize: "13px", color: "#888" }}>No items in cart.</p>
      )}

      {items.map((item) => {
        const assigned = itemAddressMap[item.key] ?? "";
        return (
          <div
            key={item.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "10px 12px",
              border: "1px solid #e8e6e0",
              borderRadius: "11px",
              marginBottom: "8px",
              background: "#fff",
            }}
          >
            {/* Thumbnail */}
            {item.images?.[0]?.thumbnail && (
              <img
                src={item.images[0].thumbnail}
                alt={item.name}
                style={{
                  width: "36px",
                  height: "36px",
                  objectFit: "cover",
                  borderRadius: "6px",
                  flexShrink: 0,
                }}
              />
            )}

            {/* Name + qty */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "12.5px",
                  fontWeight: 500,
                  color: "#1c1c1a",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.name}
              </p>
              <p style={{ fontSize: "11px", color: "#999", margin: "2px 0 0" }}>
                Qty: {item.quantity}
              </p>
            </div>

            {/* Address dropdown */}
            <select
              value={assigned}
              onChange={(e) => onAssign(item.key, e.target.value)}
              style={{
                fontSize: "12px",
                padding: "6px 8px",
                border: `1.5px solid ${assigned ? "#1c1c1a" : "#e8e6e0"}`,
                borderRadius: "8px",
                background: "#fff",
                color: "#1c1c1a",
                cursor: "pointer",
                maxWidth: "160px",
                flexShrink: 0,
              }}
            >
              <option value="">Select address…</option>
              {savedAddresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        );
      })}

      {/* ── Saved address chips ── */}
      {savedAddresses.length > 0 && (
        <div style={{ marginTop: "16px", marginBottom: "10px" }}>
          <p style={{ ...subHeading, margin: "0 0 8px" } as CSSProperties}>
            Saved addresses
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {savedAddresses.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "#f5f4f1",
                  borderRadius: "9px",
                  gap: "8px",
                }}
              >
                <span style={{ fontSize: "12px", color: "#1c1c1a", flex: 1 }}>
                  {a.label}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAddress(a.id)}
                  title="Remove address"
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#aaa",
                    padding: "2px",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <FiX size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add new address toggle ── */}
      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={isSaving}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 600,
            color: isSaving ? "#aaa" : "#1c1c1a",
            background: "none",
            border: "1.5px dashed #c8c6c0",
            borderRadius: "11px",
            padding: "10px 14px",
            cursor: isSaving ? "not-allowed" : "pointer",
            width: "100%",
            fontFamily: "inherit",
            marginTop: savedAddresses.length > 0 ? "0" : "8px",
          }}
        >
          <FiPlus size={14} />
          {isSaving ? "Saving address…" : "Add new address"}
        </button>
      )}

      {/* ── Inline address form ── */}
      {showForm && (
        <div
          style={{
            marginTop: "12px",
            padding: "14px",
            border: "1.5px solid #e8e6e0",
            borderRadius: "11px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <p style={{ ...subHeading, margin: 0 } as CSSProperties}>
              New shipping address
            </p>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#aaa",
                padding: 0,
                display: "flex",
              }}
            >
              <FiX size={15} />
            </button>
          </div>
          <ShippingAddressForm
            cartToken={cartToken}
            initialValues={undefined}
            fieldError={
              error ? { field: error.field, message: error.message } : null
            }
            isLoading={isLoading}
            submitLabel="Save Address"
            onSubmit={handleNewAddress}
            countries={countries}
            fieldOverrides={fieldOverrides}
          />
        </div>
      )}
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
  dynamicFields?: AddressFormProps["visibleFields"];
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
  dynamicFields,
}: BillingSubStepProps) {
  const savedBilling = prefillValues ?? cart?.billing_address;
  const hasSavedBilling = isSavedAddress(savedBilling);

  return (
    <div style={{ padding: "16px" }}>
      <h3 style={heading}>Billing Details</h3>
      <BillingAddressForm
        dynamicFields={dynamicFields}
        countries={countries}
        orderTypeOptions={orderTypeOptions}
        fieldOverrides={fieldOverrides}
        key={hasSavedBilling ? "prefilled" : "empty"}
        cartToken={cartToken}
        initialValues={hasSavedBilling ? savedBilling : undefined}
        fieldError={
          error ? { field: error.field, message: error.message } : null
        }
        isLoading={isLoading}
        submitLabel="Continue →"
        onSubmit={onConfirmed}
        repOptions={repOptions}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ShippingSubStep  (single-address flow, unchanged)
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
  dynamicFields?: AddressFormProps["visibleFields"];
}

function ShippingSubStep({
  cart,
  cartToken,
  isLoading,
  error,
  onConfirmed,
  countries,
  fieldOverrides,
  dynamicFields,
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
          dynamicFields={dynamicFields}
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
  multiAddressEnabled,
  setMultiAddressEnabled,
  savedShipAddresses,
  setSavedShipAddresses,
  itemAddressMap,
  setItemAddressMap,
  siteOrigin,
}: AddressStepProps) {
  console.log(
    "[AddressStep] siteOrigin passed to useCheckoutFields:",
    siteOrigin,
  );

  const {
    countries,
    reps,
    orderTypeOptions,
    billingFields,
    shippingFields,
    billingFieldOverrides,
    shippingFieldOverrides,
    isLoading: fieldsLoading,
  } = useCheckoutFields(siteOrigin);

  console.log("[AddressStep] billingFieldOverrides:", billingFieldOverrides);
  console.log("[AddressStep] fieldsLoading:", fieldsLoading);
  const dynamicBillingFields = billingFields.map(
    (f) => f.key as keyof AddressDict | CustomField,
  );
  const dynamicShippingFields = shippingFields.map(
    (f) => f.key as keyof AddressDict | CustomField,
  );
  const [view, setView] = useState<"billing" | "shipping">("billing");

  // "billing" | "single" | "multi"
  const [shipMode, setShipMode] = useState<ShipMode>(
    multiAddressEnabled ? "multi" : "billing",
  );

  // ── Helpers ──────────────────────────────────────────────────────────────

  function handleShipModeChange(mode: ShipMode) {
    setShipMode(mode);
    setMultiAddressEnabled(mode === "multi");
  }

  async function handleShippingConfirmed(shipping: AddressDict) {
    if (!confirmedBilling) return;
    const updated = await updateCustomer({
      billing_address: confirmedBilling,
      shipping_address: shipping,
    });
    clearAddressDraft(cartToken);
    setStep(nextStepAfter(updated));
  }

  /** Called when the user clicks Continue in multi-address mode.
   *  Uses the first saved address as the primary WC shipping address so the
   *  server can compute a shipping rate. The full per-item assignment lives in
   *  itemAddressMap / savedShipAddresses and will be sent at checkout time. */
  async function handleMultiContinue() {
    if (!confirmedBilling) return;
    const primaryAddress = savedShipAddresses[0]?.address;
    if (!primaryAddress) return;
    const updated = await updateCustomer({
      billing_address: confirmedBilling,
      shipping_address: primaryAddress,
    });
    clearAddressDraft(cartToken);
    setStep(nextStepAfter(updated));
  }

  // ── Derived helpers ───────────────────────────────────────────────────────

  const cartItems = cart?.items ?? [];

  const allItemsAssigned =
    cartItems.length > 0 &&
    cartItems.every((item) => !!itemAddressMap[item.key]);

  const multiCanContinue =
    !isLoading && allItemsAssigned && savedShipAddresses.length > 0;

  useEffect(() => {
    if (shipMode !== "multi") return;
    if (savedShipAddresses.length > 0) return;

    // ── Fetch saved addresses from THWMA ──────────────────────────────────
    // If the customer has previously saved addresses, pre-populate the list
    // so they don't have to re-enter them. Falls back to the cart's default
    // shipping address if the fetch returns nothing (e.g. guest / new user).
    fetchWpSavedAddresses(siteOrigin)
      .then((thwmaAddrs) => {
        if (thwmaAddrs.length > 0) {
          // Convert THWMA shape → ShipAddress (fields already match AddressDict)
          const converted: ShipAddress[] = thwmaAddrs.map((a) => ({
            id: a.id, // keep "address_0" etc. so THWMA recognises them
            label: makeAddressLabel(a as unknown as AddressDict),
            address: a as unknown as AddressDict,
          }));
          setSavedShipAddresses(converted);

          // Pre-assign every cart item to the first (default) address
          const firstId = converted[0].id;
          const map: Record<string, string> = {};
          for (const item of cart?.items ?? []) {
            map[item.key] = firstId;
          }
          setItemAddressMap(map);
        } else {
          seedFromCartShipping();
        }
      })
      .catch(() => {
        // Network error or not logged in — fall back to cart shipping
        seedFromCartShipping();
      });

    function seedFromCartShipping() {
      const cartShipping = cart?.shipping_address;
      if (!isSavedAddress(cartShipping)) return;
      const id = genAddressId();
      setSavedShipAddresses([
        { id, label: makeAddressLabel(cartShipping), address: cartShipping },
      ]);
      const map: Record<string, string> = {};
      for (const item of cart?.items ?? []) {
        map[item.key] = id;
      }
      setItemAddressMap(map);
    }
  }, [shipMode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (fieldsLoading || !cart) {
    return (
      <div
        style={{
          padding: "32px 16px",
          textAlign: "center",
          color: "#888",
          fontSize: "13px",
        }}
      >
        Loading…
      </div>
    );
  }

  // ── Step 1: Billing ────────────────────────────────────────────────────────

  if (view === "billing") {
    return (
      <BillingSubStep
        dynamicFields={dynamicBillingFields}
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

      <h3 style={{ ...heading, marginBottom: "14px" }}>Shipping</h3>

      {/* ── Shipping mode selector ── */}
      <ShipModeOption
        mode="billing"
        current={shipMode}
        label="Ship to billing address"
        description="Your order ships to the address above"
        onChange={handleShipModeChange}
      />
      <ShipModeOption
        mode="single"
        current={shipMode}
        label="Ship to a different address"
        description="Enter one alternative shipping address"
        onChange={handleShipModeChange}
      />
      <ShipModeOption
        mode="multi"
        current={shipMode}
        label="Ship to multiple addresses"
        description="Send each item to its own address"
        onChange={handleShipModeChange}
      />

      {/* ── Mode: billing ── */}
      {shipMode === "billing" && (
        <div style={{ marginTop: "14px" }}>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleShippingConfirmed(confirmedBilling!)}
            style={continueBtn(isLoading)}
          >
            {isLoading ? "Saving…" : "Continue to Shipping →"}
          </button>
        </div>
      )}

      {/* ── Mode: single ── */}
      {shipMode === "single" && (
        <div style={{ marginTop: "14px" }}>
          <p style={subHeading as CSSProperties}>Enter shipping address</p>
          <ShippingSubStep
            dynamicFields={dynamicShippingFields}
            key={isSavedAddress(cart.shipping_address) ? "prefilled" : "empty"}
            cart={cart}
            cartToken={cartToken}
            isLoading={isLoading}
            error={error}
            onConfirmed={handleShippingConfirmed}
            countries={countries}
            fieldOverrides={shippingFieldOverrides}
          />
        </div>
      )}

      {/* ── Mode: multi ── */}
      {shipMode === "multi" && (
        <div style={{ marginTop: "14px" }}>
          <MultiAddressPanel
            cart={cart}
            cartToken={cartToken}
            isLoading={isLoading}
            error={error}
            savedAddresses={savedShipAddresses}
            itemAddressMap={itemAddressMap}
            siteOrigin={siteOrigin}
            onAddAddress={(addr) =>
              setSavedShipAddresses([...savedShipAddresses, addr])
            }
            onRemoveAddress={(id) => {
              setSavedShipAddresses(
                savedShipAddresses.filter((a) => a.id !== id),
              );
              // Unassign any items that were using this address
              const updated = { ...itemAddressMap };
              for (const key of Object.keys(updated)) {
                if (updated[key] === id) delete updated[key];
              }
              setItemAddressMap(updated);
            }}
            onAssign={(cartKey, addrId) =>
              setItemAddressMap({ ...itemAddressMap, [cartKey]: addrId })
            }
            countries={countries}
            fieldOverrides={shippingFieldOverrides}
          />

          <div style={{ marginTop: "16px" }}>
            {!allItemsAssigned && savedShipAddresses.length > 0 && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#888",
                  textAlign: "center",
                  marginBottom: "10px",
                }}
              >
                Assign an address to every item to continue.
              </p>
            )}
            {savedShipAddresses.length === 0 && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#888",
                  textAlign: "center",
                  marginBottom: "10px",
                }}
              >
                Add at least one address to continue.
              </p>
            )}
            <button
              type="button"
              disabled={!multiCanContinue}
              onClick={handleMultiContinue}
              style={continueBtn(!multiCanContinue)}
            >
              {isLoading ? "Saving…" : "Continue to Shipping →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
