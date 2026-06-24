import { useState } from "react";
import {
  useCheckoutFields,
  type CheckoutField,
} from "../hooks/useCheckoutFields";
import type { AddressDict } from "../types/actions";

type AddrValues = Record<string, string | undefined>;

interface Props {
  customer_name: string;
  items_text: string;
  address: {
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postcode: string;
  };
  addr_str: string;
  billing?: AddrValues;
  shipping?: AddrValues;
  progress: { current: number; total: number };
  siteOrigin: string;
  onConfirm: () => void;
  onSkip: () => void;
  onSave: (message: string) => void;
  onCancel: () => void;
}

// Spread the incoming address values; renderField falls back to "" per key.
function seed(src?: AddressDict | AddrValues): AddrValues {
  return { ...(src || {}) } as AddrValues;
}

export function BulkAddressConfirmationCard({
  customer_name,
  items_text,
  addr_str,
  billing,
  shipping,
  progress,
  siteOrigin,
  onConfirm,
  onSkip,
  onSave,
  onCancel,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [billingForm, setBillingForm] = useState<AddrValues>(seed(billing));
  const [shippingForm, setShippingForm] = useState<AddrValues>({
    ...seed(shipping),
    // Default to US so the state dropdown renders immediately.
    // If the customer already has a non-US country it will be truthy and win.
    country: shipping?.country || "US",
  });

  const {
    countries,
    reps,
    orderTypeOptions,
    billingFields, // ← API-driven; no more hardcoded BILLING_FIELDS
    shippingFields, // ← API-driven; no more hardcoded SHIPPING_FIELDS
  } = useCheckoutFields(siteOrigin);

  const setB = (k: string, v: string) =>
    setBillingForm((p) => ({ ...p, [k]: v }));
  const setS = (k: string, v: string) =>
    setShippingForm((p) => ({ ...p, [k]: v }));

  // Required billing fields come directly from the API-parsed list.
  const requiredBilling = billingFields
    .filter((f) => f.required)
    .map((f) => f.key);
  const billingValid = requiredBilling.every((k) =>
    (billingForm[k] || "").trim(),
  );

  function statesFor(countryCode: string) {
    return countries.find((c) => c.code === countryCode)?.states ?? [];
  }

  function handleSave() {
    onSave(
      `__BULK_ADDR__${JSON.stringify({ billing: billingForm, shipping: shippingForm })}`,
    );
    setEditing(false);
  }

  // renderField now receives a full CheckoutField so it has access to .type
  // in addition to .kind, enabling textarea support for order_notes.
  function renderField(
    f: CheckoutField,
    values: AddrValues,
    set: (k: string, v: string) => void,
  ) {
    const v = values[f.key] ?? "";

    if (f.kind === "rep") {
      return (
        <select
          className="bo-address__input"
          value={v}
          onChange={(e) => set(f.key, e.target.value)}
        >
          <option value="">Select a rep…</option>
          {reps.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      );
    }

    if (f.kind === "orderType") {
      return (
        <select
          className="bo-address__input"
          value={v}
          onChange={(e) => set(f.key, e.target.value)}
        >
          <option value="">Select…</option>
          {orderTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }

    if (f.kind === "country") {
      return (
        <select
          className="bo-address__input"
          value={v}
          onChange={(e) => set(f.key, e.target.value)}
        >
          <option value="">Select a country…</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      );
    }

    if (f.kind === "state") {
      const states = statesFor(values.country ?? "");
      if (states.length > 0) {
        return (
          <select
            className="bo-address__input"
            value={v}
            onChange={(e) => set(f.key, e.target.value)}
          >
            <option value="">Select…</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        );
      }
      // Fall through to text input for countries with no state list.
    }

    if (f.type === "textarea") {
      return (
        <textarea
          className="bo-address__input"
          value={v}
          rows={3}
          onChange={(e) => set(f.key, e.target.value)}
        />
      );
    }

    return (
      <input
        className="bo-address__input"
        type={f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"}
        value={v}
        onChange={(e) => set(f.key, e.target.value)}
      />
    );
  }

  return (
    <div className="bo-address">
      <div className="bo-address__header">
        <span className="bo-address__progress">
          {progress.current} of {progress.total}
        </span>
        <strong className="bo-address__name">{customer_name}</strong>
      </div>

      <p className="bo-address__items">📦 {items_text}</p>

      {!editing && (
        <>
          <div className="bo-address__block">
            <p className="bo-address__label">📍 Shipping address</p>
            <p className="bo-address__value">
              {addr_str || <em>No address on file</em>}
            </p>
          </div>
          <div className="bo-confirm__btns">
            <button
              className="bo-btn bo-btn--primary"
              onClick={onConfirm}
              type="button"
            >
              ✓ Confirm
            </button>
            <button
              className="bo-btn bo-btn--secondary"
              onClick={() => setEditing(true)}
              type="button"
            >
              ✏️ Change
            </button>
            <button
              className="bo-btn bo-btn--ghost"
              onClick={onSkip}
              type="button"
            >
              ⏭ Skip
            </button>
          </div>
          {progress.total > 1 && (
            <div className="bo-confirm__cancel-row">
              <button
                className="bo-btn bo-btn--danger"
                onClick={onCancel}
                type="button"
              >
                ✕ Cancel bulk process
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="bo-address__panel">
          {/* ── Billing ── */}
          <div className="bo-address__panel-section">
            <p className="bo-address__label">🧾 Billing address</p>
            {billingFields.map((f) => (
              <label key={`b-${f.key}`} className="bo-address__field">
                <span className="bo-address__field-label">
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
                {renderField(f, billingForm, setB)}
              </label>
            ))}
          </div>

          {/* ── Shipping ── */}
          <div className="bo-address__panel-section">
            <div className="bo-address__panel-section-head">
              <p className="bo-address__label">📍 Shipping address</p>
              <button
                className="bo-btn bo-btn--ghost bo-address__copy"
                onClick={() =>
                  setShippingForm({
                    ...billingForm,
                    order_notes: shippingForm.order_notes,
                  })
                }
                type="button"
              >
                Same as billing
              </button>
            </div>
            {shippingFields.map((f) => (
              <label key={`s-${f.key}`} className="bo-address__field">
                <span className="bo-address__field-label">
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
                {renderField(f, shippingForm, setS)}
              </label>
            ))}
          </div>

          <div className="bo-confirm__btns">
            <button
              className="bo-btn bo-btn--primary"
              onClick={handleSave}
              disabled={!billingValid}
              type="button"
            >
              💾 Save
            </button>
            <button
              className="bo-btn bo-btn--ghost"
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
