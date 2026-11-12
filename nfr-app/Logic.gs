/**
 * Logic.gs — règles de calcul pures (aucun appel Google).
 * Ce fichier est aussi chargé par les tests Node (test/logic.test.js).
 */

var NFR = NFR || {};

/** Catégories de frais. col = colonne du tableau récapitulatif. */
NFR.CATEGORIES = {
  TRANSPORT:   { label: 'Parkings / Transports / Frais auto', col: 'TRANSPORT', type: 'jour' },
  RESTO:       { label: 'Restaurant', col: 'RESTO_HOTEL', type: 'jour' },
  HOTEL:       { label: 'Hôtel', col: 'RESTO_HOTEL', type: 'jour' },
  CADEAUX:     { label: 'Cadeaux clients', col: 'CADEAUX', type: 'jour' },
  FOURNITURES: { label: 'Fournitures', col: 'FOURNITURES', type: 'jour' },
  PETIT_MAT:   { label: 'Petits matériels', col: 'PETIT_MAT', type: 'jour' },
  CHAUFFAGE:   { label: 'Chauffage', col: 'CHAUFFAGE', type: 'charge', pctCode: 'TAUX_DOMICILE' },
  BORNE:       { label: 'Borne de recharge', col: 'BORNE', type: 'charge', pct: 1 },
  ELEC:        { label: 'Electricité', col: 'ELEC', type: 'charge', pctCode: 'TAUX_DOMICILE' },
  EAU:         { label: 'Eau', col: 'EAU', type: 'charge', pctCode: 'TAUX_DOMICILE' },
  TAXES:       { label: 'Taxes & Assurances', col: 'TAXES', type: 'charge', pctCode: 'TAUX_DOMICILE' }
};

/** Colonnes du récapitulatif journalier, dans l'ordre d'affichage. */
NFR.DAY_COLUMNS = [
  { key: 'TRANSPORT', label: 'Parkings / Transports / Frais auto' },
  { key: 'RESTO_HOTEL', label: 'Restaurants et Hôtel' },
  { key: 'CADEAUX', label: 'Cadeaux clients' },
  { key: 'FOURNITURES', label: 'Fournitures' },
  { key: 'PETIT_MAT', label: 'Petits matériels' },
  { key: 'FORFAIT', label: 'Forfait journée ext.' },
  { key: 'PERDIEM', label: 'Per diem étranger' }
];

NFR.CHARGE_COLUMNS = [
  { key: 'CHAUFFAGE', label: 'Chauffage' },
  { key: 'BORNE', label: 'Borne de recharge' },
  { key: 'ELEC', label: 'Electricité' },
  { key: 'EAU', label: 'Eau' },
  { key: 'TAXES', label: 'Taxes & Assurances' }
];

/** Statuts possibles d'une journée. */
NFR.STATUTS = {
  BUREAU:   { label: 'Prestation', short: 'P' },
  HOME:     { label: 'Homeworking', short: 'H' },
  CONGE:    { label: 'Congé', short: 'C' },
  MALADIE:  { label: 'Maladie', short: 'M' },
  ETRANGER: { label: 'Étranger', short: 'E' },
  LIBRE:    { label: 'Libre', short: '' },
  FERIE:    { label: 'Férié', short: 'F' }
};

NFR.PAYS = {
  LU: 'Luxembourg', DE: 'Allemagne', FR: 'France', NL: 'Pays-Bas', CH: 'Suisse',
  GB: 'Royaume-Uni', ES: 'Espagne', IT: 'Italie', PT: 'Portugal', AT: 'Autriche', US: 'États-Unis'
};

NFR.round2 = function (x) {
  return Math.round((Number(x) + Number.EPSILON) * 100) / 100;
};

NFR.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

NFR.iso = function (y, m, d) { return y + '-' + NFR.pad2(m) + '-' + NFR.pad2(d); };

