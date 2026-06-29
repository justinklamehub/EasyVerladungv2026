import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export const PERMISSIONS_QUERY_KEY = ["my-permissions"] as const;

export function usePermissions(): Record<string, boolean> {
  const { data = {} } = useQuery<Record<string, boolean>>({
    queryKey: PERMISSIONS_QUERY_KEY,
    queryFn: () => customFetch("/api/auth/permissions"),
    staleTime: 60_000,
  });
  return data;
}
