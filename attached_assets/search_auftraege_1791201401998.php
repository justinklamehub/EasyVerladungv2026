<?php
require_once "../functions.php";

header('Content-Type: application/json; charset=utf-8');

$spedition = trim($_GET['spedition'] ?? '');
$relation  = trim($_GET['relation'] ?? '');
$termin    = trim($_GET['termin'] ?? '');
$regal     = trim($_GET['regal'] ?? '');

if ($spedition === '' && $relation === '' && $termin === '' && $regal === '') {
    echo json_encode([
        'ok' => false,
        'message' => 'Kein Suchfilter übergeben.'
    ]);
    exit;
}

$whereAuftrag = [];
$whereVormerk = [];

if ($spedition !== '') {
    $esc = mysqli_real_escape_string($dbhandle, $spedition);
    $whereAuftrag[] = "ea.spediteur_name1 = '{$esc}'";
    $whereVormerk[] = "lv.spedition = '{$esc}'";
}

if ($relation !== '') {
    $esc = mysqli_real_escape_string($dbhandle, $relation);
    $whereAuftrag[] = "ea.relation LIKE '%{$esc}%'";
    $whereVormerk[] = "lv.relation LIKE '%{$esc}%'";
}

if ($termin !== '') {
    $esc = mysqli_real_escape_string($dbhandle, $termin);
    $whereAuftrag[] = "
        (
            ea.lfdat LIKE '%{$esc}%'
            OR ea.plus_kw LIKE '%{$esc}%'
            OR CONCAT(ea.lfdat, ' + ', ea.plus_kw) LIKE '%{$esc}%'
        )
    ";
    $whereVormerk[] = "
        (
            lv.lfdat LIKE '%{$esc}%'
            OR lv.plus_kw LIKE '%{$esc}%'
            OR CONCAT(lv.lfdat, ' + ', lv.plus_kw) LIKE '%{$esc}%'
        )
    ";
}

if ($regal !== '') {
    $esc = mysqli_real_escape_string($dbhandle, $regal);
    $whereAuftrag[] = "ea.platz LIKE '%{$esc}%'";
    $whereVormerk[] = "lv.regal LIKE '%{$esc}%'";
}

$whereAuftragSql = count($whereAuftrag)
    ? "WHERE " . implode(" AND ", $whereAuftrag)
    : "";

$whereVormerkSql = count($whereVormerk)
    ? "AND " . implode(" AND ", $whereVormerk)
    : "";

$auftraegeRes = mysqli_query($dbhandle, "
    SELECT
        ea.platz,
        ea.spediteur_name1,
        ea.relation,
        ea.lfdat,
        ea.plus_kw,
        COALESCE(sf.farbe, '#ede9fe') AS farbe,
        COALESCE(sf.textfarbe, '#111827') AS textfarbe,
        COUNT(*) AS paletten
    FROM eingelagerte_auftraege ea
    LEFT JOIN speditionsfarben sf
        ON sf.spediteur_name1 = ea.spediteur_name1
        AND sf.aktiv = 1
    {$whereAuftragSql}
    GROUP BY 
        ea.platz,
        ea.spediteur_name1,
        ea.relation,
        ea.lfdat,
        ea.plus_kw,
        sf.farbe,
        sf.textfarbe
    ORDER BY ea.platz ASC, ea.spediteur_name1 ASC
    LIMIT 100
");

$auftraege = [];

while ($row = mysqli_fetch_assoc($auftraegeRes)) {
    $terminText = trim($row['lfdat']);

    if (trim($row['plus_kw']) !== '') {
        $terminText .= ' + ' . trim($row['plus_kw']);
    }

    $auftraege[] = [
        'platz' => $row['platz'],
        'spedition' => $row['spediteur_name1'],
        'relation' => $row['relation'],
        'termin' => $terminText,
        'paletten' => (int)$row['paletten'],
        'farbe' => $row['farbe'],
        'textfarbe' => $row['textfarbe']
    ];
}

$vormerkRes = mysqli_query($dbhandle, "
    SELECT
        lv.id,
        lv.regal,
        lv.spedition,
        lv.relation,
        lv.lfdat,
        lv.plus_kw,
        lv.bemerkung,
        COALESCE(sf.farbe, '#dbeafe') AS farbe,
        COALESCE(sf.textfarbe, '#1e3a8a') AS textfarbe,
        COALESCE(ist.paletten, 0) AS ist_paletten
    FROM lager_vormerkungen lv
    LEFT JOIN speditionsfarben sf
        ON sf.spediteur_name1 = lv.spedition
        AND sf.aktiv = 1
    LEFT JOIN (
        SELECT platz, COUNT(*) AS paletten
        FROM eingelagerte_auftraege
        GROUP BY platz
    ) ist ON ist.platz = lv.regal
    WHERE lv.status = 'offen'
    {$whereVormerkSql}
    ORDER BY lv.created_at DESC
    LIMIT 100
");

$vormerkungen = [];

while ($row = mysqli_fetch_assoc($vormerkRes)) {
    $terminText = trim($row['lfdat']);

    if (trim($row['plus_kw']) !== '') {
        $terminText .= ' + ' . trim($row['plus_kw']);
    }

    $vormerkungen[] = [
        'id' => (int)$row['id'],
        'regal' => $row['regal'],
        'spedition' => $row['spedition'],
        'relation' => $row['relation'],
        'termin' => $terminText,
        'bemerkung' => $row['bemerkung'],
        'ist_paletten' => (int)$row['ist_paletten'],
        'farbe' => $row['farbe'],
        'textfarbe' => $row['textfarbe']
    ];
}

echo json_encode([
    'ok' => true,
    'auftraege' => $auftraege,
    'vormerkungen' => $vormerkungen
]);