interface HomeScreenProps {
  onStartChat: () => void;
  miraQIcon: string;
  customerName?: string;
}

export function HomeScreen({
  onStartChat,
  miraQIcon,
  customerName,
}: HomeScreenProps) {
  // Use only the first word of the name so "John Doe" becomes "John"
  const firstName = customerName?.trim().split(/\s+/)[0];

  return (
    <div className="xpert-home-screen">
      <div className="xpert-profile-card">
        <div className="xpert-profile-icon">
          <img
            style={{ height: "100%", width: "100%" }}
            src={miraQIcon}
            alt="MiraQ"
          />
        </div>
        <div className="xpert-profile-info">
          <p className="xpert-profile-label">Welcome to</p>
          <h2 className="xpert-profile-name">MiraQ Commerce Assistant</h2>
          <p className="xpert-profile-sub">AI-Powered Shopping Help</p>
        </div>
        <div className="xpert-ready-badge">● Ready</div>
      </div>

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
            Start Shopping 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
