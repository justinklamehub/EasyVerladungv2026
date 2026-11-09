type DocumentNumbers = {
  ladelistennummer: string | null;
  palettenscheinnummer: string | null;
};

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
