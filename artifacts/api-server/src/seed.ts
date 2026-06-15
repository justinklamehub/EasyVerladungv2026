import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  usersTable,
  speditionenTable,
  shipmentsTable,
  palletMovementsTable,
  palletReconciliationsTable,
  reconciliationCommentsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding database...");

  // Clear existing data (order matters for FK-like relationships)
  await db.delete(reconciliationCommentsTable);
  await db.delete(palletReconciliationsTable);
  await db.delete(palletMovementsTable);
  await db.delete(shipmentsTable);
  await db.delete(usersTable);
  await db.delete(speditionenTable);

  console.log("Cleared existing data");

  // ---- Speditionen ----
  const [sped1] = await db
    .insert(speditionenTable)
    .values({
      name: "Müller Transporte GmbH",
      kuerzel: "MTG",
      ansprechpartner: "Klaus Müller",
      email: "k.mueller@mueller-transporte.de",
      telefon: "+49 89 12345678",
      status: "aktiv",
      bemerkungen: "Langjähriger Partner, bevorzugt Containerbeladungen",
    })
    .returning();

  const [sped2] = await db
    .insert(speditionenTable)
    .values({
      name: "Schneider Logistik KG",
      kuerzel: "SLK",
      ansprechpartner: "Petra Schneider",
      email: "p.schneider@schneider-logistik.de",
      telefon: "+49 711 98765432",
      status: "aktiv",
      bemerkungen: "Spezialisiert auf Retouren und Sonderladungen",
    })
    .returning();

  const [sped3] = await db
    .insert(speditionenTable)
    .values({
      name: "Bauer Fracht AG",
      kuerzel: "BFA",
      ansprechpartner: "Hans Bauer",
      email: "h.bauer@bauer-fracht.de",
      telefon: "+49 40 55512345",
      status: "aktiv",
      bemerkungen: "Norddeutsche Partner für Großraumtransporte",
    })
    .returning();

  console.log("Created 3 Speditionen");

  // ---- Users ----
  const hash = (pw: string) => bcrypt.hash(pw, 12);

  // COMET users
  const [cometAdmin] = await db
    .insert(usersTable)
    .values({
      username: "admin",
      email: "admin@comet.de",
      passwordHash: await hash("admin123"),
      role: "comet_admin",
      speditionId: null,
      isActive: true,
    })
    .returning();

  const [cometLeitstand] = await db
    .insert(usersTable)
    .values({
      username: "leitstand",
      email: "leitstand@comet.de",
      passwordHash: await hash("leitstand123"),
      role: "comet_leitstand",
      speditionId: null,
      isActive: true,
    })
    .returning();

  const [cometLager] = await db
    .insert(usersTable)
    .values({
      username: "lager",
      email: "lager@comet.de",
      passwordHash: await hash("lager123"),
      role: "comet_lager",
      speditionId: null,
      isActive: true,
    })
    .returning();

  const [cometViewer] = await db
    .insert(usersTable)
    .values({
      username: "viewer",
      email: "viewer@comet.de",
      passwordHash: await hash("viewer123"),
      role: "comet_viewer",
      speditionId: null,
      isActive: true,
    })
    .returning();

  // Spedition users
  const [mtgAdmin] = await db
    .insert(usersTable)
    .values({
      username: "mueller.admin",
      email: "admin@mueller-transporte.de",
      passwordHash: await hash("mueller123"),
      role: "speditions_admin",
      speditionId: sped1.id,
      isActive: true,
    })
    .returning();

  const [mtgBearbeiter] = await db
    .insert(usersTable)
    .values({
      username: "mueller.fahrer",
      email: "fahrer@mueller-transporte.de",
      passwordHash: await hash("mueller123"),
      role: "speditions_bearbeiter",
      speditionId: sped1.id,
      isActive: true,
    })
    .returning();

  const [slkAdmin] = await db
    .insert(usersTable)
    .values({
      username: "schneider.admin",
      email: "admin@schneider-logistik.de",
      passwordHash: await hash("schneider123"),
      role: "speditions_admin",
      speditionId: sped2.id,
      isActive: true,
    })
    .returning();

  const [slkBearbeiter] = await db
    .insert(usersTable)
    .values({
      username: "schneider.fahrer",
      email: "fahrer@schneider-logistik.de",
      passwordHash: await hash("schneider123"),
      role: "speditions_bearbeiter",
      speditionId: sped2.id,
      isActive: true,
    })
    .returning();

  const [bfaAdmin] = await db
    .insert(usersTable)
    .values({
      username: "bauer.admin",
      email: "admin@bauer-fracht.de",
      passwordHash: await hash("bauer123"),
      role: "speditions_admin",
      speditionId: sped3.id,
      isActive: true,
    })
    .returning();

  const [bfaBearbeiter] = await db
    .insert(usersTable)
    .values({
      username: "bauer.fahrer",
      email: "fahrer@bauer-fracht.de",
      passwordHash: await hash("bauer123"),
      role: "speditions_bearbeiter",
      speditionId: sped3.id,
      isActive: true,
    })
    .returning();

  console.log("Created 10 users");

  // ---- Date helpers ----
  const today = new Date();
  const dateStr = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().split("T")[0];
  };

  // ---- Shipments ----
  const shipments = [
    // Today's shipments
    {
      bezeichnung: "MTG-001 Containerbeladung Hamburg",
      kennzeichen: "M-MT-1234",
      relation: "München → Hamburg",
      speditionId: sped1.id,
      etaDate: dateStr(0),
      etaTime: "06:00",
      ataDate: dateStr(0),
      ataTime: "05:55",
      lkwArt: "Container",
      status: "Angekommen",
      tor: "A1",
      createdBy: cometLeitstand.id,
      updatedBy: cometLeitstand.id,
    },
    {
      bezeichnung: "MTG-002 Anlieferung Ersatzteile",
      kennzeichen: "M-MT-5678",
      relation: "Nürnberg → München",
      speditionId: sped1.id,
      etaDate: dateStr(0),
      etaTime: "08:30",
      lkwArt: "Anlieferung",
      status: "Erwartet",
      tor: "B3",
      createdBy: mtgAdmin.id,
      updatedBy: mtgAdmin.id,
    },
    {
      bezeichnung: "SLK-001 Retoure Elektronik",
      kennzeichen: "S-SL-2222",
      relation: "Stuttgart → Augsburg",
      speditionId: sped2.id,
      etaDate: dateStr(0),
      etaTime: "09:15",
      lkwArt: "Retoure",
      status: "Angemeldet",
      createdBy: slkAdmin.id,
      updatedBy: slkAdmin.id,
    },
    {
      bezeichnung: "BFA-001 Großraumtransport Nord",
      kennzeichen: "HH-BF-3333",
      relation: "Hamburg → München",
      speditionId: sped3.id,
      etaDate: dateStr(0),
      etaTime: "10:00",
      ataDate: dateStr(0),
      ataTime: "10:12",
      lkwArt: "Container",
      status: "Verladen",
      tor: "C2",
      cometBearbeitet: true,
      gesperrtFuerSpedition: true,
      createdBy: cometLager.id,
      updatedBy: cometLeitstand.id,
    },
    {
      bezeichnung: "MTG-003 Abholung Leercontainer",
      kennzeichen: "M-MT-9900",
      relation: "München → Regensburg",
      speditionId: sped1.id,
      etaDate: dateStr(0),
      etaTime: "12:00",
      ataDate: dateStr(0),
      ataTime: "11:55",
      lkwArt: "Abholung",
      status: "Abgefertigt",
      tor: "A2",
      createdBy: cometLager.id,
      updatedBy: cometLager.id,
    },
    {
      bezeichnung: "SLK-002 Stornierung wegen Streik",
      kennzeichen: "S-SL-4444",
      relation: "Frankfurt → München",
      speditionId: sped2.id,
      etaDate: dateStr(0),
      etaTime: "14:00",
      lkwArt: "Anlieferung",
      status: "Storniert",
      bemerkungen: "Wegen Fahrerstreik abgesagt",
      createdBy: slkAdmin.id,
      updatedBy: cometAdmin.id,
    },
    // Tomorrow's shipments
    {
      bezeichnung: "MTG-004 Container XL München",
      kennzeichen: "M-MT-7777",
      relation: "Ingolstadt → München",
      speditionId: sped1.id,
      etaDate: dateStr(1),
      etaTime: "07:30",
      lkwArt: "Container",
      status: "Angemeldet",
      tor: "B1",
      createdBy: mtgAdmin.id,
      updatedBy: mtgAdmin.id,
    },
    {
      bezeichnung: "BFA-002 Sonderladung Maschinen",
      kennzeichen: "HH-BF-5555",
      relation: "Bremen → München",
      speditionId: sped3.id,
      etaDate: dateStr(1),
      etaTime: "11:00",
      lkwArt: "Sonstiges",
      status: "Angemeldet",
      bemerkungen: "Sperrgut, Kran benötigt",
      createdBy: bfaAdmin.id,
      updatedBy: bfaAdmin.id,
    },
    {
      bezeichnung: "SLK-003 Retoure Möbel",
      kennzeichen: "S-SL-6666",
      relation: "Ulm → Stuttgart → München",
      speditionId: sped2.id,
      etaDate: dateStr(1),
      etaTime: "13:45",
      lkwArt: "Retoure",
      status: "Erwartet",
      tor: "C1",
      createdBy: slkAdmin.id,
      updatedBy: cometLeitstand.id,
    },
    // Day after tomorrow
    {
      bezeichnung: "MTG-005 Wöchentliche Containerrunde",
      kennzeichen: "M-MT-8888",
      relation: "Landsberg → München",
      speditionId: sped1.id,
      etaDate: dateStr(2),
      etaTime: "08:00",
      lkwArt: "Container",
      status: "Angemeldet",
      createdBy: mtgAdmin.id,
      updatedBy: mtgAdmin.id,
    },
    {
      bezeichnung: "BFA-003 Rückholung leere Paletten",
      kennzeichen: "HH-BF-1111",
      relation: "München → Hamburg (Paletten)",
      speditionId: sped3.id,
      etaDate: dateStr(2),
      etaTime: "15:00",
      lkwArt: "Abholung",
      status: "Angemeldet",
      createdBy: bfaAdmin.id,
      updatedBy: bfaAdmin.id,
    },
  ];

  const insertedShipments = await db.insert(shipmentsTable).values(shipments as any).returning();
  console.log(`Created ${insertedShipments.length} shipments`);

  // ---- Pallet Movements ----
  const palletMoves = [
    // MTG movements
    {
      speditionId: sped1.id,
      shipmentId: insertedShipments[0].id,
      movementType: "eingang",
      movementDate: dateStr(-30),
      amount: 120,
      createdBy: cometLager.id,
      bemerkungen: "Eingang Containerbeladung",
    },
    {
      speditionId: sped1.id,
      shipmentId: insertedShipments[4].id,
      movementType: "ausgang",
      movementDate: dateStr(-15),
      amount: 48,
      createdBy: cometLager.id,
      bemerkungen: "Abholung Leercontainer",
    },
    {
      speditionId: sped1.id,
      movementType: "eingang",
      movementDate: dateStr(-7),
      amount: 36,
      createdBy: cometLager.id,
      bemerkungen: "Wochenlieferung MTG",
    },
    {
      speditionId: sped1.id,
      movementType: "korrektur",
      movementDate: dateStr(-3),
      amount: -5,
      createdBy: cometAdmin.id,
      bemerkungen: "Korrektur nach Inventur",
    },
    // SLK movements
    {
      speditionId: sped2.id,
      movementType: "eingang",
      movementDate: dateStr(-20),
      amount: 60,
      createdBy: cometLager.id,
      bemerkungen: "Eingang Retoure Welle 1",
    },
    {
      speditionId: sped2.id,
      movementType: "ausgang",
      movementDate: dateStr(-10),
      amount: 25,
      createdBy: cometLager.id,
    },
    // BFA movements
    {
      speditionId: sped3.id,
      shipmentId: insertedShipments[3].id,
      movementType: "eingang",
      movementDate: dateStr(-45),
      amount: 200,
      createdBy: cometLager.id,
      bemerkungen: "Großraumtransport Hamburg",
    },
    {
      speditionId: sped3.id,
      movementType: "ausgang",
      movementDate: dateStr(-30),
      amount: 80,
      createdBy: cometLager.id,
    },
    {
      speditionId: sped3.id,
      movementType: "ausgang",
      movementDate: dateStr(-14),
      amount: 60,
      createdBy: cometLager.id,
    },
  ];

  await db.insert(palletMovementsTable).values(palletMoves as any);
  console.log("Created pallet movements");

  // ---- Open Reconciliation ----
  const [rec] = await db
    .insert(palletReconciliationsTable)
    .values({
      speditionId: sped1.id,
      dateFrom: dateStr(-30),
      dateTo: dateStr(0),
      status: "offen",
      cometBalance: 103,
      speditionBalance: null,
      createdBy: cometAdmin.id,
    })
    .returning();

  await db.insert(reconciliationCommentsTable).values({
    reconciliationId: rec.id,
    userId: cometAdmin.id,
    comment: "Bitte Bestand bis Ende der Woche bestätigen. Unsererseits zählen wir 103 Paletten.",
  });

  await db.insert(reconciliationCommentsTable).values({
    reconciliationId: rec.id,
    userId: mtgAdmin.id,
    comment: "Wir prüfen den Bestand und melden uns bis Freitag zurück.",
  });

  console.log("Created 1 open reconciliation with 2 comments");

  // Abgeschlossene Abstimmung for SLK
  const [rec2] = await db
    .insert(palletReconciliationsTable)
    .values({
      speditionId: sped2.id,
      dateFrom: dateStr(-60),
      dateTo: dateStr(-31),
      status: "abgeschlossen",
      cometBalance: 35,
      speditionBalance: 35,
      createdBy: cometAdmin.id,
    })
    .returning();

  console.log("Created 1 closed reconciliation");

  console.log("\n=== SEED COMPLETE ===");
  console.log("\nLogin credentials:");
  console.log("  COMET Admin:     admin / admin123");
  console.log("  COMET Leitstand: leitstand / leitstand123");
  console.log("  COMET Lager:     lager / lager123");
  console.log("  COMET Viewer:    viewer / viewer123");
  console.log("  MTG Admin:       mueller.admin / mueller123");
  console.log("  MTG Bearbeiter:  mueller.fahrer / mueller123");
  console.log("  SLK Admin:       schneider.admin / schneider123");
  console.log("  BFA Admin:       bauer.admin / bauer123");
  console.log("============================\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
