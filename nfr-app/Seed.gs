/**
 * Seed.gs — reprise d'octobre 2026 à partir des justificatifs déjà présents
 * dans « NFR Claude / Notes de frais 2026-10 ». À lancer une seule fois depuis
 * l'éditeur Apps Script (fonction seedOctobre2026), après setup().
 */

var NFR_SEED_OCT2026 = {
  personne: 'CC',
  mois: '2026-10',
  jours: [
    { date: '2026-10-10', statut: 'ETRANGER', pays: 'DE', libelle: 'Weekend Flexso Brussels SA @ Cologne' },
    { date: '2026-10-11', statut: 'ETRANGER', pays: 'DE', libelle: 'Weekend Flexso Brussels SA @ Cologne' },
    { date: '2026-10-14', statut: 'ETRANGER', pays: 'LU', libelle: 'Flexso Luxembourg SA' },
    { date: '2026-10-26', statut: 'HOME' },
    { date: '2026-10-30', statut: 'HOME' }
  ],
  frais: [
    { date: '2026-10-10', categorie: 'RESTO', description: 'Mercure Hotel Severinshof Köln (bar)', commentaire: '', montantOrig: 19.70, devise: 'EUR', fichierId: '14sTt7pM8HV8p6rYEpan9fShRThRF0HCC', fichierNom: 'Cologne bar.pdf' },
    { date: '2026-10-11', categorie: 'TRANSPORT', description: 'Parking Mercure Köln (10 au 11/10)', commentaire: '', montantOrig: 23.50, devise: 'EUR', fichierId: '1uwPp8bSgbKfJ_2wt_nI-oLLasAuiwTrR', fichierNom: 'Cologne parking.pdf' },
    { date: '2026-10-14', categorie: 'RESTO', description: 'KFC Capellen', commentaire: '', montantOrig: 13.10, devise: 'EUR', fichierId: '1nsa0RuVj1FcZ4f8iqKcx1glTyyiTjAsE', fichierNom: 'KFC Lux.pdf' },
    { date: '2026-10-15', categorie: 'RESTO', description: 'Basile, Thorembais', commentaire: 'Lunch Le Tec', montantOrig: 628.00, devise: 'EUR', fichierId: '1uK8-KHCaNy0mh0D7s73xRlE6eSDsRbUj', fichierNom: 'Basile TEC.pdf' },
    { date: '2026-10-19', categorie: 'RESTO', description: 'Grande Piazza, Ixelles', commentaire: 'Lunch ULB', montantOrig: 116.00, devise: 'EUR', fichierId: '1Yj9XhxX7QGGANq-eewhK0YBzFoBcu59S', fichierNom: 'Grande Piazza ULB.pdf' },
    { date: '2026-10-20', categorie: 'RESTO', description: 'Un Altro Mondo, Wavre', commentaire: 'Repas SAP', montantOrig: 1100.00, devise: 'EUR', fichierId: '19-NXfSXjxJhbKfUa5hdjSwn8SzUo7LEM', fichierNom: 'Altro SAP.pdf' },
    { date: '2026-10-22', categorie: 'RESTO', description: 'Restauration Nouvelle', commentaire: 'Repas Flexso Brussels - Project Managers', montantOrig: 427.00, devise: 'EUR', fichierId: '1tUacAE5qcVv-mifkEcSHvWIAJdkIusGV', fichierNom: 'RN équipe PM.pdf' },
    { date: '2026-10-23', categorie: 'RESTO', description: 'Un Altro Mondo, Wavre', commentaire: 'Lunch Freelancer SAP', montantOrig: 581.50, devise: 'EUR', fichierId: '1Ndr5JB8NaHxa6WmjeS6Ilmg5P8OwAzBa', fichierNom: 'Atro AL.pdf' },
    { date: '2026-10-09', categorie: 'CHAUFFAGE', description: 'ProxiFuel, pellets 2 500 kg (F002608680)', commentaire: '', montantOrig: 1262.51, devise: 'EUR', fichierId: '1fJqX_JnIy0vKx-io0qRBQLbXsF6BBoII', fichierNom: 'pellets.pdf' },
    { date: '2026-10-01', categorie: 'ELEC', description: 'TotalEnergies, acompte octobre 2026 (E26/04843501)', commentaire: '', montantOrig: 465.62, devise: 'EUR', fichierId: '1imsCf9WOg0V2V4p5fkUL26bvW4f-MGZ2', fichierNom: 'invoice-E26_04843501.pdf' },
    { date: '2026-10-31', categorie: 'BORNE', description: 'Borne de recharge, 837,196 kWh à 0,40 €', commentaire: '', quantite: 837.196, montantOrig: 334.88, devise: 'EUR', fichierId: '1tzoXLRNE1y2Kx8XrUGEz-MWrbg_gat0n', fichierNom: 'seances-2026-11-01.xlsx' }
  ]
};

function seedOctobre2026() {
  var s = NFR_SEED_OCT2026;
  s.jours.forEach(function (j) {
    setDay(s.personne, j.date, j.statut, j.pays || '', j.libelle || '');
  });
  var existing = listExpenses_(s.personne, s.mois).map(function (e) { return e.fichierId; });
  s.frais.forEach(function (f) {
    if (existing.indexOf(f.fichierId) >= 0) return;
    var e = {};
    for (var k in f) e[k] = f[k];
    e.personne = s.personne;
    e.mois = s.mois;
    e.taux = 1;
    saveExpense(e);
  });
  return 'Octobre 2026 chargé : ' + s.frais.length + ' frais, ' + s.jours.length + ' journées particulières.';
}

if (typeof module !== 'undefined') module.exports = NFR_SEED_OCT2026;
