/**
 * Pdf.gs — génération de la note de frais (récapitulatif + justificatifs).
 * Le récapitulatif est produit ici en PDF ; la fusion avec les justificatifs
 * se fait dans le navigateur (pdf-lib), puis le PDF final revient dans Drive.
 */

function eur_(x) {
  var n = NFR.round2(x || 0).toFixed(2).split('.');
  return n[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + n[1] + ' €';
}

function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

var JOURS_FR = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
var MOIS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function frDate_(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }

/** Prépare tout le nécessaire pour la note : PDF récap + justificatifs (base64). */
function generateNote(personId, ym) {
  var month = getMonth(personId, ym);
  var person = month.person;
  var cfg = getConfig_();
  var initials = person.nom.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
  var numero = 'NFR-' + ym + '-' + initials;

  // Numérotation des justificatifs : frais du mois triés par date puis charges.
  var all = month.days.reduce(function (acc, d) { return acc.concat(d.expenses); }, []).concat(month.charges);
  var refs = {}, annexes = [], warnings = month.warnings.slice(), n = 0;
  all.forEach(function (it) {
    var e = it.exp;
    if (!e.fichierId) { warnings.push('Pas de justificatif pour « ' + (e.description || e.categorie) + ' » du ' + frDate_(e.date) + '.'); return; }
    if (refs[e.fichierId]) { it.ref = refs[e.fichierId]; return; }
    n++;
    var ref = 'J' + (n < 10 ? '0' : '') + n;
    refs[e.fichierId] = ref;
    it.ref = ref;
    try {
      annexes.push(annexBlob_(e.fichierId, ref, e));
    } catch (err) {
      warnings.push('Justificatif ' + ref + ' illisible (' + e.fichierNom + ') : ' + err.message);
    }
  });

  var html = recapHtml_(month, person, cfg, numero, refs, annexes);
  var pdf = Utilities.newBlob(html, 'text/html', numero + '.html').getAs('application/pdf');
  return {
    numero: numero,
    fileName: numero + ' ' + person.nom + '.pdf',
    total: month.total,
    recap: Utilities.base64Encode(pdf.getBytes()),
    annexes: annexes,
    warnings: warnings
  };
}

function annexBlob_(fileId, ref, e) {
  var file = DriveApp.getFileById(fileId);
  var mime = file.getMimeType(), name = file.getName();
  var bytes;
  if (mime === 'application/pdf' || /^image\/(jpeg|png)$/.test(mime)) {
    bytes = file.getBlob().getBytes();
  } else if (/^image\//.test(mime)) {
    bytes = file.getBlob().getAs('image/jpeg').getBytes();
    mime = 'image/jpeg';
  } else if (isSpreadsheet_(mime, name)) {
    bytes = cachedSpreadsheetPdf_(file);
    mime = 'application/pdf';
  } else if (/document|word/.test(mime)) {
    bytes = file.getBlob().getAs('application/pdf').getBytes();
    mime = 'application/pdf';
  } else {
    throw new Error('format ' + mime + ' non pris en charge');
  }
  return {
    ref: ref, name: name, mime: mime, b64: Utilities.base64Encode(bytes),
    legende: ref + ' · ' + frDate_(e.date) + ' · ' + (e.description || '') + ' · ' + eur_(e.montantEur !== '' ? e.montantEur : e.montantOrig)
  };
}

/** Conversion Excel vers PDF mémorisée à côté de l'original (la conversion est lente). */
function cachedSpreadsheetPdf_(file) {
  var cacheName = file.getName().replace(/\.(xlsx|xls|csv)$/i, '') + ' (PDF).pdf';
  var parents = file.getParents();
  var folder = parents.hasNext() ? parents.next() : null;
  if (folder) {
    var it = folder.getFilesByName(cacheName);
    while (it.hasNext()) {
      var c = it.next();
      if (c.getLastUpdated() >= file.getLastUpdated()) return c.getBlob().getBytes();
      c.setTrashed(true);
    }
  }
  var bytes = spreadsheetToPdf_(file.getId(), file.getMimeType());
  if (folder) folder.createFile(Utilities.newBlob(bytes, 'application/pdf', cacheName));
  return bytes;
}

function spreadsheetToPdf_(fileId, mime) {
  var tmpId = mime === MimeType.GOOGLE_SHEETS ? null : convertToSheet_(fileId);
  var id = tmpId || fileId;
  var url = 'https://docs.google.com/spreadsheets/d/' + id +
    '/export?format=pdf&size=A4&portrait=false&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED';
  var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (tmpId) DriveApp.getFileById(tmpId).setTrashed(true);
  if (res.getResponseCode() !== 200) throw new Error('export PDF impossible');
  return res.getBlob().getBytes();
}

function recapHtml_(month, person, cfg, numero, refs, annexes) {
  var ym = month.year + '-' + NFR.pad2(month.month);
  var periode = MOIS_FR[month.month - 1] + ' ' + month.year;
  var rates = getRates_();
  var monthEnd = month.days[month.days.length - 1].date;

  var activeCols = NFR.DAY_COLUMNS.filter(function (c) { return month.colTotals[c.key]; });
  var activeCharges = NFR.CHARGE_COLUMNS.filter(function (c) { return month.chargeTotals[c.key]; });

  var css = [
    '@page { size: A4; margin: 14mm 12mm; }',
    'body { font-family: Helvetica, Arial, sans-serif; color: #1d2433; font-size: 9pt; }',
    '.band { background: #0f2a4a; color: #fff; padding: 14px 18px; }',
    '.band h1 { font-size: 20pt; margin: 0; letter-spacing: .5px; }',
    '.band .sub { color: #b9c7da; font-size: 9pt; margin-top: 3px; }',
    'table { border-collapse: collapse; width: 100%; font-size: 9pt; }',
    'td, th { font-size: inherit; }',
    '.nw { white-space: nowrap; }',
    '.parties td { vertical-align: top; padding: 10px 0; width: 50%; }',
    '.lbl { color: #6b7385; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .8px; }',
    '.strong { font-weight: bold; font-size: 10.5pt; }',
    '.total { background: #eef3f9; border-left: 4px solid #2f6fb3; padding: 10px 14px; margin: 6px 0 14px; }',
    '.total .big { font-size: 22pt; font-weight: bold; color: #0f2a4a; }',
    'h2 { font-size: 11pt; color: #0f2a4a; border-bottom: 1.5px solid #0f2a4a; padding-bottom: 3px; margin: 16px 0 6px; }',
    '.grid th { background: #f3f5f8; color: #4a5468; font-size: 7pt; text-transform: uppercase; text-align: right; padding: 5px 4px; border-bottom: 1px solid #c9d1dd; }',
    '.grid th.l, .grid td.l { text-align: left; }',
    '.grid td { padding: 4px 4px; border-bottom: 1px solid #e6e9ef; text-align: right; font-size: 8.5pt; }',
    '.grid tr.we td { color: #8a92a3; }',
    '.grid tr.tot td { font-weight: bold; border-top: 1.5px solid #0f2a4a; border-bottom: none; background: #f3f5f8; }',
    '.ref { color: #2f6fb3; font-size: 7.5pt; }',
    '.muted { color: #6b7385; font-size: 8pt; }',
    '.sign td { height: 60px; border: 1px solid #c9d1dd; vertical-align: top; padding: 6px; width: 50%; }'
  ].join('\n');

  var h = [];
  h.push('<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>');
  h.push('<div class="band"><h1>Note de frais</h1><div class="sub">' + esc_(numero) + ' &nbsp;·&nbsp; Période : ' + esc_(periode) +
    ' &nbsp;·&nbsp; Établie le ' + Utilities.formatDate(new Date(), 'Europe/Brussels', 'dd/MM/yyyy') + '</div></div>');

  h.push('<table class="parties"><tr><td><div class="lbl">De</div><div class="strong">' + esc_(person.nom) + '</div>' +
    esc_(person.adresse1) + '<br>' + esc_(person.adresse2) + '<br><span class="muted">' + esc_(person.titre) + '</span></td>' +
    '<td><div class="lbl">À</div><div class="strong">' + esc_(cfg.SOCIETE_NOM) + '</div>' + esc_(cfg.SOCIETE_ADR1) + '<br>' +
    esc_(cfg.SOCIETE_ADR2) + '<br><span class="muted">TVA ' + esc_(cfg.SOCIETE_TVA) + '</span></td></tr></table>');

  h.push('<div class="total"><div class="lbl">Total à rembourser</div><div class="big">' + eur_(month.total) + '</div>' +
    '<div class="muted">Frais et indemnités du mois : ' + eur_(month.totalJours) + ' &nbsp;·&nbsp; Charges du domicile : ' + eur_(month.totalCharges) + '</div></div>');

  // Synthèse par catégorie
  h.push('<h2>Synthèse</h2><table class="grid"><tr><th class="l">Catégorie</th><th class="l">Base</th><th>Montant</th></tr>');
  activeCols.forEach(function (c) {
    var base = '';
    if (c.key === 'FORFAIT') base = month.counts.forfait + ' jour(s)';
    if (c.key === 'PERDIEM') base = month.counts.perdiem + ' jour(s) à l\'étranger';
    h.push('<tr><td class="l">' + esc_(c.label) + '</td><td class="l muted">' + base + '</td><td>' + eur_(month.colTotals[c.key]) + '</td></tr>');
  });
  activeCharges.forEach(function (c) {
    var pct = NFR.chargePct(c.key, rates, monthEnd);
    h.push('<tr><td class="l">' + esc_(c.label) + '</td><td class="l muted">' + Math.round(pct * 100) + ' % de la facture</td><td>' + eur_(month.chargeTotals[c.key]) + '</td></tr>');
  });
  h.push('<tr class="tot"><td class="l">Total</td><td></td><td>' + eur_(month.total) + '</td></tr></table>');

  // Détail journalier
  h.push('<h2>Agenda et détail journalier</h2><table class="grid"><tr><th class="l">Date</th><th class="l">Agenda</th>');
  activeCols.forEach(function (c) { h.push('<th>' + esc_(c.label) + '</th>'); });
  h.push('<th>Total</th><th class="l">Réf.</th></tr>');
  month.days.forEach(function (d) {
    if (!d.total && !d.agenda) return;
    var rs = [];
    d.expenses.forEach(function (it) { var r = it.exp.fichierId && refs[it.exp.fichierId]; if (r && rs.indexOf(r) < 0) rs.push(r); });
    var we = d.dow === 0 || d.dow === 6;
    h.push('<tr' + (we ? ' class="we"' : '') + '><td class="l nw">' + JOURS_FR[d.dow] + ' ' + frDate_(d.date).slice(0, 5) + '</td><td class="l">' + esc_(d.agenda) + '</td>');
    activeCols.forEach(function (c) { h.push('<td>' + (d.cols[c.key] ? eur_(d.cols[c.key]) : '') + '</td>'); });
    h.push('<td><b>' + eur_(d.total) + '</b></td><td class="l ref">' + rs.join(' ') + '</td></tr>');
  });
  h.push('<tr class="tot"><td class="l" colspan="2">Total</td>');
  activeCols.forEach(function (c) { h.push('<td>' + eur_(month.colTotals[c.key]) + '</td>'); });
  h.push('<td>' + eur_(month.totalJours) + '</td><td></td></tr></table>');

  // Charges
  if (month.charges.length) {
    h.push('<h2>Charges du domicile</h2><table class="grid"><tr><th class="l">Nature</th><th class="l">Pièce</th><th>Montant facture</th><th>Quote-part</th><th>Retenu</th><th class="l">Réf.</th></tr>');
    month.charges.forEach(function (it) {
      var c = NFR.CATEGORIES[it.exp.categorie];
      h.push('<tr><td class="l">' + esc_(c.label) + '</td><td class="l">' + esc_(it.exp.description) + '</td><td>' + eur_(it.eur) + '</td><td>' +
        Math.round(it.pct * 100) + ' %</td><td><b>' + eur_(it.retenu) + '</b></td><td class="l ref">' + (refs[it.exp.fichierId] || '') + '</td></tr>');
    });
    h.push('<tr class="tot"><td class="l" colspan="4">Total charges</td><td>' + eur_(month.totalCharges) + '</td><td></td></tr></table>');
  }

  // Paramètres appliqués
  var params = [];
  var f = NFR.rateAt(rates, 'FORFAIT_BE', monthEnd);
  if (month.colTotals.FORFAIT && f) params.push('Forfait journée extérieure : ' + eur_(f.montant) + ' par jour depuis le ' + frDate_(f.debut) + (f.source ? ' (' + esc_(f.source) + ')' : ''));
  var paysVus = {};
  month.days.forEach(function (d) { if (d.perdiem) paysVus[d.pays] = 1; });
  Object.keys(paysVus).forEach(function (p) {
    var r = NFR.rateAt(rates, 'PERDIEM_' + p, monthEnd);
    if (r) params.push('Per diem ' + (NFR.PAYS[p] || p) + ', catégorie 1 : ' + eur_(r.montant) + ' par jour depuis le ' + frDate_(r.debut) + (r.source ? ' (' + esc_(r.source) + ')' : ''));
  });
  var other = [];
  if (month.counts.home) other.push(month.counts.home + ' jour(s) de homeworking');
  if (month.counts.conge) other.push(month.counts.conge + ' jour(s) de congé');
  if (month.counts.maladie) other.push(month.counts.maladie + ' jour(s) de maladie');
  if (other.length) params.push('Sans forfait : ' + other.join(', ') + ' ; les jours de repas d\'affaires remplacent le forfait.');
  if (params.length) h.push('<h2>Bases de calcul</h2><div class="muted">' + params.join('<br>') + '</div>');

  // Annexes
  if (annexes.length) {
    h.push('<h2>Justificatifs annexés</h2><table class="grid"><tr><th class="l">Réf.</th><th class="l">Pièce</th></tr>');
    annexes.forEach(function (a) { h.push('<tr><td class="l ref">' + a.ref + '</td><td class="l">' + esc_(a.legende.replace(a.ref + ' · ', '')) + '</td></tr>'); });
    h.push('</table>');
  }

  h.push('<h2>Approbation</h2><table class="sign"><tr><td><div class="lbl">Le bénéficiaire</div></td><td><div class="lbl">Pour ' + esc_(cfg.SOCIETE_NOM) + '</div></td></tr></table>');
  h.push('</body></html>');
  return h.join('');
}

/** Enregistre le PDF final (fusionné dans le navigateur) dans le dossier du mois. */
function saveFinalPdf(personId, ym, fileName, base64, numero, total) {
  var folder = monthFolder_(personId, ym);
  var old = folder.getFilesByName(fileName);
  while (old.hasNext()) old.next().setTrashed(true);
  var file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'application/pdf', fileName));
  writeRow_(SHEETS.NOTES, null, {
    personne: personId, mois: ym, numero: numero, genere_le: new Date(), total: total, pdf_id: file.getId(), pdf_url: file.getUrl()
  });
  return { url: file.getUrl(), id: file.getId(), folderUrl: folder.getUrl() };
}
