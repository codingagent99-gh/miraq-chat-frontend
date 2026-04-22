interface InlineFieldErrorProps {
  message?: string;
}

export function InlineFieldError({ message }: InlineFieldErrorProps) {
  if (!message) return null;
  return (
    <span
      style={{
        display: "block",
        fontSize: "11px",
        color: "#ef4444",
        marginTop: "3px",
        lineHeight: 1.4,
      }}
    >
      {message}
    </span>
  );
}
