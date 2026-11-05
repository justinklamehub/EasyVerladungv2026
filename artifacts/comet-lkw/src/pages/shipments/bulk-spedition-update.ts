// Bound parallel requests and retain failed IDs so partial updates remain visible.
export async function updateShipmentSpeditionen(
  ids: readonly number[],
  speditionId: number,
  update: (id: number, speditionId: number) => Promise<unknown>,
) {
  const succeeded: number[] = [];
  const failed: number[] = [];
  for (let offset = 0; offset < ids.length; offset += 5) {
    const batch = ids.slice(offset, offset + 5);
    const results = await Promise.allSettled(batch.map(id => update(id, speditionId)));
    results.forEach((result, index) => {
      (result.status === "fulfilled" ? succeeded : failed).push(batch[index]!);
    });
  }
  return { succeeded, failed };
}
