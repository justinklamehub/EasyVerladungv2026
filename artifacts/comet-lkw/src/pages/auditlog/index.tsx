import { useState } from "react";
import { useListAuditLog } from "@workspace/api-client-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AuditlogPage() {
  const [page, setPage] = useState(1);
  const { data: pageData, isLoading } = useListAuditLog({ page, limit: 50 });

  return (
    <div className="w-full min-w-0 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Änderungslog</h1>
        <p className="text-sm text-slate-500">Lückenlose Protokollierung aller Systemänderungen.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[180px]">Zeitpunkt</TableHead>
              <TableHead>Benutzer</TableHead>
              <TableHead>Modul</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Feld</TableHead>
              <TableHead className="w-[30%]">Änderung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : !pageData || pageData.entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  Keine Einträge gefunden.
                </TableCell>
              </TableRow>
            ) : (
              pageData.entries.map((entry) => (
                <TableRow key={entry.id} className="text-sm">
                  <TableCell className="text-slate-600 whitespace-nowrap">
                    {format(new Date(entry.changedAt), "dd.MM.yyyy HH:mm:ss")}
                  </TableCell>
                  <TableCell className="font-medium text-slate-800">{entry.username || "System"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                      {entry.module}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-500 font-mono text-xs">{entry.recordId}</TableCell>
                  <TableCell className="text-slate-700 font-medium">{entry.field || "Datensatz"}</TableCell>
                  <TableCell>
                    {entry.field ? (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 line-through truncate max-w-[100px]" title={entry.oldValue || ""}>{entry.oldValue || "null"}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-slate-700 font-medium truncate max-w-[100px]" title={entry.newValue || ""}>{entry.newValue || "null"}</span>
                      </div>
                    ) : (
                      <span className="text-slate-500 italic text-xs">Neu erstellt</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
