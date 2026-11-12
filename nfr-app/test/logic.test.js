// Tests du moteur de calcul : node test/logic.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const load = f => { const m = { exports: {} }; new Function('module', fs.readFileSync(path.join(__dirname, '..', f), 'utf8'))(m); return m.exports; };
const NFR = load('Logic.gs');
const SEED = load('Seed.gs');

const rates = [
  { code: 'FORFAIT_BE', montant: 21.22, debut: '2025-03-01' },
  { code: 'FORFAIT_BE', montant: 21.64, debut: '2026-03-01' },
  { code: 'PERDIEM_LU', montant: 107, debut: '2025-08-01' },
  { code: 'PERDIEM_DE', montant: 92, debut: '2025-08-01' },
  { code: 'TAUX_DOMICILE', montant: 0.42, debut: '2000-01-01' }
];
const person = { id: 'CC', forfaitDefaut: true, libelleDefaut: 'Flexso Brussels SA' };
const overrides = {};
SEED.jours.forEach(j => { overrides[j.date] = j; });
const expenses = SEED.frais.map(f => Object.assign({ taux: 1 }, f));

const r = NFR.computeMonth({ year: 2026, month: 10, person, overrides, expenses, rates });

// Totaux de l'Excel 2026_10_NFR.xlsx (sans le ticket Seety, écarté)
assert.strictEqual(r.colTotals.TRANSPORT, 23.50);
assert.strictEqual(r.colTotals.RESTO_HOTEL, 2885.30);
assert.strictEqual(r.colTotals.FORFAIT, 302.96);
assert.strictEqual(r.counts.forfait, 14);
assert.strictEqual(r.colTotals.PERDIEM, 291.00);
assert.strictEqual(r.chargeTotals.CHAUFFAGE, 530.25);
assert.strictEqual(r.chargeTotals.BORNE, 334.88);
assert.strictEqual(r.chargeTotals.ELEC, 195.56);
assert.strictEqual(r.total, 4563.45);

// Libellés d'agenda
const day = iso => r.days.find(d => d.date === iso);
assert.strictEqual(day('2026-10-01').agenda, 'Flexso Brussels SA');
assert.strictEqual(day('2026-10-15').agenda, 'Lunch Le Tec');
assert.strictEqual(day('2026-10-15').forfait, 0);
assert.strictEqual(day('2026-10-14').perdiem, 107);
assert.strictEqual(day('2026-10-26').agenda, '');
assert.strictEqual(day('2026-10-03').statut, 'LIBRE');

// Fériés belges
const h = NFR.belgianHolidays(2026);
assert.ok(h['2026-04-06'], 'Lundi de Pâques 2026');
assert.ok(h['2026-05-14'], 'Ascension 2026');
assert.ok(h['2026-05-25'], 'Pentecôte 2026');
const nov = NFR.computeMonth({ year: 2026, month: 11, person, overrides: {}, expenses: [], rates });
assert.strictEqual(nov.days.find(d => d.date === '2026-11-11').statut, 'FERIE');

// Nouveau tarif daté : s'applique à partir de sa date seulement
const rates2 = rates.concat([{ code: 'FORFAIT_BE', montant: 22.08, debut: '2026-09-01' }]);
const r2 = NFR.computeMonth({ year: 2026, month: 10, person, overrides, expenses, rates: rates2 });
assert.strictEqual(r2.colTotals.FORFAIT, 309.12);
const aug = NFR.computeMonth({ year: 2026, month: 8, person, overrides: {}, expenses: [], rates: rates2 });
assert.strictEqual(aug.days.find(d => d.date === '2026-08-03').forfait, 21.64);

// Emma : pas de forfait par défaut
const emma = NFR.computeMonth({ year: 2026, month: 10, person: { id: 'ER', forfaitDefaut: false }, overrides: {}, expenses: [], rates });
assert.strictEqual(emma.total, 0);

console.log('OK : octobre 2026 =', r.total, '€ ; avec 22,08 € =', r2.total, '€ ; avertissements :', r.warnings);
