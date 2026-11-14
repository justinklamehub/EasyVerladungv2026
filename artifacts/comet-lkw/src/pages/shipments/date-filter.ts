/** A new start date keeps a single-day filter on that day and avoids inverted ranges. */
export function changeShipmentDate(from: string, current: { from: string; to: string }) {
  const singleDay = current.from === current.to;
  return {
    from,
    to: singleDay || !current.to || (!!from && current.to < from) ? from : current.to,
  };
}
