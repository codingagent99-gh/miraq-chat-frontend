import { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";

import "./LoginPanel.css";

interface LoginPanelProps {
  /** Absolute origin of the WordPress site the widget is embedded on. */
  siteOrigin: string;
  /** Shown above the form until the server supplies the store's own logo. */
  fallbackLogoUrl: string;
  /** Mark for the panel header — the tenant's uploaded logo, or the MiraQ one. */
  miraQIcon: string;
  onClose: () => void;
}

interface LoginMeta {
  /** Store logo URL. */
  logo: string;
  /** Store display name, shown in the panel header. */
  brand: string;
  /** WooCommerce lost-password URL. */
  lostPassword: string;
  /** WooCommerce registration URL. */
  register: string;
  /** woocommerce-login nonce. */
  nonce: string;
}

const LOGIN_META_PATH = "/wp-json/custom-api/v1/login-nonce";

/**
 * In-widget WooCommerce login.
 *
 * Nothing store-specific is compiled into the bundle. The logo, the store name
 * in the header and both footer links all come from LOGIN_META_PATH at runtime,
 * so one build serves every tenant. If that fetch fails the form still submits —
 * only the branding degrades to the bundled fallback and the two links hide.
 *
 * The POST itself targets core WooCommerce: `WC_Form_Handler::process_login()`
 * is hooked on `wp_loaded`, so it runs on any front-end request, which is why
 * posting to the site root works regardless of theme. The only field names used
 * are core ones (`username`, `password`, `rememberme`, `redirect`,
 * `woocommerce-login-nonce`, `login`) — no theme-specific fields.
 */
export function LoginPanel({
  siteOrigin,
  fallbackLogoUrl,
  miraQIcon,
  onClose,
}: LoginPanelProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<LoginMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${siteOrigin}${LOGIN_META_PATH}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setMeta(data);
      } catch {
        /* fallback branding is already rendered */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteOrigin]);

  const leavingWidget = () => {
    try {
      sessionStorage.setItem("silfra_panel_open", "false");
      sessionStorage.removeItem("silfra_resume_open");
    } catch {}
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");

    try {
      // Refetched rather than reused from the mount call above: the nonce is
      // the one field that expires, and a panel left open overnight would
      // otherwise POST a dead one — which process_login() rejects SILENTLY,
      // producing a button that does nothing.
      const nRes = await fetch(`${siteOrigin}${LOGIN_META_PATH}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!nRes.ok) throw new Error(`login-nonce ${nRes.status}`);
      const { nonce } = await nRes.json();

      const body = new URLSearchParams({
        username,
        password,
        redirect: window.location.href,
        "woocommerce-login-nonce": nonce,
        login: "Sign In",
      });
      // WooCommerce tests !empty($_POST['rememberme']) — omit, don't blank it.
      if (remember) body.set("rememberme", "forever");

      const res = await fetch(`${siteOrigin}/`, {
        method: "POST",
        body,
        credentials: "include",
        redirect: "manual",
      });

      const ok =
        res.type === "opaqueredirect" ||
        (res.status >= 300 && res.status < 400);

      if (ok) {
        // Honoured by the panelOpen initialiser in ChatWidget.tsx — reopens
        // the panel on every viewport after the reload.
        try {
          sessionStorage.setItem("silfra_resume_open", "true");
        } catch {}
        window.location.reload();
        return;
      }

      setError("That email or password didn't match. Try again.");
    } catch (err) {
      console.warn("[MiraQ] Widget login failed", err);
      setError("Couldn't reach the store. Check your connection and retry.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="miraq-login">
      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div className="xpert-profile-card">
        <div className="xpert-profile-card-info">
          <div className="xpert-profile-icon">
            <img
              style={{ height: "100%", width: "100%", borderRadius: "50%" }}
              src={miraQIcon}
              alt={meta?.brand || "Store"}
            />
          </div>
          <div className="xpert-profile-info">
            <p className="xpert-profile-label">Welcome to</p>
            {/* Store name comes from the server, never hardcoded — this bundle
                serves every tenant. Falls back to a neutral label rather than
                any one store's name. */}
            <h2 className="xpert-profile-name">{meta?.brand || "our store"}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="xpert-icon-btn"
            aria-label="Close widget"
            style={{ position: "absolute", right: "0px", top: "5px" }}
          >
            <FiX size={20} />
          </button>
        </div>
      </div>

      <div className="miraq-login-inner">
        <img
          className="miraq-login-logo"
          src={meta?.logo || fallbackLogoUrl}
          alt={meta?.brand ? `${meta.brand} logo` : "Store logo"}
        />
        <div className="miraq-login-card">
          <h3 className="miraq-login-title">Sign In</h3>

          <form onSubmit={submit} noValidate>
            <div className="miraq-login-row">
              <label htmlFor="miraq-username">
                Email Address or Username{" "}
                <span className="miraq-login-req">*</span>
              </label>
              <input
                id="miraq-username"
                className="miraq-login-input"
                type="text"
                autoComplete="username"
                placeholder="Enter your email or username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="miraq-login-row">
              <label htmlFor="miraq-password">
                Password <span className="miraq-login-req">*</span>
              </label>
              <input
                id="miraq-password"
                className="miraq-login-input"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <label className="miraq-login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember me</span>
            </label>

            {error && (
              <div className="miraq-login-error" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="miraq-login-submit"
              disabled={busy || !username || !password}
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {meta?.lostPassword && (
            <a
              className="miraq-login-lost"
              href={meta.lostPassword}
              target="_top"
              onClick={leavingWidget}
            >
              Forgot your password?
            </a>
          )}
        </div>

        {meta?.register && (
          <a
            className="miraq-login-register"
            href={meta.register}
            target="_top"
            onClick={leavingWidget}
          >
            Create an account
          </a>
        )}
      </div>
    </div>
  );
}
