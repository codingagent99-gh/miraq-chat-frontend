import { useState, useEffect } from "react";
import {
  useCheckoutFields,
  type CheckoutField,
} from "../hooks/useCheckoutFields";
import { InlineFieldError } from "./checkout/fields/InlineFieldError";
import { useCompanyAddresses } from "./checkout/fields/CompanyAddressSelector";
import {
  SavedAddressSelect,
  shouldShowSavedAddressSelect,
  isAddressSelectorField,
} from "./checkout/fields/SavedAddressSelect";
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
  /**
   * Email of the logged-in user, from __silfraWidgetConfig.customerEmail.
   * Used to default the rep select: membership of the rep option list IS the
   * "are they a rep" test, so no role list is duplicated here.
   */
  currentUserEmail?: string;
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
  currentUserEmail,
  // onConfirm is intentionally NOT destructured: Confirm now posts the form
  // via onSave (see handleConfirm). The prop stays on the interface so the
  // existing MessageRow call site keeps compiling, and so a future non-form
  // confirm surface has it available.
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

  // const [billingForm, setBillingForm] = useState<AddrValues>({
  //   ...seed(billing),
  //   // Match the shipping default below: country is required, and a blank one
  //   // also leaves the state dropdown unpopulated.
  //   country: billing?.country || "US",
  // });
  // const [shippingForm, setShippingForm] = useState<AddrValues>({
  //   ...seed(shipping),
  //   // Default to US so the state dropdown renders immediately.
  //   // If the customer already has a non-US country it will be truthy and win.
  //   country: shipping?.country || "US",
  // });

  const [billingForm, setBillingForm] = useState<AddrValues>({
    ...seed(billing),
    country: billing?.country || "US",
    // Hardcoded bulk-order default — rep can still edit.
    billing_project: billing?.billing_project || "test project",
  });
  const [shippingForm, setShippingForm] = useState<AddrValues>({
    ...seed(shipping),
    country: shipping?.country || "US",
  });

  const {
    countries,
    reps,
    orderTypeOptions,
    billingFields, // ← API-driven; no more hardcoded BILLING_FIELDS
    shippingFields, // ← API-driven; no more hardcoded SHIPPING_FIELDS
    isLoading: fieldsLoading,
  } = useCheckoutFields(siteOrigin);

  // Hardcoded bulk-order default for Order Type. It's a slug-backed <select>,
  // not free text, so it can't be seeded synchronously — wait for the options
  // to load, match "New Deal" by label, and write in the matching value. Only
  // fires while the field is blank, so it never overwrites a value the rep
  // already picked or one that came prefilled from the backend.
  useEffect(() => {
    if (billingForm.billing_field_type) return;
    if (orderTypeOptions.length === 0) return;
    const newDeal = orderTypeOptions.find(
      (o) => o.label.trim().toLowerCase() === "new deal",
    );
    if (newDeal) {
      setBillingForm((p) => ({ ...p, billing_field_type: newDeal.value }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderTypeOptions]);

  // The rep select's options come from the FIELD, not from /reps. The two are
  // different rosters: /reps is users holding a rep role, while the field's
  // option map is what the storefront checkout renders and what existing
  // _billing_project_rep values were chosen from. Driving the select off /reps
  // meant a stored value could match no option — which renders the select
  // blank while isBlank() still reads it as filled, so it slipped past the
  // required check and reached the order unseen. /reps stays as the fallback
  // for installs where the field registers no options.
  const repField = billingFields.find((f) => f.kind === "rep");
  const repOptions = repField?.options?.length ? repField.options : reps;

  // Rep default: the person placing the order picks themselves when they're a
  // rep. Option values are user emails, so the widget's own customerEmail
  // matches directly and membership of the list is the rep test — nothing here
  // has to mirror rep_roles() in PHP. Runs on [repOptions] only, so a rep who
  // then picks someone else is never overwritten.
  useEffect(() => {
    if (repOptions.length === 0) return;
    const norm = (s: string) => s.trim().toLowerCase();
    setBillingForm((p) => {
      const current = (p.project_rep ?? "").trim();
      if (current && repOptions.some((r) => norm(r.value) === norm(current))) {
        return p;
      }
      const me = currentUserEmail?.trim()
        ? repOptions.find((r) => norm(r.value) === norm(currentUserEmail))
        : undefined;
      // Not a rep (admin, customer) or no email: clear anything unmatched so
      // the field shows as missing rather than guessing a rep on their behalf.
      if (!me) return current ? { ...p, project_rep: "" } : p;
      return { ...p, project_rep: me.value };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repOptions, currentUserEmail]);

  // ── Saved company addresses ──
  // The picker belongs to the SHIPPING block (it chooses where goods go), so
  // it is driven by the shipping company, not the billing one — billing here
  // is the logged-in rep's own address and has nothing to do with the
  // customer's address book.
  //
  // Gated on the store actually having an Address Selector field: the
  // /company-addresses endpoint is bespoke to it, so on any other install
  // there is nowhere to show results and the request would be pure waste on
  // every keystroke.
  const hasAddressSelector = shippingFields.some((f) =>
    isAddressSelectorField(f.key),
  );
  const { matches: companyMatches } = useCompanyAddresses(
    siteOrigin ?? "",
    shippingForm.company ?? "",
    hasAddressSelector,
  );

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
      (f) =>
        !isAddressSelectorField(f.key) &&
        // Order Type / Rep can't be evaluated until their option lists have
        // loaded — treat "still loading" as "not yet known," not "missing,"
        // so Confirm doesn't flash blocked on first render.
        !(f.kind === "orderType" && orderTypeOptions.length === 0) &&
        !(f.kind === "rep" && repOptions.length === 0) &&
        isRequired(f, backendKeys) &&
        isBlank(values[f.key]),
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

  // The Address Selector is a UI affordance, not an address field — don't
  // ship its value to WooCommerce. Same rule as AddressForm.handleSubmit.
  const strip = (v: AddrValues): AddrValues => {
    const out = { ...v };
    for (const k of Object.keys(out)) {
      if (isAddressSelectorField(k)) delete out[k];
    }
    return out;
  };

  // The one place the panel's current values are turned into a message.
  // Shared by Save and Confirm so the two can never send different things.
  function addrPayload() {
    return `__BULK_ADDR__${JSON.stringify({
      billing: strip(billingForm),
      shipping: strip(shippingForm),
    })}`;
  }

  function handleSave() {
    // Same load-window guard as handleConfirm: saving now would persist a
    // form whose Order Type field may not even be rendered yet.
    if (fieldsLoading) return;
    // Never a silently-dead button: surface which fields are blocking instead.
    if (!isValid) {
      setShowErrors(true);
      return;
    }
    onSave(addrPayload());
    setEditing(false);
  }

  function handleConfirm() {
    // Field metadata is still in flight — the form is not what it will be in
    // a moment, so confirming now would post a half-populated one.
    //
    // Every default on this card except Project Name waits on a response:
    // Order Type's effect needs /order-types, and the rep auto-select needs
    // the option list from /checkout-fields. Worse, the Order Type FIELD
    // itself is only injected into billingFields once /order-types resolves,
    // so before that it isn't rendered, isn't in renderedKeys, and can't be
    // filled at all. Confirming inside that window posted blanks and the
    // backend answered "missing 2 required fields".
    //
    // This is why the flow appeared to work only after pressing Change: the
    // click never triggered the fetches (they start on mount), it just spent
    // long enough for them to land.
    if (fieldsLoading) return;
    // The backend gate rejects this too, but blocking here means the rep gets
    // told which fields are missing instead of bouncing off a server error.
    if (!isValid) {
      setEditing(true);
      setShowErrors(true);
      return;
    }
    // Send the FORM, not a bare "Yes, confirm".
    //
    // Several of these values exist only in this component until they are
    // posted: billing_project falls back to a default above, and
    // billing_field_type is written in by an effect once /order-types loads.
    // isValid is computed from that same local state, so Confirm used to pass
    // its own check and post a plain string carrying none of it — the backend
    // still had blanks and answered "missing 2 required fields: Order Type,
    // Project Name" while the panel sat there visibly showing both filled.
    // Confirming again just repeated it.
    //
    // __BULK_ADDR__ is not merely a "save": on success the backend marks the
    // line confirmed, propagates the decision and advances to the next line —
    // exactly what Confirm is for. So this is one message, not a save
    // followed by a racing confirm.
    onSave(addrPayload());
  }

  // renderField now receives a full CheckoutField so it has access to .type
  // in addition to .kind, enabling textarea support for order_notes.
  function renderField(
    f: CheckoutField,
    values: AddrValues,
    set: (k: string, v: string) => void,
  ) {
    // ── Address Selector ──
    // Not a real address field: it writes into the OTHER fields. Rendered via
    // the same shared component AddressForm uses so the string-id comparison
    // and option formatting can't drift between the two surfaces.
    if (isAddressSelectorField(f.key)) {
      return (
        <SavedAddressSelect
          className="bo-address__input"
          matches={companyMatches}
          fallbackCompany={shippingForm.company ?? ""}
          onPick={(addr) => setShippingForm((prev) => ({ ...prev, ...addr }))}
        />
      );
    }

    const v = values[f.key] ?? "";

    if (f.kind === "rep") {
      return (
        <select
          className="bo-address__input"
          value={v}
          onChange={(e) => set(f.key, e.target.value)}
        >
          <option value="">Select a rep…</option>
          {repOptions.map((r) => (
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
      // Hidden entirely until the lookup returns something — label included,
      // matching AddressForm. No company typed, lookup still running, or no
      // saved addresses on file all collapse to "render nothing".
      if (
        isAddressSelectorField(f.key) &&
        !shouldShowSavedAddressSelect(companyMatches)
      ) {
        return null;
      }

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
          {!isValid && !fieldsLoading && missingSummary}
          <div className="bo-confirm__btns">
            <button
              className={`bo-btn ${isValid && !fieldsLoading ? "bo-btn--primary" : "bo-btn--secondary"}`}
              onClick={handleConfirm}
              disabled={fieldsLoading || !isValid}
              type="button"
            >
              {fieldsLoading ? "Loading fields…" : "✓ Confirm"}
            </button>
            {/* When the address is incomplete, Change is the only action that
                can resolve it — promote it to primary.

                Also disabled while loading: opening the editor early is what
                made this bug look like a Change-button feature. The panel
                would render without the Order Type field, the rep select
                would have no options, and the defaults would land seconds
                later underneath the rep. */}
            <button
              className={`bo-btn ${isValid || fieldsLoading ? "bo-btn--secondary" : "bo-btn--primary"}`}
              onClick={() => setEditing(true)}
              disabled={fieldsLoading}
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
              disabled={fieldsLoading}
              type="button"
            >
              {fieldsLoading ? "Loading fields…" : "💾 Save"}
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
