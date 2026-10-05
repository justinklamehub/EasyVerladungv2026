import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetEinlagerungState, getGetEinlagerungStateQueryKey,
  useCreateEinlagerungRecord, useUpdateEinlagerungRecord, useDeleteEinlagerungRecord,
} from "@workspace/api-client-react";
import type { Rec, D } from "./lib";

export function useEinlagerungState(enabled = true) {
  return useGetEinlagerungState({
    query: {
      queryKey: getGetEinlagerungStateQueryKey(),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      enabled,
    },
  });
}

export function useRefreshEinlagerung() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: getGetEinlagerungStateQueryKey() });
    qc.invalidateQueries({ queryKey: ["/api/einlagerung/search"] });
  }, [qc]);
}

export function useRecordActions() {
  const refresh = useRefreshEinlagerung();
  const create = useCreateEinlagerungRecord();
  const update = useUpdateEinlagerungRecord();
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
