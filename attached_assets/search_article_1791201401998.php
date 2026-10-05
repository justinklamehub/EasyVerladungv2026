<?php

require_once "../functions.php";

header('Content-Type: application/json; charset=utf-8');

$q = trim($_GET['q'] ?? '');

if ($q === '') {
    echo json_encode([
        "ok" => false,
        "message" => "Keine Eingabe erhalten."
    ]);
    exit;
}

$sql = "
    SELECT 
        a.id AS artikel_id,
        a.artikelnummer,
        a.ean,
        a.artikelname,

        ez.prioritaet,
        ez.hinweis,

        lr.id AS regal_id,
        lr.regal_nr,
        lr.voll_gemeldet,
        lr.voll_gemeldet_at,
        lr.voll_hinweis,

        lg.gang_nr,

        kg.name AS kundengruppe,
        kg.farbe,

        ret.parcours,
        COALESCE(ret.paletten, 0) AS paletten

    FROM artikel a

    LEFT JOIN einlagerung_zuordnung ez 
        ON ez.artikel_id = a.id 
        AND ez.aktiv = 1

    LEFT JOIN lager_regale lr 
        ON lr.id = ez.regal_id

    LEFT JOIN lager_gaenge lg 
        ON lg.id = lr.gang_id

    LEFT JOIN kundengruppen kg 
        ON kg.id = ez.kundengruppe_id

    LEFT JOIN (
            SELECT 
                platz,
                parcours,
                COUNT(*) AS paletten
            FROM zlthu_retoure
            GROUP BY platz, parcours
        ) ret 
            ON ret.platz = lr.regal_nr

    WHERE 
        a.aktiv = 1
        AND (
            a.artikelnummer = ?
            OR a.ean = ?
        )

    ORDER BY 
        lr.voll_gemeldet ASC,
        ez.prioritaet ASC,
        lg.gang_nr ASC,
        lr.sortierung ASC
";

$stmt = mysqli_prepare($dbhandle, $sql);

if (!$stmt) {
    echo json_encode([
        "ok" => false,
        "message" => "SQL Fehler: " . mysqli_error($dbhandle)
    ]);
    exit;
}

mysqli_stmt_bind_param($stmt, "ss", $q, $q);
mysqli_stmt_execute($stmt);

$result = mysqli_stmt_get_result($stmt);

$article = null;
$locations = [];

while ($row = mysqli_fetch_assoc($result)) {

    // Artikel einmal setzen
    if ($article === null) {
        $article = [
            "artikel_id"    => (int)$row['artikel_id'],
            "artikelnummer" => $row['artikelnummer'],
            "ean"           => $row['ean'],
            "artikelname"   => $row['artikelname']
        ];
    }

    // Nur gültige Lagerzuordnung
    if (!empty($row['regal_id'])) {

        $key = $row['regal_nr'];

        // Regal einmal anlegen
        if (!isset($locations[$key])) {
            $locations[$key] = [
                "artikel_id"     => (int)$row['artikel_id'],
                "regal_id"       => (int)$row['regal_id'],

                "prioritaet"     => (int)$row['prioritaet'],
                "gang_nr"        => $row['gang_nr'],
                "regal_nr"       => $row['regal_nr'],

                "kundengruppe"   => $row['kundengruppe'],
                "farbe"          => $row['farbe'],

                "hinweis"        => $row['hinweis'],

                "voll_gemeldet"  => (int)$row['voll_gemeldet'],
                "voll_hinweis"   => $row['voll_hinweis'],
                "voll_at"        => (int)$row['voll_gemeldet_at'],

                // 👉 NEU
                "retouren_total"   => 0,
                "retouren_details" => []
            ];
        }

        // 👉 Retouren hinzufügen
        if (!empty($row['parcours'])) {

            $anzahl = (int)$row['paletten'];

            $locations[$key]["retouren_total"] += $anzahl;

            $locations[$key]["retouren_details"][] = [
                "kunde"  => $row['parcours'],
                "anzahl" => $anzahl,
                "ist_total" => 0,
                "ist_details" => []
            ];
        }
    }
}

foreach ($locations as $key => $loc) {
    $stmt = mysqli_prepare($dbhandle, "
        SELECT 
            material,
            COUNT(*) AS paletten
        FROM zlthu_istbestand
        WHERE lagerplatz = ?
        GROUP BY material
        ORDER BY paletten DESC, material ASC
    ");

    mysqli_stmt_bind_param($stmt, "s", $loc['regal_nr']);
    mysqli_stmt_execute($stmt);
    $istRes = mysqli_stmt_get_result($stmt);

    while ($ist = mysqli_fetch_assoc($istRes)) {
        $paletten = (int)$ist['paletten'];

        $locations[$key]['ist_total'] += $paletten;
        $locations[$key]['ist_details'][] = [
            "material" => $ist['material'],
            "paletten" => $paletten
        ];
    }
}

// Array neu indexieren für JSON
$locations = array_values($locations);

mysqli_stmt_close($stmt);


// Artikel nicht gefunden
if ($article === null) {
    echo json_encode([
        "ok" => false,
        "message" => "Artikel wurde nicht gefunden."
    ]);
    exit;
}


// Artikel gefunden, aber keine Zuordnung
if (count($locations) === 0) {
    echo json_encode([
        "ok" => false,
        "message" => "Artikel gefunden, aber keine Einlagerungsvorgabe hinterlegt."
    ]);
    exit;
}


// Erfolg
echo json_encode([
    "ok" => true,
    "article" => $article,
    "locations" => $locations
]);