import { FiShoppingCart } from "react-icons/fi";

interface WidgetContainerProps {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  children: React.ReactNode;
}

export function WidgetContainer({
  panelOpen,
  setPanelOpen,
  children,
}: WidgetContainerProps) {
  return (
    <>
      {!panelOpen && (
        <button
          className="xpert-floating-btn"
          onClick={() => setPanelOpen(true)}
          aria-label="Open chat"
        >
          <FiShoppingCart size={24} />
        </button>
      )}

      {panelOpen && <div className="xpert-panel">{children}</div>}
    </>
  );
}
