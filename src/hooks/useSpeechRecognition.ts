import { useState, useRef, useCallback } from "react";
import { toast } from "react-toastify";

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

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    // Create a fresh instance every time to avoid browser restart issues
    const recog = new SpeechRecognition();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = "en-US";

    recog.onresult = (event: any) => {
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setTranscript(currentTranscript);
    };

    recog.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      if (event.error === "not-allowed") {
        toast.error(
          "Microphone access denied. Please enable it in your browser settings.",
        );
      }
      setIsListening(false);
    };

    recog.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recog;

    try {
      setTranscript(""); // Clear old transcript before starting
      recog.start();
      setIsListening(true);
    } catch (e) {
      console.error("Could not start speech recognition:", e);
    }
  }, [isListening]);

  return {
    isListening,
    isSupported,
    transcript,
    toggleListening,
  };
}
