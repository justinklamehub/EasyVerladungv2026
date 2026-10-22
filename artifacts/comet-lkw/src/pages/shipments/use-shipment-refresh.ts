import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { SHIPMENT_REFRESH_KEY } from "@workspace/api-zod/shipment-refresh";
import { getShipmentRefreshOptions } from "./refresh-options";

export function useShipmentRefreshOptions() {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ["settings-public"],
    queryFn: () => customFetch<Record<string, string>>("/api/settings/public"),
    // Discover configuration changes even when sockets are unavailable, independently
    // of a potentially much longer user-configured shipment refresh interval.
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  return getShipmentRefreshOptions(data?.[SHIPMENT_REFRESH_KEY]);
}
