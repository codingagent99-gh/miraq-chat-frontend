import { useState, useEffect, useRef } from "react";
import { FiX, FiPackage } from "react-icons/fi";
import type { WCCart } from "../../hooks/useCart";
import type { StoreApiFetch } from "../../hooks/useStoreApi";
import type { CheckoutStep, PaymentPayload } from "../../types/checkout";
import { useCheckout } from "../../hooks/useCheckout";
import { AddressStep } from "./steps/AddressStep";
import { ShippingStep } from "./steps/ShippingStep";
import { PaymentStep } from "./steps/PaymentStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ConfirmationStep } from "./steps/ConfirmationStep";
import { getPaymentAdapter } from "./payment/PaymentGatewayAdapter";
import "./CheckoutPanel.css";

interface CheckoutPanelProps {
  storeApiFetch: StoreApiFetch;
  cart: WCCart | null;
  onCartUpdate: (cart: WCCart) => void;
  cartToken: string | null;
  siteOrigin: string;
  onClose: () => void;
  onPostBotMessage: (text: string) => void;
}

// ── Step indicator metadata ──────────────────────────────────────────────────

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

// ── Price formatter ──────────────────────────────────────────────────────────

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

// ── Component ────────────────────────────────────────────────────────────────

export function CheckoutPanel({
  storeApiFetch,
  cart,
  onCartUpdate,
  cartToken,
  siteOrigin,
  onClose,
  onPostBotMessage,
}: CheckoutPanelProps) {
  const checkout = useCheckout({
    storeApiFetch,
    cart,
    onCartUpdate,
    cartToken,
  });

  // Panel-level payment payload — lives here so ReviewStep can consume it.
  const [paymentPayload, setPaymentPayload] = useState<PaymentPayload | null>(
    null,
  );

  // ── FIX: snapshot ref ────────────────────────────────────────────────────
  // The payment adapter's Component fires onPayloadChange(null) in its
  // useEffect cleanup when PaymentStep unmounts (navigating to Review).
  // That clears the state before ReviewStep can read it.
  //
  // Solution: snapshot the last non-null payload here. When the user
  // explicitly clicks "Continue to Review" we capture the confirmed payload
  // into this ref so it survives the unmount.
  const confirmedPayloadRef = useRef<PaymentPayload | null>(null);
  // ────────────────────────────────────────────────────────────────────────

  // Transition from idle → collecting_address on mount
  useEffect(() => {
    if (checkout.step === "idle") {
      checkout.setStep("collecting_address");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derive the effective payload ─────────────────────────────────────────
  // Priority:
  //  1. Live state from adapter (while on PaymentStep)
  //  2. Snapshotted ref (survives PaymentStep unmount — the fix)
  //  3. Cart needs no payment (zero total)   → empty stub
  //  4. Only one payment method available    → auto-select it
  //  5. Anything else                        → null (button stays disabled)
  const effectivePaymentPayload: PaymentPayload | null = (() => {
    if (paymentPayload) return paymentPayload;
    if (confirmedPayloadRef.current) return confirmedPayloadRef.current; // ← FIX
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
    // Clicking back to Payment clears the snapshot so the user re-confirms
    if (targetIndex === 2) confirmedPayloadRef.current = null;
    checkout.setStep(STEPS[targetIndex].step);
  }

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
          />
        );
      case "awaiting_payment":
        return cart ? (
          <PaymentStep
            cart={cart}
            onPaymentPayloadChange={setPaymentPayload}
            isPayloadReady={paymentPayload !== null}
            onBack={() => {
              // Clear the snapshot when going back to re-select
              confirmedPayloadRef.current = null;
              checkout.setStep("selecting_rate");
            }}
            onContinue={() => {
              // ── FIX: snapshot before navigating away ──────────────────────
              // Capture the payload NOW, while PaymentStep is still mounted
              // and the state is still populated. The adapter's cleanup will
              // call setPaymentPayload(null) during unmount — but the ref
              // survives and effectivePaymentPayload falls back to it.
              if (paymentPayload) {
                confirmedPayloadRef.current = paymentPayload;
              }
              // ──────────────────────────────────────────────────────────────
              checkout.setStep("placing_order");
            }}
          />
        ) : null;
      case "placing_order":
      case "error": {
        return (
          <ReviewStep
            cart={cart}
            customer={checkout.customer}
            order={checkout.order}
            isLoading={checkout.isLoading}
            error={checkout.step === "error" ? checkout.error : null}
            paymentPayload={effectivePaymentPayload}
            selectedAdapter={selectedAdapter}
            onPlaceOrder={async (payload) => {
              await checkout.placeOrder(payload);
            }}
            onSetStep={(step) => {
              // Clear snapshot when user navigates back to re-do payment
              if (step === "awaiting_payment") {
                confirmedPayloadRef.current = null;
                setPaymentPayload(null);
              }
              checkout.setStep(step);
            }}
            onClearError={checkout.clearError}
          />
        );
      }
      default:
        return null;
    }
  }

  return (
    <div className="miraq-checkout-panel">
      {/* ── Header ── */}
      <div className="miraq-checkout-header">
        <div className="miraq-checkout-title">
          <FiPackage size={16} color="#1c1c1a" />
          <span className="miraq-checkout-title-text">Checkout</span>
        </div>
        <button
          className="miraq-checkout-close"
          onClick={() => {
            if (checkout.step === "complete") {
              checkout.reset();
            }
            onClose();
          }}
          aria-label="Close checkout"
        >
          <FiX size={16} />
        </button>
      </div>

      {/* ── Step indicator ── */}
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

      {/* ── Body (active step) ── */}
      <div className="miraq-checkout-body">{renderActiveStep()}</div>

      {/* ── Order Summary (always visible) ── */}
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
