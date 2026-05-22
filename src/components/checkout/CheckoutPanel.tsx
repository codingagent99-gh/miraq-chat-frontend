import { useState, useEffect, useRef, useMemo } from "react";
import type { WCCart } from "../../hooks/useCart";
import type { StoreApiFetch } from "../../hooks/useStoreApi";
import type { CheckoutStep, PaymentPayload } from "../../types/checkout";
import type { AddressDict } from "../../types/actions";
import type { ShipAddress, MultiShipGroup } from "../../types/multiAddress";
import { AddressStep } from "./steps/AddressStep";
import { ShippingStep } from "./steps/ShippingStep";
import { PaymentStep } from "./steps/PaymentStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ConfirmationStep } from "./steps/ConfirmationStep";
import { getPaymentAdapter } from "./payment/PaymentGatewayAdapter";
import "./CheckoutPanel.css";
import { useCheckout } from "../../hooks/useCheckout";
import { FiX, FiPackage, FiMaximize2, FiMinimize2 } from "react-icons/fi";

interface CheckoutPanelProps {
  storeApiFetch: StoreApiFetch;
  cart: WCCart | null;
  onCartUpdate: (cart: WCCart) => void;
  cartToken: string | null;
  siteOrigin: string;
  onClose: () => void;
  onPostBotMessage: (text: string) => void;
  onOrderComplete?: (productId: number, productName: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  resetCartToken?: () => void;
}

const STEPS: { label: string; step: CheckoutStep }[] = [
  { label: "Address", step: "collecting_address" },
  { label: "Shipping", step: "selecting_rate" },
  { label: "Payment", step: "awaiting_payment" },
  { label: "Review", step: "placing_order" },
];

function stepToIndex(step: CheckoutStep): number {
  switch (step) {
    case "idle":
    case "collecting_address":
      return 0;
    case "selecting_rate":
      return 1;
    case "awaiting_payment":
      return 2;
    case "placing_order":
    case "complete":
    case "error":
      return 3;
  }
}

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

// ── Derive MultiShipGroups from address + assignment state ──────────────────

/**
 * Canonical key for a delivery address — name fields are intentionally
 * excluded so that two entries pointing to the same physical location
 * (but with different recipient names) are still consolidated.
 */
function addressDeliveryKey(
  addr: import("../../types/actions").AddressDict,
): string {
  return [
    addr.address_1 ?? "",
    addr.address_2 ?? "",
    addr.city ?? "",
    addr.state ?? "",
    addr.postcode ?? "",
    addr.country ?? "",
  ]
    .map((s) => String(s).trim().toLowerCase())
    .join("|");
}

function buildMultiShipGroups(
  savedAddresses: ShipAddress[],
  itemAddressMap: Record<string, string>,
  cartItems: WCCart["items"],
  groupRates: Record<string, string>, // addressId → rateId
): MultiShipGroup[] {
  // Map each ShipAddress.id → its canonical delivery key so we can look up
  // which merged group an item belongs to in O(1).
  const idToKey = new Map<string, string>();
  // One representative group per canonical key (first address wins for the
  // stored address object; later duplicates only contribute their rate if the
  // existing group has none yet).
  const keyToGroup = new Map<string, MultiShipGroup>();

  for (const addr of savedAddresses) {
    const key = addressDeliveryKey(addr.address);
    idToKey.set(addr.id, key);

    if (!keyToGroup.has(key)) {
      keyToGroup.set(key, {
        address: addr.address,
        items: [],
        selected_rate_id: groupRates[addr.id] ?? null,
      });
    } else {
      // Duplicate address — inherit rate if the canonical group has none yet
      const existing = keyToGroup.get(key)!;
      if (!existing.selected_rate_id && groupRates[addr.id]) {
        existing.selected_rate_id = groupRates[addr.id];
      }
    }
  }

  // Distribute cart items into their canonical group
  for (const item of cartItems) {
    const addrId = itemAddressMap[item.key];
    if (!addrId) continue;
    const key = idToKey.get(addrId);
    if (!key) continue;
    const group = keyToGroup.get(key);
    if (!group) continue;
    group.items.push({
      cart_key: item.key,
      product_name: item.name,
      quantity: item.quantity,
      address_id: addrId,
    });
  }

  return [...keyToGroup.values()].filter((g) => g.items.length > 0);
}

// ── Component ────────────────────────────────────────────────────────────────

export function CheckoutPanel({
  storeApiFetch,
  cart,
  onCartUpdate,
  cartToken,
  siteOrigin,
  onClose,
  onPostBotMessage,
  onOrderComplete,
  isExpanded,
  onToggleExpand,
  resetCartToken,
}: CheckoutPanelProps) {
  // ── Multi-address state (lifted here so it survives step transitions) ───────
  const [multiAddressEnabled, setMultiAddressEnabled] = useState(false);
  const [savedShipAddresses, setSavedShipAddresses] = useState<ShipAddress[]>(
    [],
  );
  const [itemAddressMap, setItemAddressMap] = useState<Record<string, string>>(
    {},
  );
  // Tracks which shipping rate each address group has selected
  const [multiGroupRates, setMultiGroupRates] = useState<
    Record<string, string>
  >({});

  // Derive the full MultiShipGroup array from the above state
  const multiShipGroups = useMemo(
    () =>
      multiAddressEnabled && cart
        ? buildMultiShipGroups(
            savedShipAddresses,
            itemAddressMap,
            cart.items,
            multiGroupRates,
          )
        : [],
    [
      multiAddressEnabled,
      savedShipAddresses,
      itemAddressMap,
      cart,
      multiGroupRates,
    ],
  );

  // Keep a stable ref so placeOrder in useCheckout always reads the latest
  // groups without needing them in its dependency array.
  const multiShipGroupsRef = useRef<MultiShipGroup[]>([]);
  multiShipGroupsRef.current = multiShipGroups;

  // ── useCheckout ──────────────────────────────────────────────────────────────
  const checkout = useCheckout({
    storeApiFetch,
    cart,
    onCartUpdate,
    cartToken,
    multiShipGroupsRef,
    onOrderComplete,
    resetCartToken,
  });

  // ── Other lifted state ───────────────────────────────────────────────────────
  const [paymentPayload, setPaymentPayload] = useState<PaymentPayload | null>(
    null,
  );
  const [confirmedBilling, setConfirmedBilling] = useState<AddressDict | null>(
    () => {
      try {
        const saved = sessionStorage.getItem("silfra_billing");
        return saved ? (JSON.parse(saved) as AddressDict) : null;
      } catch {
        return null;
      }
    },
  );
  const confirmedPayloadRef = useRef<PaymentPayload | null>(null);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (checkout.step === "idle") {
      checkout.setStep("collecting_address");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      if (confirmedBilling) {
        sessionStorage.setItem(
          "silfra_billing",
          JSON.stringify(confirmedBilling),
        );
      } else {
        sessionStorage.removeItem("silfra_billing");
      }
    } catch {}
  }, [confirmedBilling]);
  useEffect(() => {
    if (checkout.step === "complete" && cart && cart.items_count > 0) {
      console.log(
        "[MiraQ DEBUG] useEffect clear firing, cart items:",
        cart.items?.length,
      );
      sessionStorage.removeItem("silfra_billing");

      onCartUpdate({
        ...cart,
        items: [],
        items_count: 0,
        totals: {
          ...cart.totals,
          total_items: "0",
          total_items_tax: "0",
          total_shipping: "0",
          total_tax: "0",
          total_price: "0",
        },
      });
    }
  }, [checkout.step]);
  // ── Helpers ──────────────────────────────────────────────────────────────────
  const effectivePaymentPayload: PaymentPayload | null = (() => {
    if (paymentPayload) return paymentPayload;
    if (confirmedPayloadRef.current) return confirmedPayloadRef.current;
    if (cart?.needs_payment === false)
      return { payment_method: "", payment_data: [] };
    if (cart?.payment_methods && cart.payment_methods.length === 1)
      return { payment_method: cart.payment_methods[0], payment_data: [] };
    return null;
  })();

  const selectedAdapter = effectivePaymentPayload
    ? (getPaymentAdapter(effectivePaymentPayload.payment_method) ?? null)
    : null;

  const activeIndex = stepToIndex(checkout.step);
  const symbol = cart?.totals.currency_symbol ?? "₹";
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;

  function handleStepClick(targetIndex: number) {
    if (targetIndex >= activeIndex) return;
    if (targetIndex === 2) confirmedPayloadRef.current = null;
    checkout.setStep(STEPS[targetIndex].step);
  }

  // Called by ShippingStep when user picks a rate for one address group
  function handleMultiRateChange(addressId: string, rateId: string) {
    setMultiGroupRates((prev) => ({ ...prev, [addressId]: rateId }));
  }

  // ── Step rendering ────────────────────────────────────────────────────────────
  function renderActiveStep() {
    if (checkout.step === "complete" && checkout.order) {
      return (
        <ConfirmationStep
          order={checkout.order}
          siteOrigin={siteOrigin}
          onBackToChat={onClose}
          onPostBotMessage={onPostBotMessage}
        />
      );
    }

    switch (checkout.step) {
      case "idle":
      case "collecting_address":
        return (
          <AddressStep
            cart={cart}
            cartToken={cartToken}
            isLoading={checkout.isLoading}
            error={checkout.error}
            updateCustomer={checkout.updateCustomer}
            setStep={checkout.setStep}
            // Lifted billing state
            confirmedBilling={confirmedBilling}
            setConfirmedBilling={setConfirmedBilling}
            // Lifted multi-address state
            multiAddressEnabled={multiAddressEnabled}
            setMultiAddressEnabled={setMultiAddressEnabled}
            savedShipAddresses={savedShipAddresses}
            setSavedShipAddresses={setSavedShipAddresses}
            itemAddressMap={itemAddressMap}
            setItemAddressMap={setItemAddressMap}
          />
        );

      case "selecting_rate":
        return (
          <ShippingStep
            shippingPackages={checkout.shippingPackages}
            selectedRateId={checkout.selectedRateId}
            cart={cart}
            isLoading={checkout.isLoading}
            error={checkout.error}
            selectShippingRate={checkout.selectShippingRate}
            setStep={checkout.setStep}
            // Multi-address props — only passed when mode is active
            multiAddressGroups={
              multiAddressEnabled ? multiShipGroups : undefined
            }
            onMultiRateChange={
              multiAddressEnabled ? handleMultiRateChange : undefined
            }
          />
        );

      case "awaiting_payment":
        return cart ? (
          <PaymentStep
            cart={cart}
            onPaymentPayloadChange={setPaymentPayload}
            isPayloadReady={paymentPayload !== null}
            onBack={() => {
              confirmedPayloadRef.current = null;
              checkout.setStep("selecting_rate");
            }}
            onContinue={() => {
              if (paymentPayload) {
                confirmedPayloadRef.current = paymentPayload;
              }
              checkout.setStep("placing_order");
            }}
          />
        ) : null;

      case "placing_order":
      case "error":
        return (
          <ReviewStep
            cart={cart}
            customer={checkout.customer}
            order={checkout.order}
            isLoading={checkout.isLoading}
            error={checkout.step === "error" ? checkout.error : null}
            paymentPayload={effectivePaymentPayload}
            selectedAdapter={selectedAdapter}
            // Multi-address display props
            multiAddressEnabled={multiAddressEnabled}
            multiShipGroups={multiShipGroups}
            onPlaceOrder={async (payload) => {
              await checkout.placeOrder(payload);
            }}
            onSetStep={(step) => {
              if (step === "awaiting_payment") {
                confirmedPayloadRef.current = null;
                setPaymentPayload(null);
              }
              checkout.setStep(step);
            }}
            onClearError={checkout.clearError}
          />
        );

      default:
        return null;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="miraq-checkout-panel">
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
              if (checkout.step === "complete") checkout.reset();
              onClose();
            }}
            aria-label="Close checkout"
          >
            <FiX size={16} />
          </button>
        </div>
      </div>

      <div className="miraq-checkout-steps">
        {STEPS.map((s, i) => {
          const isActive = i === activeIndex;
          const isCompleted = i < activeIndex;
          const isClickable = isCompleted;

          return (
            <button
              key={s.label}
              type="button"
              className={`miraq-checkout-step ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
              onClick={() => handleStepClick(i)}
              disabled={!isClickable}
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

      <div className="miraq-checkout-body">{renderActiveStep()}</div>

      {cart && cart.items_count > 0 && (
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

          {parseInt(cart.totals.total_shipping, 10) > 0 && (
            <div className="miraq-checkout-summary-row">
              <span>Shipping</span>
              <span>
                {formatPrice(cart.totals.total_shipping, symbol, minorUnit)}
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
            <span>
              {formatPrice(cart.totals.total_price, symbol, minorUnit)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
