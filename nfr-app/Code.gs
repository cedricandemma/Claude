/**
 * Code.gs — serveur de l'application Notes de frais (Google Apps Script).
 * Données : Google Sheet « NFR Données » dans le dossier Drive « NFR Claude ».
 */

var ROOT_FOLDER_NAME = 'NFR Claude';
var DATA_FILE_NAME = 'NFR Données';

var SHEETS = {
  CONFIG: { name: 'Config', headers: ['cle', 'valeur', 'commentaire'] },
  PERSONNES: { name: 'Personnes', headers: ['id', 'nom', 'titre', 'adresse1', 'adresse2', 'forfait_defaut', 'libelle_defaut', 'sous_dossier'] },
  TARIFS: { name: 'Tarifs', headers: ['code', 'libelle', 'montant', 'date_debut', 'source', 'valide_le'] },
  JOURS: { name: 'Jours', headers: ['personne', 'date', 'statut', 'pays', 'libelle'] },
  FRAIS: { name: 'Frais', headers: ['id', 'personne', 'mois', 'date', 'categorie', 'description', 'commentaire', 'montant_orig', 'devise', 'taux', 'montant_eur', 'quantite', 'fichier_id', 'fichier_nom', 'cree_le'] },
  NOTES: { name: 'Notes', headers: ['personne', 'mois', 'numero', 'genere_le', 'total', 'pdf_id', 'pdf_url'] }
};

var DEFAULT_CONFIG = [
  ['SOCIETE_NOM', 'Castremanne Management SRL', 'Destinataire des notes de frais'],
  ['SOCIETE_ADR1', 'Avenue Fernand Labby 9', ''],
  ['SOCIETE_ADR2', '1390 Bossut-Gottechain', ''],
  ['SOCIETE_TVA', 'BE 0843.031.552', ''],
  ['CLAUDE_MODEL', 'claude-opus-5-5', 'Modèle utilisé pour lire les justificatifs et vérifier les tarifs'],
  ['DERNIERE_VERIF_TARIFS', '', 'Rempli automatiquement']
];

var DEFAULT_PERSONNES = [
  ['CC', 'Cédric Castremanne', 'Administrateur', 'Avenue Fernand Labby 9', '1390 Bossut-Gottechain', 'OUI', 'Flexso Brussels SA', ''],
  ['ER', 'Emma Russell', 'Administratrice', 'Avenue Fernand Labby 9', '1390 Bossut-Gottechain', 'NON', '', 'Emma Russell']
];

var DEFAULT_TARIFS = [
  ['FORFAIT_BE', 'Forfait journée extérieure (Belgique)', 21.64, '2026-03-01', 'Circulaire 2026/C/35 SPF Finances', ''],
  ['PERDIEM_LU', 'Per diem Luxembourg (catégorie 1)', 107, '2025-08-01', 'AM 14/07/2025', ''],
  ['PERDIEM_DE', 'Per diem Allemagne (catégorie 1)', 92, '2025-08-01', 'AM 14/07/2025', ''],
  ['PERDIEM_FR', 'Per diem France (catégorie 1)', '', '2025-08-01', 'À compléter', ''],
  ['TAUX_DOMICILE', 'Quote-part professionnelle du domicile', 0.42, '2000-01-01', 'Convention société', ''],
  ['PRIX_KWH_BORNE', 'Prix du kWh borne de recharge', 0.40, '2026-01-01', 'Contrat TotalEnergies', '']
];

/* ------------------------------------------------------------------ */
/* Web app                                                            */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Notes de frais')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ------------------------------------------------------------------ */
/* Installation                                                       */
/* ------------------------------------------------------------------ */

/** À lancer une fois depuis l'éditeur : crée le classeur de données. */
function setup() {
  var root = rootFolder_();
  var ss = dataSpreadsheet_(true);
  Object.keys(SHEETS).forEach(function (k) { ensureSheet_(ss, SHEETS[k]); });
  textDateColumns_();
  fillIfEmpty_(ss, SHEETS.CONFIG, DEFAULT_CONFIG);
  fillIfEmpty_(ss, SHEETS.PERSONNES, DEFAULT_PERSONNES);
  fillIfEmpty_(ss, SHEETS.TARIFS, DEFAULT_TARIFS);
  var def = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  return 'Installation terminée. Dossier : ' + root.getUrl() + ' ; données : ' + ss.getUrl();
}

function rootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('ROOT_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recherche ci-dessous */ } }
  var it = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  var f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function dataSpreadsheet_(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DATA_SS_ID');
  if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* recherche ci-dessous */ } }
  var root = rootFolder_();
  var it = root.getFilesByName(DATA_FILE_NAME);
  var ss;
  if (it.hasNext()) ss = SpreadsheetApp.open(it.next());
  else if (create) {
    ss = SpreadsheetApp.create(DATA_FILE_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(root);
  } else throw new Error('Données introuvables : lancez setup() depuis l\'éditeur Apps Script.');
  props.setProperty('DATA_SS_ID', ss.getId());
  return ss;
}

function ensureSheet_(ss, def) {
  var sh = ss.getSheetByName(def.name);
  if (!sh) sh = ss.insertSheet(def.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, def.headers.length).setValues([def.headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function fillIfEmpty_(ss, def, rows) {
  var sh = ss.getSheetByName(def.name);
  if (sh.getLastRow() <= 1 && rows.length) sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

/* ------------------------------------------------------------------ */
/* Accès aux onglets                                                  */
/* ------------------------------------------------------------------ */

function sheet_(def) { return ensureSheet_(dataSpreadsheet_(false), def); }

function readRows_(def) {
  var sh = sheet_(def);
  var n = sh.getLastRow();
  if (n < 2) return [];
  var values = sh.getRange(2, 1, n - 1, def.headers.length).getValues();
  return values.map(function (row, i) {
    var o = { _row: i + 2 };
    def.headers.forEach(function (h, j) {
      var v = row[j];
      if (v instanceof Date) v = Utilities.formatDate(v, 'Europe/Brussels', 'yyyy-MM-dd');
      o[h] = v;
    });
    return o;
  });
}

function writeRow_(def, rowIndex, obj) {
  var sh = sheet_(def);
  var row = def.headers.map(function (h) { return obj[h] === undefined ? '' : obj[h]; });
  if (rowIndex) sh.getRange(rowIndex, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function textDateColumns_() {
  // Évite que Sheets convertisse les dates ISO : format texte sur les colonnes date.
  var ss = dataSpreadsheet_(false);
  [[SHEETS.JOURS, 'date'], [SHEETS.FRAIS, 'date'], [SHEETS.FRAIS, 'mois'], [SHEETS.TARIFS, 'date_debut'], [SHEETS.NOTES, 'mois']].forEach(function (p) {
    var sh = ss.getSheetByName(p[0].name);
    var col = p[0].headers.indexOf(p[1]) + 1;
    sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@');
  });
}

function getConfig_() {
  var c = {};
  readRows_(SHEETS.CONFIG).forEach(function (r) { c[r.cle] = r.valeur; });
  return c;
}

function setConfig_(key, value) {
  var rows = readRows_(SHEETS.CONFIG);
  var r = rows.filter(function (x) { return x.cle === key; })[0];
  writeRow_(SHEETS.CONFIG, r ? r._row : null, { cle: key, valeur: value, commentaire: r ? r.commentaire : '' });
}

function getPersons_() {
  return readRows_(SHEETS.PERSONNES).map(function (p) {
    return {
      id: String(p.id), nom: p.nom, titre: p.titre, adresse1: p.adresse1, adresse2: p.adresse2,
      forfaitDefaut: String(p.forfait_defaut).toUpperCase() === 'OUI',
      libelleDefaut: p.libelle_defaut, sousDossier: p.sous_dossier
    };
  });
}

function getPerson_(id) {
  var p = getPersons_().filter(function (x) { return x.id === id; })[0];
  if (!p) throw new Error('Personne inconnue : ' + id);
  return p;
}

function getRates_() {
  return readRows_(SHEETS.TARIFS).map(function (r) {
    return { code: r.code, libelle: r.libelle, montant: r.montant === '' ? '' : Number(r.montant), debut: String(r.date_debut), source: r.source, _row: r._row };
  });
}

function listExpenses_(personId, ym) {
  return readRows_(SHEETS.FRAIS).filter(function (r) {
    return String(r.personne) === personId && String(r.mois).slice(0, 7) === ym;
  }).map(function (r) {
    return {
      id: r.id, personne: r.personne, mois: String(r.mois).slice(0, 7), date: String(r.date), categorie: r.categorie,
      description: r.description, commentaire: r.commentaire, montantOrig: Number(r.montant_orig),
      devise: r.devise || 'EUR', taux: Number(r.taux || 1), montantEur: r.montant_eur === '' ? '' : Number(r.montant_eur),
      quantite: r.quantite, fichierId: r.fichier_id, fichierNom: r.fichier_nom, _row: r._row
    };
  });
}

/* ------------------------------------------------------------------ */
/* API appelée par l'interface (google.script.run)                    */
/* ------------------------------------------------------------------ */

function getBootstrap() {
  var props = PropertiesService.getScriptProperties();
  return {
    persons: getPersons_(),
    categories: NFR.CATEGORIES,
    statuts: NFR.STATUTS,
    pays: NFR.PAYS,
    dayColumns: NFR.DAY_COLUMNS,
    chargeColumns: NFR.CHARGE_COLUMNS,
    rates: getRates_(),
    hasApiKey: !!props.getProperty('ANTHROPIC_API_KEY'),
    config: getConfig_()
  };
}

function getMonth(personId, ym) {
  var person = getPerson_(personId);
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  var overrides = {};
  readRows_(SHEETS.JOURS).forEach(function (r) {
    if (String(r.personne) === personId && String(r.date).slice(0, 7) === ym) {
      overrides[String(r.date)] = { statut: r.statut, pays: r.pays, libelle: r.libelle };
    }
  });
  var expenses = listExpenses_(personId, ym);
  var rates = getRates_();
  var res = NFR.computeMonth({ year: y, month: m, person: person, overrides: overrides, expenses: expenses, rates: rates });
  res.person = person;
  res.expenses = expenses;
  res.notes = readRows_(SHEETS.NOTES).filter(function (n) { return String(n.personne) === personId && String(n.mois).slice(0, 7) === ym; });
  return JSON.parse(JSON.stringify(res));
}

/** Modifie le statut d'une journée. statut vide = retour au défaut. */
function setDay(personId, isoDate, statut, pays, libelle) {
  var rows = readRows_(SHEETS.JOURS);
  var r = rows.filter(function (x) { return String(x.personne) === personId && String(x.date) === isoDate; })[0];
  if (!statut) {
    if (r) sheet_(SHEETS.JOURS).deleteRow(r._row);
    return true;
  }
  writeRow_(SHEETS.JOURS, r ? r._row : null, { personne: personId, date: isoDate, statut: statut, pays: pays || '', libelle: libelle || '' });
  return true;
}

/** Applique un statut sur une période (voyage, congés). */
function setDayRange(personId, fromIso, toIso, statut, pays, libelle, weekendsAussi) {
  var d = fromIso, n = 0;
  while (d <= toIso && n < 62) {
    var w = NFR.dow(d);
    if (weekendsAussi || statut === 'ETRANGER' || (w !== 0 && w !== 6)) setDay(personId, d, statut, pays, libelle);
    d = NFR.addDays(d, 1);
    n++;
  }
  return n;
}

function saveExpense(e) {
  var cat = NFR.CATEGORIES[e.categorie];
  if (!cat) throw new Error('Catégorie inconnue');
  var taux = e.devise && e.devise !== 'EUR' ? Number(e.taux || 0) : 1;
  if (e.devise && e.devise !== 'EUR' && !taux) taux = fxRate(e.devise, e.date);
  var row = {
    id: e.id || Utilities.getUuid(), personne: e.personne, mois: e.mois || String(e.date).slice(0, 7),
    date: e.date, categorie: e.categorie, description: e.description || '', commentaire: e.commentaire || '',
    montant_orig: Number(e.montantOrig || 0), devise: e.devise || 'EUR', taux: taux,
    montant_eur: NFR.round2(Number(e.montantOrig || 0) * taux), quantite: e.quantite || '',
    fichier_id: e.fichierId || '', fichier_nom: e.fichierNom || '', cree_le: new Date()
  };
  var existing = e.id ? readRows_(SHEETS.FRAIS).filter(function (x) { return x.id === e.id; })[0] : null;
  writeRow_(SHEETS.FRAIS, existing ? existing._row : null, row);
  return row.id;
}

function deleteExpense(id) {
  var r = readRows_(SHEETS.FRAIS).filter(function (x) { return x.id === id; })[0];
  if (r) sheet_(SHEETS.FRAIS).deleteRow(r._row);
  return true;
}

/** Cours BCE du jour (via frankfurter.app) : 1 unité de devise = x EUR. */
function fxRate(devise, isoDate) {
  if (!devise || devise === 'EUR') return 1;
  var url = 'https://api.frankfurter.app/' + isoDate + '?from=' + encodeURIComponent(devise) + '&to=EUR';
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('Cours ' + devise + ' introuvable au ' + isoDate);
  return Number(JSON.parse(res.getContentText()).rates.EUR);
}

function saveApiKey(key) {
  PropertiesService.getScriptProperties().setProperty('ANTHROPIC_API_KEY', String(key).trim());
  return true;
}

/* ------------------------------------------------------------------ */
/* Dossiers et fichiers                                               */
/* ------------------------------------------------------------------ */

function normalizeName_(s) { return String(s).replace(/[‐-―]/g, '-').trim().toLowerCase(); }

function childFolder_(parent, name) {
  var target = normalizeName_(name);
  var it = parent.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (normalizeName_(f.getName()) === target) return f;
  }
  return parent.createFolder(name);
}

function monthFolder_(personId, ym) {
  var person = getPerson_(personId);
  var base = rootFolder_();
  if (person.sousDossier) base = childFolder_(base, person.sousDossier);
  return childFolder_(base, 'Notes de frais ' + ym);
}

/** Reçoit un fichier (base64) depuis le téléphone ou l'ordinateur. */
function uploadFile(personId, ym, fileName, mimeType, base64) {
  var folder = monthFolder_(personId, ym);
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType, fileName);
  var file = folder.createFile(blob);
  return { id: file.getId(), name: file.getName(), mimeType: mimeType, url: file.getUrl() };
}

function renameFile_(fileId, newName) {
  try { DriveApp.getFileById(fileId).setName(newName); } catch (e) { /* non bloquant */ }
}

/** Convertit un Excel en Google Sheet temporaire (Drive API v3). */
function convertToSheet_(fileId) {
  var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/copy', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ mimeType: 'application/vnd.google-apps.spreadsheet', name: 'tmp-nfr-' + fileId }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) throw new Error('Conversion Excel impossible : ' + res.getContentText());
  return JSON.parse(res.getContentText()).id;
}

function isSpreadsheet_(mime, name) {
  return /spreadsheet|excel|csv/i.test(mime) || /\.(xlsx|xls|csv)$/i.test(name || '');
}

/** Lit un Excel et retourne ses valeurs (toutes feuilles, texte). */
function readSpreadsheetValues_(fileId) {
  var file = DriveApp.getFileById(fileId);
  var tmpId = null, ss;
  if (file.getMimeType() === MimeType.GOOGLE_SHEETS) ss = SpreadsheetApp.openById(fileId);
  else { tmpId = convertToSheet_(fileId); ss = SpreadsheetApp.openById(tmpId); }
  var out = ss.getSheets().map(function (sh) { return sh.getDataRange().getDisplayValues(); });
  if (tmpId) DriveApp.getFileById(tmpId).setTrashed(true);
  return out;
}

/** Relevé de borne : somme de la colonne kWh. */
function importBorne(fileId, ym) {
  var sheets = readSpreadsheetValues_(fileId);
  var total = 0, sessions = 0;
  sheets.forEach(function (rows) {
    var col = -1, headerRow = -1;
    for (var i = 0; i < Math.min(rows.length, 15) && col < 0; i++) {
      for (var j = 0; j < rows[i].length; j++) {
        if (/^\s*kwh\s*$/i.test(rows[i][j])) { col = j; headerRow = i; break; }
      }
    }
    if (col < 0) return;
    for (var r = headerRow + 1; r < rows.length; r++) {
      if (!String(rows[r][0]).trim()) continue; // ligne de total sans identifiant
      var v = Number(String(rows[r][col]).replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(v)) { total += v; sessions++; }
    }
  });
  if (!sessions) throw new Error('Aucune colonne « KWh » trouvée dans ce fichier.');
  var monthEnd = NFR.iso(+ym.slice(0, 4), +ym.slice(5, 7), NFR.daysInMonth(+ym.slice(0, 4), +ym.slice(5, 7)));
  var prix = NFR.rateAt(getRates_(), 'PRIX_KWH_BORNE', monthEnd);
  var p = prix ? Number(prix.montant) : 0;
  total = Math.round(total * 1000) / 1000;
  return { kwh: total, sessions: sessions, prix: p, montant: NFR.round2(total * p), date: monthEnd };
}

/** Analyse un justificatif déposé : borne (Excel kWh) ou ticket / facture (IA). */
function analyzeFile(fileId, personId, ym) {
  var file = DriveApp.getFileById(fileId);
  var mime = file.getMimeType(), name = file.getName();
  if (isSpreadsheet_(mime, name)) {
    try {
      var b = importBorne(fileId, ym);
      return {
        categorie: 'BORNE', date: b.date, montant: b.montant, devise: 'EUR', quantite: b.kwh,
        description: 'Borne de recharge, ' + String(b.kwh).replace('.', ',') + ' kWh à ' + String(b.prix).replace('.', ',') + ' €',
        commentaire: '', confiance: 'haute', source: 'excel'
      };
    } catch (e) {
      var text = readSpreadsheetValues_(fileId).map(function (rows) {
        return rows.map(function (r) { return r.join(' ; '); }).join('\n');
      }).join('\n\n');
      return ocrText_(text, ym);
    }
  }
  return ocrFile_(file, ym);
}
