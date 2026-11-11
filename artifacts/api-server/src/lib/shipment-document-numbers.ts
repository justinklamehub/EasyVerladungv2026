type DocumentNumbers = {
  ladelistennummer: string | null;
  palettenscheinnummer: string | null;
};

/** Use the receipt's outgoing Euro count, not the pallet account's net balance. */
export function shipmentLoadedEuroPallets(rows: {
  shipmentId: number | null;
  vonCometEuropaletten: number | null;
}[]) {
  const totals = new Map<number, number>();
  for (const row of rows) {
    if (row.shipmentId == null) continue;
    totals.set(row.shipmentId, (totals.get(row.shipmentId) ?? 0) + (row.vonCometEuropaletten ?? 0));
  }
  return totals;
}

/** Keep every document number without duplicating shipment rows in an export. */
export function shipmentDocumentNumbers(rows: (DocumentNumbers & { shipmentId: number | null })[]) {
  const grouped = new Map<number, { loading: Set<string>; pallets: Set<string> }>();
  for (const row of rows) {
    if (row.shipmentId == null) continue;
    const group = grouped.get(row.shipmentId) ?? { loading: new Set<string>(), pallets: new Set<string>() };
    if (row.ladelistennummer?.trim()) group.loading.add(row.ladelistennummer.trim());
    if (row.palettenscheinnummer?.trim()) group.pallets.add(row.palettenscheinnummer.trim());
    grouped.set(row.shipmentId, group);
  }
  return new Map<number, DocumentNumbers>(
    [...grouped].map(([id, group]) => [id, {
      ladelistennummer: [...group.loading].join(", ") || null,
      palettenscheinnummer: [...group.pallets].join(", ") || null,
    }]),
  );
}
