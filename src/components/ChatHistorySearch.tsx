import { useEffect, useRef, useState, Fragment } from "react";
import { FiArrowLeft, FiSearch, FiX } from "react-icons/fi";
import type {
  HistorySearchResponse,
  HistorySearchResult,
} from "../types/api";

/** Must match _HISTORY_SEARCH_MIN_LEN in routes/chat.py */
const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;

interface ChatHistorySearchProps {
  open: boolean;
  onClose: () => void;
  search: (q: string, signal?: AbortSignal) => Promise<HistorySearchResponse>;
  /** Resolves true once the hit is on screen; false keeps the panel open. */
  onSelect: (result: HistorySearchResult) => Promise<boolean>;
}

type Status = "idle" | "loading" | "done" | "error";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay(d, now)) return time;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday ${time}`;
  return d.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Wraps every case-insensitive occurrence of `q` in <mark>. */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="xpert-hs-mark">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

const MATCH_LABEL: Record<HistorySearchResult["matched_in"], string | null> = {
  text: null,
  product: "Product",
  order: "Order",
};

export function ChatHistorySearch({
  open,
  onClose,
  search,
  onSelect,
}: ChatHistorySearchProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<HistorySearchResult[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [openError, setOpenError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  // Bumped on every keystroke so a slower, older response can't overwrite a newer one.
  const reqSeqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const trimmed = query.trim();

  // Focus the box each time the panel opens. Query and results are kept
  // between opens so "back to results" after a jump costs nothing.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [open]);

  useEffect(() => {
    const seq = ++reqSeqRef.current;
    setOpenError(false);
    if (trimmed.length < MIN_QUERY_LEN) {
      setStatus("idle");
      setResults([]);
      setHasMore(false);
      setActiveIdx(-1);
      return;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await search(trimmed, ctrl.signal);
        if (seq !== reqSeqRef.current) return;
        setResults(res.results ?? []);
        setHasMore(!!res.has_more);
        setActiveIdx(-1);
        setStatus("done");
      } catch (err: any) {
        if (seq !== reqSeqRef.current || err?.name === "CanceledError") return;
        console.error("[MiraQ] history search failed", err);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // `search` is stable per customer (useCallback in useChat).
  }, [trimmed, search, retryTick]);

  // Keep the keyboard-selected row in view.
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  const choose = async (r: HistorySearchResult) => {
    if (openingId !== null) return;
    setOpeningId(r.message_id);
    setOpenError(false);
    try {
      const ok = await onSelect(r);
      if (ok) onClose();
      else setOpenError(true);
    } finally {
      setOpeningId(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActiveIdx((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0 && results[activeIdx]) {
      e.preventDefault();
      choose(results[activeIdx]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="xpert-hs-panel"
      role="dialog"
      aria-label="Search chat history"
      // On the panel, not the input: Escape closes from any control in it.
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="xpert-hs-bar">
        <button
          type="button"
          className="xpert-hs-icon-btn"
          onClick={onClose}
          aria-label="Close search"
        >
          <FiArrowLeft size={18} />
        </button>
        <div className="xpert-hs-input-wrap">
          <FiSearch size={15} className="xpert-hs-input-icon" aria-hidden />
          <input
            ref={inputRef}
            className="xpert-hs-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search products, orders, messages…"
            maxLength={100}
            aria-label="Search chat history"
            aria-controls="xpert-hs-results"
            aria-activedescendant={
              activeIdx >= 0 ? `xpert-hs-r-${activeIdx}` : undefined
            }
          />
          {query && (
            <button
              type="button"
              className="xpert-hs-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
            >
              <FiX size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="xpert-hs-body" aria-live="polite">
        {status === "idle" && (
          <p className="xpert-hs-hint">
            {trimmed.length > 0
              ? `Type at least ${MIN_QUERY_LEN} characters`
              : "Find anything from your past chats — a product name, an order number, or something you asked."}
          </p>
        )}

        {status === "loading" && results.length === 0 && (
          <div className="xpert-hs-hint">
            <span className="dot-loader" aria-label="Searching">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}

        {status === "error" && (
          <p className="xpert-hs-hint">
            Couldn't search right now.{" "}
            <button
              type="button"
              className="xpert-hs-link"
              onClick={() => setRetryTick((n) => n + 1)}
            >
              Try again
            </button>
          </p>
        )}

        {status === "done" && results.length === 0 && (
          <p className="xpert-hs-hint">No messages match "{trimmed}".</p>
        )}

        {openError && (
          <p className="xpert-hs-error" role="alert">
            Couldn't open that message. Please try again.
          </p>
        )}

        {results.length > 0 && status !== "error" && (
          <ul
            ref={listRef}
            id="xpert-hs-results"
            className={`xpert-hs-list${status === "loading" ? " xpert-hs-list--stale" : ""}`}
            role="listbox"
          >
            {results.map((r, i) => {
              const tag = MATCH_LABEL[r.matched_in];
              return (
                <li
                  key={r.message_id}
                  id={`xpert-hs-r-${i}`}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={`xpert-hs-item${i === activeIdx ? " is-active" : ""}`}
                  onClick={() => choose(r)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <div className="xpert-hs-meta">
                    <span className="xpert-hs-who">
                      {r.role === "user" ? "You" : "MiraQ"}
                    </span>
                    {tag && <span className="xpert-hs-tag">{tag}</span>}
                    {!r.is_current_session && (
                      <span className="xpert-hs-tag xpert-hs-tag--muted">
                        Earlier chat
                      </span>
                    )}
                    <span className="xpert-hs-when">
                      {openingId === r.message_id ? (
                        <span className="dot-loader" aria-label="Opening">
                          <span />
                          <span />
                          <span />
                        </span>
                      ) : (
                        formatWhen(r.timestamp)
                      )}
                    </span>
                  </div>
                  <p className="xpert-hs-snippet">
                    <Highlight text={r.snippet} q={trimmed} />
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {status === "done" && hasMore && (
          <p className="xpert-hs-footnote">
            Showing the {results.length} most recent matches. Add more words to
            narrow it down.
          </p>
        )}
      </div>
    </div>
  );
}
