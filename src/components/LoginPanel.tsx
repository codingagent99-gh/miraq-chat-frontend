import { useEffect, useState } from "react";
import { FiX } from "react-icons/fi";

interface LoginPanelProps {
  siteOrigin: string;
  fallbackLogoUrl: string;
  miraQIcon: string;
  login?: {
    logo: string;
    brand: string;
    lostPassword: string;
    register: string;
  };
  onClose: () => void;
}

interface LoginMeta {
  logo: string;
  brand: string;
  lostPassword: string;
  register: string;
}

import "./LoginPanel.css";
/**
 * In-widget WooCommerce login.
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

  // Branding + links come from the server so nothing store-specific is
  // compiled into the bundle. Failure here is cosmetic only — the form still
  // submits, it just shows the fallback mark and hides the two links.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${siteOrigin}/wp-json/custom-api/v1/login-nonce`,
          { credentials: "include", cache: "no-store" },
        );
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
      const nRes = await fetch(
        `${siteOrigin}/wp-json/custom-api/v1/login-nonce`,
        { credentials: "include", cache: "no-store" },
      );
      if (!nRes.ok) throw new Error(`login-nonce ${nRes.status}`);
      const { nonce } = await nRes.json();

      const body = new URLSearchParams({
        username,
        password,
        shoptimizer_login_redirect: window.location.href,
        shoptimizer_login_context: window.matchMedia("(max-width: 768px)")
          .matches
          ? "mobile"
          : "desktop",
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
      {/* ── MiraQ header ─────────────────────────────────────────────────── */}
      <div className="xpert-profile-card">
        <div className="xpert-profile-card-info">
          <div className="xpert-profile-icon">
            <img
              style={{ height: "100%", width: "100%", borderRadius: "50%" }}
              src={miraQIcon}
              alt="MiraQ"
            />
          </div>
          <div className="xpert-profile-info">
            <p className="xpert-profile-label">Welcome to</p>
            <h2 className="xpert-profile-name">Dandelion</h2>
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
            Join Our Community
          </a>
        )}
      </div>
    </div>
  );
}
