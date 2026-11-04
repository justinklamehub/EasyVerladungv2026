const arrivalFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function shipmentArrivalFields(now: Date): { ataDate: string; ataTime: string } {
  const parts = Object.fromEntries(arrivalFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  return { ataDate: `${parts.year}-${parts.month}-${parts.day}`, ataTime: `${parts.hour}:${parts.minute}` };
}
