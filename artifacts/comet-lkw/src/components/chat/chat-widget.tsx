import { useState } from "react";
import { useChatContext } from "./chat-context";
import { useAuth } from "@/contexts/auth-context";
import { ChatPanel } from "./chat-panel";
import { SupportInbox } from "./support-inbox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Headphones, X, Loader2, Bot, Sparkles } from "lucide-react";

const STAFF_ROLES = new Set(["comet_admin", "comet_leitstand"]);

function NewChatDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { openNewChat, isLoading } = useChatContext();
  const [targetRole, setTargetRole] = useState<"leitstand" | "admin">("leitstand");
  const [subject, setSubject] = useState("");

  const handleStart = async () => {
    await openNewChat(targetRole, subject || undefined);
    setSubject("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="w-5 h-5 text-slate-700" />
            Support kontaktieren
          </DialogTitle>
          <DialogDescription>
            Wähle aus, an wen du dich wenden möchtest.
          </DialogDescription>
        </DialogHeader>

        {/* AI info box */}
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-3 py-3 text-sm text-blue-800">
          <Bot className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
          <div>
            <p className="font-medium text-blue-900">KI-Assistent antwortet zuerst</p>
            <p className="text-xs text-blue-600 mt-0.5">Falls die KI nicht helfen kann, wirst du mit einem Mitarbeiter verbunden.</p>
          </div>
        </div>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Ich möchte kontaktieren</Label>
            <Select value={targetRole} onValueChange={(v) => setTargetRole(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leitstand">COMET Leitstand</SelectItem>
                <SelectItem value="admin">COMET Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Betreff <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input
              placeholder="Worum geht es?"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Abbrechen
            </Button>
            <Button
              className="flex-1 bg-slate-900 hover:bg-slate-700"
              onClick={handleStart}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="w-4 h-4 mr-1.5" />
              )}
              Chat starten
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ChatWidget() {
  const { user } = useAuth();
  const {
    activeSession,
    unclaimedCount,
    isPanelOpen,
    isInboxOpen,
    setIsPanelOpen,
    setIsInboxOpen,
    closeSession,
  } = useChatContext();

  const [showNewDialog, setShowNewDialog] = useState(false);

  if (!user) return null;

  const isStaff = STAFF_ROLES.has(user.role);

  const handleButtonClick = () => {
    if (isStaff) {
      setIsInboxOpen(true);
    } else {
      if (activeSession && activeSession.status !== "closed") {
        setIsPanelOpen((v) => !v);
      } else {
        setShowNewDialog(true);
      }
    }
  };

  const hasActiveChat = !isStaff && activeSession && activeSession.status !== "closed";
  const isAiMode = hasActiveChat && activeSession?.ai_active;
  const showBadge = isStaff ? unclaimedCount > 0 : false;

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {/* Active chat collapsed indicator for users */}
        {hasActiveChat && !isPanelOpen && (
          <div
            className="flex items-center gap-2 bg-slate-900 text-white rounded-full pl-3 pr-1 py-1 text-xs shadow-lg cursor-pointer"
            onClick={() => setIsPanelOpen(true)}
          >
            {isAiMode
              ? <Bot className="w-3 h-3 text-blue-400" />
              : <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            }
            <span>Support-Chat</span>
            <button
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
              onClick={(e) => { e.stopPropagation(); closeSession(); }}
              title="Chat beenden"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Main button */}
        <Button
          size="icon"
          className={`relative h-12 w-12 rounded-full shadow-xl transition-all ${
            isPanelOpen || isInboxOpen
              ? "bg-slate-700 hover:bg-slate-600"
              : "bg-slate-900 hover:bg-slate-700"
          }`}
          onClick={handleButtonClick}
          title={isStaff ? "Support-Inbox" : "Support kontaktieren"}
        >
          {isStaff ? (
            <Headphones className="w-5 h-5" />
          ) : isAiMode ? (
            <Bot className="w-5 h-5 text-blue-300" />
          ) : (
            <MessageCircle className="w-5 h-5" />
          )}

          {/* Badge for unclaimed sessions */}
          {showBadge && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ring-2 ring-white shadow">
              {unclaimedCount > 9 ? "9+" : unclaimedCount}
            </span>
          )}

          {/* Green dot for active human session */}
          {hasActiveChat && activeSession?.status === "active" && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 ring-2 ring-white" />
          )}

          {/* Blue dot for AI mode */}
          {isAiMode && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-400 ring-2 ring-white animate-pulse" />
          )}
        </Button>
      </div>

      <ChatPanel />
      <SupportInbox />
      <NewChatDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
    </>
  );
}
