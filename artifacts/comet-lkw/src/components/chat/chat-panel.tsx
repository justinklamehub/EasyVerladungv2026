import React, { useState, useEffect, useRef, KeyboardEvent, useCallback } from "react";
import { useChatContext, AI_SENDER_ID } from "./chat-context";
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
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Bot,
  UserRound,
  Headphones,
  Sparkles,
} from "lucide-react";

function renderMessageContent(content: string, isAi: boolean) {
  if (!isAi) {
    return (
      <span className="whitespace-pre-wrap break-words leading-snug text-sm">
        {content}
      </span>
    );
  }
  // AI messages: render **bold** and newlines
  const lines = content.split("\n");
  const rendered = lines.reduce<React.ReactNode[]>((acc, line, i) => {
    if (i > 0) acc.push(<br key={`br-${i}`} />);
    if (!line) return acc;
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    acc.push(
      ...parts.map((part, j) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={`${i}-${j}`}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={`${i}-${j}`}>{part}</span>
        ),
      ),
    );
    return acc;
  }, []);
  return <span className="break-words leading-snug text-sm">{rendered}</span>;
}

function statusBar(session: ReturnType<typeof useChatContext>["activeSession"]) {
  if (!session) return null;
  if (session.status === "closed") {
    return { text: "Chat beendet", color: "text-slate-500", bg: "bg-slate-100", icon: CheckCircle2 };
  }
  if (session.status === "active" && session.claimed_by_name) {
    return { text: `Verbunden mit ${session.claimed_by_name}`, color: "text-green-700", bg: "bg-green-50", icon: CheckCircle2 };
  }
  if (session.status === "open") {
    const role = session.target_role === "leitstand" ? "Leitstand" : "Admin";
    return { text: `Warte auf ${role}-Mitarbeiter…`, color: "text-orange-700", bg: "bg-orange-50", icon: Clock };
  }
  // bot mode
  return { text: "KI-Assistent aktiv", color: "text-blue-700", bg: "bg-blue-50", icon: Sparkles };
}

