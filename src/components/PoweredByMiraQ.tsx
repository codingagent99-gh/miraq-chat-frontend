interface PoweredByMiraQProps {
  /**
   * True once the store has applied its own branding (logo and/or text). The
   * bar is hidden entirely on a default install, where the MiraQ mark is still
   * on screen and attribution would be redundant.
   */
  show: boolean;
  /**
   * Footer text set by the store. When present it REPLACES the attribution
   * rather than sitting alongside it — the two share one slot.
   */
  text?: string;
  logoUrl: string;
}

/**
 * Footer bar pinned to the bottom of the widget panel.
 *
 * Rendered as the last child of the panel container on every screen (login,
 * AI opt-in, home, chat) rather than inside any one of them, so it survives
 * screen switches and stays below the cart/checkout overlays.
 */
export function PoweredByMiraQ({ show, text, logoUrl }: PoweredByMiraQProps) {
  if (!show) return null;

  // trim() so a stray space saved in the admin field doesn't count as custom
  // text and silently blank out the attribution.
  const custom = text?.trim();

  return (
    <div className="miraq-powered-by">
      {custom ? (
        custom
      ) : (
        <span className="miraq-attribution">
          <span>Powered by</span>
          <img src={logoUrl} alt="MiraQ" className="miraq-logo" />
        </span>
      )}
    </div>
  );
}
