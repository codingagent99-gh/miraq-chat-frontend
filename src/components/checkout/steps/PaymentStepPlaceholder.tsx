/**
 * PaymentStepPlaceholder — visible in step indicator only.
 * Real payment integration arrives in PR 4 (COD adapter + PaymentGatewayAdapter interface).
 */
export function PaymentStepPlaceholder() {
  return (
    <div
      style={{
        padding: "32px 20px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
      }}
    >
      <div
        style={{
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          background: "#f5f4f1",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
        }}
      >
        💳
      </div>
      <p
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#1c1c1a",
          margin: 0,
        }}
      >
        Payment
      </p>
      <p style={{ fontSize: "12px", color: "#888", margin: 0, lineHeight: 1.5 }}>
        Payment integration coming in next release.
      </p>
    </div>
  );
}
