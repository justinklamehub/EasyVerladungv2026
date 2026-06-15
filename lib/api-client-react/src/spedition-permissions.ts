import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface SpeditionPermissionGranted {
  grantingSpeditionId: number;
  receivingSpeditionId: number;
  receivingSpeditionName: string | null;
  permissionLevel: string;
}

export interface SpeditionPermissionReceived {
  grantingSpeditionId: number;
  grantingSpeditionName: string | null;
  receivingSpeditionId: number;
  permissionLevel: string;
}

export interface AddPermissionInput {
  receivingSpeditionId: number;
  permissionLevel: "read" | "edit";
}

export function getGrantedPermissionsQueryKey(speditionId: number) {
  return ["spedition-permissions-granted", speditionId];
}

export function getReceivedPermissionsQueryKey(speditionId: number) {
  return ["spedition-permissions-received", speditionId];
}

async function listGrantedPermissions(speditionId: number): Promise<SpeditionPermissionGranted[]> {
  return customFetch(`/api/speditionen/${speditionId}/permissions`);
}

async function listReceivedPermissions(speditionId: number): Promise<SpeditionPermissionReceived[]> {
  return customFetch(`/api/speditionen/${speditionId}/received-permissions`);
}

async function addPermission(speditionId: number, data: AddPermissionInput): Promise<SpeditionPermissionGranted> {
  return customFetch(`/api/speditionen/${speditionId}/permissions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function deletePermission(speditionId: number, receivingId: number): Promise<void> {
  return customFetch(`/api/speditionen/${speditionId}/permissions/${receivingId}`, { method: "DELETE" });
}

export function useListGrantedPermissions(
  speditionId: number,
  options?: { query?: UseQueryOptions<SpeditionPermissionGranted[]> },
) {
  return useQuery<SpeditionPermissionGranted[]>({
    queryKey: getGrantedPermissionsQueryKey(speditionId),
    queryFn: () => listGrantedPermissions(speditionId),
    enabled: !!speditionId,
    ...options?.query,
  });
}

export function useListReceivedPermissions(
  speditionId: number,
  options?: { query?: UseQueryOptions<SpeditionPermissionReceived[]> },
) {
  return useQuery<SpeditionPermissionReceived[]>({
    queryKey: getReceivedPermissionsQueryKey(speditionId),
    queryFn: () => listReceivedPermissions(speditionId),
    enabled: !!speditionId,
    ...options?.query,
  });
}

export function useAddSpeditionPermission(
  speditionId: number,
  options?: { mutation?: UseMutationOptions<SpeditionPermissionGranted, unknown, AddPermissionInput> },
) {
  return useMutation<SpeditionPermissionGranted, unknown, AddPermissionInput>({
    mutationFn: (data) => addPermission(speditionId, data),
    ...options?.mutation,
  });
}

export function useDeleteSpeditionPermission(
  speditionId: number,
  options?: { mutation?: UseMutationOptions<void, unknown, number> },
) {
  return useMutation<void, unknown, number>({
    mutationFn: (receivingId) => deletePermission(speditionId, receivingId),
    ...options?.mutation,
  });
}
