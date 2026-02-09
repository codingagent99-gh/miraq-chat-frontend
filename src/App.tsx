import "bootstrap/dist/css/bootstrap.min.css";
import "./App.css";

// import { useEffect } from "react";
import ChatHeader from "./components/ChatHeaders";
import MessageBubble from "./components/MessageBubble";
import TypingIndicator from "./components/TypingIndicator";
import ChatInput from "./components/ChatInput";
import { useChat } from "./hooks/useChat";

const WELCOME_TEXT =
  "Hi there! ☕ I'm your coffee shopping assistant. I can help you find the perfect coffee products.\n\n" +
  "Try something like:\n• *Show me filter coffee under $200*\n• *What's on sale?*\n• *I want cheap instant coffee*";

export default function App() {
  const {
    messages,
    loading,
    userEmail, // NEW
    updateEmail, // NEW
    sendMessage,
    clearAll,
    bottomRef,
  } = useChat();

  // useEffect(() => {
  //   if (messages.length === 0) {
  //     sendMessage("hi");
  //   }
  // }, []);

  return (
    <div className="chat-shell">
      <ChatHeader
        onClear={clearAll}
        userEmail={userEmail} // NEW
        onEmailUpdate={updateEmail} // NEW
      />

      {/* scrollable message area */}
      <div className="chat-body">
        {/* welcome card only when truly empty (before greeting resolves) */}
        {messages.length === 0 && !loading && (
          <div className="welcome-card">
            <span className="welcome-icon">☕</span>
            <p
              className="welcome-text"
              dangerouslySetInnerHTML={{
                __html: WELCOME_TEXT.replace(/\n/g, "<br/>").replace(
                  /\*(.+?)\*/g,
                  "<em>$1</em>",
                ),
              }}
            />
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSuggestion={sendMessage}
          />
        ))}

        {loading && <TypingIndicator />}

        {/* anchor for auto-scroll */}
        <div ref={bottomRef} />
      </div>

      <ChatInput loading={loading} onSend={sendMessage} />
    </div>
  );
}
