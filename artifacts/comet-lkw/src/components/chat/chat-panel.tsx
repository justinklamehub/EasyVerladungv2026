import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useChatContext } from "./chat-context";
import { useAuth } from "@/contexts/auth-context";
import { getSocket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  X,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

function statusLabel(status: string, targetRole: string, claimedByName: string | null) {
  if (status === "closed") return { text: "Chat beendet", color: "text-slate-500", bg: "bg-slate-100" };
  if (status === "active" && claimedByName) {
    return { text: `Verbunden mit ${claimedByName}`, color: "text-green-700", bg: "bg-green-50" };
  }
  const role = targetRole === "leitstand" ? "Leitstand" : "Admin";
  return { text: `Warte auf ${role}-Mitarbeiter…`, color: "text-orange-700", bg: "bg-orange-50" };
}

export function ChatPanel() {
  const { user } = useAuth();
  const { activeSession, messages, typingInfo, isPanelOpen, setIsPanelOpen, sendMessage, closeSession } = useChatContext();
  const [inputValue, setInputValue] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSessionIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const isClosed = activeSession?.status === "closed";

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingInfo]);

  useEffect(() => {
    if (isPanelOpen && textareaRef.current && !isClosed) {
      textareaRef.current.focus();
    }
  }, [isPanelOpen, isClosed]);

  // Reset input on new session
  useEffect(() => {
    if (activeSession?.id && activeSession.id !== lastSessionIdRef.current) {
      lastSessionIdRef.current = activeSession.id;
      setInputValue("");
    }
  }, [activeSession?.id]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isClosed) return;
    sendMessage(trimmed);
    setInputValue("");
    stopTyping();
  };

  const stopTyping = () => {
    if (isTypingRef.current && activeSession) {
      getSocket().emit("chat:typing", { sessionId: activeSession.id, typing: false });
      isTypingRef.current = false;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleInputChange = (val: string) => {
    setInputValue(val);
    if (!activeSession || isClosed) return;
    if (!isTypingRef.current) {
      getSocket().emit("chat:typing", { sessionId: activeSession.id, typing: true });
      isTypingRef.current = true;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(stopTyping, 2000);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isPanelOpen || !activeSession) return null;

  const info = statusLabel(activeSession.status, activeSession.target_role, activeSession.claimed_by_name);

  return (
    <div className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
      style={{ height: "480px" }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 shrink-0 text-slate-300" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              Support-Chat
              <Badge className={`ml-2 text-[10px] px-1.5 py-0 ${
                activeSession.target_role === "admin"
                  ? "bg-purple-600 text-white border-0"
                  : "bg-blue-500 text-white border-0"
              }`}>
                {activeSession.target_role === "leitstand" ? "Leitstand" : "Admin"}
              </Badge>
            </p>
            {activeSession.subject && (
              <p className="text-xs text-slate-400 truncate">{activeSession.subject}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isClosed && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-white/10"
              onClick={() => closeSession()}
              title="Chat beenden"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-slate-400 hover:text-white hover:bg-white/10"
            onClick={() => setIsPanelOpen(false)}
            title="Minimieren"
          >
            <span className="text-lg leading-none mb-1">—</span>
          </Button>
        </div>
      </div>

      {/* Status bar */}
      <div className={`flex items-center gap-2 px-4 py-2 text-xs font-medium shrink-0 ${info.bg} ${info.color}`}>
        {isClosed
          ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          : activeSession.status === "active"
          ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          : <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
        }
        {info.text}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
        {messages.length === 0 && !isClosed && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 gap-2 py-8">
            <MessageSquare className="w-8 h-8 text-slate-300" />
            <p className="text-sm">Starte die Unterhaltung…</p>
            <p className="text-xs">Ein Mitarbeiter wird sich gleich melden.</p>
          </div>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender_user_id === user?.id;
          return (
            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                isOwn
                  ? "bg-slate-900 text-white rounded-br-sm"
                  : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm shadow-sm"
              }`}>
                {!isOwn && (
                  <p className="text-[10px] font-semibold mb-0.5 text-slate-500">{msg.sender_name}</p>
                )}
                <p className="whitespace-pre-wrap break-words leading-snug">{msg.content}</p>
                <p className={`text-[10px] mt-1 text-right ${isOwn ? "text-slate-400" : "text-slate-400"}`}>
                  {format(new Date(msg.sent_at), "HH:mm", { locale: de })}
                </p>
              </div>
            </div>
          );
        })}

        {typingInfo?.typing && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3 py-2 shadow-sm">
              <p className="text-[10px] font-semibold text-slate-500 mb-1">{typingInfo.senderName}</p>
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isClosed ? (
        <div className="px-4 py-3 bg-white border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <AlertCircle className="w-4 h-4 shrink-0 text-slate-400" />
            <span>Chat wurde beendet.</span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto text-xs h-7"
              onClick={() => setIsPanelOpen(false)}
            >
              Schließen
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 bg-white border-t border-slate-100 shrink-0 flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nachricht schreiben… (Enter zum Senden)"
            className="resize-none min-h-[36px] max-h-[80px] text-sm py-2 rounded-xl border-slate-200"
            rows={1}
          />
          <Button
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0 bg-slate-900 hover:bg-slate-700"
            onClick={handleSend}
            disabled={!inputValue.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
