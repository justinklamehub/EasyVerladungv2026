import { useState } from "react";
import { useListSpeditionen, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Edit, Shield } from "lucide-react";
import { SpeditionDialog } from "./components/spedition-dialog";
import { useAuth } from "@/contexts/auth-context";

export default function SpeditionenPage() {
  const { user } = useAuth();
  const isSpedAdmin = user?.role === "speditions_admin";

  const { data: permissions = {} } = useQuery<Record<string, boolean>>({
    queryKey: ["my-permissions"],
    queryFn: () => customFetch("/api/auth/permissions"),
    staleTime: 60_000,
  });

  const canCreate = !!permissions["spedition.create"];
  const canEdit = !!permissions["spedition.edit"];

  const { data: speditionen, isLoading } = useListSpeditionen();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSpedition, setEditSpedition] = useState<any | null>(null);
  const [permSpedition, setPermSpedition] = useState<any | null>(null);

  const hasActions = canCreate || canEdit || isSpedAdmin;
  const colSpan = hasActions ? 6 : 5;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Speditionen</h1>
          <p className="text-sm text-slate-500">
            {(canCreate || canEdit) ? "Partner-Speditionen und Zugriffsrechte verwalten." : "Übersicht der Speditionen und Ihre Zugriffsrechte."}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Neue Spedition
          </Button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Kürzel</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Status</TableHead>
              {hasActions && <TableHead className="text-right">Aktionen</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : !speditionen || speditionen.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8 text-slate-500">
                  Keine Speditionen gefunden.
                </TableCell>
              </TableRow>
            ) : (
              speditionen.map((spedition) => {
                const isOwnSped = isSpedAdmin && spedition.id === user?.speditionId;
                return (
                  <TableRow key={spedition.id} className="hover:bg-slate-50">
                    <TableCell className="font-medium text-slate-900">{spedition.name}</TableCell>
                    <TableCell className="text-slate-600 font-mono text-sm">{spedition.kuerzel || "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium text-slate-700">{spedition.ansprechpartner || "—"}</div>
                        <div className="text-slate-500 text-xs">{spedition.email || ""}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600 text-sm">{spedition.telefon || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={spedition.status === "aktiv"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-slate-100 text-slate-600 border-slate-300"}
                      >
                        {spedition.status === "aktiv" ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    {hasActions && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditSpedition(spedition)}
                              title="Bearbeiten"
                            >
                              <Edit className="w-4 h-4 text-slate-500" />
                            </Button>
                          )}
                          {isOwnSped && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPermSpedition(spedition)}
                              className="text-slate-600 gap-1"
                              title="Zugriffsrechte verwalten"
                            >
                              <Shield className="w-4 h-4" />
                              Zugriffsrechte
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <SpeditionDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <SpeditionDialog
        open={!!editSpedition}
        onOpenChange={(v) => { if (!v) setEditSpedition(null); }}
        editSpedition={editSpedition}
      />
      <SpeditionDialog
        open={!!permSpedition}
        onOpenChange={(v) => { if (!v) setPermSpedition(null); }}
        editSpedition={permSpedition}
        permissionsOnly
      />
    </div>
  );
}
