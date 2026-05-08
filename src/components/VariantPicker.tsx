import { useState } from "react";

interface VariantPickerProps {
  /** Axes and their available options, e.g. { Colors: ["CORAL Argento", ...], Finish: [...] } */
  variantOptions: Record<string, string[]>;
  /** Called whenever the selection changes — receives the composed input string */
  onSelect: (text: string) => void;
}

/**
 * Renders one row of clickable chips per variation axis.
 * Selecting an option updates the chat input box; the user still presses
 * Send themselves (no auto-send).
 *
 * Behaviour:
 * - Click an unselected option  → select it, deselect any previous option on that axis.
 * - Click the already-selected  → deselect it (toggle off).
 * - After every click, compose a comma-separated string of all current
 *   selections and call onSelect() so the input box reflects the state.
 */
export function VariantPicker({
  variantOptions,
  onSelect,
}: VariantPickerProps) {
  const axes = Object.keys(variantOptions);
  const [selections, setSelections] = useState<Record<string, string>>({});

  const handleClick = (axis: string, option: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      if (next[axis] === option) {
        // Toggle off
        delete next[axis];
      } else {
        next[axis] = option;
      }

      // Compose the full selection string in axis order, skipping unselected axes
      const composed = axes
        .filter((a) => next[a] !== undefined)
        .map((a) => next[a])
        .join(", ");

      onSelect(composed);
      return next;
    });
  };

  return (
    <div className="xpert-variant-picker">
      {axes.map((axis) => (
        <div key={axis} className="xpert-variant-axis">
          <p className="xpert-variant-axis-label">{axis}</p>
          <div className="xpert-variant-chips">
            {variantOptions[axis].map((option) => {
              const isSelected = selections[axis] === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={`xpert-variant-chip${isSelected ? " xpert-variant-chip--selected" : ""}`}
                  onClick={() => handleClick(axis, option)}
                  aria-pressed={isSelected}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
