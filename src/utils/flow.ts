import type {
  FlowState,
  FlowContext,
  ChatResponseMetadata,
} from "../types/api";

// ── Intents that indicate a guided-flow prompt ──
const FLOW_INTENTS = new Set(["disambiguation", "guided_flow"]);

// ── Flow states whose suggestions should render as prominent action buttons ──
const FLOW_STATES: Set<FlowState> = new Set([
  "awaiting_intent_choice",
  "awaiting_quantity",
  "awaiting_order_confirm",
  "awaiting_final_confirm",
  "awaiting_shipping_confirm",
  "awaiting_new_address",
  "awaiting_address_confirm",
  "awaiting_anything_else",
  "awaiting_variant_selection",
]);

/**
 * Returns true when the response should display suggestion chips
 * as prominent flow-action buttons instead of regular chips.
 */
export function isFlowPrompt(intent?: string, flowState?: FlowState): boolean {
  return (
    (!!intent && FLOW_INTENTS.has(intent)) ||
    (!!flowState && FLOW_STATES.has(flowState))
  );
}

/**
 * Derive updated FlowContext from a server response.
 * Merges metadata fields into the existing context; resets on idle/closing.
 */
export function buildFlowContext(
  current: FlowContext,
  res: { flow_state?: FlowState; metadata?: ChatResponseMetadata },
): FlowContext {
  const newState: FlowState =
    res.flow_state ?? res.metadata?.flow_state ?? "idle";

  // Reset everything when flow returns to idle or closing
  if (newState === "idle" || newState === "closing") {
    return { flow_state: newState };
  }

  // For resolved_attributes: if the server sent new ones, use them.
  // Otherwise keep what we had from the previous turn.
  const newResolved = res.metadata?.resolved_attributes;
  const mergedResolved =
    newResolved != null ? newResolved : current.resolved_attributes;

  return {
    flow_state: newState,
    pending_product_id:
      res.metadata?.pending_product_id ?? current.pending_product_id,
    pending_product_name:
      res.metadata?.pending_product_name ?? current.pending_product_name,
    pending_quantity:
      res.metadata?.pending_quantity ?? current.pending_quantity,
    pending_variation_id:
      res.metadata?.pending_variation_id ?? current.pending_variation_id,
    pending_shipping_address:
      res.metadata?.pending_shipping_address ??
      current.pending_shipping_address,
    use_existing_address:
      res.metadata?.use_existing_address ?? current.use_existing_address,
    use_new_address: res.metadata?.use_new_address ?? current.use_new_address,
    resolved_attributes: mergedResolved,
  };
}
