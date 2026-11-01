// Règles métier Chez Spoons : lecture des exports, facture « Clients divers » et fichier Statbel.
// Ce fichier est inséré tel quel dans chez_spoons.html par build.py, et testé avec Node (test.js).

const TAUX_TVA = 0.12;
const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];
const STATUTS_ANNULES_SITE = ["cancel", "annul", "abandon", "trash", "corbeille"];
const PERSONNES_PAR_CHAMBRE_SITE = 2;

// Codes du websurvey Statbel
const BUT = { loisirs: "1", congres: "2", pro: "3" };
const LIBELLE_BUT = { "1": "(1) loisirs, vacances", "2": "(2) conférence, congrès, séminaire",
  "3": "(3) autres raisons professionnelles" };
const REGION = { wallonie: "1", bruxelles: "2", flandre: "3", germanophone: "4" };
const LIBELLE_REGION = { "1": "(1) Wallonie", "2": "(2) Bruxelles", "3": "(3) Flandre",
  "4": "(4) Communauté germanophone" };
const PAYS_STATBEL = new Set((
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ " +
  "BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM " +
  "DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS " +
  "GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN " +
  "KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ " +
  "MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM " +
  "PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV " +
  "SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI " +
  "VN VU WF WS XX YE YT ZA ZM ZW").split(" "));
const ALIAS_PAYS = { UK: "GB", EL: "GR" };

// Outils
const round2 = (x) => Math.round((x + Number.EPSILON * Math.abs(x)) * 100) / 100;
const texte = (v) => (v === undefined || v === null ? "" : String(v).trim());
const montant = (v) => {
  const s = texte(v).replace(/[^\d,.\-]/g, "").replace(",", ".");
  return s ? parseFloat(s) : 0;
};
const isoDate = (d) => d.toISOString().slice(0, 10);
const mkDate = (y, m, j) => new Date(Date.UTC(+y, +m - 1, +j));
const dateFr = (d) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const moisDe = (d) => isoDate(d).slice(0, 7);
const nuits = (r) => Math.round((r.depart - r.arrivee) / 86400000);
const libelleMois = (m) => {
  const [a, mm] = m.split("-");
  const n = MOIS_FR[+mm - 1];
  return `${n[0].toUpperCase()}${n.slice(1)} ${a}`;
};
function parseDateFlex(s) {
  s = texte(s);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return mkDate(m[1], m[2], m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return mkDate(m[3], m[2], m[1]);
  return null;
}
function codePays(brut) {
  let c = texte(brut).toUpperCase();
  c = ALIAS_PAYS[c] || c;
  return PAYS_STATBEL.has(c) ? c : "XX";
}

// CSV avec guillemets (export MotoPress)
function parseCSV(txt) {
  txt = txt.replace(/^﻿/, "");
  const lignes = [];
  let ligne = [], champ = "", guill = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (guill) {
      if (c === '"' && txt[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guill = false;
      else champ += c;
    } else if (c === '"') guill = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && txt[i + 1] === "\n") i++;
      ligne.push(champ); champ = "";
      if (ligne.some((x) => x !== "")) lignes.push(ligne);
      ligne = [];
    } else champ += c;
  }
  ligne.push(champ);
  if (ligne.some((x) => x !== "")) lignes.push(ligne);
  return lignes;
}
const enObjets = (lignes) => {
  const tete = lignes[0].map((h) => texte(h).replace(/&nbsp;/g, "").trim());
  return lignes.slice(1).map((l) => Object.fromEntries(tete.map((h, i) => [h, l[i] ?? ""])));
};
const typeExport = (lignes) => {
  const tete = (lignes[0] || []).map((h) => texte(h).replace(/&nbsp;/g, ""));
  if (tete.includes("Numéro de réservation") && tete.includes("Booker country")) return "booking";
  if (tete.includes("Check-in") && tete.includes("Accommodation")) return "site";
  return null;
};

