import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { customFetch } from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { formatDistanceToNow, format } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Plus,
  Ticket,
  MessageSquare,
  ChevronRight,
  X,
  Send,
  AlertTriangle,
  Flame,
  ArrowDown,
  Minus,
  Trash2,
  Filter,
  RefreshCw,
  CheckCircle2,
  Clock,
  CircleDot,
  XCircle,
  ImageIcon,
  Upload,
  ZoomIn,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_CATEGORIES = ["Verladung", "System", "Sonstiges"];
const PRIORITIES = ["Niedrig", "Mittel", "Hoch", "Kritisch"];
const STATUSES = ["Offen", "In Bearbeitung", "Geloest", "Geschlossen"];
const STATUS_LABELS: Record<string, string> = {
  Offen: "Offen",
  "In Bearbeitung": "In Bearbeitung",
  Geloest: "Gelöst",
  Geschlossen: "Geschlossen",
};

function priorityIcon(p: string) {
  if (p === "Kritisch") return <Flame className="w-3.5 h-3.5 text-red-500" />;
  if (p === "Hoch") return <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />;
  if (p === "Mittel") return <Minus className="w-3.5 h-3.5 text-yellow-500" />;
  return <ArrowDown className="w-3.5 h-3.5 text-slate-400" />;
}

function priorityBadge(p: string) {
  const colors: Record<string, string> = {
    Kritisch: "bg-red-100 text-red-700 border-red-200",
    Hoch: "bg-orange-100 text-orange-700 border-orange-200",
    Mittel: "bg-yellow-100 text-yellow-700 border-yellow-200",
    Niedrig: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border", colors[p] ?? colors.Niedrig)}>
      {priorityIcon(p)} {p}
    </span>
  );
}

function categoryBadge(c: string) {
  const colors: Record<string, string> = {
    Verladung: "bg-blue-100 text-blue-700 border-blue-200",
    System: "bg-purple-100 text-purple-700 border-purple-200",
    Sonstiges: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-medium border", colors[c] ?? colors.Sonstiges)}>
      {c}
    </span>
  );
}

function statusIcon(s: string) {
  if (s === "Offen") return <CircleDot className="w-3.5 h-3.5 text-blue-500" />;
  if (s === "In Bearbeitung") return <Clock className="w-3.5 h-3.5 text-yellow-500" />;
  if (s === "Geloest") return <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />;
  return <XCircle className="w-3.5 h-3.5 text-slate-400" />;
}

type TicketRow = {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  createdBy: number;
  assignedTo: number | null;
  shipmentId: number | null;
  createdAt: string;
  updatedAt: string;
  createdByUsername: string | null;
  commentCount: number;
};

type Comment = {
  id: number;
  ticketId: number;
  userId: number;
  body: string;
  createdAt: string;
  username: string | null;
};

type TicketDetail = TicketRow & { comments: Comment[] };

type Attachment = {
  id: number;
  ticketId: number;
  objectPath: string;
  fileName: string;
  contentType: string;
  uploadedBy: number;
  createdAt: string;
};

