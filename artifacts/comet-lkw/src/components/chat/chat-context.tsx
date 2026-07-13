import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { customFetch } from "@workspace/api-client-react";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/contexts/auth-context";

export interface ChatSession {
  id: number;
  created_by_user_id: number;
  created_by_name: string;
  claimed_by_user_id: number | null;
  claimed_by_name: string | null;
  target_role: "leitstand" | "admin";
  status: "bot" | "open" | "active" | "closed";
  ai_active: boolean;
  subject: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  sender_user_id: number;
  sender_name: string;
  content: string;
  sent_at: string;
}

interface TypingInfo {
  senderName: string;
  typing: boolean;
  userId: number;
}

interface ChatContextType {
  activeSession: ChatSession | null;
  messages: ChatMessage[];
  openSessions: ChatSession[];
  unclaimedCount: number;
  isPanelOpen: boolean;
  isInboxOpen: boolean;
  isLoading: boolean;
  isAiTyping: boolean;
  typingInfo: TypingInfo | null;
  setIsPanelOpen: (open: boolean) => void;
  setIsInboxOpen: (open: boolean) => void;
  openNewChat: (targetRole: "leitstand" | "admin", subject?: string) => Promise<void>;
  openExistingSession: (session: ChatSession) => Promise<void>;
  claimSession: (sessionId: number) => Promise<void>;
  closeSession: (sessionId?: number) => Promise<void>;
  escalateSession: () => Promise<void>;
  sendMessage: (content: string) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

const STAFF_ROLES = new Set(["comet_admin", "comet_leitstand"]);
export const AI_SENDER_ID = 0;

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isStaff = user ? STAFF_ROLES.has(user.role) : false;

  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [openSessions, setOpenSessions] = useState<ChatSession[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [typingInfo, setTypingInfo] = useState<TypingInfo | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unclaimedCount = openSessions.filter((s) => s.status === "open").length;

  // Load initial sessions
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const data = await customFetch("/api/chat/sessions");
        const all: ChatSession[] = data.sessions ?? [];
        if (isStaff) {
          // Staff see others' sessions in inbox, but can also have their own chat
          const mine = all.find((s) => s.created_by_user_id === user!.id) ?? null;
          const others = all.filter((s) => s.created_by_user_id !== user!.id);
          setOpenSessions(others);
          if (mine) {
            setActiveSession(mine);
            joinAndLoadMessages(mine.id);
          }
        } else {
          const existing = all[0] ?? null;
          if (existing) {
            setActiveSession(existing);
            joinAndLoadMessages(existing.id);
          }
        }
      } catch { /* ignore */ }
    };
    load();
  }, [user?.id]);

  const joinAndLoadMessages = useCallback(async (sessionId: number) => {
    const socket = getSocket();
    socket.emit("chat:join", { sessionId });
    try {
      const data = await customFetch(`/api/chat/sessions/${sessionId}/messages`);
      setMessages(data.messages ?? []);
    } catch { /* ignore */ }
  }, []);

  // Socket.IO listeners
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const onSessionNew = (session: ChatSession) => {
      if (isStaff) {
        // Upsert: update if already in list (e.g. status changed bot→open), insert if new
        setOpenSessions((prev) => {
          const idx = prev.findIndex((s) => s.id === session.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = session;
            return updated;
          }
          return [session, ...prev];
        });
      }
    };

    const onSessionUpdated = (session: ChatSession) => {
      if (isStaff) {
        setOpenSessions((prev) => {
          if (!prev.find((s) => s.id === session.id)) return prev;
          if (session.status === "closed") return prev.filter((s) => s.id !== session.id);
          return prev.map((s) => (s.id === session.id ? session : s));
        });
      }
      setActiveSession((prev) => (prev?.id === session.id ? session : prev));
    };

    const onSessionClaimed = (data: { sessionId: number; claimedByName: string; session: ChatSession }) => {
      setActiveSession((prev) => (prev?.id === data.sessionId ? data.session : prev));
    };

    const onSessionClosed = (data: { sessionId: number; session: ChatSession }) => {
      setActiveSession((prev) => (prev?.id === data.sessionId ? data.session : prev));
      if (isStaff) {
        setOpenSessions((prev) => prev.filter((s) => s.id !== data.sessionId));
      }
    };

    const onMessageNew = (message: ChatMessage) => {
      // If AI message arrives, stop AI typing indicator
      if (message.sender_user_id === AI_SENDER_ID) {
        setIsAiTyping(false);
        if (aiTypingTimerRef.current) clearTimeout(aiTypingTimerRef.current);
      }
      setMessages((prev) => {
        if (prev.find((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    };

    const onTyping = (info: TypingInfo) => {
      if (info.userId === user.id) return;
      setTypingInfo(info.typing ? info : null);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (info.typing) {
        typingTimerRef.current = setTimeout(() => setTypingInfo(null), 3000);
      }
    };

    socket.on("chat:session:new", onSessionNew);
    socket.on("chat:session:updated", onSessionUpdated);
    socket.on("chat:session:claimed", onSessionClaimed);
    socket.on("chat:session:closed", onSessionClosed);
    socket.on("chat:message:new", onMessageNew);
    socket.on("chat:typing", onTyping);

    return () => {
      socket.off("chat:session:new", onSessionNew);
      socket.off("chat:session:updated", onSessionUpdated);
      socket.off("chat:session:claimed", onSessionClaimed);
      socket.off("chat:session:closed", onSessionClosed);
      socket.off("chat:message:new", onMessageNew);
      socket.off("chat:typing", onTyping);
    };
  }, [user?.id, isStaff]);

  const openNewChat = useCallback(async (targetRole: "leitstand" | "admin", subject?: string) => {
    setIsLoading(true);
    try {
      const data = await customFetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetRole, subject }),
      });
      const session: ChatSession = data.session;
      setActiveSession(session);
      setMessages([]);
      await joinAndLoadMessages(session.id);
      setIsPanelOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, [joinAndLoadMessages]);

  const openExistingSession = useCallback(async (session: ChatSession) => {
    setActiveSession(session);
    setMessages([]);
    await joinAndLoadMessages(session.id);
    setIsInboxOpen(false);
    setIsPanelOpen(true);
  }, [joinAndLoadMessages]);

  const claimSession = useCallback(async (sessionId: number) => {
    const data = await customFetch(`/api/chat/sessions/${sessionId}/claim`, {
      method: "POST",
    });
    const session: ChatSession = data.session;
    setActiveSession(session);
    setMessages([]);
    await joinAndLoadMessages(session.id);
    setIsInboxOpen(false);
    setIsPanelOpen(true);
  }, [joinAndLoadMessages]);

  const escalateSession = useCallback(async () => {
    if (!activeSession) return;
    const data = await customFetch(`/api/chat/sessions/${activeSession.id}/escalate`, {
      method: "POST",
    });
    setActiveSession(data.session);
  }, [activeSession?.id]);

  const closeSession = useCallback(async (sessionId?: number) => {
    const id = sessionId ?? activeSession?.id;
    if (!id) return;
    await customFetch(`/api/chat/sessions/${id}/close`, { method: "POST" });
    if (!sessionId || sessionId === activeSession?.id) {
      setActiveSession((prev) => prev ? { ...prev, status: "closed" } : null);
    }
  }, [activeSession?.id]);

  const sendMessage = useCallback((content: string) => {
    if (!activeSession || !content.trim()) return;
    if (activeSession.ai_active) {
      // Show AI typing indicator with delay
      aiTypingTimerRef.current = setTimeout(() => {
        setIsAiTyping(true);
        // Auto-hide after 15s max
        aiTypingTimerRef.current = setTimeout(() => setIsAiTyping(false), 15000);
      }, 800);
    }
    const socket = getSocket();
    socket.emit("chat:message", { sessionId: activeSession.id, content: content.trim() });
  }, [activeSession?.id, activeSession?.ai_active]);

  return (
    <ChatContext.Provider value={{
      activeSession,
      messages,
      openSessions,
      unclaimedCount,
      isPanelOpen,
      isInboxOpen,
      isLoading,
      isAiTyping,
      typingInfo,
      setIsPanelOpen,
      setIsInboxOpen,
      openNewChat,
      openExistingSession,
      claimSession,
      closeSession,
      escalateSession,
      sendMessage,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within ChatProvider");
  return ctx;
}