// Lecture des exports, une ligne par réservation (Booking) ou par chambre réservée (site)
function lireBooking(lignes) {
  return enObjets(lignes).filter((r) => texte(r["Numéro de réservation"])).map((r) => {
    const numero = texte(r["Numéro de réservation"]).replace(/\.0$/, "");
    const motif = texte(r["Motif du voyage"]).toLowerCase();
    return {
      canal: "Booking", ref: numero, numero,
      client: [r["Nom du client"], r["Réservé par"]].map(texte).find((n) => n && n.toLowerCase() !== "null") || "",
      chambres: texte(r["Type d'hébergement"]),
      arrivee: parseDateFlex(r["Arrivée"]), depart: parseDateFlex(r["Départ"]),
      reserveLe: parseDateFlex(r["Réservé le"]),
      ttc: round2(montant(r["Tarif"])),
      commission: round2(montant(r["Montant de la commission"])),
      statut: texte(r["Statut"]).toLowerCase() || "ok",
      nbChambres: parseInt(texte(r["Hébergements"]), 10) || 1,
      personnes: parseInt(texte(r["Personnes"]), 10) || 2,
      pays: codePays(r["Booker country"]),
      but: motif === "affaires" ? BUT.pro : BUT.loisirs,
      codePostal: "", payeEnLigne: true, remarques: [],
    };
  });
}

