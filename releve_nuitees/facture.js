// Rendu Word de la facture Chez Spoons. Appelé par facture.py : node facture.js data.json sortie.docx
const fs = require("fs");
const {
  AlignmentType, BorderStyle, Document, Footer, ImageRun, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} = require("docx");

const [, , jsonPath, sortie] = process.argv;
const d = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

const POLICE = "Century Gothic";
const BLEU = "0A548B";
const BLEU_CLAIR = "E7EFF6";
const GRIS = "6B7280";
const LIGNE = "D5DEE7";
const ZEBRE = "F7F9FB";
const PORTRAIT = 11906 - 2 * 1000;
const PAYSAGE = 16838 - 2 * 900;

const SOCIETE = {
  marque: "Chez Spoons",
  nom: "Castremanne Management SRL",
  adresse: ["Avenue Fernand Labby 9", "1390 Bossut-Gottechain", "Belgique"],
  tva: "BE 0843.031.552",
  rpm: "Nivelles",
  iban: "BE62 1030 8586 3761",
  bic: "AXABBE22",
  tel: "+32 (0)492 82 29 23",
  email: "hello@chezspoons.com",
};

const eur = (x) => {
  const [e, c] = Math.abs(x).toFixed(2).split(".");
  return `${x < 0 ? "-" : ""}${e.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${c} €`;
};
const pct = (t) => `${Math.round(t * 100)} %`;

const run = (text, o = {}) => new TextRun({ text: String(text), font: POLICE, size: o.size || 18, ...o });
const para = (contenu, o = {}) =>
  new Paragraph({ children: [].concat(contenu), spacing: { before: 0, after: 0, ...(o.spacing || {}) }, ...o });

const AUCUNE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const sansBord = { top: AUCUNE, bottom: AUCUNE, left: AUCUNE, right: AUCUNE };
const bordBas = (couleur = LIGNE) => ({ top: AUCUNE, left: AUCUNE, right: AUCUNE,
  bottom: { style: BorderStyle.SINGLE, size: 4, color: couleur } });

function cell(contenu, largeur, o = {}) {
  return new TableCell({
    width: { size: largeur, type: WidthType.DXA },
    borders: o.borders || bordBas(),
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    verticalAlign: o.valign || VerticalAlign.CENTER,
    columnSpan: o.span,
    margins: o.margins || { top: 70, bottom: 70, left: 90, right: 90 },
    children: [].concat(contenu).map((c) =>
      c instanceof Paragraph ? c : para(run(c, o.run || {}), { alignment: o.align || AlignmentType.LEFT })),
  });
}

