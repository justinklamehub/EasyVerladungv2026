import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import {
  getListShipmentsQueryKey,
  getListPalletMovementsQueryKey,
  getListPalletBalancesQueryKey,
  getListSpeditionenQueryKey,
  getListUsersQueryKey,
  getListReconciliationsQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";

export interface ShipmentEditor {
  userId: number;
  username: string;
}

type EditingHandler = (shipmentId: number, editors: ShipmentEditor[]) => void;

const editingListeners = new Set<EditingHandler>();

export function onShipmentEditing(handler: EditingHandler) {
  editingListeners.add(handler);
  return () => editingListeners.delete(handler);
}

// Module-level connection state so multiple components can read it
// without registering duplicate socket listeners.
let _isConnected = true;
const _statusListeners = new Set<(v: boolean) => void>();

function _setConnected(v: boolean) {
  _isConnected = v;
  for (const fn of _statusListeners) fn(v);
}

/** Lightweight hook — only returns connection status, no query invalidation. */
export function useSocketStatus() {
  const [isConnected, setIsConnected] = useState(_isConnected);
  useEffect(() => {
    _statusListeners.add(setIsConnected);
    return () => { _statusListeners.delete(setIsConnected); };
  }, []);
  return { isConnected };
}

export function useSocket() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(_isConnected);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setIsConnected(true);
      _setConnected(true);
      // Nach Reconnect (z. B. nach PWA-Hintergrund) alle Daten sofort neu laden
      queryClient.invalidateQueries();
    };
    const onDisconnect = () => { setIsConnected(false); _setConnected(false); };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Shipment events
    const invalidateShipments = () => queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
    socket.on("shipment.created", invalidateShipments);
    socket.on("shipment.updated", invalidateShipments);
    socket.on("shipment.status_changed", invalidateShipments);
    socket.on("shipment.deleted", invalidateShipments);
    socket.on("shipment.locked", invalidateShipments);
    socket.on("shipment.unlocked", invalidateShipments);

    // Pallet events — debounced so rapid back-to-back socket events (e.g. pallet_movement.created
    // followed immediately by pallet_balance.updated) only trigger one refetch per query.
    // cancelRefetch:false prevents cancelling an already in-flight request.
    let palletMovementsTimer: ReturnType<typeof setTimeout> | null = null;
    let palletBalancesTimer: ReturnType<typeof setTimeout> | null = null;

    const invalidatePalletMovements = () => {
      if (palletMovementsTimer) clearTimeout(palletMovementsTimer);
      palletMovementsTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: getListPalletMovementsQueryKey(), cancelRefetch: false });
        palletMovementsTimer = null;
      }, 500);
    };
    const invalidatePalletBalances = () => {
      if (palletBalancesTimer) clearTimeout(palletBalancesTimer);
      palletBalancesTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: getListPalletBalancesQueryKey(), cancelRefetch: false });
        palletBalancesTimer = null;
      }, 500);
    };

    socket.on("pallet_movement.created", invalidatePalletMovements);
    socket.on("pallet_movement.created", invalidatePalletBalances);
    socket.on("pallet_balance.updated", invalidatePalletBalances);

    // Reconciliation events
    const invalidateReconciliations = () => {
      queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey() });
    };
    socket.on("reconciliation.created", invalidateReconciliations);
    socket.on("reconciliation.updated", invalidateReconciliations);
    socket.on("reconciliation.comment_added", invalidateReconciliations);

    // Dashboard — debounced so rapid successive events only trigger one refetch
    let dashboardTimer: ReturnType<typeof setTimeout> | null = null;
    const invalidateDashboard = () => {
      if (dashboardTimer) clearTimeout(dashboardTimer);
      dashboardTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        dashboardTimer = null;
      }, 300);
    };
    socket.on("shipment.created", invalidateDashboard);
    socket.on("shipment.updated", invalidateDashboard);
    socket.on("shipment.status_changed", invalidateDashboard);
    socket.on("pallet_movement.created", invalidateDashboard);
    socket.on("pallet_balance.updated", invalidateDashboard);

    // Permission / Spedition events
    const invalidateSpeditionen = () => queryClient.invalidateQueries({ queryKey: getListSpeditionenQueryKey() });
    socket.on("permission.updated", invalidateSpeditionen);

    // User events
    const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    socket.on("user.updated", invalidateUsers);

    // Concurrent editing presence
    const onShipmentEditingEvent = (data: { shipmentId: number; editors: ShipmentEditor[] }) => {
      for (const handler of editingListeners) {
        handler(data.shipmentId, data.editors);
      }
    };
    socket.on("shipment.editing", onShipmentEditingEvent);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("shipment.created", invalidateShipments);
      socket.off("shipment.updated", invalidateShipments);
      socket.off("shipment.status_changed", invalidateShipments);
      socket.off("shipment.deleted", invalidateShipments);
      socket.off("shipment.locked", invalidateShipments);
      socket.off("shipment.unlocked", invalidateShipments);
      socket.off("pallet_movement.created", invalidatePalletMovements);
      socket.off("pallet_movement.created", invalidatePalletBalances);
      socket.off("pallet_balance.updated", invalidatePalletBalances);
      socket.off("reconciliation.created", invalidateReconciliations);
      socket.off("reconciliation.updated", invalidateReconciliations);
      socket.off("reconciliation.comment_added", invalidateReconciliations);
      socket.off("shipment.created", invalidateDashboard);
      socket.off("shipment.updated", invalidateDashboard);
      socket.off("shipment.status_changed", invalidateDashboard);
      socket.off("pallet_movement.created", invalidateDashboard);
      socket.off("pallet_balance.updated", invalidateDashboard);
      socket.off("permission.updated", invalidateSpeditionen);
      socket.off("user.updated", invalidateUsers);
      socket.off("shipment.editing", onShipmentEditingEvent);
    };
  }, [queryClient]);

  return { isConnected };
}
