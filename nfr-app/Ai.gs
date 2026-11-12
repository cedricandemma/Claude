/**
 * Ai.gs — appels à l'API Claude (Messages API, HTTP brut via UrlFetchApp :
 * il n'existe pas de SDK Anthropic pour Apps Script).
 *  1. lecture des tickets et factures (image ou PDF)
 *  2. vérification des tarifs officiels avec la recherche web
 */

var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2026-10-21';

function claudeModel_() {
  var c = getConfig_();
  return c.CLAUDE_MODEL || 'claude-opus-5-5';
}

function apiKey_() {
  var k = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!k) throw new Error('Clé API Claude absente : renseignez-la dans Réglages.');
  return k;
}

/** Appel Messages API avec reprise sur 429 / 5xx et sur pause_turn (recherche web). */
function callClaude_(body) {
  var messages = body.messages.slice();
  for (var turn = 0; turn < 4; turn++) {
    body.messages = messages;
    var res = null, code = 0;
    for (var attempt = 0; attempt < 3; attempt++) {
      res = UrlFetchApp.fetch(ANTHROPIC_URL, {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'x-api-key': apiKey_(), 'anthropic-version': ANTHROPIC_VERSION },
        payload: JSON.stringify(body)
      });
      code = res.getResponseCode();
      if (code === 429 || code >= 500) { Utilities.sleep(2000 * (attempt + 1)); continue; }
      break;
    }
    var data = JSON.parse(res.getContentText());
    if (code !== 200) {
      var msg = data && data.error ? data.error.message : res.getContentText();
      if (code === 401) throw new Error('Clé API Claude refusée. Vérifiez-la dans Réglages.');
      throw new Error('API Claude (' + code + ') : ' + msg);
    }
    if (data.stop_reason === 'pause_turn') {
      messages = messages.concat([{ role: 'assistant', content: data.content }]);
      continue;
    }
    if (data.stop_reason === 'refusal') throw new Error('Le modèle a décliné la demande.');
    var texts = (data.content || []).filter(function (b) { return b.type === 'text'; });
    if (!texts.length) throw new Error('Réponse vide de l\'API Claude.');
    if (body.output_config && body.output_config.format) return JSON.parse(texts[texts.length - 1].text);
    // Sans format imposé (recherche web : les citations découpent le texte) : on extrait le JSON du texte complet.
    var all = texts.map(function (b) { return b.text; }).join('');
    var a = all.indexOf('{'), z = all.lastIndexOf('}');
    if (a < 0 || z < a) throw new Error('Réponse illisible de l\'API Claude.');
    return JSON.parse(all.slice(a, z + 1));
  }
  throw new Error('La recherche n\'a pas abouti, réessayez.');
}

var OCR_SCHEMA = {
  type: 'object',
  properties: {
    type_document: { type: 'string', enum: ['ticket', 'facture', 'recu', 'autre'] },
    date: { type: 'string', description: 'Date de la dépense au format YYYY-MM-DD' },
    montant: { type: 'number', description: 'Montant total TTC payé' },
    devise: { type: 'string', description: 'Code ISO 4217, ex. EUR, CHF, GBP' },
    fournisseur: { type: 'string' },
    pays: { type: 'string', description: 'Code ISO 3166 alpha-2 du lieu de la dépense' },
    categorie: { type: 'string', enum: ['TRANSPORT', 'RESTO', 'HOTEL', 'CADEAUX', 'FOURNITURES', 'PETIT_MAT', 'CHAUFFAGE', 'ELEC', 'EAU', 'TAXES', 'BORNE'] },
    description: { type: 'string', description: 'Libellé court : fournisseur, ville, objet' },
    couverts: { type: 'integer', description: 'Nombre de couverts estimé pour un restaurant, 0 sinon' },
    confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
    remarque: { type: 'string', description: 'Point à vérifier par l\'utilisateur, vide sinon' }
  },
  required: ['type_document', 'date', 'montant', 'devise', 'fournisseur', 'pays', 'categorie', 'description', 'couverts', 'confiance', 'remarque'],
  additionalProperties: false
};

var OCR_PROMPT = [
  'Tu lis un justificatif de dépense pour une note de frais belge.',
  'Retourne la date de la dépense, le montant TOTAL TTC réellement payé (pas le sous-total, pas un montant HTVA) et la devise.',
  'Catégories : TRANSPORT (parking, train, taxi, carburant, péage, avion), RESTO (restaurant, bar, café, repas),',
  'HOTEL (nuitée), CADEAUX (cadeau client), FOURNITURES (papeterie, consommables), PETIT_MAT (petit matériel informatique ou bureau),',
  'CHAUFFAGE (pellets, mazout, gaz de chauffage), ELEC (facture ou acompte d\'électricité), EAU (facture d\'eau),',
  'TAXES (précompte immobilier, taxes communales, assurances habitation), BORNE (recharge de véhicule électrique).',
  'Pour une facture d\'énergie ou d\'acompte, date = date de la facture.',
  'Les tickets de caisse belges peuvent contenir des erreurs de lecture : en cas de doute entre deux montants, prends le total payé par carte et signale-le dans remarque.',
  'Mois de la note en cours : {MOIS}.'
].join('\n');

