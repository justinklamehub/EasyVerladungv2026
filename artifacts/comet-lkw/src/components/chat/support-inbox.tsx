import { useState } from "react";
import { useChatContext, ChatSession } from "./chat-context";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Headphones, UserCheck, MessageSquare, Clock, X, Zap, History } from "lucide-react";

function SessionCard({ session, isHistory = false }: { session: ChatSession; isHistory?: boolean }) {
  const { user } = useAuth();
  const { claimSession, openExistingSession, closeSession, forceEscalate } = useChatContext();
  const [confirmClose, setConfirmClose] = useState(false);

  const isMySession =
    session.claimed_by_user_id !== null && session.claimed_by_user_id === user?.id;
  const isClaimedByOther =
    session.claimed_by_user_id !== null && session.claimed_by_user_id !== user?.id;

  const timeRef = isHistory ? session.updated_at : session.created_at;
  const timeAgo = formatDistanceToNow(new Date(timeRef), { addSuffix: true, locale: de });

  const statusBadge = isHistory
    ? { label: "Beendet", cls: "bg-slate-100 text-slate-500" }
    : session.status === "open"
    ? { label: "Offen", cls: "bg-orange-100 text-orange-700" }
    : session.status === "bot"
    ? { label: "KI-Modus", cls: "bg-blue-100 text-blue-700" }
    : { label: "Aktiv", cls: "bg-green-100 text-green-700" };

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
      isHistory
        ? "border-slate-100 bg-slate-50/50"
        : session.status === "open"
        ? "border-orange-200 bg-orange-50/50 hover:bg-orange-50"
        : session.status === "bot"
        ? "border-blue-100 bg-blue-50/50"
        : isMySession
        ? "border-green-200 bg-green-50/50"
        : "border-slate-200 bg-white hover:bg-slate-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{session.created_by_name}</span>
            <Badge className={`text-[10px] px-1.5 py-0 border-0 ${
              session.target_role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
            }`}>
              {session.target_role === "leitstand" ? "Leitstand" : "Admin"}
            </Badge>
            <Badge className={`text-[10px] px-1.5 py-0 border-0 ${statusBadge.cls}`}>
              {statusBadge.label}
            </Badge>
          </div>
          {session.subject && (
            <p className="text-xs text-slate-500 mt-0.5 truncate">{session.subject}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
          <Clock className="w-3 h-3" />
          {timeAgo}
        </div>
      </div>

      {isClaimedByOther && !isHistory && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          Übernommen von {session.claimed_by_name}
        </p>
      )}
      {isHistory && session.claimed_by_name && (
        <p className="text-xs text-slate-400 flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          Bearbeitet von {session.claimed_by_name}
        </p>
      )}

      {!isHistory && (
        <div className="flex gap-2 flex-wrap">
          {/* Bot-Modus: KI überspringen */}
          {session.status === "bot" && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
              onClick={() => forceEscalate(session.id)}
            >
              <Zap className="w-3 h-3 mr-1.5" />
              KI überspringen
            </Button>
          )}
          {/* Offene Session übernehmen */}
          {session.status === "open" && !isClaimedByOther && (
            <Button
              size="sm"
              className="flex-1 h-8 text-xs bg-slate-900 hover:bg-slate-700"
              onClick={() => claimSession(session.id)}
            >
              <Headphones className="w-3 h-3 mr-1.5" />
              Übernehmen
            </Button>
          )}
          {/* Eigene oder fremde aktive Session öffnen */}
          {(isMySession || (isClaimedByOther && session.status === "active")) && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={() => openExistingSession(session)}
            >
              <MessageSquare className="w-3 h-3 mr-1.5" />
              Öffnen
            </Button>
          )}
          {session.status === "open" && isClaimedByOther && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs"
              onClick={() => openExistingSession(session)}
            >
              <MessageSquare className="w-3 h-3 mr-1.5" />
              Beobachten
            </Button>
          )}
          {/* Session schließen */}
          {!confirmClose ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50"
              onClick={() => setConfirmClose(true)}
              title="Session schließen"
            >
              <X className="w-3 h-3" />
            </Button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500">Schließen?</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px] text-red-600 hover:bg-red-50"
                onClick={() => { setConfirmClose(false); closeSession(session.id); }}
              >
                Ja
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[10px] text-slate-400 hover:bg-slate-100"
                onClick={() => setConfirmClose(false)}
              >
                Nein
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SupportInbox() {
  const {
    openSessions,
    closedSessions,
    showHistory,
    setShowHistory,
    unclaimedCount,
    isInboxOpen,
    setIsInboxOpen,
  } = useChatContext();

  const displaySessions = showHistory ? closedSessions : openSessions;

  return (
    <Sheet open={isInboxOpen} onOpenChange={setIsInboxOpen}>
      <SheetContent side="right" className="w-[400px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100">
              <Headphones className="w-5 h-5 text-slate-700" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base">Support-Inbox</SheetTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {showHistory
                  ? `${closedSessions.length} beendete Session${closedSessions.length !== 1 ? "s" : ""}`
                  : unclaimedCount > 0
                  ? `${unclaimedCount} wartende Anfrage${unclaimedCount !== 1 ? "n" : ""}`
                  : "Keine offenen Anfragen"}
              </p>
            </div>
            <Button
              size="sm"
              variant={showHistory ? "default" : "outline"}
              className={`h-8 text-xs shrink-0 ${showHistory ? "bg-slate-800 hover:bg-slate-700" : ""}`}
              onClick={() => setShowHistory(!showHistory)}
            >
              <History className="w-3.5 h-3.5 mr-1.5" />
              Verlauf
            </Button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {displaySessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-3">
              <div className="p-4 rounded-full bg-slate-100">
                {showHistory ? (
                  <History className="w-8 h-8 text-slate-300" />
                ) : (
                  <Headphones className="w-8 h-8 text-slate-300" />
                )}
              </div>
              <p className="text-sm font-medium">
                {showHistory ? "Keine abgeschlossenen Sessions" : "Keine aktiven Anfragen"}
              </p>
              <p className="text-xs">
                {showHistory
                  ? "Beendete Chats erscheinen hier."
                  : "Neue Anfragen erscheinen hier automatisch."}
              </p>
            </div>
          ) : (
            displaySessions.map((session) => (
              <SessionCard key={session.id} session={session} isHistory={showHistory} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