function table(largeurs, lignes, o = {}) {
  return new Table({
    width: { size: largeurs.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: largeurs,
    layout: TableLayoutType.FIXED,
    alignment: o.alignment,
    rows: lignes,
  });
}

const logo = fs.readFileSync(d.logo);
const image = (largeur) => new ImageRun({
  type: "png", data: logo, transformation: { width: largeur, height: Math.round(largeur * 1434 / 1180) },
});
const label = (t) => run(t.toUpperCase(), { size: 14, color: BLEU, bold: true, characterSpacing: 30 });
const espace = (pts) => para(run(""), { spacing: { after: pts * 20 } });

// Page 1 : facture
function entete() {
  const meta = [
    ["N° de facture", d.numero],
    ["Date de facture", d.date],
    ["Période", d.periode],
    ["Conditions de paiement", d.conditions],
  ];
  const droite = [
    para(run("FACTURE", { size: 52, bold: true, color: BLEU, characterSpacing: 80 }),
      { alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),
    ...meta.map(([k, v]) => para([run(`${k}   `, { color: GRIS, size: 17 }), run(v, { bold: true, size: 17 })],
      { alignment: AlignmentType.RIGHT, spacing: { after: 60 } })),
  ];
  return table([3300, PORTRAIT - 3300], [new TableRow({ children: [
    cell(para(image(118)), 3300, { borders: sansBord, valign: VerticalAlign.TOP, margins: { left: 0 } }),
    cell(droite, PORTRAIT - 3300, { borders: sansBord, valign: VerticalAlign.BOTTOM, margins: { right: 0 } }),
  ] })]);
}

function parties() {
  const emetteur = [
    para(label("Émetteur"), { spacing: { after: 100 } }),
    para(run(SOCIETE.marque, { bold: true, size: 20 })),
    para(run(SOCIETE.nom)),
    ...SOCIETE.adresse.map((l) => para(run(l))),
    para(run(`TVA ${SOCIETE.tva}`, { color: GRIS, size: 16 }), { spacing: { before: 80 } }),
  ];
  const client = [
    para(label("Facturé à"), { spacing: { after: 100 } }),
    para(run("Clients divers", { bold: true, size: 20 })),
    para(run("Hébergement en chambres d'hôtes")),
    para(run(`Séjours de ${d.periode.toLowerCase()}`)),
  ];
  const m = { top: 200, bottom: 200, left: 240, right: 240 };
  return table([PORTRAIT / 2 - 150, 300, PORTRAIT / 2 - 150], [new TableRow({ children: [
    cell(emetteur, PORTRAIT / 2 - 150, { borders: sansBord, valign: VerticalAlign.TOP, margins: { ...m, left: 0 } }),
    cell("", 300, { borders: sansBord }),
    cell(client, PORTRAIT / 2 - 150, { borders: sansBord, fill: BLEU_CLAIR, valign: VerticalAlign.TOP, margins: m }),
  ] })]);
}

function recapitulatif() {
  const L = [2706, 1100, 1000, 1700, 1500, 1900];
  const R = AlignmentType.RIGHT;
  const tete = ["Période", "Séjours", "Nuits", "Montant HTVA", `TVA ${pct(d.taux)}`, "Montant TVAC"];
  const h = new TableRow({ tableHeader: true, children: tete.map((t, i) =>
    cell(t, L[i], { fill: BLEU, borders: sansBord, align: i ? R : AlignmentType.LEFT,
      run: { bold: true, color: "FFFFFF", size: 16 } })) });
  const lignes = d.mois.map((m) => new TableRow({ children: [
    cell(`Nuitées ${m.libelle.toLowerCase()}`, L[0]),
    cell(m.sejours, L[1], { align: R }),
    cell(m.nuits, L[2], { align: R }),
    cell(eur(m.htva), L[3], { align: R }),
    cell(eur(m.tva), L[4], { align: R }),
    cell(eur(m.ttc), L[5], { align: R, run: { bold: true } }),
  ] }));
  return table(L, [h, ...lignes]);
}

function totaux() {
  const L = [2600, 1900];
  const R = AlignmentType.RIGHT;
  const ligne = (k, v) => new TableRow({ children: [cell(k, L[0], { run: { color: GRIS } }), cell(v, L[1], { align: R })] });
  return table(L, [
    ligne("Sous-total HTVA", eur(d.total.htva)),
    ligne(`TVA ${pct(d.taux)}`, eur(d.total.tva)),
    new TableRow({ children: [
      cell("Total TVA incluse", L[0], { fill: BLEU, borders: sansBord, run: { bold: true, color: "FFFFFF", size: 20 } }),
      cell(eur(d.total.ttc), L[1], { fill: BLEU, borders: sansBord, align: R, run: { bold: true, color: "FFFFFF", size: 20 } }),
    ] }),
  ], { alignment: AlignmentType.RIGHT });
}

function mentions() {
  const lignes = [
    "Prestations : nuitées en chambres d'hôtes, petit-déjeuner compris, TVA hébergement de 12 %.",
    "Le détail des séjours par réservation figure en annexe.",
    "Facture acquittée : montants encaissés via booking.com et chezspoons.com.",
  ];
  return [
    para(label("Informations"), { spacing: { before: 400, after: 100 } }),
    ...lignes.map((l) => para(run(l, { size: 16, color: GRIS }), { spacing: { after: 60 } })),
  ];
}

const pied = () => new Footer({ children: [
  para(run(""), { border: { top: { style: BorderStyle.SINGLE, size: 4, color: LIGNE, space: 6 } } }),
  para(run(`${SOCIETE.nom}  ·  ${SOCIETE.adresse.slice(0, 2).join(", ")}  ·  TVA ${SOCIETE.tva}  ·  RPM ${SOCIETE.rpm}`,
    { size: 14, color: GRIS }), { alignment: AlignmentType.CENTER }),
  para([
    run(`IBAN ${SOCIETE.iban}  ·  BIC ${SOCIETE.bic}  ·  ${SOCIETE.tel}  ·  ${SOCIETE.email}  ·  Page `, { size: 14, color: GRIS }),
    new TextRun({ children: [PageNumber.CURRENT], font: POLICE, size: 14, color: GRIS }),
    run(" / ", { size: 14, color: GRIS }),
    new TextRun({ children: [PageNumber.TOTAL_PAGES], font: POLICE, size: 14, color: GRIS }),
  ], { alignment: AlignmentType.CENTER }),
] });

// Annexe : détail des nuitées
function detail() {
  const L = [1600, 1750, 2588, 1850, 1150, 1150, 650, 1250, 800, 1250, 1000];
  const R = AlignmentType.RIGHT;
  const C = AlignmentType.CENTER;
  const tete = ["Canal", "N° réservation", "Client", "Chambre", "Arrivée", "Départ", "Nuits",
    "Montant TVAC", "Taux TVA", "Montant HTVA", "TVA"];
  const align = [null, null, null, null, C, C, C, R, C, R, R];
  const fmt = { size: 16 };
  const rows = [new TableRow({ tableHeader: true, children: tete.map((t, i) =>
    cell(t, L[i], { fill: BLEU, borders: sansBord, align: align[i] || AlignmentType.LEFT,
      run: { bold: true, color: "FFFFFF", size: 15 } })) })];
  const total = (texte, x, o) => new TableRow({ children: [
    cell(texte, L.slice(0, 6).reduce((a, b) => a + b), { span: 6, ...o }),
    cell(x.nuits, L[6], { align: C, ...o }),
    cell(eur(x.ttc), L[7], { align: R, ...o }),
    cell("", L[8], o),
    cell(eur(x.htva), L[9], { align: R, ...o }),
    cell(eur(x.tva), L[10], { align: R, ...o }),
  ] });
  for (const m of d.mois) {
    rows.push(new TableRow({ cantSplit: true, children: [cell(m.libelle, PAYSAGE, {
      span: 11, fill: BLEU_CLAIR, borders: sansBord, run: { bold: true, color: BLEU, size: 17 } })] }));
    m.lignes.forEach((l, i) => {
      const o = { fill: i % 2 ? ZEBRE : undefined, run: fmt };
      const v = [l.canal, l.ref, l.client, l.chambre, l.arrivee, l.depart, l.nuits,
        eur(l.ttc), pct(l.taux), eur(l.htva), eur(l.tva)];
      rows.push(new TableRow({ cantSplit: true, children: v.map((x, j) =>
        cell(x, L[j], { ...o, align: align[j] || AlignmentType.LEFT })) }));
    });
    rows.push(total(`Sous-total ${m.libelle.toLowerCase()}`, m,
      { run: { bold: true, size: 16 }, borders: bordBas(BLEU) }));
  }
  rows.push(total("Total de la période", d.total,
    { fill: BLEU, borders: sansBord, run: { bold: true, color: "FFFFFF", size: 17 } }));
  return table(L, rows);
}

function enteteAnnexe() {
  return table([1100, PAYSAGE - 1100], [new TableRow({ children: [
    cell(para(image(52)), 1100, { borders: sansBord, margins: { left: 0 } }),
    cell([
      para(run("Détail des nuitées", { size: 32, bold: true, color: BLEU })),
      para(run(`Annexe à la facture n° ${d.numero} du ${d.date}  ·  ${d.periode}  ·  Clients divers`,
        { size: 16, color: GRIS }), { spacing: { before: 60 } }),
    ], PAYSAGE - 1100, { borders: sansBord }),
  ] })]);
}

const doc = new Document({
  creator: SOCIETE.marque,
  title: `Facture ${d.numero}`,
  styles: { default: { document: { run: { font: POLICE, size: 18 } } } },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 },
        margin: { top: 800, bottom: 1300, left: 1000, right: 1000, footer: 500 } } },
      footers: { default: pied() },
      children: [
        entete(),
        para(run(""), { spacing: { before: 200, after: 400 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BLEU, space: 1 } } }),
        parties(),
        espace(24),
        para(label("Récapitulatif"), { spacing: { after: 120 } }),
        recapitulatif(),
        espace(14),
        totaux(),
        ...mentions(),
      ],
    },
    {
      properties: { page: { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 700, bottom: 1200, left: 900, right: 900, footer: 450 } } },
      footers: { default: pied() },
      children: [enteteAnnexe(), espace(10), detail()],
    },
  ],
});

Packer.toBuffer(doc).then((b) => fs.writeFileSync(sortie, b));
