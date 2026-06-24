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
  variations: { id: number; attributes: Record<string, string> }[];
  onConfirm: (message: string) => void;
}

const QUICK_QTYS = [1, 5, 10, 15, 25];

export function BulkVariantPromptCard({
  company,
  product_name,
  quantity,
  progress,
  attributes,
  onConfirm,
  is_self_order,
}: Props) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState<number>(quantity > 0 ? quantity : 0);
  const [customQty, setCustomQty] = useState("");

  const allAttrsChosen = attributes.every((a) => selected[a.name]);
  const qtyChosen = quantity > 0 || qty > 0;
  const canConfirm = allAttrsChosen && qtyChosen;

  function handleConfirm() {
    const attrTokens = attributes.map((a) => selected[a.name]).filter(Boolean);
    const message = attrTokens.join(", ");

    // Only append a quantity when the backend didn't already have one.
    // quantity === 0 means the qty picker was shown. Appending an
    // already-known quantity puts a stray integer into the message.
    const needsQty = quantity === 0;
    onConfirm(needsQty && qty > 0 ? `${message} ${qty}` : message);
  }

  const pick = (axis: string, opt: string) =>
    setSelected((prev) => ({ ...prev, [axis]: opt }));

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
            {attr.options.map((opt) => (
              <button
                key={opt}
                type="button"
                className={`xpert-variant-chip${selected[attr.name] === opt ? " xpert-variant-chip--selected" : ""}`}
                onClick={() => pick(attr.name, opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Quantity picker — only when backend says qty is missing */}
      {quantity === 0 && (
        <div className="bo-variant__axis">
          <p className="bo-variant__axis-label">Quantity</p>
          <div className="bo-variant__chips">
            {QUICK_QTYS.map((q) => (
              <button
                key={q}
                type="button"
                className={`xpert-variant-chip${qty === q && !customQty ? " xpert-variant-chip--selected" : ""}`}
                onClick={() => {
                  setQty(q);
                  setCustomQty("");
                }}
              >
                {q}
              </button>
            ))}
          </div>
          <input
            className="bo-variant__qty-input"
            type="number"
            min={1}
            placeholder="Other quantity…"
            value={customQty}
            onChange={(e) => {
              setCustomQty(e.target.value);
              setQty(parseInt(e.target.value, 10) || 0);
            }}
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
