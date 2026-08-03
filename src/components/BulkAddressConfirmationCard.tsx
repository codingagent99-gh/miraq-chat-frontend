import { useState } from "react";
import {
  useCheckoutFields,
  type CheckoutField,
} from "../hooks/useCheckoutFields";
import { InlineFieldError } from "./checkout/fields/InlineFieldError";
import type { AddressDict } from "../types/actions";

type AddrValues = Record<string, string | undefined>;

/** Field key → display label, per group, as returned by the backend gate. */
type ValidationErrors = {
  billing: Record<string, string>;
  shipping: Record<string, string>;
  meta: Record<string, string>;
};

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
  /**
   * Present only when the backend rejected this line. The backend's required
   * set is authoritative and is deliberately NOT synced with the one this card
   * derives from /checkout-fields, so these keys are honoured even where the
   * local `required` flag disagrees.
   */
  validation_errors?: ValidationErrors;
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

function isBlank(v: string | undefined): boolean {
  return !(v || "").trim();
}

export function BulkAddressConfirmationCard({
  customer_name,
  items_text,
  addr_str,
  billing,
  shipping,
  progress,
  validation_errors,
  siteOrigin,
  onConfirm,
  onSkip,
  onSave,
  onCancel,
}: Props) {
  // Backend-flagged keys. The "meta" group (order type, project name, rep)
  // lives on the billing block, so it merges into the billing key set.
  const backendBillingKeys = new Set([
    ...Object.keys(validation_errors?.billing ?? {}),
    ...Object.keys(validation_errors?.meta ?? {}),
  ]);
  const backendShippingKeys = new Set(
    Object.keys(validation_errors?.shipping ?? {}),
  );
  const hasBackendErrors =
    backendBillingKeys.size > 0 || backendShippingKeys.size > 0;

  // A backend rejection arrives as a NEW chat message, so this component
  // remounts with fresh props — these initialisers are enough, no effect sync
  // is needed. Open straight onto the panel with errors already showing so the
  // rep lands on the problem rather than on a card they have to re-open.
  const [editing, setEditing] = useState(hasBackendErrors);
  const [showErrors, setShowErrors] = useState(hasBackendErrors);

  const [billingForm, setBillingForm] = useState<AddrValues>({
    ...seed(billing),
    // Match the shipping default below: country is required, and a blank one
    // also leaves the state dropdown unpopulated.
    country: billing?.country || "US",
  });
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

  // ── Validation ────────────────────────────────────────────────────────────
  // A field counts as required if EITHER the local /checkout-fields flag says
  // so, or the backend flagged it on this line.
  function isRequired(f: CheckoutField, backendKeys: Set<string>): boolean {
    return f.required || backendKeys.has(f.key);
  }

  function missingIn(
    fields: CheckoutField[],
    values: AddrValues,
    backendKeys: Set<string>,
  ): CheckoutField[] {
    return fields.filter(
      (f) => isRequired(f, backendKeys) && isBlank(values[f.key]),
    );
  }

  const missingBilling = missingIn(
    billingFields,
    billingForm,
    backendBillingKeys,
  );
  const missingShipping = missingIn(
    shippingFields,
    shippingForm,
    backendShippingKeys,
  );
  const missingCount = missingBilling.length + missingShipping.length;
  const isValid = missingCount === 0;

  // Keys the backend rejected that this card doesn't render at all. Without
  // surfacing these the rep would face a Confirm button that keeps getting
  // rejected with no visible cause.
  const renderedKeys = new Set([
    ...billingFields.map((f) => f.key),
    ...shippingFields.map((f) => f.key),
  ]);
  const unrenderableErrors = [
    ...Object.entries(validation_errors?.billing ?? {}),
    ...Object.entries(validation_errors?.meta ?? {}),
    ...Object.entries(validation_errors?.shipping ?? {}),
  ]
    .filter(([key]) => !renderedKeys.has(key))
    .map(([, label]) => label);

  function statesFor(countryCode: string) {
    return countries.find((c) => c.code === countryCode)?.states ?? [];
  }

  function handleSave() {
    // Never a silently-dead button: surface which fields are blocking instead.
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    onSave(
      `__BULK_ADDR__${JSON.stringify({ billing: billingForm, shipping: shippingForm })}`,
    );
    setEditing(false);
  }

  function handleConfirm() {
    // The backend gate rejects this too, but blocking here means the rep gets
    // told which fields are missing instead of bouncing off a server error.
    if (!isValid) {
      setEditing(true);
      setShowErrors(true);
      return;
    }
    onConfirm();
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

  function renderSection(
    fields: CheckoutField[],
    values: AddrValues,
    set: (k: string, v: string) => void,
    backendKeys: Set<string>,
    keyPrefix: string,
  ) {
    return fields.map((f) => {
      const required = isRequired(f, backendKeys);
      const invalid = showErrors && required && isBlank(values[f.key]);
      return (
        <label key={`${keyPrefix}-${f.key}`} className="bo-address__field">
          <span className="bo-address__field-label">
            {f.label}
            {required ? " *" : ""}
          </span>
          {renderField(f, values, set)}
          <InlineFieldError message={invalid ? "Required" : undefined} />
        </label>
      );
    });
  }

  const missingSummary = (
    <p className="bo-address__missing" style={{ color: "#ef4444" }}>
      ⚠️ {missingCount} required field{missingCount === 1 ? "" : "s"} missing
      {unrenderableErrors.length > 0 && (
        <>
          {" "}
          ({unrenderableErrors.join(", ")} cannot be edited here — skip this
          order or fix it on the site)
        </>
      )}
    </p>
  );

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
          {!isValid && missingSummary}
          <div className="bo-confirm__btns">
            <button
              className={`bo-btn ${isValid ? "bo-btn--primary" : "bo-btn--secondary"}`}
              onClick={handleConfirm}
              disabled={!isValid}
              type="button"
            >
              ✓ Confirm
            </button>
            {/* When the address is incomplete, Change is the only action that
                can resolve it — promote it to primary. */}
            <button
              className={`bo-btn ${isValid ? "bo-btn--secondary" : "bo-btn--primary"}`}
              onClick={() => setEditing(true)}
              type="button"
            >
              ✏️ Change
            </button>
            {/* Skip aborts this line entirely, so it needs no address and must
                stay available as the rep's escape hatch. Never disable it. */}
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
            {renderSection(
              billingFields,
              billingForm,
              setB,
              backendBillingKeys,
              "b",
            )}
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
            {renderSection(
              shippingFields,
              shippingForm,
              setS,
              backendShippingKeys,
              "s",
            )}
          </div>

          {showErrors && !isValid && missingSummary}

          <div className="bo-confirm__btns">
            {/* Deliberately NOT disabled. A greyed-out Save with no indication
                of which of ~14 fields is blank is how reps ended up backing out
                and pressing Confirm instead. Pressing it while invalid reveals
                the per-field errors. */}
            <button
              className="bo-btn bo-btn--primary"
              onClick={handleSave}
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
