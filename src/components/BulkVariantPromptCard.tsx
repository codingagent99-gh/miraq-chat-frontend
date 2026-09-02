import { useState } from "react";

interface Attribute {
  name: string;
  options: string[];
}

interface Props {
  line_index: number;
  company: string;
  is_self_order: boolean;
  product_name: string;
  /** 0 means quantity was not specified — show qty picker */
  quantity: number;
  progress: { current: number; total: number };
  attributes: Attribute[];
  /**
   * Axis values the backend already resolved from the user's message
   * (e.g. "London White" -> { Colors: "LONDON White" }). Values match entries
   * in `attributes[].options` exactly, so they can be compared directly.
   * Used to seed the initial selection so the user isn't asked to re-pick
   * something they already stated.
   */
  preselected?: Record<string, string>;
  variations: { id: number; attributes: Record<string, string> }[];
  onConfirm: (message: string) => void;
}

export function BulkVariantPromptCard({
  company,
  product_name,
  quantity,
  progress,
  attributes,
  preselected,
  variations,
  onConfirm,
  is_self_order,
}: Props) {
  // Seed from what the backend already resolved. Only keep values that are
  // actually offered for that axis — a stale or renamed option would
  // otherwise show as chosen while matching no chip, leaving the user unable
  // to see or change it.
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    if (!preselected) return {};
    const seed: Record<string, string> = {};
    for (const attr of attributes) {
      const value = preselected[attr.name];
      if (value && attr.options.includes(value)) {
        seed[attr.name] = value;
      }
    }
    return seed;
  });
  const [qty, setQty] = useState<number>(quantity > 0 ? quantity : 0);
  const [customQty, setCustomQty] = useState("");

  // ── Combination awareness ────────────────────────────────────────────────
  // The axes are NOT independent. Allspice ships Beleza in Polished and Silky
  // only — there is no Beleza + Honed variation — but every Finish was offered
  // regardless, so an impossible pair could be selected, confirmed, and only
  // then fail to resolve.
  //
  // The backend already sends the full `variations` matrix in this payload;
  // it was declared in Props and never read. Everything below is derived from
  // it, so it stays correct for any product without a second source of truth.
  //
  // An axis MISSING from a variation means "Any" (the parent's options apply),
  // so a missing axis matches every value rather than none.
  const matchesSelection = (
    v: { attributes: Record<string, string> },
    sel: Record<string, string>,
    ignoreAxis?: string,
  ) =>
    Object.entries(sel).every(([axis, val]) => {
      if (!val || axis === ignoreAxis) return true;
      const have = v.attributes[axis];
      return have === undefined || have === val;
    });

  // An option is available when at least one real variation carries it
  // alongside everything else currently chosen.
  const isAvailable = (axis: string, opt: string) => {
    if (!variations || variations.length === 0) return true; // no matrix: never block
    return variations.some(
      (v) =>
        (v.attributes[axis] === undefined || v.attributes[axis] === opt) &&
        matchesSelection(v, selected, axis),
    );
  };

  // Picking a value can invalidate a choice made earlier on another axis.
  // Rather than leaving an impossible pair selected, drop the ones that no
  // longer fit — the axis simply returns to unanswered and is asked again.
  const pick = (axis: string, opt: string) =>
    setSelected((prev) => {
      // Clicking the option that's already chosen clears that axis. No other
      // axis needs re-checking: removing a constraint only ever WIDENS what's
      // possible, so nothing already selected can become invalid.
      if (prev[axis] === opt) {
        const cleared = { ...prev };
        delete cleared[axis];
        return cleared;
      }
      const next = { ...prev, [axis]: opt };
      if (!variations || variations.length === 0) return next;
      for (const other of Object.keys(next)) {
        if (other === axis) continue;
        const stillOk = variations.some(
          (v) =>
            (v.attributes[axis] === undefined || v.attributes[axis] === opt) &&
            (v.attributes[other] === undefined ||
              v.attributes[other] === next[other]),
        );
        if (!stillOk) delete next[other];
      }
      return next;
    });

  const allAttrsChosen = attributes.every((a) => selected[a.name]);
  const qtyChosen = quantity > 0 || qty > 0;
  // Guard the whole combination, not just "one value per axis" — belt and
  // braces alongside the per-option disabling above.
  const comboExists =
    !variations || variations.length === 0
      ? true
      : variations.some((v) => matchesSelection(v, selected));
  const canConfirm = allAttrsChosen && qtyChosen && comboExists;

  function handleConfirm() {
    const attrTokens = attributes.map((a) => selected[a.name]).filter(Boolean);
    const message = attrTokens.join(", ");

    // Only append a quantity when the backend didn't already have one.
    // quantity === 0 means the qty picker was shown. Appending an
    // already-known quantity puts a stray integer into the message.
    const needsQty = quantity === 0;
    onConfirm(needsQty && qty > 0 ? `${message} ${qty}` : message);
  }

  return (
    <div className="bo-variant">
      {/* Header */}
      <div className="bo-variant__header">
        <span className="bo-variant__progress">
          Step {progress.current} of {progress.total}
        </span>
        <strong className="bo-variant__product">{product_name}</strong>
        {!is_self_order && company && (
          <span className="bo-variant__company">for {company}</span>
        )}{" "}
      </div>

      {/* Attribute axes */}
      {attributes.map((attr) => (
        <div key={attr.name} className="bo-variant__axis">
          <p className="bo-variant__axis-label">{attr.name}</p>
          <div className="bo-variant__chips">
            {attr.options.map((opt) => {
              const isSelected = selected[attr.name] === opt;
              // A chosen option must always stay clickable so it can be
              // deselected — otherwise a value that later reads as
              // unavailable would be stuck on with no way to clear it.
              const avail = isSelected || isAvailable(attr.name, opt);
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={!avail}
                  title={
                    isSelected
                      ? "Click again to clear this choice"
                      : avail
                        ? undefined
                        : "Not available with the options selected above"
                  }
                  className={`xpert-variant-chip${
                    isSelected ? " xpert-variant-chip--selected" : ""
                  }${avail ? "" : " xpert-variant-chip--unavailable"}`}
                  onClick={() => avail && pick(attr.name, opt)}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Quantity — manual entry only, no predefined buttons */}
      {quantity === 0 && (
        <div className="bo-variant__axis">
          <p className="bo-variant__axis-label">Quantity</p>
          <p style={{ fontSize: "0.8rem", color: "#666", marginTop: 0 }}>
            Please enter the required quantity
          </p>
          <input
            className="bo-variant__qty-input"
            type="number"
            min={1}
            placeholder="Enter quantity"
            value={customQty}
            onChange={(e) => {
              setCustomQty(e.target.value);
              setQty(parseInt(e.target.value, 10) || 0);
            }}
            autoFocus
          />
        </div>
      )}

      <button
        className="xpert-suggestion-chip xpert-suggestion-chip--flow"
        onClick={handleConfirm}
        disabled={!canConfirm}
        type="button"
      >
        Confirm Selection
      </button>
    </div>
  );
}
