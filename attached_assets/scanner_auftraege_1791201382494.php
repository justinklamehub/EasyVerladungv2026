<?php
include("functions.php");

$search = trim($_GET['q'] ?? '');

$regalRes = mysqli_query($dbhandle, "
    SELECT regal_nr
    FROM lager_regale
    ORDER BY regal_nr ASC
");

$speditionRes = mysqli_query($dbhandle, "
    SELECT DISTINCT 
        ea.spediteur_name1,
        sf.farbe,
        sf.textfarbe
    FROM eingelagerte_auftraege ea
    LEFT JOIN speditionsfarben sf 
        ON sf.spediteur_name1 = ea.spediteur_name1
        AND sf.aktiv = 1
    WHERE ea.spediteur_name1 <> ''
    ORDER BY ea.spediteur_name1 ASC
");

$relationRes = mysqli_query($dbhandle, "
    SELECT DISTINCT relation
    FROM eingelagerte_auftraege
    WHERE relation <> ''
    ORDER BY relation ASC
");

$regale = [];
while ($r = mysqli_fetch_assoc($regalRes)) {
    $regale[] = $r['regal_nr'];
}

$speditionen = [];
while ($s = mysqli_fetch_assoc($speditionRes)) {
    $speditionen[] = $s;
}

$relationen = [];
while ($rel = mysqli_fetch_assoc($relationRes)) {
    $relationen[] = $rel['relation'];
}

?>
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <title>Aufträge Scanner</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <link rel="stylesheet" href="assets/app.css">

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.css">
    <script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>

    <style>
        .scanner-tabs {
            display: flex;
            gap: 8px;
            margin-bottom: 14px;
        }

        .scanner-tab {
            flex: 1;
            border: 0;
            border-radius: 12px;
            padding: 12px;
            font-weight: 800;
            background: #e5e7eb;
            color: #111827;
        }

        .scanner-tab.active {
            background: #111827;
            color: #fff;
        }

        .scanner-section {
            display: none;
        }

        .scanner-section.active {
            display: block;
        }

        .scanner-form-grid {
            display: grid;
            gap: 10px;
        }

        .scanner-form-grid input {
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid #d1d5db;
            font-size: 16px;
        }

        .auftrag-card {
            position: relative;
            background: #fff;
            border-radius: 16px;
            padding: 14px;
            margin-bottom: 12px;
            box-shadow: 0 6px 18px rgba(15,23,42,.12);
            border-left: 6px solid #7c3aed;
        }

        .vormerk-card {
            border-left-color: #2563eb;
            background: #eff6ff;
        }

        .real-badge {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #111827;
            color: #fff;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 900;
        }

        .vormerk-badge {
            display: inline-block;
            background: #2563eb;
            color: #fff;
            padding: 5px 9px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 900;
            margin-bottom: 8px;
        }

        .auftrag-title {
            font-size: 18px;
            font-weight: 900;
            color: #111827;
            margin-bottom: 4px;
            padding-right: 65px;
        }

        .auftrag-meta {
            font-size: 14px;
            color: #475569;
            margin-bottom: 6px;
        }

        .auftrag-row {
            display: flex;
            justify-content: space-between;
            gap: 10px;
            border-top: 1px solid rgba(15,23,42,.08);
            padding-top: 8px;
            margin-top: 8px;
            font-size: 14px;
        }

        .auftrag-row strong {
            color: #111827;
        }

        .scanner-form-grid select {
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            border: 1px solid #d1d5db;
            font-size: 16px;
            background: #fff;
        }

        .spedition-color-preview {
            height: 8px;
            border-radius: 999px;
            margin-top: 6px;
            background: #e5e7eb;
        }

        .regal-group-card {
    background: #fff;
    border-radius: 18px;
    margin-bottom: 14px;
    box-shadow: 0 8px 22px rgba(15,23,42,.14);
    overflow: hidden;
    border-left: 7px solid #7c3aed;
}

.regal-group-header {
    width: 100%;
    border: 0;
    background: linear-gradient(180deg, #ffffff, #f8fafc);
    padding: 16px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
}

.regal-head-main {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.regal-title-big {
    font-size: 22px;
    font-weight: 950;
    color: #020617;
}

.regal-subline {
    font-size: 13px;
    font-weight: 700;
    color: #64748b;
}

.regal-head-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.regal-group-count {
    background: #020617;
    color: #fff;
    border-radius: 999px;
    padding: 8px 11px;
    font-size: 15px;
    font-weight: 950;
    min-width: 42px;
    text-align: center;
}

.regal-group-count small {
    display: block;
    font-size: 10px;
    font-weight: 800;
    opacity: .75;
    margin-top: 1px;
}

.regal-toggle-btn {
    width: 42px;
    height: 42px;
    border-radius: 14px;
    border: 1px solid #cbd5e1;
    background: #fff;
    color: #020617;
    font-size: 20px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(15,23,42,.12);
}

.regal-group-body {
    display: none;
    padding: 0 14px 16px 14px;
    background: #fff;
}

.regal-group-card.open .regal-group-body {
    display: block;
}

.relation-block {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 15px;
    margin-top: 12px;
    overflow: hidden;
}

.relation-header {
    padding: 12px 12px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}

.relation-title {
    font-size: 16px;
    font-weight: 950;
    color: #020617;
}

.relation-sub {
    font-size: 12px;
    font-weight: 800;
    color: #64748b;
    margin-top: 2px;
}

.relation-pill {
    background: #ede9fe;
    color: #3b0764;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 950;
    white-space: nowrap;
}

.termin-list {
    padding: 4px 12px 10px 12px;
}

.termin-row {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 11px 0;
    border-bottom: 1px solid #e5e7eb;
}

.termin-row:last-child {
    border-bottom: 0;
}

.termin-date {
    font-size: 15px;
    font-weight: 850;
    color: #334155;
}

.termin-paletten {
    background: #020617;
    color: #fff;
    border-radius: 999px;
    padding: 6px 10px;
    font-size: 13px;
    font-weight: 950;
}
    </style>
</head>
<body class="scanner-body">

<div class="scanner-wrapper">
    <h1>Aufträge</h1>

    <div class="scanner-tabs">
        <button class="scanner-tab active" onclick="showTab('search')">Suchen</button>
        <button class="scanner-tab" onclick="showTab('vormerkung')">Vormerken</button>
    </div>

    <div id="tabSearch" class="scanner-section active">
        <div class="scan-box">
            <label>Aufträge suchen</label>

            <div class="scanner-form-grid">
                <select id="searchSpedition">
                    <option value="">Spedition auswählen</option>
                    <?php foreach ($speditionen as $sp): ?>
                        <option 
                            value="<?= e($sp['spediteur_name1']) ?>"
                            data-farbe="<?= e($sp['farbe'] ?? '#ede9fe') ?>"
                            data-textfarbe="<?= e($sp['textfarbe'] ?? '#111827') ?>"
                        >
                            <?= e($sp['spediteur_name1']) ?>
                        </option>
                    <?php endforeach; ?>
                </select>

                <input list="relationListe" id="searchRelation" placeholder="Leitgebiet eingeben oder auswählen">

                <input type="text" id="searchTermin" placeholder="Liefertermin, z. B. 47.2024 + 3">

                <input list="regalListe" id="searchRegal" placeholder="Regal, z. B. 01-45">
            </div>

            <div class="admin-form">
                <button type="button" class="admin-save" onclick="triggerSearch()">
                    Suchen
                </button>
            </div>
        </div>

        <div id="resultBox" class="result-box empty">
            Bitte Suchbegriff eingeben.
        </div>
    </div>

    <div id="tabVormerkung" class="scanner-section">
        <div class="scan-box">
            <label>Neue Vormerkung</label>

            <div class="scanner-form-grid">
                <input list="regalListe" type="text" id="vmRegal" placeholder="Regal eingeben oder auswählen, z. B. 01-45">

                <select id="vmSpedition">
                    <option value="">Spedition auswählen</option>
                    <?php foreach ($speditionen as $sp): ?>
                        <option 
                            value="<?= e($sp['spediteur_name1']) ?>"
                            data-farbe="<?= e($sp['farbe'] ?? '#ede9fe') ?>"
                            data-textfarbe="<?= e($sp['textfarbe'] ?? '#111827') ?>"
                        >
                            <?= e($sp['spediteur_name1']) ?>
                        </option>
                    <?php endforeach; ?>
                </select>

                <input list="relationListe" type="text" id="vmRelation" placeholder="Leitgebiet eingeben oder auswählen">

                <input type="text" id="vmLfdat" placeholder="Liefertermin, z. B. 47.2024 oder 18.12.2024">

                <input type="text" id="vmPlusKw" placeholder="+KW, z. B. 3">

                <input type="text" id="vmBemerkung" placeholder="Bemerkung optional">
            </div>

            <div class="admin-form">
                <button type="button" class="admin-save" onclick="saveVormerkung()">
                    Vormerkung speichern
                </button>
            </div>
        </div>
    </div>
</div>

<datalist id="regalListe">
    <?php foreach ($regale as $regal): ?>
        <option value="<?= e($regal) ?>"></option>
    <?php endforeach; ?>
</datalist>

<datalist id="relationListe">
    <?php foreach ($relationen as $relation): ?>
        <option value="<?= e($relation) ?>"></option>
    <?php endforeach; ?>
</datalist>

<script>
toastr.options = {
    closeButton: true,
    progressBar: true,
    positionClass: "toast-top-right",
    timeOut: "3000",
    extendedTimeOut: "1000",
    preventDuplicates: true
};

const searchInput = document.getElementById('searchInput');
const resultBox = document.getElementById('resultBox');

searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
    }
});

function showTab(tab) {
    document.querySelectorAll('.scanner-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.scanner-section').forEach(sec => sec.classList.remove('active'));

    if (tab === 'search') {
        document.querySelectorAll('.scanner-tab')[0].classList.add('active');
        document.getElementById('tabSearch').classList.add('active');
        searchInput.focus();
    } else {
        document.querySelectorAll('.scanner-tab')[1].classList.add('active');
        document.getElementById('tabVormerkung').classList.add('active');
        document.getElementById('vmRegal').focus();
    }
}

function triggerSearch() {
    const spedition = document.getElementById('searchSpedition').value.trim();
    const relation  = document.getElementById('searchRelation').value.trim();
    const termin    = document.getElementById('searchTermin').value.trim();
    const regal     = document.getElementById('searchRegal').value.trim();

    if (!spedition && !relation && !termin && !regal) {
        toastr.warning('Bitte mindestens ein Suchfeld ausfüllen.');
        return;
    }

    searchAuftraege({
        spedition,
        relation,
        termin,
        regal
    });
}

function searchAuftraege(filters) {
    resultBox.className = 'result-box loading';
    resultBox.innerHTML = 'Suche läuft...';

    const params = new URLSearchParams();

    params.set('spedition', filters.spedition || '');
    params.set('relation', filters.relation || '');
    params.set('termin', filters.termin || '');
    params.set('regal', filters.regal || '');

    fetch('ajax/search_auftraege.php?' + params.toString())
        .then(r => r.json())
        .then(data => {
            if (!data.ok) {
                resultBox.className = 'result-box error';
                resultBox.innerHTML = data.message || 'Keine Treffer gefunden.';
                searchInput.select();
                return;
            }

            let html = '';

            if (data.vormerkungen.length > 0) {
                html += `<h3>Vormerkungen</h3>`;

                data.vormerkungen.forEach(row => {
                    html += `
                        <div class="auftrag-card vormerk-card">
                            <div class="vormerk-badge">Vorgemerkt</div>
                            <div class="auftrag-title">Regal ${escapeHtml(row.regal)}</div>
                            <div class="auftrag-meta">${escapeHtml(row.spedition)} · Leitgebiet ${escapeHtml(row.relation)}</div>
                            <div class="auftrag-row">
                                <span>Liefertermin</span>
                                <strong>${escapeHtml(row.termin)}</strong>
                            </div>
                            ${row.bemerkung ? `
                                <div class="auftrag-row">
                                    <span>Bemerkung</span>
                                    <strong>${escapeHtml(row.bemerkung)}</strong>
                                </div>
                            ` : ''}
                            <div class="auftrag-row">
                                <span>Tatsächlich drin</span>
                                <strong>${parseInt(row.ist_paletten)} Pal.</strong>
                            </div>
                            ${parseInt(row.ist_paletten) > 0 ? `<div class="real-badge">${parseInt(row.ist_paletten)}</div>` : ''}
                        </div>
                    `;
                });
            }

            if (data.auftraege.length > 0) {
                html += `<h3>Eingelagerte Aufträge</h3>`;

                const grouped = {};

                data.auftraege.forEach(row => {
                    if (!grouped[row.platz]) {
                        grouped[row.platz] = {
                            platz: row.platz,
                            total: 0,
                            farbe: row.farbe || '#7c3aed',
                            textfarbe: row.textfarbe || '#111827',
                            relationen: {}
                        };
                    }

                    grouped[row.platz].total += parseInt(row.paletten || 0);

                    const relKey = row.relation || 'Ohne Leitgebiet';

                    if (!grouped[row.platz].relationen[relKey]) {
                        grouped[row.platz].relationen[relKey] = {
                            relation: relKey,
                            spedition: row.spedition || '',
                            termine: []
                        };
                    }

                    grouped[row.platz].relationen[relKey].termine.push({
                        termin: row.termin,
                        paletten: parseInt(row.paletten || 0)
                    });
                });

                Object.values(grouped).forEach((regal, index) => {
                    html += `
                        <div class="regal-group-card ${index === 0 ? 'open' : ''}" style="border-left-color:${escapeHtml(regal.farbe)}">
                            <button type="button" class="regal-group-header" onclick="toggleRegalGroup(this)">
                                <div class="regal-head-main">
                                    <div class="regal-title-big">Regal ${escapeHtml(regal.platz)}</div>
                                    <div class="regal-subline">${Object.keys(regal.relationen).length} Leitgebiet(e)</div>
                                </div>

                                <div class="regal-head-actions">
                                    <div class="regal-group-count">
                                        ${regal.total}
                                        <small>Pal.</small>
                                    </div>

                                    <div class="regal-toggle-btn arrow">
                                        ${index === 0 ? '⌃' : '⌄'}
                                    </div>
                                </div>
                            </button>

                            <div class="regal-group-body">
                    `;

                    Object.values(regal.relationen).forEach(rel => {
                    const relTotal = rel.termine.reduce((sum, t) => sum + parseInt(t.paletten || 0), 0);

                    html += `
                        <div class="relation-block">
                            <div class="relation-header">
                                <div>
                                    <div class="relation-title">Leitgebiet ${escapeHtml(rel.relation)}</div>
                                    <div class="relation-sub">${escapeHtml(rel.spedition)}</div>
                                </div>

                                <div class="relation-pill">${relTotal} Pal.</div>
                            </div>

                            <div class="termin-list">
                    `;

                    rel.termine.forEach(t => {
                        html += `
                            <div class="termin-row">
                                <div class="termin-date">${escapeHtml(t.termin)}</div>
                                <div class="termin-paletten">${t.paletten} Pal.</div>
                            </div>
                        `;
                    });

                    html += `
                            </div>
                        </div>
                    `;
                });

                    html += `
                            </div>
                        </div>
                    `;
                });
            }

            if (html === '') {
                resultBox.className = 'result-box empty';
                resultBox.innerHTML = 'Keine Treffer gefunden.';
                return;
            }

            resultBox.className = 'result-box success';
            resultBox.innerHTML = html;
        })
        .catch(() => {
            resultBox.className = 'result-box error';
            resultBox.innerHTML = 'Fehler bei der Suche.';
        });
}

function toggleRegalGroup(btn) {
    const card = btn.closest('.regal-group-card');
    card.classList.toggle('open');

    const arrow = card.querySelector('.arrow');
    arrow.innerText = card.classList.contains('open') ? '⌃' : '⌄';
}

function saveVormerkung() {
    const formData = new FormData();
    formData.append('regal', document.getElementById('vmRegal').value.trim());
    formData.append('spedition', document.getElementById('vmSpedition').value.trim());
    formData.append('relation', document.getElementById('vmRelation').value.trim());
    formData.append('lfdat', document.getElementById('vmLfdat').value.trim());
    formData.append('plus_kw', document.getElementById('vmPlusKw').value.trim());
    formData.append('bemerkung', document.getElementById('vmBemerkung').value.trim());

    fetch('ajax/save_vormerkung.php', {
        method: 'POST',
        body: formData
    })
    .then(r => r.json())
    .then(data => {
        if (!data.ok) {
            toastr.error(data.message || 'Vormerkung konnte nicht gespeichert werden.');
            return;
        }

        toastr.success(data.message || 'Vormerkung gespeichert.');

        const regal = document.getElementById('vmRegal').value.trim();

        document.getElementById('vmRegal').value = '';
        document.getElementById('vmSpedition').value = '';
        document.getElementById('vmRelation').value = '';
        document.getElementById('vmLfdat').value = '';
        document.getElementById('vmPlusKw').value = '';
        document.getElementById('vmBemerkung').value = '';

        showTab('search');

        document.getElementById('searchRegal').value = regal;
        document.getElementById('searchSpedition').value = '';
        document.getElementById('searchRelation').value = '';
        document.getElementById('searchTermin').value = '';

        searchAuftraege({
            spedition: '',
            relation: '',
            termin: '',
            regal: regal
        });
    })
    .catch(() => {
        toastr.error('Fehler beim Speichern.');
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

window.addEventListener('load', function() {
    const initial = "<?= e($search) ?>";

    if (initial !== '') {
        searchAuftraege(initial);
    }
});
</script>

</body>
</html>