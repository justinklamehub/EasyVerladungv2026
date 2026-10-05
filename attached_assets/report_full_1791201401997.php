<?php

require_once "../functions.php";

header('Content-Type: application/json; charset=utf-8');

$regalId = (int)($_POST['regal_id'] ?? 0);
$artikelId = (int)($_POST['artikel_id'] ?? 0);
$bemerkung = trim($_POST['bemerkung'] ?? '');

if ($regalId <= 0) {
    echo json_encode([
        "ok" => false,
        "message" => "Ungültiges Regal."
    ]);
    exit;
}

$now = time();

mysqli_begin_transaction($dbhandle);

try {
    $stmt = mysqli_prepare($dbhandle, "
        UPDATE lager_regale
        SET 
            voll_gemeldet = 1,
            voll_gemeldet_at = ?,
            voll_hinweis = ?
        WHERE id = ?
    ");

    mysqli_stmt_bind_param($stmt, "isi", $now, $bemerkung, $regalId);
    mysqli_stmt_execute($stmt);

    $stmt = mysqli_prepare($dbhandle, "
        INSERT INTO regal_voll_meldungen
            (regal_id, artikel_id, meldung_at, bemerkung)
        VALUES
            (?, ?, ?, ?)
    ");

    mysqli_stmt_bind_param($stmt, "iiis", $regalId, $artikelId, $now, $bemerkung);
    mysqli_stmt_execute($stmt);

    mysqli_commit($dbhandle);

    echo json_encode([
        "ok" => true,
        "message" => "Regal wurde als voll gemeldet."
    ]);
} catch (Throwable $e) {
    mysqli_rollback($dbhandle);

    echo json_encode([
        "ok" => false,
        "message" => "Fehler beim Speichern der Meldung."
    ]);
}