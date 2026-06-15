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

export function useSocket() {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(true);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Shipment events
    const invalidateShipments = () => queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
    socket.on("shipment.created", invalidateShipments);
    socket.on("shipment.updated", invalidateShipments);
    socket.on("shipment.status_changed", invalidateShipments);
    socket.on("shipment.locked", invalidateShipments);
    socket.on("shipment.unlocked", invalidateShipments);

    // Pallet events
    const invalidatePallets = () => {
      queryClient.invalidateQueries({ queryKey: getListPalletMovementsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListPalletBalancesQueryKey() });
    };
    socket.on("pallet_movement.created", invalidatePallets);
    socket.on("pallet_balance.updated", invalidatePallets);

    // Reconciliation events
    const invalidateReconciliations = () => {
      queryClient.invalidateQueries({ queryKey: getListReconciliationsQueryKey() });
    };
    socket.on("reconciliation.created", invalidateReconciliations);
    socket.on("reconciliation.updated", invalidateReconciliations);
    socket.on("reconciliation.comment_added", invalidateReconciliations);

    // Dashboard invalidation — fired by any shipment or pallet change
    const invalidateDashboard = () => {
      queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
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
      socket.off("shipment.locked", invalidateShipments);
      socket.off("shipment.unlocked", invalidateShipments);
      socket.off("pallet_movement.created", invalidatePallets);
      socket.off("pallet_balance.updated", invalidatePallets);
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
