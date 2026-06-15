import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface LkwAustrag {
  id: number;
  shipmentId: number | null;
  ladelistennummer: string | null;
  palettenscheinnummer: string | null;
  datum: string;
  kennzeichen: string | null;
  beauftragteSpeditionId: number | null;
  beauftragteSpeditionName: string | null;
  subSpedition: string | null;
  tor: string | null;
  vonCometEuropaletten: number;
  vonCometLadungssicherung: number;
  vonDefektePaletten: number;
  anCometEuropaletten: number;
  anCometLadungssicherung: number;
  anDefektePaletten: number;
  createdBy: number | null;
  createdAt: string;
}

export interface LkwAustragInput {
  shipmentId?: number | null;
  ladelistennummer?: string | null;
  palettenscheinnummer?: string | null;
  datum: string;
  kennzeichen?: string | null;
  beauftragteSpeditionId?: number | null;
  subSpedition?: string | null;
  tor?: string | null;
  vonCometEuropaletten?: number;
  vonCometLadungssicherung?: number;
  vonDefektePaletten?: number;
  anCometEuropaletten?: number;
  anCometLadungssicherung?: number;
  anDefektePaletten?: number;
}

export function getListLkwAustraegeQueryKey(shipmentId?: number) {
  return shipmentId ? ["austraege", { shipmentId }] : ["austraege"];
}

async function listLkwAustraege(shipmentId?: number): Promise<LkwAustrag[]> {
  const params = new URLSearchParams();
  if (shipmentId !== undefined) params.set("shipmentId", String(shipmentId));
  const qs = params.toString();
  return customFetch(`/api/austraege${qs ? `?${qs}` : ""}`);
}

async function createLkwAustrag(data: LkwAustragInput): Promise<LkwAustrag> {
  return customFetch("/api/austraege", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function deleteLkwAustrag(id: number): Promise<void> {
  return customFetch(`/api/austraege/${id}`, { method: "DELETE" });
}

export function useListLkwAustraege(
  shipmentId?: number,
  options?: { query?: UseQueryOptions<LkwAustrag[]> },
) {
  return useQuery<LkwAustrag[]>({
    queryKey: getListLkwAustraegeQueryKey(shipmentId),
    queryFn: () => listLkwAustraege(shipmentId),
    ...options?.query,
  });
}

export function useCreateLkwAustrag(
  options?: { mutation?: UseMutationOptions<LkwAustrag, unknown, LkwAustragInput> },
) {
  return useMutation<LkwAustrag, unknown, LkwAustragInput>({
    mutationFn: createLkwAustrag,
    ...options?.mutation,
  });
}

export function useDeleteLkwAustrag(
  options?: { mutation?: UseMutationOptions<void, unknown, number> },
) {
  return useMutation<void, unknown, number>({
    mutationFn: deleteLkwAustrag,
    ...options?.mutation,
  });
}
