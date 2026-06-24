import type { BulkOrderLine } from "../types/actions";

interface Props {
  lines?: BulkOrderLine[];
  resolved_count: number;
  unresolved_count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function hasRealAddress(line: BulkOrderLine): boolean {
  return Boolean(
    line.shipping_address?.address_1 || line.billing_address?.address_1,
  );
}

function statusCell(line: BulkOrderLine): { icon: string; label: string } {
  if (!line.unresolved) {
    return hasRealAddress(line)
      ? { icon: "✅", label: "Ready" }
      : { icon: "⚠️", label: "No address on file" };
  }
  switch (line.unresolved_reason) {
    case "product_not_found":
      return { icon: "❌", label: "Product not found" };
    case "company_not_found":
      return { icon: "❌", label: "Customer not found" };
    case "both_not_found":
      return { icon: "❌", label: "Both not found" };
    default:
      return { icon: "❌", label: "Unresolved" };
  }
}

export function BulkOrderConfirmationCard({
  lines = [],
  resolved_count,
  unresolved_count,
  onConfirm,
  onCancel,
}: Props) {
  const needsAddressCount = lines.filter(
    (line) => !line.unresolved && !hasRealAddress(line),
  ).length;

  if (!lines.length) {
    return <div className="bo-confirm">No orders to display.</div>;
  }
  return (
    <div className="bo-confirm">
      <p className="bo-confirm__title">📋 Bulk Order Summary</p>

      <div className="bo-confirm__table">
        <div className="bo-confirm__thead">
          <span>Customer</span>
          <span>Product</span>
          <span>Qty</span>
          <span>Status</span>
        </div>

        {lines.map((line, i) => {
          const { icon, label } = statusCell(line);
          const needsAddress = !line.unresolved && !hasRealAddress(line);
          return (
            <div
              key={i}
              className={`bo-confirm__row${
                line.unresolved
                  ? " bo-confirm__row--skip"
                  : needsAddress
                    ? " bo-confirm__row--warn"
                    : ""
              }`}
            >
              <span>{line.customer_display_name || "—"}</span>
              <span>{line.product_name || "—"}</span>
              <span>{line.quantity || "—"}</span>
              <span className="bo-confirm__status">
                {icon} {label}
              </span>
            </div>
          );
        })}
      </div>

      {unresolved_count > 0 && (
        <p className="bo-confirm__warning">
          ⚠️ {unresolved_count} line(s) cannot be resolved and will be skipped.
        </p>
      )}

      {needsAddressCount > 0 && (
        <p className="bo-confirm__warning">
          ⚠️ {needsAddressCount} order(s) have no address on file — you'll need
          to add one before they can be placed.
        </p>
      )}

      <p className="bo-confirm__ready">
        ✅ {resolved_count} order(s) ready to place.
      </p>

      <div className="bo-confirm__btns">
        <button
          className="bo-btn bo-btn--primary"
          onClick={onConfirm}
          type="button"
        >
          ✓ Confirm
        </button>
        <button
          className="bo-btn bo-btn--ghost"
          onClick={onCancel}
          type="button"
        >
          ✕ Cancel
        </button>
      </div>
    </div>
  );
}
