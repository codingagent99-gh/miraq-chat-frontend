interface SuggestionChipsProps {
  suggestions: string[];
  isFlowPrompt?: boolean;
  onSelect: (s: string) => void;
}

export function SuggestionChips({
  suggestions,
  isFlowPrompt,
  onSelect,
}: SuggestionChipsProps) {
  return (
    <div
      className={`xpert-suggestions ${isFlowPrompt ? "xpert-suggestions--flow" : ""}`}
    >
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          type="button"
          className={`xpert-suggestion-chip ${isFlowPrompt ? "xpert-suggestion-chip--flow" : ""}`}
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
}