function lireSite(lignes) {
  const resas = enObjets(lignes).filter((r) => texte(r["Check-in"])).map((r) => {
    const id = texte(r["ID"]).replace(/^#/, "").replace(/\.0$/, "");
    const statut = texte(r["Status"]).toLowerCase();
    const details = texte(r["Payment Details"]);
    const commande = details.startsWith("#") ? details.split(",")[0].slice(1) : "";
    const chambre = texte(r["Accommodation"]);
    const arrivee = parseDateFlex(r["Check-in"]);
    const cle = id || commande;
    return {
      canal: "Site", id,
      ref: cle ? `${cle}-${chambre}` : `${isoDate(arrivee).replace(/-/g, "")}-${chambre}`,
      numero: id ? `#${id}` : "",
      client: `${texte(r["First Name"])} ${texte(r["Last Name"])}`.trim(),
      chambres: chambre,
      arrivee, depart: parseDateFlex(r["Check-out"]), reserveLe: parseDateFlex(r["Date"]),
      ttc: round2(montant(r["Total"])), commission: 0,
      statut: STATUTS_ANNULES_SITE.some((x) => statut.includes(x)) ? "annulée" : "ok",
      statutBrut: texte(r["Status"]),
      nbChambres: 1, personnes: PERSONNES_PAR_CHAMBRE_SITE,
      pays: codePays(r["Country"]), but: BUT.loisirs,
      codePostal: texte(r["Postcode"]),
      payeEnLigne: Boolean(commande && montant(r["Paid"])), remarques: [],
    };
  });
  const actives = resas.filter((r) => r.statut === "ok");
  return dedoublonner(actives).concat(resas.filter((r) => r.statut !== "ok"));
}

// MotoPress garde parfois une réservation abandonnée à côté de celle payée
function dedoublonner(resas) {
  const gardees = new Map();
  for (const r of resas) {
    const cle = [isoDate(r.arrivee), isoDate(r.depart), r.chambres, r.client.toLowerCase()].join("|");
    const autre = gardees.get(cle);
    if (!autre) { gardees.set(cle, r); continue; }
    const garder = r.payeEnLigne && !autre.payeEnLigne ? r : autre;
    const ecartee = garder === r ? autre : r;
    garder.remarques.push(`Doublon écarté dans l'export du site (${ecartee.ref}, ${ecartee.ttc.toFixed(2)} €), à confirmer`);
    gardees.set(cle, garder);
  }
  return [...gardees.values()];
}

// Réservations des deux canaux, même réservation présente dans plusieurs exports gardée une fois
function fusionner(listes) {
  const vues = new Map();
  for (const r of listes.flat()) vues.set(`${r.canal}:${r.ref}`, r);
  return [...vues.values()];
}

// Facture : séjours dont la première nuit tombe dans la période, tous à 12 %
const PARTICULES = new Set(["de", "van", "der", "den", "du", "le", "la", "von"]);
function nomPropre(nom) {
  if (nom.includes(",") && !nom.includes(";")) {
    const [famille, prenom] = nom.split(/,(.*)/s).map((x) => (x || "").trim());
    nom = `${prenom} ${famille}`;
  }
  return nom.split(/\s+/).filter(Boolean).map((m, i) => {
    const minus = m === m.toLowerCase() && m !== m.toUpperCase();
    const majus = m === m.toUpperCase() && m !== m.toLowerCase() && m.length > 1;
    if (minus || majus) {
      const b = m.toLowerCase();
      return i && PARTICULES.has(b) ? b : b[0].toUpperCase() + b.slice(1);
    }
    return m;
  }).join(" ");
}
const nomChambre = (n) => n.split(",").map((c) => c.trim().replace(/\s+\d+$/, "")).join(", ");

function preparerFacture(resas, du, au) {
  const lignes = resas.filter((r) => r.statut === "ok" && r.arrivee >= du && r.arrivee <= au)
    .sort((a, b) => a.arrivee - b.arrivee || a.canal.localeCompare(b.canal) || a.client.localeCompare(b.client));
  const mois = [];
  for (const m of [...new Set(lignes.map((r) => moisDe(r.arrivee)))].sort()) {
    const detail = lignes.filter((r) => moisDe(r.arrivee) === m).map((r) => {
      const htva = round2(r.ttc / (1 + TAUX_TVA));
      return {
        canal: r.canal === "Booking" ? "booking.com" : "chezspoons.com",
        ref: r.numero || "Sans n°", client: nomPropre(r.client), chambre: nomChambre(r.chambres),
        arrivee: dateFr(r.arrivee), depart: dateFr(r.depart), nuits: nuits(r),
        ttc: r.ttc, taux: TAUX_TVA, htva, tva: round2(r.ttc - htva),
      };
    });
    const somme = (k) => round2(detail.reduce((s, d) => s + d[k], 0));
    mois.push({ mois: m, libelle: libelleMois(m), lignes: detail, sejours: detail.length,
      nuits: detail.reduce((s, d) => s + d.nuits, 0), ttc: somme("ttc"), htva: somme("htva"), tva: somme("tva") });
  }
  const total = { sejours: 0, nuits: 0, ttc: 0, htva: 0, tva: 0 };
  for (const m of mois) for (const k in total) total[k] += m[k];
  for (const k of ["ttc", "htva", "tva"]) total[k] = round2(total[k]);
  return { mois, total };
}

// Statbel : séjours dont le départ tombe dans la période, un fichier par mois de départ
function regionDepuisCodePostal(cp) {
  const m = texte(cp).match(/\b(\d{4})\b/);
  if (!m) return "";
  const n = +m[1];
  if (n >= 1000 && n <= 1299) return REGION.bruxelles;
  if (n >= 4700 && n <= 4799) return REGION.germanophone;
  if ((n >= 1300 && n <= 1499) || (n >= 4000 && n <= 7999)) return REGION.wallonie;
  if ((n >= 1500 && n <= 3999) || (n >= 8000 && n <= 9999)) return REGION.flandre;
  return "";
}

function preparerStatbel(resas, du, au) {
  // Le site exporte une ligne par chambre : on regroupe par numéro de réservation
  const sejours = new Map();
  for (const r of resas) {
    if (r.statut !== "ok" || r.depart < du || r.depart > au) continue;
    const cle = r.canal === "Site" && r.id ? `Site:${r.id}` : `${r.canal}:${r.ref}`;
    const s = sejours.get(cle);
    if (s) { s.unites += r.nbChambres; s.personnes += r.personnes; continue; }
    sejours.set(cle, {
      canal: r.canal, ref: r.canal === "Site" ? r.id || r.ref : r.ref, client: r.client,
      pays: r.pays, but: r.but, depart: r.depart, nuits: nuits(r),
      personnes: r.personnes, unites: r.nbChambres,
      region: r.pays === "BE" ? regionDepuisCodePostal(r.codePostal) : "", regionEstimee: false,
    });
  }
  const liste = [...sejours.values()].sort((a, b) => a.depart - b.depart || String(a.ref).localeCompare(String(b.ref)));
  for (const s of liste) {
    if (s.pays === "BE" && !s.region) {
      // Clientèle belge sans code postal : 4 sur 5 en Flandre, 1 sur 5 en Wallonie,
      // de façon stable selon le numéro de réservation
      const n = parseInt(String(s.ref).replace(/\D/g, ""), 10) || 0;
      s.region = n % 5 === 0 ? REGION.wallonie : REGION.flandre;
      s.regionEstimee = true;
    }
  }
  const parMois = [];
  for (const m of [...new Set(liste.map((s) => moisDe(s.depart)))].sort()) {
    const lignes = liste.filter((s) => moisDe(s.depart) === m);
    parMois.push({ mois: m, libelle: libelleMois(m), lignes,
      nuitees: lignes.reduce((t, s) => t + s.nuits * s.personnes, 0) });
  }
  return parMois;
}

// Format accepté par l'upload du websurvey : 7 colonnes, point-virgule, sans titres
const csvStatbel = (lignes) => lignes.map((s) =>
  [s.pays, s.but, isoDate(s.depart), s.nuits, s.personnes, s.unites, s.region].join(";")).join("\r\n") + "\r\n";

// Points à vérifier avant d'envoyer
function controles(resas, du, au) {
  const pts = [];
  for (const r of resas) {
    const dansFacture = r.arrivee >= du && r.arrivee <= au;
    const dansStatbel = r.depart >= du && r.depart <= au;
    if (!dansFacture && !dansStatbel) continue;
    const nom = `${r.canal === "Booking" ? "Booking" : "Site"} ${r.numero || r.ref} (${r.client || "sans nom"})`;
    if (r.statut !== "ok") {
      if (r.canal === "Booking" || r.ttc) pts.push({ niveau: "info",
        texte: `${nom} au statut « ${r.statutBrut || r.statut} », exclue${r.ttc && r.canal === "Booking" ? ` ; montant de ${r.ttc.toFixed(2)} € à voir avec le comptable` : ""}` });
      continue;
    }
    if (nuits(r) <= 0) pts.push({ niveau: "alerte", texte: `${nom} : nombre de nuits incohérent` });
    if (!r.ttc && dansFacture) pts.push({ niveau: "alerte", texte: `${nom} : montant nul` });
    for (const m of r.remarques) pts.push({ niveau: "alerte", texte: `${nom} : ${m}` });
    if (dansFacture && !dansStatbel) pts.push({ niveau: "info",
      texte: `${nom} arrive le ${dateFr(r.arrivee)} et part le ${dateFr(r.depart)} : facturé sur cette période, déclaré à Statbel le mois du départ` });
    if (!dansFacture && dansStatbel) pts.push({ niveau: "info",
      texte: `${nom} arrivé le ${dateFr(r.arrivee)} : déclaré à Statbel sur cette période, facturé sur la période précédente` });
  }
  return pts;
}

if (typeof module !== "undefined") module.exports = {
  parseCSV, typeExport, lireBooking, lireSite, fusionner, preparerFacture, preparerStatbel,
  csvStatbel, controles, mkDate, nomPropre, LIBELLE_BUT, LIBELLE_REGION,
};
