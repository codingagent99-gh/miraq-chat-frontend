import type { BulkOrderLine } from "../types/actions";

interface Props {
  lines?: BulkOrderLine[];
  resolved_count: number;
  unresolved_count: number;
  /**
   * Number of WooCommerce orders confirming will create. Several products for
   * the same recipient merge into ONE order, so this is usually lower than the
   * number of rows in the table. Optional: when the backend predates it, the
   * card falls back to resolved_count and behaves as before.
   */
  order_count?: number;
  /** Number of product lines ready — the row count. Defaults to resolved_count. */
  line_count?: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** One order's worth of lines — everything sharing a group_index. */
interface OrderGroup {
  kind: "group";
  groupIndex: number;
  header: BulkOrderLine;
  items: BulkOrderLine[];
}

/** An unresolved or skipped line — not part of any order, rendered on its own. */
interface SingleLine {
  kind: "single";
  line: BulkOrderLine;
}

type Row = OrderGroup | SingleLine;

function hasRealAddress(line: BulkOrderLine): boolean {
  return Boolean(
    line.shipping_address?.address_1 || line.billing_address?.address_1,
  );
}

/** Compact one-line address string, same field order as the per-line address card. */
function formatAddress(line: BulkOrderLine): string {
  const block = line.shipping_address?.address_1
    ? line.shipping_address
    : line.billing_address;
  if (!block) return "";
  return [
    block.address_1,
    block.address_2,
    block.city,
    block.state,
    block.postcode,
  ]
    .filter(Boolean)
    .join(", ");
}

function statusCell(line: BulkOrderLine): { icon: string; label: string } {
  // Skipped wins over everything: the rep explicitly chose not to place this
  // line, and it will NOT be ordered. Showing it as "Ready" (which it was,
  // until they skipped it) contradicts what actually happens.
  if (line.address_skipped) {
    return { icon: "⏭️", label: "Skipped" };
  }
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

/**
 * Collapse lines into render rows: consecutive-or-not lines sharing a
 * group_index become ONE OrderGroup (rendered at the position the group
 * first appears), so a multi-product order shows its address once instead
 * of once per product. Unresolved/skipped lines have no group_index and
 * always render as their own SingleLine — they aren't part of an order.
 */
function buildRows(lines: BulkOrderLine[]): Row[] {
  const rows: Row[] = [];
  const groupPositions = new Map<number, number>();

  for (const line of lines) {
    if (line.group_index != null) {
      const pos = groupPositions.get(line.group_index);
      if (pos === undefined) {
        groupPositions.set(line.group_index, rows.length);
        rows.push({
          kind: "group",
          groupIndex: line.group_index,
          header: line,
          items: [line],
        });
      } else {
        (rows[pos] as OrderGroup).items.push(line);
      }
    } else {
      rows.push({ kind: "single", line });
    }
  }
  return rows;
}

export function BulkOrderConfirmationCard({
  lines = [],
  resolved_count,
  unresolved_count,
  order_count,
  line_count,
  onConfirm,
  onCancel,
}: Props) {
  const readyLines = line_count ?? resolved_count;
  const readyOrders = order_count ?? resolved_count;

  const needsAddressCount = lines.filter(
    (line) =>
      !line.unresolved && !line.address_skipped && !hasRealAddress(line),
  ).length;

  if (!lines.length) {
    return <div className="bo-confirm">No orders to display.</div>;
  }

  const rows = buildRows(lines);

  return (
    <div className="bo-confirm">
      <p className="bo-confirm__title">📋 Bulk Order Summary</p>

      <div className="bo-confirm__groups">
        {rows.map((row, i) => {
          if (row.kind === "single") {
            const { line } = row;
            const { icon, label } = statusCell(line);
            return (
              <div key={i} className="bo-confirm__issue-row">
                <span className="bo-confirm__issue-who">
                  {line.customer_display_name || "—"}
                </span>
                <span className="bo-confirm__issue-what">
                  {line.product_name || "—"} ×{line.quantity || "—"}
                </span>
                <span className="bo-confirm__status">
                  {icon} {label}
                </span>
              </div>
            );
          }

          const { header, items } = row;
          const { icon, label } = statusCell(header);
          const address = hasRealAddress(header) ? formatAddress(header) : "";

          return (
            <div key={i} className="bo-confirm__group">
              <div className="bo-confirm__group-head">
                <span className="bo-confirm__group-name">
                  {header.customer_display_name || "—"}
                </span>
                <span className="bo-confirm__status">
                  {icon} {label}
                </span>
              </div>

              {address ? (
                <p className="bo-confirm__group-address">📍 {address}</p>
              ) : (
                <p className="bo-confirm__group-address bo-confirm__group-address--warn">
                  ⚠️ No address on file
                </p>
              )}

              <div className="bo-confirm__group-items">
                {items.map((item, j) => (
                  <div key={j} className="bo-confirm__group-item">
                    <span>{item.product_name || "—"}</span>
                    <span className="bo-confirm__group-item-qty">
                      ×{item.quantity || "—"}
                    </span>
                  </div>
                ))}
              </div>
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
          ⚠️ {needsAddressCount} line(s) have no address on file — you'll need
          to add one before they can be placed.
        </p>
      )}

      <p className="bo-confirm__ready">
        ✅{" "}
        {readyOrders !== readyLines
          ? `${readyLines} product(s) in ${readyOrders} order(s) ready to place.`
          : `${readyOrders} order(s) ready to place.`}
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
