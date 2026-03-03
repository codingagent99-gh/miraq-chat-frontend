import type { FilterSuggestion } from "../types/api";

// Icons as inline SVGs to avoid additional icon library dependencies
function TagIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function CategoryIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function AttributeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="12" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function BroadenIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function getIcon(type: FilterSuggestion["type"]) {
  switch (type) {
    case "tag":
      return <TagIcon />;
    case "category":
      return <CategoryIcon />;
    case "attribute":
      return <AttributeIcon />;
    case "broaden":
      return <BroadenIcon />;
  }
}

interface FilterSuggestionChipsProps {
  suggestions: FilterSuggestion[];
  onSelect: (suggestion: FilterSuggestion) => void;
}

export function FilterSuggestionChips({
  suggestions,
  onSelect,
}: FilterSuggestionChipsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="xpert-filter-suggestions">
      <span className="xpert-filter-suggestions-label">Try instead:</span>
      <div className="xpert-filter-suggestions-row">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            type="button"
            className={`xpert-filter-chip xpert-filter-chip--${suggestion.type}`}
            onClick={() => onSelect(suggestion)}
          >
            <span className="xpert-filter-chip-icon">
              {getIcon(suggestion.type)}
            </span>
            <span className="xpert-filter-chip-label">{suggestion.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
