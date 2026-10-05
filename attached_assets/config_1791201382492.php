<?php

$dbhost = "localhost";
$dbuser = "root";
$dbpass = "0ctlI4dKpeNahlP9JS5eze9DETkufwxicxFxQqW4C0yuKx5dK8";
$dbname = "einlagerung";

$dbhandle = mysqli_connect($dbhost, $dbuser, $dbpass, $dbname);

if (!$dbhandle) {
    die("Datenbankverbindung fehlgeschlagen: " . mysqli_connect_error());
}

mysqli_set_charset($dbhandle, "utf8mb4");