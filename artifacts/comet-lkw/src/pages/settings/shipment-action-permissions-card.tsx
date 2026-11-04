import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { SHIPMENT_PRINT_PERMISSION, SHIPMENT_ADVANCE_PERMISSION, isInternalShipmentActionRole } from "@workspace/api-zod/shipment-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { PERMISSIONS_QUERY_KEY } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";

type PermissionData = {
  roles: { roleKey: string; label: string; roleGroup: string; isSystem: boolean }[];
  matrix: { role: string; permission: string; allowed: boolean }[];
};
const queryKey = ["admin-permissions"];

export function ShipmentActionPermissionsCard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const query = useQuery<PermissionData>({
    queryKey, queryFn: () => customFetch("/api/admin/permissions"),
    staleTime: 0, refetchOnWindowFocus: true,
  });
  const save = useMutation({
    mutationFn: (input: { role: string; permission: string; allowed: boolean }) =>
      customFetch("/api/admin/permissions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey }), qc.invalidateQueries({ queryKey: PERMISSIONS_QUERY_KEY })]);
    },
    onError: () => toast({ title: "Berechtigung konnte nicht gespeichert werden", variant: "destructive" }),
  });
  const data = query.data;
  return <Card className="shadow-sm">
    <CardHeader>
      <CardTitle className="text-base">Verladungsbuttons: Drucken und Weiter</CardTitle>
      <CardDescription>Getrennte Rechte pro COMET-Rolle. Änderungen werden sofort gespeichert und gelten auch unter „Berechtigungen“. „Weiter“: Angemeldet → Angekommen → in Verladung → Verladen. Das allgemeine Bearbeitungsrecht ist dafür nicht erforderlich.</CardDescription>
    </CardHeader>
    <CardContent>
      {query.isLoading && <p className="text-sm text-slate-500">Berechtigungen werden geladen …</p>}
      {query.isError && <div role="alert" className="text-sm text-red-700">Berechtigungen konnten nicht geladen werden. <Button variant="outline" size="sm" onClick={() => query.refetch()}>Erneut versuchen</Button></div>}
      {data && <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="shipment-action-permissions">
        <thead><tr className="border-b text-left"><th className="py-2 pr-4">Rolle</th><th className="py-2 px-3">Deckblatt drucken</th><th className="py-2 px-3">Weiter</th></tr></thead>
        <tbody>{data.roles.filter((role) => isInternalShipmentActionRole(role.roleKey)).map((role) => <tr className="border-b last:border-0" key={role.roleKey}>
          <td className="py-3 pr-4">{role.label}{role.roleKey === "comet_admin" && <span className="ml-2 text-xs text-slate-500">Administrator – immer erlaubt</span>}</td>
          {[SHIPMENT_PRINT_PERMISSION, SHIPMENT_ADVANCE_PERMISSION].map((permission) => <td className="py-3 px-3" key={permission}>
            <Switch
              aria-label={`${permission === SHIPMENT_PRINT_PERMISSION ? "Deckblatt drucken" : "Weiter"} für ${role.label}`}
              data-testid={`switch-${permission}-${role.roleKey}`}
              checked={role.roleKey === "comet_admin" || !!data.matrix.find((entry) => entry.role === role.roleKey && entry.permission === permission)?.allowed}
              disabled={role.roleKey === "comet_admin" || save.isPending || query.isError}
              onCheckedChange={(allowed) => save.mutate({ role: role.roleKey, permission, allowed })}
            />
          </td>)}
        </tr>)}</tbody>
      </table></div>}
      <p className="mt-3 text-xs text-slate-500">Speditionen erhalten diese COMET-Buttons nicht. „Weiter“ endet bei „Verladen“; andere Status werden nicht automatisch übersprungen.</p>
    </CardContent>
  </Card>;
}
