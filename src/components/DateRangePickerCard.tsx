import { useState } from "react";

interface Props {
  /**
   * Identifies the prompt this card belongs to. Echoed back on submit; the
   * backend refuses a token it isn't currently waiting on, which is what stops
   * a card replayed from history from starting a report nobody asked for.
   */
  token: string;
  /** Rep the report is scoped to, shown for context. Null = all reps. */
  rep_name?: string | null;
  /** Phrase shortcuts sent as plain text through the normal NLP path. */
  quick_options?: string[];
  /** Sends a message as if the user typed it. */
  onSubmit: (message: string) => void;
  /** True once this card has been superseded — rendered read-only. */
  disabled?: boolean;
}

/** Today as YYYY-MM-DD in the LOCAL calendar.
 *
 * Deliberately built from the local date parts rather than
 * `toISOString().slice(0, 10)`: toISOString converts to UTC first, so for
 * anyone east of Greenwich the "today" it reports flips a day early in the
 * evening. Everything in this component stays on bare date strings for the
 * same reason — see handleApply.
 */
function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DateRangePickerCard({
  token,
  rep_name,
  quick_options,
  onSubmit,
  disabled = false,
}: Props) {
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");

  const today = todayLocal();
  const inverted = Boolean(after && before && after > before);
  const canApply = Boolean(after && before) && !inverted && !disabled;

  function send(payload: Record<string, unknown>) {
    if (disabled) return;
    onSubmit(`__DATE_RANGE__${JSON.stringify({ token, ...payload })}`);
  }

  function handleApply() {
    if (!canApply) return;
    // The input values are already bare YYYY-MM-DD strings in the user's own
    // calendar. They are passed through untouched — never through `new Date()`,
    // which would reinterpret them as UTC midnight and shift the whole window
    // back a day for any user in a positive-offset timezone. The backend
    // attaches the 00:00:00 / 23:59:59 bounds.
    send({ after, before });
  }

  return (
    <div className="bo-daterange">
      <div className="bo-daterange__header">
        <span className="bo-daterange__label">Report period</span>
        {rep_name && <span className="bo-daterange__rep">for {rep_name}</span>}
      </div>

      {quick_options && quick_options.length > 0 && (
        <div className="bo-daterange__chips">
          {quick_options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="bo-chip"
              disabled={disabled}
              onClick={() => onSubmit(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <div className="bo-daterange__fields">
        <label className="bo-daterange__field">
          <span className="bo-daterange__field-label">From</span>
          <input
            type="date"
            className="bo-daterange__input"
            value={after}
            max={before || today}
            disabled={disabled}
            onChange={(e) => setAfter(e.target.value)}
          />
        </label>
        <label className="bo-daterange__field">
          <span className="bo-daterange__field-label">To</span>
          <input
            type="date"
            className="bo-daterange__input"
            value={before}
            min={after || undefined}
            max={today}
            disabled={disabled}
            onChange={(e) => setBefore(e.target.value)}
          />
        </label>
      </div>

      {inverted && (
        <p className="bo-daterange__error">
          The start date is after the end date.
        </p>
      )}

      <div className="bo-daterange__actions">
        <button
          type="button"
          className="xpert-suggestion-chip xpert-suggestion-chip--flow bo-daterange__apply"
          disabled={!canApply}
          onClick={handleApply}
        >
          Apply range
        </button>
        <button
          type="button"
          className="bo-chip"
          disabled={disabled}
          onClick={() => send({ all_time: true })}
        >
          All time
        </button>
      </div>
    </div>
  );
}
