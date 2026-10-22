import { resolveShipmentRefreshSeconds } from "@workspace/api-zod/shipment-refresh";

// A display-only browser must stay current even when no socket event arrives.
// Refetch data, never reload the page: filters and open forms stay mounted.
export const shipmentRefreshOptions = {
  refetchInterval: 30_000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: "always",
  refetchOnReconnect: "always",
  refetchOnMount: "always",
} as const;

export function getShipmentRefreshOptions(value: unknown) {
  return { ...shipmentRefreshOptions, refetchInterval: resolveShipmentRefreshSeconds(value) * 1000 };
}
