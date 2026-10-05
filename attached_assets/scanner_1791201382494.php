<?php
include("functions.php");

$search = trim($_GET['q'] ?? '');
?>

<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Einlagerung Scanner</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <link rel="stylesheet" href="assets/app.css">

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>
</head>
<body class="scanner-body">

<div class="scanner-wrapper">
    <h1>Einlagerung</h1>

    <div class="scan-box">
        <label>Artikelnummer oder EAN scannen</label>
        <input type="number" id="scanInput" value="<?= e($search) ?>" autocomplete="off" placeholder="Scannen...">

        <div class="admin-form">
            <button type="button" class="admin-save" onclick="refreshSearch()">
                Aktualisieren
            </button>
        </div>
    </div>

    <div id="resultBox" class="result-box empty">
        Bitte Artikel scannen.
    </div>
</div>


<!-- Regal voll Modal -->
<div id="fullModal" class="modal-backdrop" style="display:none;">
    <div class="modal-box">
        <h2>Regal voll melden?</h2>
        <p id="fullModalText"></p>

        <textarea id="fullRemark" placeholder="Optionale Bemerkung"></textarea>

        <div class="modal-actions">
            <button type="button" onclick="closeFullModal()">Abbrechen</button>
            <button type="button" class="danger" onclick="submitFullReport()">Ja, Regal ist voll</button>
        </div>
    </div>
</div>

<div id="istModal" class="modal-backdrop" style="display:none;">
    <div class="modal-box">
        <h2 id="istModalTitle">IST-Bestand</h2>
        <div id="istModalContent"></div>

        <div class="modal-actions">
            <button type="button" onclick="closeIstModal()">Schließen</button>
        </div>
    </div>
</div>

<script>
toastr.options = {
    closeButton: true,
    progressBar: true,
    positionClass: "toast-top-right",
    timeOut: "3000",
    extendedTimeOut: "1000",
    preventDuplicates: true
};
</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>

<script>
const input = document.getElementById('scanInput');
const resultBox = document.getElementById('resultBox');

let lastSearchValue = '';
let selectedRegalId = 0;
let selectedArtikelId = 0;

let inputStartTime = 0;

input.addEventListener('keydown', function(e) {
    if (input.value.length === 0) {
        inputStartTime = Date.now();
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
    }
});

input.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') return;

    if (input.value.length < 5) return;

    const duration = Date.now() - inputStartTime;

    if (duration < 300) {
        triggerSearch();
    }
});


function refreshSearch() {

if (!lastSearchValue) {
    toastr.warning('Kein Artikel vorhanden.');
    return;
}

window.location.href = 'scanner.php?q=' + encodeURIComponent(lastSearchValue);
}

function triggerSearch() {
    const value = input.value.trim();

    if (!value) return;

    window.location.href = 'scanner.php?q=' + encodeURIComponent(value);
}


