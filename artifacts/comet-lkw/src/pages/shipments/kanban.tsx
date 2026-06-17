import { useState } from "react";
import { useListShipments, useUpdateShipment, getListShipmentsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lock } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const STATUSES = ["Angemeldet", "Erwartet", "Angekommen", "in Verladung", "Verladen", "Abgefertigt", "Storniert"];

function SortableShipmentCard({ shipment }: { shipment: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ 
    id: shipment.id,
    disabled: shipment.gesperrtFuerSpedition
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={`shadow-sm border-slate-200 mb-3 ${shipment.gesperrtFuerSpedition ? 'cursor-not-allowed opacity-80' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <CardContent className="p-3">
        <div className="flex justify-between items-start mb-2">
          <div className="font-bold text-slate-900">{shipment.kennzeichen || "Ohne Kennzeichen"}</div>
          {shipment.gesperrtFuerSpedition && <Lock className="w-3.5 h-3.5 text-red-500" />}
        </div>
        <div className="text-sm text-slate-600 mb-2 truncate">
          {shipment.speditionName || "Unbekannte Spedition"}
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">
            Tor: {shipment.tor || "-"}
          </span>
          <span className="text-slate-500">
            {shipment.etaDate && shipment.etaTime ? `${format(new Date(shipment.etaDate), "dd.MM.")} ${shipment.etaTime}` : "-"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DroppableColumn({ status, items }: { status: string, items: any[] }) {
  return (
    <div className="flex flex-col flex-shrink-0 w-80 bg-slate-100 rounded-lg border border-slate-200 h-full">
      <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-lg">
        <h3 className="font-semibold text-slate-700">{status}</h3>
        <Badge variant="secondary" className="bg-white border-slate-200">
          {items.length}
        </Badge>
      </div>
      
      <ScrollArea className="flex-1 p-3">
        <SortableContext id={status} items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <div className="min-h-[100px]">
            {items.map(shipment => (
              <SortableShipmentCard key={shipment.id} shipment={shipment} />
            ))}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

export default function KanbanPage() {
  const { data: shipments, isLoading } = useListShipments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const updateShipment = useUpdateShipment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        toast({ title: "Status aktualisiert" });
      },
      onError: () => {
        toast({ title: "Fehler beim Verschieben", variant: "destructive" });
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
      }
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const [activeId, setActiveId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const shipmentsByStatus = STATUSES.reduce((acc, status) => {
    acc[status] = shipments?.filter(s => s.status === status) || [];
    return acc;
  }, {} as Record<string, any[]>);

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    setActiveId(null);
    const { active, over } = event;
    
    if (!over) return;
    
    // Find the container we dropped in
    // Since SortableContext id is the status string, over.data.current?.sortable?.containerId has the status
    const overId = over.id;
    const activeContainer = active.data.current?.sortable?.containerId;
    
    let overContainer = over.data.current?.sortable?.containerId;
    if (!overContainer && STATUSES.includes(overId)) {
        overContainer = overId;
    }

    if (!overContainer || activeContainer === overContainer) {
      return; // Dropped in same column or invalid
    }

    // Move to new status
    const shipmentId = active.id as number;
    // Optimistic update could go here
    updateShipment.mutate({ id: shipmentId, data: { status: overContainer as any } });
  };

  const activeShipment = activeId ? shipments?.find(s => s.id === activeId) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-full overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Kanban Board</h1>
        <p className="text-sm text-slate-500">Verladungen per Drag-and-Drop verschieben</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4 h-full">
          {STATUSES.map(status => (
            <DroppableColumn key={status} status={status} items={shipmentsByStatus[status]} />
          ))}
        </div>
        
        <DragOverlay>
          {activeShipment ? (
             <Card className="shadow-lg border-primary/50 opacity-90 scale-105 cursor-grabbing">
             <CardContent className="p-3">
               <div className="font-bold text-slate-900 mb-2">{activeShipment.kennzeichen || "Ohne Kennzeichen"}</div>
               <div className="text-sm text-slate-600 mb-2 truncate">{activeShipment.speditionName}</div>
             </CardContent>
           </Card>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
