import { registerPaymentAdapter } from "./PaymentGatewayAdapter";
import { CodAdapter } from "./adapters/CodAdapter";

registerPaymentAdapter(CodAdapter);

// PR 4 ships COD only. Stripe / PayPal adapters land in a future PR.
