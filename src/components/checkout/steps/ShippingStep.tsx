import type { ShippingPackage } from "../../../types/checkout";
import type { WCCart } from "../../../hooks/useCart";
import type { CheckoutStep } from "../../../types/checkout";

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
}: ShippingStepProps) {
  const symbol = cart?.totals.currency_symbol ?? "₹";
  const minorUnit = cart?.totals.currency_minor_unit ?? 2;

  async function handleSelect(packageId: string | number, rateId: string) {
    await selectShippingRate(packageId, rateId);
  }

  const hasPackages = shippingPackages.length > 0;

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

      {!hasPackages && !isLoading && (
        <p style={{ fontSize: "13px", color: "#888", textAlign: "center" }}>
          No shipping methods available for your address.
        </p>
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
        shippingPackages.map((pkg) => (
          <div key={pkg.package_id} style={{ marginBottom: "14px" }}>
            {shippingPackages.length > 1 && (
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
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {pkg.shipping_rates.map((rate) => {
                const isSelected = rate.rate_id === selectedRateId;
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
                      onChange={() => handleSelect(pkg.package_id, rate.rate_id)}
                      style={{ accentColor: "#1c1c1a", width: "15px", height: "15px" }}
                    />
                    <span style={{ flex: 1, fontSize: "13px", color: "#1c1c1a", fontWeight: isSelected ? 600 : 400 }}>
                      {rate.name}
                      {rate.delivery_time && (
                        <span style={{ fontSize: "11px", color: "#999", marginLeft: "6px" }}>
                          ({rate.delivery_time})
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#1c1c1a" }}>
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
        disabled={!selectedRateId || isLoading}
        onClick={() => setStep("placing_order")}
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
          cursor: !selectedRateId || isLoading ? "not-allowed" : "pointer",
          opacity: !selectedRateId || isLoading ? 0.5 : 1,
          transition: "opacity 0.2s",
        }}
      >
        Continue to Review →
      </button>
    </div>
  );
}
