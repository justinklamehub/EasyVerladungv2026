import { useCallback } from "react";
import { useLocation } from "wouter";
import { isWarehouseScannerRoute } from "@/lib/scanner-access";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetEinlagerungState, getGetEinlagerungStateQueryKey,
  useCreateEinlagerungRecord, useUpdateEinlagerungRecord, useDeleteEinlagerungRecord,
  getScannerEinlagerungState, getGetScannerEinlagerungStateQueryKey,
  getEinlagerungState, searchEinlagerung, searchScannerEinlagerung,
  useSearchEinlagerung, getSearchEinlagerungQueryKey, getSearchScannerEinlagerungQueryKey,
  createScannerEinlagerungRecord, updateScannerEinlagerungRecord,
  useSetEinlagerungShelfStatus, setScannerEinlagerungShelfStatus,
} from "@workspace/api-client-react";
import type { SearchEinlagerungParams, SearchScannerEinlagerungParams } from "@workspace/api-client-react";
import type { Rec, D } from "./lib";

export function useEinlagerungState(enabled = true) {
  const [location] = useLocation();
  const scanner = isWarehouseScannerRoute(location);
  return useGetEinlagerungState({
    query: {
      queryKey: scanner ? getGetScannerEinlagerungStateQueryKey() : getGetEinlagerungStateQueryKey(),
      queryFn: ({ signal }) => (scanner ? getScannerEinlagerungState : getEinlagerungState)({ signal }),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      enabled,
    },
  });
}

export function useWarehouseSearch(params: SearchEinlagerungParams, enabled = true) {
  const [location] = useLocation();
  const scanner = isWarehouseScannerRoute(location);
  const publicParams: SearchScannerEinlagerungParams = {
    ...params, mode: params.mode === "artikel" ? "artikel" : "auftraege",
  };
  return useSearchEinlagerung(params, { query: {
    queryKey: scanner ? getSearchScannerEinlagerungQueryKey(publicParams) : getSearchEinlagerungQueryKey(params),
    queryFn: ({ signal }) => {
      if (scanner && params.mode !== "artikel" && params.mode !== "auftraege")
        throw new Error("Dieser Suchmodus ist im öffentlichen Scanner nicht verfügbar.");
      return scanner ? searchScannerEinlagerung(publicParams, { signal }) : searchEinlagerung(params, { signal });
    },
    enabled, refetchInterval: 30_000, refetchIntervalInBackground: false,
  } });
}

export function useWarehouseShelfStatus() {
  const [location] = useLocation();
  const scanner = isWarehouseScannerRoute(location);
  return useSetEinlagerungShelfStatus({ mutation: {
    ...(scanner ? { mutationFn: ({ id, data }) => setScannerEinlagerungShelfStatus(id, data) } : {}),
  } });
}

export function useRefreshEinlagerung() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: getGetEinlagerungStateQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/einlagerung/search"] });
    qc.invalidateQueries({ queryKey: getGetScannerEinlagerungStateQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/einlagerung/scanner/search"] });
  }, [qc]);
}

export function useRecordActions() {
  const [location] = useLocation();
  const scanner = isWarehouseScannerRoute(location);
  const refresh = useRefreshEinlagerung();
  const create = useCreateEinlagerungRecord({ mutation: {
    ...(scanner ? { mutationFn: ({ kind, data }) => {
      if (kind !== "reservation") throw new Error("Im Scanner sind nur Reservierungen änderbar.");
      return createScannerEinlagerungRecord(kind, data);
    } } : {}),
  } });
  const update = useUpdateEinlagerungRecord({ mutation: {
    ...(scanner ? { mutationFn: ({ kind, id, data }) => {
      if (kind !== "reservation") throw new Error("Im Scanner sind nur Reservierungen änderbar.");
      return updateScannerEinlagerungRecord(kind, id, data);
    } } : {}),
  } });
  const del = useDeleteEinlagerungRecord();
  const save = async (kind: string, rec: Rec | null, data: D) => {
    const res = rec
      ? await update.mutateAsync({ kind, id: rec.id, data: { data, expectedUpdatedAt: rec.updatedAt } })
      : await create.mutateAsync({ kind, data: { data } });
    refresh();
    return res;
  };
  const remove = async (kind: string, id: number) => {
    const res = await del.mutateAsync({ kind, id });
    refresh();
    return res;
  };
  return { save, remove, busy: create.isPending || update.isPending || del.isPending };
}
