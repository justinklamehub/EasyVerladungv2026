import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";

export interface LkwArtOption { id: number; name: string; aktiv: boolean }

export function useLkwArten(enabled = true) {
  const { user } = useAuth();
  return useQuery<LkwArtOption[]>({
    queryKey: ["lkw-arten", user?.id, user?.speditionId],
    queryFn: () => customFetch("/api/lkw-arten"),
    enabled,
    staleTime: 30_000,
  });
}

export function selectableLkwArten(types: LkwArtOption[] | undefined, allowedIds?: number[] | null) {
  return (types ?? []).filter((type) => type.aktiv && (allowedIds == null || allowedIds.includes(type.id)));
}
