import type { Order, OrderItem } from "../types/api";

/**
 * CSV export for order data.
 *
 * Two grains, deliberately different:
 *   - buildOrdersCsv()  — one row per ORDER, for "Download all". Summing
 *     order_total gives the true revenue for the list.
 *   - buildOrderCsv()   — one row per LINE ITEM, for a single order's export.
 *     Order-level fields repeat down the rows, so order_total must NOT be
 *     summed; the column is named distinctly from line_total for that reason.
 *
 * The two files are not concatenable. They answer different questions.
 */

/** Cells that would be interpreted as a formula when opened in a spreadsheet. */
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Escape one cell.
 *
 * Two separate jobs, and both matter:
 *
 * 1. CSV quoting — commas, quotes and newlines appear routinely in addresses
 *    and product names, and unquoted they shift every later column.
 *
 * 2. Formula neutralisation — a cell beginning with =, +, -, or @ is executed
 *    by Excel, Google Sheets and LibreOffice on open. Customer names and
 *    address lines land in this file unmodified from user input, so a value
 *    like `=HYPERLINK(...)` would run on the admin's machine. A leading
 *    apostrophe forces the cell to text. This is why every cell goes through
 *    here rather than only the ones that "look risky".
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s = String(value);
  if (FORMULA_PREFIXES.some((p) => s.startsWith(p))) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function row(values: unknown[]): string {
  return values.map(cell).join(",");
}

/** Address block reader tolerant of this store's field naming. */
function addr(block: Record<string, any> | undefined) {
  const b = block || {};
  const street = [b.address_1, b.address_2].filter(Boolean).join(", ");
  const name = [b.first_name, b.last_name].filter(Boolean).join(" ");
  // The store registers company as billing_company_name / shipping_company_name
  // (THWCFE) rather than WooCommerce's standard `company`. Reading only the
  // standard key returns empty for every order on this store, so check both.
  const company = b.company_name || b.company || "";
  return {
    name,
    company,
    email: b.email || "",
    phone: b.phone || "",
    street,
    city: b.city || "",
    state: b.state || "",
    postcode: b.postcode || "",
    country: b.country || "",
  };
}

function orderCoreValues(o: Order): unknown[] {
  const b = addr(o.billing);
  const s = addr(o.shipping);
  return [
    o.order_number,
    o.id,
    o.status,
    o.date_created,
    o.date_paid ?? "",
    o.date_completed ?? "",
    o.customer_name ?? "",
    o.customer_email ?? "",
    // 0 means guest checkout, not "missing" — preserved as 0 so a filter on
    // guest orders is possible.
    o.customer_id ?? "",
    o.currency_code ?? "",
    o.subtotal ?? "",
    o.discount_total ?? "",
    o.shipping_total ?? "",
    o.tax_total ?? "",
    o.total,
    o.payment_method ?? "",
    b.name,
    b.company,
    b.email,
    b.phone,
    b.street,
    b.city,
    b.state,
    b.postcode,
    b.country,
    s.name,
    s.company,
    s.street,
    s.city,
    s.state,
    s.postcode,
    s.country,
  ];
}

const ORDER_CORE_HEADERS = [
  "order_number",
  "order_id",
  "status",
  "date_created",
  "date_paid",
  "date_completed",
  "customer_name",
  "customer_email",
  "customer_id",
  "currency_code",
  "subtotal",
  "discount_total",
  "shipping_total",
  "tax_total",
  "order_total",
  "payment_method",
  "billing_name",
  "billing_company",
  "billing_email",
  "billing_phone",
  "billing_street",
  "billing_city",
  "billing_state",
  "billing_postcode",
  "billing_country",
  "shipping_name",
  "shipping_company",
  "shipping_street",
  "shipping_city",
  "shipping_state",
  "shipping_postcode",
  "shipping_country",
];

function variationText(item: OrderItem): string {
  const attrs = (item as any).variation_attributes;
  if (!attrs) return "";
  if (Array.isArray(attrs)) {
    return (
      attrs
        // `attribute` is the key the OrderItem type actually uses; `name`/
        // `option` are the raw WooCommerce spellings, kept as fallbacks so this
        // survives either shape reaching the widget.
        .map(
          (a: any) =>
            `${a.attribute ?? a.name ?? a.key ?? ""}: ${a.option ?? a.value ?? ""}`,
        )
        .filter((s) => s.trim() !== ":")
        .join(" | ")
    );
  }
  if (typeof attrs === "object") {
    return Object.entries(attrs)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
  }
  return String(attrs);
}

/** One row per order — the "Download all" grain. */
export function buildOrdersCsv(orders: Order[]): string {
  const headers = [
    ...ORDER_CORE_HEADERS,
    "line_item_count",
    "total_quantity",
    "items_summary",
  ];
  const lines = [row(headers)];

  for (const o of orders) {
    const items = o.items || [];
    const totalQty = items.reduce(
      (sum, it) => sum + (Number(it.quantity) || 0),
      0,
    );
    const summary = items
      .map((it) => {
        const sku = (it as any).sku;
        return `${sku ? sku + " " : ""}×${it.quantity} — ${it.name}`;
      })
      .join("; ");
    lines.push(row([...orderCoreValues(o), items.length, totalQty, summary]));
  }
  return lines.join("\r\n");
}

/** One row per line item — the single-order grain. */
export function buildOrderCsv(order: Order): string {
  const headers = [
    ...ORDER_CORE_HEADERS,
    "line_number",
    "item_name",
    "sku",
    "variation_attributes",
    "quantity",
    "line_total",
  ];
  const lines = [row(headers)];
  const core = orderCoreValues(order);
  const items = order.items || [];

  if (items.length === 0) {
    lines.push(row([...core, "", "", "", "", "", ""]));
    return lines.join("\r\n");
  }

  items.forEach((it, i) => {
    lines.push(
      row([
        ...core,
        i + 1,
        it.name,
        (it as any).sku ?? "",
        variationText(it),
        it.quantity,
        it.total,
      ]),
    );
  });
  return lines.join("\r\n");
}

/**
 * Trigger a browser download.
 *
 * The BOM is not optional: without it Excel decodes the file as the system
 * codepage, so currency symbols and any non-ASCII customer name arrive
 * mojibaked. It costs three bytes and prevents a class of "the export is
 * corrupted" reports.
 *
 * The anchor is appended to document.body rather than the widget's own root
 * because this component renders inside a shadow root, where a synthetic
 * click on a detached or shadow-contained anchor does not reliably start a
 * download in all browsers.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoked on a later tick: revoking synchronously can cancel the download
  // in some browsers before it has started reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Safe, sortable filename stem for an export. */
export function csvFilename(parts: string[]): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const stem = parts
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
  return `${stem}-${stamp}.csv`;
}
