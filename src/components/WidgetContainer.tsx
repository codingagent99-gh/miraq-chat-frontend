// import { FiShoppingCart } from "react-icons/fi";

interface WidgetContainerProps {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  assetBaseUrl: string;
  children: React.ReactNode;
}

export function WidgetContainer({
  panelOpen,
  setPanelOpen,
  children,
  assetBaseUrl,
}: WidgetContainerProps) {
  const MiraQIcon = `${assetBaseUrl}MiraQ-icon.png`;

  return (
    <>
      {!panelOpen && (
        <button
          className="xpert-floating-btn"
          onClick={() => setPanelOpen(true)}
          aria-label="Open chat"
        >
          <img src={MiraQIcon} height={24} width={24} />
          {/* <FiShoppingCart size={24} /> */}
        </button>
      )}

      {panelOpen && <div className="xpert-panel">{children}</div>}
    </>
  );
}
