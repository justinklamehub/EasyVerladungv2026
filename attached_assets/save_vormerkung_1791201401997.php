<?php
require_once "../functions.php";

header('Content-Type: application/json; charset=utf-8');

$regal      = trim($_POST['regal'] ?? '');
$spedition  = trim($_POST['spedition'] ?? '');
$relation   = trim($_POST['relation'] ?? '');
$lfdat      = trim($_POST['lfdat'] ?? '');
$plusKw     = trim($_POST['plus_kw'] ?? '');
$bemerkung  = trim($_POST['bemerkung'] ?? '');

if ($regal === '' || $spedition === '' || $relation === '' || $lfdat === '') {
    echo json_encode([
        'ok' => false,
        'message' => 'Bitte Regal, Spedition, Leitgebiet und Liefertermin ausfüllen.'
    ]);
    exit;
}

if (!preg_match('/^\d{2}-\d{2}$/', $regal)) {
    echo json_encode([
        'ok' => false,
        'message' => 'Regal bitte im Format 01-45 eingeben.'
    ]);
    exit;
}

$now = time();
$createdBy = $_SESSION['username'] ?? null;

$stmt = mysqli_prepare($dbhandle, "
    INSERT INTO lager_vormerkungen (
        regal,
        spedition,
        relation,
        lfdat,
        plus_kw,
        bemerkung,
        status,
        created_by,
        created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'offen', ?, ?)
");

if (!$stmt) {
    echo json_encode([
        'ok' => false,
        'message' => 'Prepare fehlgeschlagen: ' . mysqli_error($dbhandle)
    ]);
    exit;
}

mysqli_stmt_bind_param(
    $stmt,
    "sssssssi",
    $regal,
    $spedition,
    $relation,
    $lfdat,
    $plusKw,
    $bemerkung,
    $createdBy,
    $now
);

if (!mysqli_stmt_execute($stmt)) {
    echo json_encode([
        'ok' => false,
        'message' => 'Speichern fehlgeschlagen: ' . mysqli_stmt_error($stmt)
    ]);
    exit;
}

echo json_encode([
    'ok' => true,
    'message' => 'Vormerkung wurde gespeichert.'
]);