export function ChatPanel() {
  const { user } = useAuth();
  const {
    activeSession,
    messages,
    typingInfo,
    isAiTyping,
    isPanelOpen,
    setIsPanelOpen,
    sendMessage,
    closeSession,
    escalateSession,
  } = useChatContext();

  const [inputValue, setInputValue] = useState("");
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const confirmCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSessionIdRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const isClosed = activeSession?.status === "closed";
  const isAiMode = activeSession?.ai_active === true;
  const isWaitingForHuman = activeSession?.status === "open";

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingInfo, isAiTyping]);

  useEffect(() => {
    if (isPanelOpen && textareaRef.current && !isClosed) {
      textareaRef.current.focus();
    }
  }, [isPanelOpen, isClosed]);

  useEffect(() => {
    if (activeSession?.id && activeSession.id !== lastSessionIdRef.current) {
      lastSessionIdRef.current = activeSession.id;
      setInputValue("");
    }
  }, [activeSession?.id]);

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isClosed || isWaitingForHuman) return;
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
    if (!activeSession || isClosed || isWaitingForHuman) return;
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

  const handleEscalate = useCallback(async () => {
    setIsEscalating(true);
    setEscalateError(null);
    try {
      await escalateSession();
    } catch {
      setEscalateError("Fehler beim Verbinden. Bitte erneut versuchen.");
    } finally {
      setIsEscalating(false);
    }
  }, [escalateSession]);

  if (!isPanelOpen || !activeSession) return null;

  const bar = statusBar(activeSession);
  const Icon = bar?.icon ?? Clock;

  return (
    <div
      className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden"
      style={{ height: "500px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-4 h-4 shrink-0 text-slate-300" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">
              Support-Chat
              <Badge
                className={`ml-2 text-[10px] px-1.5 py-0 border-0 ${
                  activeSession.target_role === "admin"
                    ? "bg-purple-600 text-white"
                    : "bg-blue-500 text-white"
                }`}
              >
                {activeSession.target_role === "leitstand" ? "Leitstand" : "Admin"}
              </Badge>
            </p>
            {activeSession.subject && (
              <p className="text-xs text-slate-400 truncate">{activeSession.subject}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isClosed && !confirmClose && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-slate-400 hover:text-red-400 hover:bg-white/10"
              onClick={() => {
                setConfirmClose(true);
                confirmCloseTimerRef.current = setTimeout(() => setConfirmClose(false), 4000);
              }}
              title="Chat beenden"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          {!isClosed && confirmClose && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-red-300">Wirklich beenden?</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-900/30 hover:text-red-300"
                onClick={() => {
                  if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                  setConfirmClose(false);
                  closeSession();
                }}
              >
                Ja
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px] text-slate-400 hover:bg-white/10"
                onClick={() => {
                  if (confirmCloseTimerRef.current) clearTimeout(confirmCloseTimerRef.current);
                  setConfirmClose(false);
                }}
              >
                Nein
              </Button>
            </div>
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
      {bar && (
        <div className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium shrink-0 ${bar.bg} ${bar.color}`}>
          <Icon className={`w-3.5 h-3.5 shrink-0 ${isAiMode ? "animate-pulse" : ""}`} />
          {bar.text}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 gap-2 py-8">
            <Bot className="w-8 h-8 text-slate-300" />
            <p className="text-sm">KI-Assistent bereit…</p>
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender_user_id === user?.id;
          const isAi = msg.sender_user_id === AI_SENDER_ID;

          return (
            <div key={msg.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              {/* Avatar for AI / human staff */}
              {!isOwn && (
                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-1.5 mt-1 ${
                  isAi ? "bg-blue-100" : "bg-slate-200"
                }`}>
                  {isAi
                    ? <Bot className="w-3.5 h-3.5 text-blue-600" />
                    : <UserRound className="w-3.5 h-3.5 text-slate-600" />
                  }
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  isOwn
                    ? "bg-slate-900 text-white rounded-br-sm"
                    : isAi
                    ? "bg-blue-50 border border-blue-100 text-slate-900 rounded-bl-sm"
                    : "bg-white border border-slate-200 text-slate-900 rounded-bl-sm shadow-sm"
                }`}
              >
                {!isOwn && (
                  <div className={`text-[10px] font-semibold mb-0.5 ${isAi ? "text-blue-600" : "text-slate-500"}`}>
                    {isAi && <Bot className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
                    {msg.sender_name}
                  </div>
                )}
                <div className="break-words">{renderMessageContent(msg.content, isAi)}</div>
                <div className={`text-[10px] mt-1 text-right ${isOwn ? "text-slate-400" : "text-slate-400"}`}>
                  {format(new Date(msg.sent_at), "HH:mm", { locale: de })}
                </div>
              </div>
            </div>
          );
        })}

        {/* AI typing indicator */}
        {isAiTyping && (
          <div className="flex justify-start">
            <div className="shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center mr-1.5 mt-1">
              <Bot className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-bl-sm px-3 py-2">
              <p className="text-[10px] font-semibold text-blue-600 mb-1">KI-Assistent</p>
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* Human typing indicator */}
        {typingInfo?.typing && (
          <div className="flex justify-start">
            <div className="shrink-0 w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center mr-1.5 mt-1">
              <UserRound className="w-3.5 h-3.5 text-slate-600" />
            </div>
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

      {/* Escalation banner (only when in bot mode) */}
      {isAiMode && !isClosed && (
        <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="text-xs text-blue-700 flex-1">KI kann nicht helfen?</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800 shrink-0"
              onClick={handleEscalate}
              disabled={isEscalating}
            >
              <Headphones className="w-3 h-3 mr-1" />
              {isEscalating ? "Verbinde…" : "Mitarbeiter hinzuziehen"}
            </Button>
          </div>
          {escalateError && (
            <div className="mt-1 text-[11px] text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {escalateError}
            </div>
          )}
        </div>
      )}

      {/* Waiting for human banner */}
      {isWaitingForHuman && !isClosed && (
        <div className="px-3 py-2 bg-orange-50 border-t border-orange-100 shrink-0">
          <div className="flex items-center gap-2 text-xs text-orange-700">
            <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            Mitarbeiter wurde benachrichtigt, bitte warte kurz…
          </div>
        </div>
      )}

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
      ) : isWaitingForHuman ? (
        <div className="px-3 py-3 bg-white border-t border-slate-100 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Clock className="w-3.5 h-3.5 animate-pulse" />
            Eingabe deaktiviert – warte auf Mitarbeiter…
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
