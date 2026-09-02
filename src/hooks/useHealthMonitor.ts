import { useCallback, useEffect, useRef, useState } from "react";

export interface HealthState {
  /** True whenever the chat screen should be covered by the down overlay. */
  blocking: boolean;
  checked: boolean;
  /** Last response was "degraded" — never blocking, just informational. */
  degraded: boolean;
  /** null means the fetch itself failed (backend unreachable) — no data to read. */
  components: { backend?: string; store?: string; upstream?: string } | null;
  retryAfterSeconds: number;
}

const DEFAULT_RETRY_HEALTHY = 30;
const DEFAULT_RETRY_DOWN = 5;

/**
 * Polls GET {apiUrl}/health per the server.py contract:
 *   - blocking === true, OR the fetch itself fails/times out → overlay
 *   - status === "degraded" → NOT blocking (working store)
 * Pauses while the tab is hidden; checks immediately on focus/visibility return.
 * forceCheck() lets a failed /chat POST trigger an immediate check instead of
 * waiting for the next scheduled poll (see note below on wiring that up).
 */
export function useHealthMonitor(apiUrl: string | undefined) {
  const [state, setState] = useState<HealthState>({
    blocking: false,
    checked: false,
    degraded: false,
    components: null,
    retryAfterSeconds: DEFAULT_RETRY_HEALTHY,
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const check = useCallback(async () => {
    if (!apiUrl || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${apiUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(t);
      const data = await res.json(); // 503 is still valid JSON on the down path
      setState({
        blocking: !!data.blocking,
        checked: true,
        degraded: data.status === "degraded",
        components: data.components ?? null,
        retryAfterSeconds:
          typeof data.retry_after_seconds === "number"
            ? data.retry_after_seconds
            : data.blocking
              ? DEFAULT_RETRY_DOWN
              : DEFAULT_RETRY_HEALTHY,
      });
    } catch {
      // Network error, timeout, non-JSON — backend unreachable outright.
      setState({
        blocking: true,
        checked: true,
        degraded: false,
        components: null,
        retryAfterSeconds: DEFAULT_RETRY_DOWN,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [apiUrl]);

  const scheduleNext = useCallback(
    (seconds: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (document.hidden) return; // resume via visibilitychange instead
      timerRef.current = setTimeout(check, seconds * 1000);
    },
    [check],
  );

  useEffect(() => {
    scheduleNext(state.retryAfterSeconds);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [state.retryAfterSeconds, scheduleNext]);

  useEffect(() => {
    check(); // first check on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [check]);

  return { ...state, forceCheck: check };
}
