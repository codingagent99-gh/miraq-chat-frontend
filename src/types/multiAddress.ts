import type { AddressDict } from "./actions";

/** A named shipping destination saved during this checkout session */
export interface ShipAddress {
  id: string;
  label: string; // e.g. "John Smith – New York, NY"
  address: AddressDict;
}

/** One cart item's assignment to a shipping address */
export interface ItemAssignment {
  cart_key: string;
  product_name: string;
  quantity: number;
  address_id: string;
}

/** A group of items destined for the same address, with a chosen shipping rate */
export interface MultiShipGroup {
  address: AddressDict;
  items: ItemAssignment[];
  selected_rate_id: string | null;
}

/** Build a human-readable label from an address dict */
export function makeAddressLabel(addr: AddressDict): string {
  const name = [addr.first_name, addr.last_name].filter(Boolean).join(" ");
  const loc = [addr.city, addr.state].filter(Boolean).join(", ");
  return (
    [name, loc].filter(Boolean).join(" – ") ||
    String(addr.address_1 ?? "") ||
    "Address"
  );
}

/** Generate a lightweight unique ID for a saved address */
export function genAddressId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}
