/* eslint-disable react-refresh/only-export-components -- adapter registry file exports a non-component intentionally */
import { useEffect } from "react";
import type {
  PaymentGatewayAdapter,
  PaymentGatewayAdapterProps,
} from "../PaymentGatewayAdapter";

const CodComponent: React.FC<PaymentGatewayAdapterProps> = ({
  onPayloadChange,
}) => {
  useEffect(() => {
    onPayloadChange({
      payment_method: "cod",
      payment_data: [],
    });
    return () => onPayloadChange(null);
  }, [onPayloadChange]);

  return (
    <div className="miraq-cod-info">
      <p style={{ fontSize: "12px", color: "#555", margin: 0, lineHeight: 1.5 }}>
        Pay with cash when your order is delivered.
      </p>
    </div>
  );
};

export const CodAdapter: PaymentGatewayAdapter = {
  id: "cod",
  label: "Cash on Delivery",
  description: "Pay in cash upon delivery.",
  Component: CodComponent,
};
