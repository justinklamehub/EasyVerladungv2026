import type { Server as IOServer } from "socket.io";

export function emitToRooms(
  io: IOServer,
  event: string,
  data: any,
  speditionId?: number | null,
  additionalSpeditionIds?: number[],
) {
  io.to("comet").emit(event, data);
  if (speditionId) {
    io.to(`spedition:${speditionId}`).emit(event, data);
  }
  for (const id of additionalSpeditionIds ?? []) {
    if (id !== speditionId) {
      io.to(`spedition:${id}`).emit(event, data);
    }
  }
}