function ocrFile_(file, ym) {
  var mime = file.getMimeType();
  var b64 = Utilities.base64Encode(file.getBlob().getBytes());
  var block;
  if (mime === 'application/pdf') {
    block = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } };
  } else if (/^image\/(jpeg|png|gif|webp)$/.test(mime)) {
    block = { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } };
  } else if (/^image\//.test(mime)) {
    var jpg = file.getBlob().getAs('image/jpeg');
    block = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Utilities.base64Encode(jpg.getBytes()) } };
  } else {
    throw new Error('Format non pris en charge : ' + mime);
  }
  return ocrCall_([block, { type: 'text', text: OCR_PROMPT.replace('{MOIS}', ym) }], ym);
}

function ocrText_(text, ym) {
  return ocrCall_([{ type: 'text', text: OCR_PROMPT.replace('{MOIS}', ym) + '\n\nContenu du fichier :\n' + text.slice(0, 60000) }], ym);
}

function ocrCall_(content, ym) {
  var r = callClaude_({
    model: claudeModel_(),
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OCR_SCHEMA } },
    messages: [{ role: 'user', content: content }]
  });
  return {
    categorie: r.categorie, date: r.date, montant: r.montant, devise: (r.devise || 'EUR').toUpperCase(),
    description: r.description || r.fournisseur, commentaire: '', pays: r.pays,
    couverts: r.couverts, confiance: r.confiance, remarque: r.remarque, source: 'ia'
  };
}

/* ------------------------------------------------------------------ */
/* Vérification des tarifs officiels                                  */
/* ------------------------------------------------------------------ */

var RATES_SCHEMA = {
  type: 'object',
  properties: {
    resultats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          montant: { type: 'number', description: '0 si introuvable' },
          date_debut: { type: 'string', description: 'Date d\'entrée en vigueur YYYY-MM-DD' },
          source_url: { type: 'string' },
          reference: { type: 'string', description: 'Circulaire, arrêté ou publication officielle' },
          confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] }
        },
        required: ['code', 'montant', 'date_debut', 'source_url', 'reference', 'confiance'],
        additionalProperties: false
      }
    }
  },
  required: ['resultats'],
  additionalProperties: false
};

/**
 * Cherche sur internet les tarifs en vigueur à la fin du mois et retourne
 * les écarts avec l'onglet Tarifs. Ne modifie rien : l'utilisateur valide.
 */
function checkRates(ym) {
  var y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  var monthEnd = NFR.iso(y, m, NFR.daysInMonth(y, m));
  var rates = getRates_();
  var codes = {};
  rates.forEach(function (r) { if (r.code === 'FORFAIT_BE' || r.code.indexOf('PERDIEM_') === 0) codes[r.code] = r.libelle; });
  var list = Object.keys(codes).map(function (c) {
    if (c === 'FORFAIT_BE') return '- FORFAIT_BE : indemnité forfaitaire journalière pour frais de séjour (repas) en Belgique, déplacement d\'au moins 6 heures, plafond admis par le SPF Finances et l\'ONSS (circulaires indexées en mars et septembre).';
    var p = c.replace('PERDIEM_', '');
    return '- ' + c + ' : indemnité journalière forfaitaire de séjour, catégorie 1 (voyages de service de courte durée), pour ' + (NFR.PAYS[p] || p) + ', selon l\'arrêté ministériel en vigueur (SPF Affaires étrangères), admise par le SPF Finances et l\'ONSS.';
  }).join('\n');

  var prompt = 'Recherche sur des sources officielles ou des secrétariats sociaux belges (SPF Finances, ONSS, Partena, Securex, SD Worx, Acerta) ' +
    'les montants en vigueur au ' + monthEnd + ' pour chacun des codes suivants :\n' + list +
    '\nPour chaque code, donne le montant applicable à cette date, sa date d\'entrée en vigueur et la source. ' +
    'Si tu ne trouves pas de valeur fiable, mets montant à 0 et confiance « basse ».\n' +
    'Termine ta réponse par un unique objet JSON conforme à ce schéma, sans texte après : ' + JSON.stringify(RATES_SCHEMA);

  var r = callClaude_({
    model: claudeModel_(),
    max_tokens: 16000,
    output_config: { effort: 'medium' },
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
    messages: [{ role: 'user', content: prompt }]
  });

  var diffs = [];
  (r.resultats || []).forEach(function (f) {
    if (!codes[f.code] || !f.montant) return;
    var cur = NFR.rateAt(rates, f.code, monthEnd);
    var curVal = cur ? Number(cur.montant) : null;
    if (curVal === null || Math.abs(curVal - f.montant) > 0.004) {
      diffs.push({
        code: f.code, libelle: codes[f.code], actuel: curVal, actuelDepuis: cur ? cur.debut : '',
        nouveau: f.montant, depuis: f.date_debut, source: f.source_url, reference: f.reference, confiance: f.confiance
      });
    }
  });
  setConfig_('DERNIERE_VERIF_TARIFS', new Date().toISOString() + ' (' + ym + ') : ' + diffs.length + ' écart(s)');
  return { verifieLe: new Date().toISOString(), ecarts: diffs, resultats: r.resultats };
}

/** Enregistre un nouveau tarif daté, après validation par l'utilisateur. */
function applyRate(code, montant, debut, source) {
  var lib = (getRates_().filter(function (r) { return r.code === code; })[0] || {}).libelle || code;
  writeRow_(SHEETS.TARIFS, null, {
    code: code, libelle: lib, montant: Number(montant), date_debut: debut, source: source || '', valide_le: new Date()
  });
  return true;
}
