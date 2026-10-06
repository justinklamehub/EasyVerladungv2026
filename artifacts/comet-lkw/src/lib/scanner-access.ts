export const isWarehouseScannerRoute = (path: string) => {
  const route = path.replace(/\/+$/, "");
  return route === "/scanner/einlagerung" || route === "/scanner/einlagerung-auftraege";
};

export const PUBLIC_SCANNER_PERMISSIONS: readonly string[] = [
  "einlagerung.scan", "einlagerung.view", "einlagerung.full", "einlagerung.release",
  "einlagerung.reservation.create", "einlagerung.reservation.edit",
];