NFR.daysInMonth = function (y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** 0 = dimanche … 6 = samedi */
NFR.dow = function (isoDate) {
  var p = isoDate.split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
};

NFR.addDays = function (isoDate, n) {
  var p = isoDate.split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return NFR.iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher). */
NFR.easter = function (y) {
  var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  var h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return NFR.iso(y, month, day);
};

/** Jours fériés légaux belges : { 'YYYY-MM-DD': 'Nom' } */
NFR.belgianHolidays = function (y) {
  var e = NFR.easter(y), h = {};
  h[NFR.iso(y, 1, 1)] = 'Nouvel An';
  h[NFR.addDays(e, 1)] = 'Lundi de Pâques';
  h[NFR.iso(y, 5, 1)] = 'Fête du Travail';
  h[NFR.addDays(e, 39)] = 'Ascension';
  h[NFR.addDays(e, 50)] = 'Lundi de Pentecôte';
  h[NFR.iso(y, 7, 21)] = 'Fête nationale';
  h[NFR.iso(y, 8, 15)] = 'Assomption';
  h[NFR.iso(y, 11, 1)] = 'Toussaint';
  h[NFR.iso(y, 11, 11)] = 'Armistice';
  h[NFR.iso(y, 12, 25)] = 'Noël';
  return h;
};

/**
 * Tarif applicable à une date : la ligne de même code dont date_debut est
 * la plus récente sans dépasser la date. Retourne null si aucun.
 */
NFR.rateAt = function (rates, code, isoDate) {
  var best = null;
  for (var i = 0; i < rates.length; i++) {
    var r = rates[i];
    if (r.code !== code || r.montant === '' || r.montant === null || r.montant === undefined) continue;
    if (r.debut > isoDate) continue;
    if (!best || r.debut > best.debut) best = r;
  }
  return best;
};

NFR.chargePct = function (cat, rates, isoDate) {
  var c = NFR.CATEGORIES[cat];
  if (!c || c.type !== 'charge') return 1;
  if (c.pct !== undefined) return c.pct;
  var r = NFR.rateAt(rates, c.pctCode, isoDate);
  return r ? Number(r.montant) : 0.42;
};

/** Montant retenu d'un frais (EUR après conversion et pourcentage). */
NFR.expenseAmount = function (exp, rates, monthEndIso) {
  var eur = exp.montantEur !== undefined && exp.montantEur !== '' ? Number(exp.montantEur)
    : Number(exp.montantOrig || 0) * Number(exp.taux || 1);
  var pct = NFR.CATEGORIES[exp.categorie] && NFR.CATEGORIES[exp.categorie].type === 'charge'
    ? NFR.chargePct(exp.categorie, rates, monthEndIso) : 1;
  return { eur: NFR.round2(eur), pct: pct, retenu: NFR.round2(eur * pct) };
};

/**
 * Statut par défaut d'une journée pour une personne.
 */
NFR.defaultStatus = function (isoDate, person, holidays) {
  var d = NFR.dow(isoDate);
  if (d === 0 || d === 6) return 'LIBRE';
  if (holidays[isoDate]) return 'FERIE';
  return person.forfaitDefaut ? 'BUREAU' : 'LIBRE';
};

/**
 * Calcule la note d'un mois.
 * params = { year, month, person, overrides: {iso: {statut, pays, libelle}},
 *            expenses: [...], rates: [...] }
 */
NFR.computeMonth = function (params) {
  var y = params.year, m = params.month, person = params.person;
  var overrides = params.overrides || {}, rates = params.rates || [];
  var holidays = NFR.belgianHolidays(y);
  var nDays = NFR.daysInMonth(y, m);
  var monthEnd = NFR.iso(y, m, nDays);
  var warnings = [];
  var days = [], byDate = {};

  for (var d = 1; d <= nDays; d++) {
    var iso = NFR.iso(y, m, d);
    var ov = overrides[iso] || {};
    var statut = ov.statut || NFR.defaultStatus(iso, person, holidays);
    var day = {
      date: iso, dow: NFR.dow(iso), statut: statut, statutDefaut: !ov.statut,
      pays: ov.pays || '', libelleSaisi: ov.libelle || '', ferie: holidays[iso] || '',
      cols: {}, expenses: [], forfait: 0, perdiem: 0, total: 0, agenda: ''
    };
    NFR.DAY_COLUMNS.forEach(function (c) { day.cols[c.key] = 0; });
    days.push(day);
    byDate[iso] = day;
  }

  var charges = [];
  var chargeTotals = {};
  NFR.CHARGE_COLUMNS.forEach(function (c) { chargeTotals[c.key] = 0; });

  (params.expenses || []).forEach(function (exp) {
    var cat = NFR.CATEGORIES[exp.categorie];
    if (!cat) { warnings.push('Catégorie inconnue pour « ' + (exp.description || exp.id) + ' »'); return; }
    var amt = NFR.expenseAmount(exp, rates, monthEnd);
    var item = { exp: exp, eur: amt.eur, pct: amt.pct, retenu: amt.retenu };
    if (cat.type === 'charge') {
      charges.push(item);
      chargeTotals[cat.col] = NFR.round2(chargeTotals[cat.col] + amt.retenu);
      return;
    }
    var day = byDate[exp.date];
    if (!day) {
      warnings.push('Le frais « ' + (exp.description || exp.categorie) + ' » du ' + exp.date + ' est hors du mois.');
      return;
    }
    day.cols[cat.col] = NFR.round2(day.cols[cat.col] + amt.retenu);
    day.expenses.push(item);
    if (exp.categorie === 'RESTO' && day.statut !== 'ETRANGER' && !String(exp.commentaire || '').trim()) {
      warnings.push('Restaurant du ' + exp.date + ' sans commentaire (avec qui ?).');
    }
  });

  days.forEach(function (day) {
    var restos = day.expenses.filter(function (it) { return it.exp.categorie === 'RESTO'; });
    var restoLabel = restos.map(function (it) { return String(it.exp.commentaire || it.exp.description || 'Restaurant').trim(); }).join(' / ');

    if (day.statut === 'ETRANGER') {
      if (!day.pays) {
        warnings.push('Journée à l\'étranger du ' + day.date + ' sans pays.');
      } else {
        var r = NFR.rateAt(rates, 'PERDIEM_' + day.pays, day.date);
        if (!r) warnings.push('Pas de per diem connu pour ' + (NFR.PAYS[day.pays] || day.pays) + ' au ' + day.date + '. Complétez l\'onglet Tarifs.');
        else day.perdiem = NFR.round2(Number(r.montant));
      }
      var dest = day.libelleSaisi || ((person.libelleDefaut || 'Mission') + ' @ ' + (NFR.PAYS[day.pays] || day.pays));
      day.agenda = dest + (restoLabel ? ' · ' + restoLabel : '');
    } else if (day.statut === 'BUREAU') {
      if (restos.length) {
        day.agenda = restoLabel;
      } else {
        var f = NFR.rateAt(rates, 'FORFAIT_BE', day.date);
        if (!f) warnings.push('Pas de forfait journalier belge connu au ' + day.date + '.');
        else day.forfait = NFR.round2(Number(f.montant));
        day.agenda = day.libelleSaisi || person.libelleDefaut || 'Prestation';
      }
    } else {
      var others = day.expenses.map(function (it) {
        return it.exp.categorie === 'RESTO' ? (it.exp.commentaire || 'Restaurant') : (it.exp.description || NFR.CATEGORIES[it.exp.categorie].label);
      });
      day.agenda = day.libelleSaisi || others.join(' / ');
    }
    day.cols.FORFAIT = day.forfait;
    day.cols.PERDIEM = day.perdiem;
    var t = 0;
    NFR.DAY_COLUMNS.forEach(function (c) { t += day.cols[c.key]; });
    day.total = NFR.round2(t);
  });

  var colTotals = {};
  NFR.DAY_COLUMNS.forEach(function (c) {
    colTotals[c.key] = NFR.round2(days.reduce(function (s, d) { return s + d.cols[c.key]; }, 0));
  });
  var totalJours = NFR.round2(days.reduce(function (s, d) { return s + d.total; }, 0));
  var totalCharges = NFR.round2(Object.keys(chargeTotals).reduce(function (s, k) { return s + chargeTotals[k]; }, 0));

  var counts = { forfait: 0, perdiem: 0, home: 0, conge: 0, maladie: 0 };
  days.forEach(function (d) {
    if (d.forfait) counts.forfait++;
    if (d.perdiem) counts.perdiem++;
    if (d.statut === 'HOME') counts.home++;
    if (d.statut === 'CONGE') counts.conge++;
    if (d.statut === 'MALADIE') counts.maladie++;
  });

  return {
    year: y, month: m, days: days, charges: charges, chargeTotals: chargeTotals,
    colTotals: colTotals, totalJours: totalJours, totalCharges: totalCharges,
    total: NFR.round2(totalJours + totalCharges), counts: counts, warnings: warnings
  };
};

if (typeof module !== 'undefined') module.exports = NFR;
