import type { AddressDict } from "../../types/actions";

interface SavedAddressConfirmCardProps {
  address: AddressDict;
  title: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  isLoading?: boolean;
}

function formatAddress(addr: AddressDict): string {
  const parts = [
    [addr.first_name, addr.last_name].filter(Boolean).join(" "),
    addr.company,
    addr.address_1,
    addr.address_2,
    [addr.city, addr.state, addr.postcode].filter(Boolean).join(", "),
    addr.country,
  ].filter(Boolean);
  return parts.join("\n");
}

/**
 * Generic saved-address confirmation card.
 * Used in AddressStep to confirm an existing address, and will be reused in
 * PR 5 to display a PROPOSE_CHECKOUT_ADDRESS parsed address.
 */
export function SavedAddressConfirmCard({
  address,
  title,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  isLoading,
}: SavedAddressConfirmCardProps) {
  const formatted = formatAddress(address);

  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #e8e6e0",
        borderRadius: "13px",
        padding: "14px 16px",
        marginBottom: "14px",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "#888",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: "8px",
        }}
      >
        {title}
      </p>
      <pre
        style={{
          fontFamily: "inherit",
          fontSize: "13px",
          color: "#1c1c1a",
          lineHeight: 1.6,
          margin: 0,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {formatted}
      </pre>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginTop: "14px",
        }}
      >
        <button
          type="button"
          onClick={onPrimary}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "10px",
            background: "#1c1c1a",
            color: "#fff",
            border: "none",
            borderRadius: "9px",
            fontFamily: "inherit",
            fontSize: "12.5px",
            fontWeight: 600,
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? 0.65 : 1,
            transition: "opacity 0.2s, background 0.2s",
          }}
        >
          {isLoading ? "Saving…" : primaryLabel}
        </button>
        <button
          type="button"
          onClick={onSecondary}
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "10px",
            background: "transparent",
            color: "#555",
            border: "1.5px solid #e8e6e0",
            borderRadius: "9px",
            fontFamily: "inherit",
            fontSize: "12.5px",
            fontWeight: 500,
            cursor: isLoading ? "not-allowed" : "pointer",
            transition: "border-color 0.15s, background 0.15s",
          }}
        >
          {secondaryLabel}
        </button>
      </div>
    </div>
  );
}
