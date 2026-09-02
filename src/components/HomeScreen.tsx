import {
  FiX,
  FiMaximize2,
  FiMinimize2,
  // FiCpu
} from "react-icons/fi";
interface HomeScreenProps {
  onStartChat: () => void;
  onClose: () => void;
  miraQIcon: string;
  customerName?: string;
  isLoggedIn?: boolean;
  aiMode?: boolean;
  onToggleAI?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function HomeScreen({
  onStartChat,
  onClose,
  miraQIcon,
  customerName,
  isLoggedIn = true,
  // aiMode = true,
  // onToggleAI,
  isExpanded,
  onToggleExpand,
}: HomeScreenProps) {
  const firstName = customerName?.trim().split(/\s+/)[0];

  // ── Shared header card ──
  const profileCard = (
    <div className="xpert-profile-card">
      <div className="xpert-profile-card-info">
        <div className="xpert-profile-icon">
          <img
            style={{ height: "100%", width: "100%" }}
            src={miraQIcon}
            alt="MiraQ"
          />
        </div>
        <div className="xpert-profile-info">
          <h2 className="xpert-profile-name">Welcome to Dandelion</h2>
          <p className="xpert-profile-sub">AI Powered Assistant</p>
        </div>

        {/* <span className="xpert-profile-divider" aria-hidden="true" /> */}

        {/* ── AI Mode Toggle ── */}
        {/* {onToggleAI && (
          <div
            className="xpert-ai-toggle"
            title={aiMode ? "Turn off AI mode" : "Turn on AI mode"}
          >
            <button
              role="switch"
              aria-checked={aiMode}
              aria-label="Toggle AI mode"
              className={`xpert-toggle-switch ${aiMode ? "xpert-toggle-on" : "xpert-toggle-off"}`}
              onClick={onToggleAI}
            >
              <FiCpu
                className="xpert-toggle-icon"
                size={13}
                aria-hidden="true"
              />
              <span className="xpert-toggle-thumb" />
            </button>
          </div>
        )} */}

        {onToggleExpand && (
          <button
            className="xpert-icon-btn"
            onClick={onToggleExpand}
            aria-label={isExpanded ? "Collapse panel" : "Expand panel"}
            style={{
              position: "absolute",
              right: "20px",
              top: "5px",
            }}
          >
            {isExpanded ? <FiMinimize2 size={18} /> : <FiMaximize2 size={18} />}
          </button>
        )}

        <button
          className="xpert-icon-btn"
          onClick={onClose}
          aria-label="Close widget"
          style={{
            position: "absolute",
            right: "0px",
            top: "5px",
          }}
        >
          <FiX size={20} />
        </button>
      </div>
      <div className="xpert-profile-accent" aria-hidden="true" />
    </div>
  );

  // ── Locked state ──
  if (!isLoggedIn) {
    return (
      <div className="xpert-home-screen">
        {profileCard}
        <div className="xpert-main-content">
          <div className="xpert-locked-state">
            <div className="xpert-locked-icon">🔒</div>
            <h3 className="xpert-locked-title">
              Login to access the Dandelion
            </h3>
            <p className="xpert-locked-desc">
              Please log in to your account to browse products, manage your
              cart, and track orders with AI assistance.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Logged-in state ──
  return (
    <div className="xpert-home-screen">
      {profileCard}
      <div className="xpert-main-content">
        {firstName ? (
          <>
            <h3 className="xpert-content-title">
              Hey {firstName}! 👋 How can I help you today?
            </h3>
            <p className="xpert-content-desc">
              Good to see you. I can help you find products, manage your cart,
              track orders, and more!
            </p>
          </>
        ) : (
          <>
            <h3 className="xpert-content-title">How can I help you today?</h3>
            <p className="xpert-content-desc">
              I can help you find products, manage your cart, track orders, and
              more!
            </p>
          </>
        )}

        <div className="xpert-features-list">
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">🔍</span>
            <span className="xpert-feature-text">
              Search and discover products
            </span>
          </div>
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">🛒</span>
            <span className="xpert-feature-text">
              Add items to cart and checkout
            </span>
          </div>
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">📦</span>
            <span className="xpert-feature-text">
              View and track your orders
            </span>
          </div>
          <div className="xpert-feature-item">
            <span className="xpert-feature-icon">💬</span>
            <span className="xpert-feature-text">
              Get instant shopping assistance
            </span>
          </div>
        </div>

        <div className="xpert-bottom-actions single-button">
          <button className="xpert-start-chat-btn" onClick={onStartChat}>
            Start exploring 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