function imgUrl(objectPath: string) {
  return "/api/storage/objects/" + objectPath.replace(/^\/objects\//, "");
}

export default function TicketsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canManage = user && ["comet_admin", "comet_leitstand"].includes(user.role);

  const [activeStatus, setActiveStatus] = useState("Offen");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [newTicket, setNewTicket] = useState({ title: "", description: "", category: "System", priority: "Mittel" });
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const { uploadFile } = useUpload();

  const params = new URLSearchParams();
  params.set("status", activeStatus);
  if (filterCategory) params.set("category", filterCategory);
  if (filterPriority) params.set("priority", filterPriority);

  const { data: publicSettings } = useQuery<Record<string, string>>({
    queryKey: ["settings-public"],
    queryFn: () => customFetch<Record<string, string>>("/api/settings/public"),
    staleTime: 60_000,
  });
  const categories: string[] = (() => {
    try {
      const parsed = JSON.parse(publicSettings?.ticket_categories ?? "");
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CATEGORIES;
    } catch { return DEFAULT_CATEGORIES; }
  })();

  const { data: tickets = [], isLoading, refetch } = useQuery<TicketRow[]>({
    queryKey: ["tickets", activeStatus, filterCategory, filterPriority],
    queryFn: () => customFetch<TicketRow[]>(`/api/tickets?${params}`),
  });

  const { data: detail, refetch: refetchDetail } = useQuery<TicketDetail>({
    queryKey: ["ticket", selectedTicket?.id],
    queryFn: () => customFetch<TicketDetail>(`/api/tickets/${selectedTicket!.id}`),
    enabled: !!selectedTicket,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof newTicket) =>
      customFetch<TicketRow>("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setShowCreate(false);
      setNewTicket({ title: "", description: "", category: "System", priority: "Mittel" });
      toast({ title: "Ticket erstellt" });
    },
    onError: () => toast({ title: "Fehler beim Erstellen", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; [k: string]: any }) =>
      customFetch<TicketRow>(`/api/tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      refetchDetail();
      toast({ title: "Ticket aktualisiert" });
    },
    onError: () => toast({ title: "Fehler beim Aktualisieren", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      customFetch<{ ok: boolean }>(`/api/tickets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      setSelectedTicket(null);
      toast({ title: "Ticket gelöscht" });
    },
    onError: () => toast({ title: "Fehler beim Löschen", variant: "destructive" }),
  });

  const { data: attachments = [], refetch: refetchAttachments } = useQuery<Attachment[]>({
    queryKey: ["ticket-attachments", selectedTicket?.id],
    queryFn: () => customFetch<Attachment[]>(`/api/tickets/${selectedTicket!.id}/attachments`),
    enabled: !!selectedTicket,
  });

  const attachMutation = useMutation({
    mutationFn: ({ ticketId, objectPath, fileName, contentType }: { ticketId: number; objectPath: string; fileName: string; contentType: string }) =>
      customFetch<Attachment>(`/api/tickets/${ticketId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objectPath, fileName, contentType }),
      }),
    onSuccess: () => refetchAttachments(),
    onError: () => toast({ title: "Fehler beim Speichern des Anhangs", variant: "destructive" }),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: ({ ticketId, attachmentId }: { ticketId: number; attachmentId: number }) =>
      customFetch<{ ok: boolean }>(`/api/tickets/${ticketId}/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => refetchAttachments(),
    onError: () => toast({ title: "Fehler beim Löschen des Anhangs", variant: "destructive" }),
  });

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    e.target.value = "";
    setIsUploadingImg(true);
    try {
      const result = await uploadFile(file);
      if (result) {
        await attachMutation.mutateAsync({
          ticketId: selectedTicket.id,
          objectPath: result.objectPath,
          fileName: result.metadata.name,
          contentType: result.metadata.contentType,
        });
      }
    } catch {
      toast({ title: "Upload fehlgeschlagen", variant: "destructive" });
    } finally {
      setIsUploadingImg(false);
    }
  }

  const commentMutation = useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: number; body: string }) =>
      customFetch<Comment>(`/api/tickets/${ticketId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) }),
    onSuccess: () => {
      setCommentBody("");
      refetchDetail();
      qc.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: () => toast({ title: "Fehler beim Senden", variant: "destructive" }),
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ ticketId, commentId }: { ticketId: number; commentId: number }) =>
      customFetch<{ ok: boolean }>(`/api/tickets/${ticketId}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: () => refetchDetail(),
  });

  const statusCounts = (STATUSES).map((s) => ({ status: s, label: STATUS_LABELS[s] }));

  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* Left panel: list */}
      <div className="flex flex-col w-full max-w-xl border-r border-slate-200 bg-white shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-slate-600" />
            <h1 className="font-semibold text-slate-800 text-base">Tickets</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Neues Ticket
            </Button>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex border-b border-slate-100 bg-slate-50/80">
          {statusCounts.map(({ status, label }) => (
            <button
              key={status}
              onClick={() => setActiveStatus(status)}
              className={cn(
                "flex-1 py-2 text-xs font-medium transition-colors",
                activeStatus === status
                  ? "text-primary border-b-2 border-primary bg-white"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <Select value={filterCategory || "alle"} onValueChange={(v) => setFilterCategory(v === "alle" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs w-36 border-slate-200">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Kategorien</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterPriority || "alle"} onValueChange={(v) => setFilterPriority(v === "alle" ? "" : v)}>
            <SelectTrigger className="h-7 text-xs w-32 border-slate-200">
              <SelectValue placeholder="Priorität" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Prio.</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          {(filterCategory || filterPriority) && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400" onClick={() => { setFilterCategory(""); setFilterPriority(""); }}>
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoading && (
            <div className="flex items-center justify-center py-16 text-sm text-slate-400">Laden...</div>
          )}
          {!isLoading && tickets.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-400">
              <Ticket className="w-8 h-8 opacity-30" />
              <p className="text-sm">Keine Tickets in diesem Status</p>
            </div>
          )}
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTicket(t)}
              className={cn(
                "w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors",
                selectedTicket?.id === t.id && "bg-blue-50 border-l-2 border-l-primary"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    {categoryBadge(t.category)}
                    {priorityBadge(t.priority)}
                  </div>
                  <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{t.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                  {t.commentCount > 0 && (
                    <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <MessageSquare className="w-3 h-3" /> {t.commentCount}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] text-slate-400">
                  #{t.id} · {t.createdByUsername ?? "?"} · {formatDistanceToNow(new Date(t.createdAt), { addSuffix: true, locale: de })}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: detail */}
      {selectedTicket ? (
        <div className="flex flex-col flex-1 min-w-0 bg-white">
          {/* Detail header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {statusIcon(detail?.status ?? selectedTicket.status)}
              <span className="font-semibold text-slate-800 truncate">{detail?.title ?? selectedTicket.title}</span>
              <span className="text-xs text-slate-400 shrink-0">#{selectedTicket.id}</span>
            </div>
            <button onClick={() => setSelectedTicket(null)} className="text-slate-400 hover:text-slate-600 shrink-0 ml-2">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Metadata */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex flex-wrap gap-2 mb-3">
                {categoryBadge(detail?.category ?? selectedTicket.category)}
                {priorityBadge(detail?.priority ?? selectedTicket.priority)}
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium border border-slate-200 bg-slate-50 text-slate-600">
                  {statusIcon(detail?.status ?? selectedTicket.status)}
                  {STATUS_LABELS[detail?.status ?? selectedTicket.status] ?? detail?.status}
                </span>
              </div>

              {canManage && detail && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <Select
                    value={detail.status}
                    onValueChange={(v) => patchMutation.mutate({ id: detail.id, status: v })}
                  >
                    <SelectTrigger className="h-7 text-xs w-40 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={detail.priority}
                    onValueChange={(v) => patchMutation.mutate({ id: detail.id, priority: v })}
                  >
                    <SelectTrigger className="h-7 text-xs w-32 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <p className="text-sm text-slate-700 whitespace-pre-wrap">{detail?.description ?? selectedTicket.description}</p>

              <div className="mt-3 text-xs text-slate-400 space-y-0.5">
                <div>Erstellt von <span className="text-slate-600 font-medium">{detail?.createdByUsername ?? "?"}</span> · {format(new Date(selectedTicket.createdAt), "dd.MM.yyyy HH:mm")}</div>
                {selectedTicket.shipmentId && (
                  <div>Verladung <span className="font-medium text-slate-600">#{selectedTicket.shipmentId}</span></div>
                )}
              </div>

              {(canManage || detail?.createdBy === user?.id) && (
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 h-7 text-xs gap-1"
                    onClick={() => {
                      if (confirm("Ticket wirklich löschen?")) deleteMutation.mutate(selectedTicket.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Löschen
                  </Button>
                </div>
              )}
            </div>

            {/* Anhänge */}
            <div className="px-5 py-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">
                    Bilder {attachments.length > 0 ? `(${attachments.length})` : ""}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  disabled={isUploadingImg}
                  onClick={() => imgFileRef.current?.click()}
                >
                  {isUploadingImg
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lädt hoch…</>
                    : <><Upload className="w-3.5 h-3.5" /> Bild hochladen</>
                  }
                </Button>
                <input
                  ref={imgFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageSelect}
                />
              </div>
              {attachments.length === 0 && !isUploadingImg && (
                <p className="text-xs text-slate-400">Noch keine Bilder angehängt.</p>
              )}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="relative group w-20 h-20 rounded-md overflow-hidden border border-slate-200 bg-slate-100 shrink-0">
                      <img
                        src={imgUrl(a.objectPath)}
                        alt={a.fileName}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setLightboxSrc(imgUrl(a.objectPath))}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                        <button
                          className="bg-white/90 rounded-full p-1 hover:bg-white"
                          onClick={() => setLightboxSrc(imgUrl(a.objectPath))}
                          title="Vergrößern"
                        >
                          <ZoomIn className="w-3.5 h-3.5 text-slate-700" />
                        </button>
                        <button
                          className="bg-white/90 rounded-full p-1 hover:bg-white"
                          onClick={() => {
                            if (confirm("Bild löschen?")) {
                              deleteAttachmentMutation.mutate({ ticketId: selectedTicket!.id, attachmentId: a.id });
                            }
                          }}
                          title="Löschen"
                        >
                          <X className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">
                  Kommentare {detail?.comments?.length ? `(${detail.comments.length})` : ""}
                </span>
              </div>

              {detail?.comments?.length === 0 && (
                <p className="text-xs text-slate-400 mb-4">Noch keine Kommentare.</p>
              )}

              <div className="space-y-3 mb-4">
                {detail?.comments?.map((c) => (
                  <div key={c.id} className="group flex gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600 uppercase shrink-0 mt-0.5">
                      {(c.username ?? "?").slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700">{c.username ?? "?"}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-400">
                            {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true, locale: de })}
                          </span>
                          {(user?.id === c.userId || user?.role === "comet_admin") && (
                            <button
                              onClick={() => deleteCommentMutation.mutate({ ticketId: selectedTicket.id, commentId: c.id })}
                              className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Comment input */}
              <div className="flex gap-2 items-end">
                <Textarea
                  placeholder="Kommentar schreiben..."
                  className="text-sm resize-none min-h-[70px]"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && commentBody.trim()) {
                      e.preventDefault();
                      commentMutation.mutate({ ticketId: selectedTicket.id, body: commentBody });
                    }
                  }}
                />
                <Button
                  size="icon"
                  className="shrink-0 h-9 w-9"
                  disabled={!commentBody.trim() || commentMutation.isPending}
                  onClick={() => commentMutation.mutate({ ticketId: selectedTicket.id, body: commentBody })}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Strg+Enter zum Senden</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-300 bg-slate-50 gap-3">
          <Ticket className="w-12 h-12 opacity-30" />
          <p className="text-sm">Ticket auswählen</p>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Neues Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Titel *</Label>
              <Input
                placeholder="Kurze Beschreibung des Problems"
                value={newTicket.title}
                onChange={(e) => setNewTicket((t) => ({ ...t, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Beschreibung *</Label>
              <Textarea
                placeholder="Was ist passiert? Was haben Sie erwartet?"
                className="resize-none min-h-[100px] text-sm"
                value={newTicket.description}
                onChange={(e) => setNewTicket((t) => ({ ...t, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategorie</Label>
                <Select value={newTicket.category} onValueChange={(v) => setNewTicket((t) => ({ ...t, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priorität</Label>
                <Select value={newTicket.priority} onValueChange={(v) => setNewTicket((t) => ({ ...t, priority: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Abbrechen</Button>
            <Button
              disabled={!newTicket.title.trim() || !newTicket.description.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate(newTicket)}
            >
              Ticket erstellen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxSrc} onOpenChange={() => setLightboxSrc(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-0">
          <div className="relative flex items-center justify-center min-h-[300px] max-h-[90vh]">
            {lightboxSrc && (
              <img
                src={lightboxSrc}
                alt="Anhang"
                className="max-w-full max-h-[90vh] object-contain"
              />
            )}
            <button
              className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5"
              onClick={() => setLightboxSrc(null)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
