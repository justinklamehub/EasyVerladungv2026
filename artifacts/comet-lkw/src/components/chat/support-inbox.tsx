import { useChatContext, ChatSession } from "./chat-context";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Headphones, UserCheck, MessageSquare, Clock } from "lucide-react";

function SessionCard({ session }: { session: ChatSession }) {
  const { user } = useAuth();
  const { claimSession, openExistingSession } = useChatContext();

  const isMySession =
    session.claimed_by_user_id !== null && session.claimed_by_user_id === user?.id;
  const isClaimedByOther =
    session.claimed_by_user_id !== null && session.claimed_by_user_id !== user?.id;

  const timeAgo = formatDistanceToNow(new Date(session.created_at), {
    addSuffix: true,
    locale: de,
  });

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
      session.status === "open"
        ? "border-orange-200 bg-orange-50/50 hover:bg-orange-50"
        : isMySession
        ? "border-green-200 bg-green-50/50"
        : "border-slate-200 bg-white hover:bg-slate-50"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-slate-900">{session.created_by_name}</span>
            <Badge className={`text-[10px] px-1.5 py-0 border-0 ${
              session.target_role === "admin"
                ? "bg-purple-100 text-purple-700"
                : "bg-blue-100 text-blue-700"
            }`}>
              {session.target_role === "leitstand" ? "Leitstand" : "Admin"}
            </Badge>
            <Badge className={`text-[10px] px-1.5 py-0 border-0 ${
              session.status === "open"
                ? "bg-orange-100 text-orange-700"
                : "bg-green-100 text-green-700"
            }`}>
              {session.status === "open" ? "Offen" : "Aktiv"}
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

      {isClaimedByOther && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          Übernommen von {session.claimed_by_name}
        </p>
      )}

      <div className="flex gap-2">
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
        {(isMySession || isClaimedByOther) && (
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
      </div>
    </div>
  );
}

export function SupportInbox() {
  const { openSessions, unclaimedCount, isInboxOpen, setIsInboxOpen } = useChatContext();

  return (
    <Sheet open={isInboxOpen} onOpenChange={setIsInboxOpen}>
      <SheetContent side="right" className="w-[400px] sm:w-[420px] flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100">
              <Headphones className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <SheetTitle className="text-base">Support-Inbox</SheetTitle>
              <p className="text-xs text-slate-500 mt-0.5">
                {unclaimedCount > 0
                  ? `${unclaimedCount} wartende Anfrage${unclaimedCount !== 1 ? "n" : ""}`
                  : "Keine offenen Anfragen"}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {openSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400 gap-3">
              <div className="p-4 rounded-full bg-slate-100">
                <Headphones className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm font-medium">Keine aktiven Anfragen</p>
              <p className="text-xs">Neue Anfragen erscheinen hier automatisch.</p>
            </div>
          ) : (
            openSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
