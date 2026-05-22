import { useState } from "react";
import type { ShippingPackage } from "../../../types/checkout";
import type { WCCart } from "../../../hooks/useCart";
import type { CheckoutStep } from "../../../types/checkout";
import type { MultiShipGroup } from "../../../types/multiAddress";
import { makeAddressLabel } from "../../../types/multiAddress";

interface ShippingStepProps {
  shippingPackages: ShippingPackage[];
  selectedRateId: string | null;
  cart: WCCart | null;
  isLoading: boolean;
  error: { code: string; message: string; field?: string } | null;
  selectShippingRate: (
    packageId: string | number,
    rateId: string,
  ) => Promise<WCCart>;
  setStep: (step: CheckoutStep) => void;
  // ── Multi-address props ─────────────────────────────────────────────────
  /** Populated when the user chose "Ship to multiple addresses" in AddressStep */
  multiAddressGroups?: MultiShipGroup[];
  /** Called when the user picks a rate for one address group */
  onMultiRateChange?: (addressId: string, rateId: string) => void;
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

export function ShippingStep({
  shippingPackages,
  selectedRateId,
  cart,
  isLoading,
  error,
  selectShippingRate,
  setStep,
  multiAddressGroups,
  onMultiRateChange,
}: ShippingStepProps) {
  const symbol = cart?.totals.currency_symbol ?? "₹";
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;

  const cartNeedsShipping = cart?.needs_shipping !== false;
  const cartNeedsPayment = cart?.needs_payment !== false;
  const nextStep: CheckoutStep = cartNeedsPayment
    ? "awaiting_payment"
    : "placing_order";

  // ── Multi-address "Continue" state ────────────────────────────────────────
  // We track a local submitting flag because we fire one selectShippingRate
  // call (for the first group) before advancing the step.
  const [multiSubmitting, setMultiSubmitting] = useState(false);

  const isMultiMode = !!multiAddressGroups && multiAddressGroups.length > 0;

  // ── Multi-address mode ─────────────────────────────────────────────────────
  if (isMultiMode) {
    const availableRates = shippingPackages[0]?.shipping_rates ?? [];
    const allGroupsHaveRate = multiAddressGroups.every(
      (g) => g.selected_rate_id !== null,
    );
    const multiCanContinue =
      !isLoading && !multiSubmitting && allGroupsHaveRate;

    async function handleMultiContinue() {
      setMultiSubmitting(true);
      try {
        // Register the first group's rate with WC so cart totals are updated.
        const firstGroup = multiAddressGroups![0];
        if (firstGroup.selected_rate_id && shippingPackages[0]) {
          await selectShippingRate(
            shippingPackages[0].package_id,
            firstGroup.selected_rate_id,
          );
        }
        setStep(nextStep);
      } finally {
        setMultiSubmitting(false);
      }
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
          Shipping Methods
        </h3>

        {isLoading && !multiSubmitting && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div className="dot-loader">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {!isLoading && availableRates.length === 0 && (
          <div
            style={{
              padding: "12px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "11px",
              marginBottom: "12px",
            }}
          >
            <p
              style={{
                fontSize: "13px",
                color: "#ef4444",
                margin: "0 0 8px 0",
              }}
            >
              No shipping methods available for your address.
            </p>
            <button
              type="button"
              onClick={() => setStep("collecting_address")}
              style={{
                fontSize: "12px",
                background: "transparent",
                color: "#ef4444",
                border: "1px solid #fecaca",
                borderRadius: "8px",
                padding: "6px 10px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Edit address
            </button>
          </div>
        )}

        {/* One card per address group */}
        {!isLoading &&
          multiAddressGroups.map((group, idx) => (
            <div
              key={group.items[0]?.address_id ?? idx}
              style={{
                border: "1px solid #e8e6e0",
                borderRadius: "11px",
                overflow: "hidden",
                marginBottom: "14px",
              }}
            >
              {/* Group header */}
              <div
                style={{
                  padding: "10px 14px",
                  background: "#f5f4f1",
                  borderBottom: "1px solid #e8e6e0",
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#888",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    margin: "0 0 2px",
                  }}
                >
                  Shipment {idx + 1}
                </p>
                <p
                  style={{
                    fontSize: "12.5px",
                    fontWeight: 500,
                    color: "#1c1c1a",
                    margin: 0,
                  }}
                >
                  {makeAddressLabel(group.address)}
                </p>
                <p
                  style={{ fontSize: "11px", color: "#888", margin: "3px 0 0" }}
                >
                  {group.items
                    .map((i) => `${i.product_name} ×${i.quantity}`)
                    .join(", ")}
                </p>
              </div>

              {/* Rate options */}
              <div
                style={{
                  padding: "10px 14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {availableRates.map((rate) => {
                  const isSelected = rate.rate_id === group.selected_rate_id;
                  return (
                    <label
                      key={rate.rate_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 12px",
                        background: isSelected ? "#f5f4f1" : "#fff",
                        border: `1.5px solid ${isSelected ? "#1c1c1a" : "#e8e6e0"}`,
                        borderRadius: "9px",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                      }}
                    >
                      <input
                        type="radio"
                        name={`multi-rate-${group.items[0]?.address_id ?? idx}`}
                        value={rate.rate_id}
                        checked={isSelected}
                        onChange={() =>
                          onMultiRateChange?.(
                            group.items[0]?.address_id ?? "",
                            rate.rate_id,
                          )
                        }
                        style={{ accentColor: "#1c1c1a", flexShrink: 0 }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: "13px",
                          color: "#1c1c1a",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {rate.name}
                        {rate.delivery_time && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#999",
                              marginLeft: "6px",
                            }}
                          >
                            ({rate.delivery_time})
                          </span>
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          color: "#1c1c1a",
                        }}
                      >
                        {parseInt(rate.price, 10) === 0
                          ? "Free"
                          : formatPrice(rate.price, symbol, minorUnit)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

        {error && (
          <p style={{ fontSize: "12px", color: "#ef4444", margin: "8px 0" }}>
            {error.message}
          </p>
        )}

        <button
          type="button"
          disabled={!multiCanContinue}
          onClick={handleMultiContinue}
          style={{
            marginTop: "8px",
            width: "100%",
            padding: "12px",
            background: "#1c1c1a",
            color: "#fff",
            border: "none",
            borderRadius: "11px",
            fontFamily: "inherit",
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            cursor: multiCanContinue ? "pointer" : "not-allowed",
            opacity: multiCanContinue ? 1 : 0.5,
            transition: "opacity 0.2s",
          }}
        >
          {multiSubmitting ? "Saving…" : "Continue to Payment →"}
        </button>
      </div>
    );
  }

  // ── Single-address mode ───────────────────────────────────────────────────

  /**
   * When WooCommerce splits a single-destination cart into multiple packages
   * (e.g. one package per item), all packages typically offer the same set of
   * shipping methods. In that case we consolidate them into a single rate
   * picker: the user chooses once, and we apply the matching rate to every
   * package sequentially so the WC session is fully in sync.
   *
   * If the packages genuinely differ (different method sets), we fall back to
   * the original per-package UI so nothing is hidden.
   */
  function methodKey(rateId: string): string {
    // rate_id format is usually "method_id:instance_id" — normalise to method_id
    return rateId.split(":")[0];
  }

  const packagesShareSameMethods =
    shippingPackages.length <= 1 ||
    (() => {
      const firstMethods = shippingPackages[0].shipping_rates
        .map((r) => methodKey(r.rate_id))
        .sort()
        .join(",");
      return shippingPackages.every(
        (pkg) =>
          pkg.shipping_rates
            .map((r) => methodKey(r.rate_id))
            .sort()
            .join(",") === firstMethods,
      );
    })();

  /**
   * For the consolidated UI we render pkg[0]'s rates. When the user picks one,
   * we find the matching method in every package and call selectShippingRate
   * for each — sequentially to avoid cart state races.
   */
  async function handleSelect(packageId: string | number, rateId: string) {
    if (!packagesShareSameMethods || shippingPackages.length <= 1) {
      // Original behaviour — single package or genuinely different methods
      await selectShippingRate(packageId, rateId);
      return;
    }

    const selectedMethod = methodKey(rateId);
    for (const pkg of shippingPackages) {
      const match = pkg.shipping_rates.find(
        (r) => r.rate_id === rateId || methodKey(r.rate_id) === selectedMethod,
      );
      if (match) {
        await selectShippingRate(pkg.package_id, match.rate_id);
      }
    }
  }

  // Which packages to render: one representative entry when consolidated,
  // all entries when methods genuinely differ.
  const packagesToRender = packagesShareSameMethods
    ? shippingPackages.slice(0, 1)
    : shippingPackages;

  const hasPackages = shippingPackages.length > 0;
  const canContinue = !isLoading && (!cartNeedsShipping || !!selectedRateId);

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
        Shipping Method
      </h3>

      {!cartNeedsShipping && !isLoading && (
        <div
          style={{
            padding: "14px",
            background: "#f5f4f1",
            borderRadius: "11px",
            fontSize: "13px",
            color: "#1c1c1a",
            marginBottom: "12px",
          }}
        >
          No shipping selection is needed for this order. You can continue to
          review.
        </div>
      )}

      {cartNeedsShipping && !hasPackages && !isLoading && (
        <div
          style={{
            padding: "12px 14px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "11px",
            marginBottom: "12px",
          }}
        >
          <p
            style={{ fontSize: "13px", color: "#ef4444", margin: "0 0 8px 0" }}
          >
            No shipping methods available for your address.
          </p>
          <button
            type="button"
            onClick={() => setStep("collecting_address")}
            style={{
              fontSize: "12px",
              background: "transparent",
              color: "#ef4444",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              padding: "6px 10px",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Edit address
          </button>
        </div>
      )}

      {isLoading && (
        <div
          style={{ display: "flex", justifyContent: "center", padding: "20px" }}
        >
          <div className="dot-loader">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {!isLoading &&
        packagesToRender.map((pkg) => (
          <div key={pkg.package_id} style={{ marginBottom: "14px" }}>
            {/* Only label packages when they genuinely differ (not consolidated) */}
            {!packagesShareSameMethods && shippingPackages.length > 1 && (
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#888",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  marginBottom: "8px",
                }}
              >
                {pkg.name}
              </p>
            )}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "8px" }}
            >
              {pkg.shipping_rates.map((rate) => {
                const isSelected =
                  rate.rate_id === selectedRateId ||
                  // In consolidated mode, also highlight if the method matches
                  // the selected rate from any package (selectedRateId may come
                  // from a sibling package's rate_id variant).
                  (packagesShareSameMethods &&
                    !!selectedRateId &&
                    methodKey(rate.rate_id) === methodKey(selectedRateId));
                return (
                  <label
                    key={rate.rate_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "12px 14px",
                      background: isSelected ? "#f5f4f1" : "#fff",
                      border: `1.5px solid ${isSelected ? "#1c1c1a" : "#e8e6e0"}`,
                      borderRadius: "11px",
                      cursor: "pointer",
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                  >
                    <input
                      type="radio"
                      name={`shipping-rate-${pkg.package_id}`}
                      value={rate.rate_id}
                      checked={isSelected}
                      onChange={() =>
                        handleSelect(pkg.package_id, rate.rate_id)
                      }
                      style={{
                        accentColor: "#1c1c1a",
                        width: "15px",
                        height: "15px",
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        fontSize: "13px",
                        color: "#1c1c1a",
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {rate.name}
                      {rate.delivery_time && (
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#999",
                            marginLeft: "6px",
                          }}
                        >
                          ({rate.delivery_time})
                        </span>
                      )}
                    </span>
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "#1c1c1a",
                      }}
                    >
                      {parseInt(rate.price, 10) === 0
                        ? "Free"
                        : formatPrice(rate.price, symbol, minorUnit)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}

      {error && (
        <p style={{ fontSize: "12px", color: "#ef4444", margin: "8px 0" }}>
          {error.message}
        </p>
      )}

      <button
        type="button"
        disabled={!canContinue}
        onClick={() => setStep(nextStep)}
        style={{
          marginTop: "8px",
          width: "100%",
          padding: "12px",
          background: "#1c1c1a",
          color: "#fff",
          border: "none",
          borderRadius: "11px",
          fontFamily: "inherit",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          cursor: canContinue ? "pointer" : "not-allowed",
          opacity: canContinue ? 1 : 0.5,
          transition: "opacity 0.2s",
        }}
      >
        Continue to Review →
      </button>
    </div>
  );
}
