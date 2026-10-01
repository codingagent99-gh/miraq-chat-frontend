import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "react-toastify";

// Errors after which listening must stop for good: retrying cannot succeed
// (permission refused, no microphone, service/language unavailable, offline)
// and would only spin. Anything else ("no-speech" after a long silence,
// a browser-side "aborted") just ends the current session, and onend starts
// the next one.
const FATAL_ERRORS = new Set([
  "not-allowed",
  "service-not-allowed",
  "audio-capture",
  "network",
  "language-not-supported",
]);

// Safety valve for the auto-restart below: if sessions keep ending almost as
// soon as they start (a browser refusing to keep the mic open), stop instead
// of restarting in a tight loop.
const RESTART_WINDOW_MS = 2000;
const MAX_RESTARTS_IN_WINDOW = 3;

function joinParts(...parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Voice typing that keeps listening until the user presses stop.
 *
 * The Web Speech API ends a session by itself: immediately at the first pause
 * when `continuous` is false (the old behaviour — the mic switched off as soon
 * as the shopper paused), and even with `continuous` true, browsers such as
 * Chrome still close it after several seconds of silence. So listening is a
 * chain of sessions: whenever the browser ends one and the user has NOT asked
 * to stop, a new one is started and the text heard so far is kept.
 */
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!(
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition
    );
  });
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  // True once the user pressed stop (or a fatal error / unmount happened):
  // the next onend must NOT start another session.
  const stopRequestedRef = useRef(true);
  // Text from earlier sessions in this listening run, and the latest text of
  // the current session (a session's results restart from empty).
  const committedRef = useRef("");
  const sessionTextRef = useRef("");
  const restartTimesRef = useRef<number[]>([]);

  const startSession = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return false;

    // Create a fresh instance every time to avoid browser restart issues
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "en-US";

    recog.onresult = (event: any) => {
      // Chrome starts each later piece with a space; not every browser does.
      // Add one only where neither side already has it.
      const sessionText = Array.from(event.results)
        .map((result: any) => result[0].transcript as string)
        .reduce(
          (acc, piece) =>
            acc && !/\s$/.test(acc) && !/^\s/.test(piece)
              ? `${acc} ${piece}`
              : acc + piece,
          "",
        );
      sessionTextRef.current = sessionText;
      setTranscript(joinParts(committedRef.current, sessionText));
    };

    recog.onerror = (event: any) => {
      if (FATAL_ERRORS.has(event.error)) {
        console.error("Speech recognition error", event.error);
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          toast.error(
            "Microphone access denied. Please enable it in your browser settings.",
          );
        }
        stopRequestedRef.current = true;
      }
      // Non-fatal ("no-speech", "aborted"): onend follows and restarts.
    };

    recog.onend = () => {
      // Keep what this session heard before the next one starts empty.
      committedRef.current = joinParts(
        committedRef.current,
        sessionTextRef.current,
      );
      sessionTextRef.current = "";

      if (stopRequestedRef.current) {
        setIsListening(false);
        return;
      }

      const now = Date.now();
      restartTimesRef.current = restartTimesRef.current
        .filter((t) => now - t < RESTART_WINDOW_MS)
        .concat(now);
      if (restartTimesRef.current.length > MAX_RESTARTS_IN_WINDOW) {
        console.warn("[MiraQ] Speech recognition keeps ending — stopping.");
        stopRequestedRef.current = true;
        setIsListening(false);
        return;
      }

      // The browser ended the session on its own (pause/silence): carry on.
      if (!startSession()) {
        stopRequestedRef.current = true;
        setIsListening(false);
      }
    };

    recognitionRef.current = recog;
    try {
      recog.start();
      return true;
    } catch (e) {
      console.error("Could not start speech recognition:", e);
      return false;
    }
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      // User asked to stop: onend will see this and not restart.
      stopRequestedRef.current = true;
      recognitionRef.current?.stop();
      return;
    }

    stopRequestedRef.current = false;
    committedRef.current = "";
    sessionTextRef.current = "";
    restartTimesRef.current = [];
    setTranscript(""); // Clear old transcript before starting

    if (startSession()) {
      setIsListening(true);
    } else {
      stopRequestedRef.current = true;
    }
  }, [isListening, startSession]);

  // Widget unmounted mid-dictation: stop for good, so onend can't restart.
  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      recognitionRef.current?.abort?.();
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    toggleListening,
  };
}