function searchArticle(valueOverride = null) {
    const value = valueOverride !== null ? valueOverride : input.value.trim();

    if (value === '') {
        return;
    }

    lastSearchValue = value;

    resultBox.className = 'result-box loading';
    resultBox.innerHTML = 'Suche läuft...';

    fetch('ajax/search_article.php?q=' + encodeURIComponent(value))
        .then(response => response.json())
        .then(data => {
            if (!data.ok) {
                resultBox.className = 'result-box error';
                resultBox.innerHTML = data.message || 'Artikel nicht gefunden.';
                input.select();
                return;
            }

            let html = `
                <div class="article-header">
                    <div class="article-number">${escapeHtml(data.article.artikelnummer)}</div>
                    <div class="article-name">${escapeHtml(data.article.artikelname || '')} (${escapeHtml(data.article.ean || '')})</div>
                </div>

                <div class="locations">
            `;

            data.locations.forEach(loc => {

            const color = loc.farbe || '#999';
            const kundengruppe = loc.kundengruppe || 'Keine Kundengruppe';
            const hinweis = loc.hinweis || '';

            const isFull = parseInt(loc.voll_gemeldet) === 1;
            const cardClass = isFull ? 'location-card location-full' : 'location-card';

            html += `
                <div class="${cardClass}" style="border-left-color:${isFull ? '#c62828' : escapeHtml(color)}">
                    <div class="prio">Priorität ${escapeHtml(loc.prioritaet)}</div>
                    <div class="target">Regal ${escapeHtml(loc.regal_nr)}</div>
                    <div class="group">${escapeHtml(kundengruppe)}</div>

                    ${loc.retouren_total > 0
                        ? `<div class="scanner-paletten-badge">
                        ${loc.retouren_details
                            .filter(r => r.anzahl > 0)
                            .map(r => `<span>${escapeHtml(r.kunde)}`)
                            .join(' | ')} (${loc.retouren_total} Pal.)</span>
                        </div>`
                        : ''
                    }

                    ${loc.ist_total > 0
                        ? `<button type="button" class="scanner-ist-badge" onclick='openIstModal(${JSON.stringify(loc.ist_details)}, ${loc.ist_total}, "${escapeJs(loc.regal_nr)}")'>
                                ${loc.ist_total}
                        </button>`
                        : ''
                    }

                    ${hinweis ? `<div class="hint">${escapeHtml(hinweis)}</div>` : ''}

                    ${isFull
                        ? `<div class="full-warning">⚠️ Dieses Regal wurde als voll gemeldet. Melden beim Lagerleitstand!</div>`
                        : `<button class="btn-full" onclick="openFullModal(${loc.regal_id}, ${loc.artikel_id}, '${loc.regal_nr}')">Regal voll melden</button>`
                    }
                </div>
            `;
            });

            html += `</div>`;

            resultBox.className = 'result-box success';
            resultBox.innerHTML = html;

            input.value = '';
        })
        .catch(() => {
            resultBox.className = 'result-box error';
            resultBox.innerHTML = 'Fehler bei der Suche.';
        });
}

function openFullModal(regalId, artikelId, regalNr) {
    selectedRegalId = regalId;
    selectedArtikelId = artikelId;

    document.getElementById('fullModalText').innerText =
        'Soll Regal ' + regalNr + ' wirklich als voll gemeldet werden?';

    document.getElementById('fullRemark').value = '';
    document.getElementById('fullModal').style.display = 'flex';
}

function closeFullModal() {
    document.getElementById('fullModal').style.display = 'none';
}

function submitFullReport() {
    if (selectedRegalId <= 0) {
        alert('Kein Regal ausgewählt.');
        return;
    }

    const formData = new FormData();
    formData.append('regal_id', selectedRegalId);
    formData.append('artikel_id', selectedArtikelId);
    formData.append('bemerkung', document.getElementById('fullRemark').value);

    fetch('ajax/report_full.php', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.ok) {
            toastr.success(data.message || 'Regal erfolgreich als voll gemeldet');
        } else {
            toastr.error(data.message || 'Fehler beim Speichern');
        }

        if (data.ok) {
            closeFullModal();

            if (lastSearchValue !== '') {
                searchArticle(lastSearchValue);
            }
        }
    })
    .catch(() => {
        toastr.error('Fehler beim Speichern der Meldung.');
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeJs(value) {
    return String(value ?? '')
        .replaceAll('\\', '\\\\')
        .replaceAll("'", "\\'")
        .replaceAll('"', '\\"');
}
</script>

<script>
window.addEventListener('load', function() {
    const initial = "<?= e($search) ?>";

    if (initial !== '') {
        lastSearchValue = initial;
        searchArticle(initial);
    }
});


function openIstModal(details, total, regalNr) {
    document.getElementById('istModalTitle').innerText =
        'IST-Bestand Regal ' + regalNr;

    let html = `
        <div class="scanner-ist-total">
            ${total} Bestandspaletten gesamt
        </div>
    `;

    if (details && details.length > 0) {
        html += `<div class="scanner-ist-list">`;

        details.forEach(row => {
            html += `
                <div class="scanner-ist-row">
                    <span>${escapeHtml(row.material)}</span>
                    <strong>${parseInt(row.paletten)} Pal.</strong>
                </div>
            `;
        });

        html += `</div>`;
    } else {
        html += `<div class="scanner-ist-empty">Kein IST-Bestand vorhanden.</div>`;
    }

    document.getElementById('istModalContent').innerHTML = html;
    document.getElementById('istModal').style.display = 'flex';
}

function closeIstModal() {
    document.getElementById('istModal').style.display = 'none';
    input.focus();
}
</script>



</body>
</html>