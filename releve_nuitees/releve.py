"""Relevé mensuel des nuitées (Booking.com + site MotoPress) pour la facture au comptable.

Usage :
    python releve.py --periode 2026-09 --booking export_booking.xls --site export_site.csv
    python releve.py --periode 2026-09 ... --valider     # enregistre le mois comme facturé

Règles appliquées (voir README.md) :
  * une réservation est rattachée au mois de sa première nuitée ;
  * TVA hébergement 12 % depuis le 1er mars 2026, 6 % avant, avec le régime transitoire
    (réservé avant le 1er mars 2026 et séjour avant le 1er juillet 2026 : 6 %) ;
  * les montants exportés sont TVA comprise ; HTVA et TVA sont calculés par formule Excel ;
  * les réservations déjà facturées sont gardées dans un registre pour détecter les écarts.
"""

import argparse
import json
import re
from dataclasses import dataclass, field, asdict
from datetime import date, datetime
from pathlib import Path

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# Paramètres fiscaux
DATE_PASSAGE_12 = date(2026, 3, 1)
FIN_TRANSITOIRE = date(2026, 7, 1)
# Le "Tarif" de l'export Booking est TVA comprise (confirmé par le propriétaire).
BOOKING_TARIF_TTC = True
# Colonnes optionnelles de l'export MotoPress, à cocher lors de l'export
COLONNES_ID_SITE = ("ID", "Booking ID", "Booking", "Reservation ID", "Réservation")
COLONNES_STATUT_SITE = ("Status", "Booking Status", "Statut")
STATUTS_ANNULES_SITE = ("cancel", "annul", "abandon", "trash", "corbeille")


@dataclass
class Resa:
    canal: str
    ref: str
    client: str
    chambres: str
    arrivee: date
    depart: date
    reserve_le: date | None
    montant_ttc: float
    commission: float = 0.0
    paiement: str = ""
    statut: str = "ok"
    nb_chambres: int = 1
    paye_en_ligne: bool = False
    numero: str = ""
    remarques: list = field(default_factory=list)

    @property
    def nuits(self):
        return (self.depart - self.arrivee).days

    @property
    def mois(self):
        return self.arrivee.strftime("%Y-%m")

    @property
    def taux_tva(self):
        if self.arrivee < DATE_PASSAGE_12:
            return 0.06
        if self.reserve_le and self.reserve_le < DATE_PASSAGE_12 and self.arrivee < FIN_TRANSITOIRE:
            return 0.06
        return 0.12


def _montant(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return 0.0
    s = re.sub(r"[^\d,.\-]", "", str(v)).replace(",", ".")
    return float(s) if s else 0.0


def _texte(v):
    return "" if v is None or (isinstance(v, float) and pd.isna(v)) else str(v).strip()


def lire_booking(chemin):
    df = pd.read_excel(chemin)
    df.columns = [c.replace("&nbsp;", "").strip() for c in df.columns]
    resas = []
    for _, r in df.iterrows():
        client = _texte(r.get("Nom du client")) or _texte(r.get("Réservé par"))
        resas.append(Resa(
            canal="Booking",
            ref=str(int(r["Numéro de réservation"])),
            client=client,
            chambres=_texte(r.get("Type d'hébergement")),
            arrivee=pd.to_datetime(r["Arrivée"]).date(),
            depart=pd.to_datetime(r["Départ"]).date(),
            reserve_le=pd.to_datetime(r["Réservé le"]).date(),
            montant_ttc=round(_montant(r["Tarif"]), 2),
            commission=round(_montant(r["Montant de la commission"]), 2),
            paiement=_texte(r.get("Statut du paiement")),
            statut=_texte(r.get("Statut")).lower() or "ok",
            nb_chambres=int(r.get("Hébergements") or 1),
            numero=str(int(r["Numéro de réservation"])),
        ))
    return resas


def lire_site(chemin):
    df = pd.read_csv(chemin)
    col_id = next((c for c in COLONNES_ID_SITE if c in df.columns), None)
    col_statut = next((c for c in COLONNES_STATUT_SITE if c in df.columns), None)
    resas = []
    for _, r in df.iterrows():
        numero = _texte(r.get(col_id)).lstrip("#") if col_id else ""
        if numero.endswith(".0"):
            numero = numero[:-2]
        statut = _texte(r.get(col_statut)).lower() if col_statut else ""
        details = _texte(r.get("Payment Details"))
        commande = details.split(",")[0].lstrip("#") if details.startswith("#") else ""
        arrivee = datetime.strptime(r["Check-in"], "%d/%m/%Y").date()
        chambre = _texte(r.get("Accommodation"))
        cle = numero or commande
        ref = f"{cle}-{chambre}" if cle else f"{arrivee:%Y%m%d}-{chambre}"
        paye = _montant(r.get("Paid"))
        if commande:
            paiement = details.split(",")[-1]
        else:
            paiement = _texte(r.get("Customer Note"))[:60] or "Non payé en ligne"
        resas.append(Resa(
            canal="Site",
            ref=ref,
            client=f"{_texte(r.get('First Name'))} {_texte(r.get('Last Name'))}".strip(),
            chambres=chambre,
            arrivee=arrivee,
            depart=datetime.strptime(r["Check-out"], "%d/%m/%Y").date(),
            reserve_le=datetime.strptime(r["Date"], "%d/%m/%Y %H:%M:%S").date(),
            montant_ttc=round(_montant(r.get("Total")), 2),
            paiement=paiement if paye or not commande else f"{paiement} (non encaissé)",
            paye_en_ligne=bool(commande and paye),
            numero=f"#{numero}" if numero else "",
            statut="annulée" if any(x in statut for x in STATUTS_ANNULES_SITE) else "ok",
        ))
    return dedoublonner_site(resas)


def dedoublonner_site(resas):
    """MotoPress garde parfois une réservation abandonnée à côté de celle payée."""
    gardees, points = {}, []
    for r in resas:
        cle = (r.arrivee, r.depart, r.chambres, r.client.lower())
        if cle in gardees:
            autre = gardees[cle]
            garder = r if r.paye_en_ligne and not autre.paye_en_ligne else autre
            ecartee = autre if garder is r else r
            gardees[cle] = garder
            garder.remarques.append(
                f"Doublon écarté dans l'export du site ({ecartee.ref}, {ecartee.montant_ttc:.2f} €), à confirmer")
        else:
            gardees[cle] = r
    return list(gardees.values())


def controler_registre(resas, registre, periode):
    """Compare les mois déjà facturés aux exports actuels."""
    regul, points = [], []
    mois_factures = set(registre.get("mois", []))
    connues = registre.get("reservations", {})
    mois_couverts = {r.mois for r in resas}
    vues = set()
    for r in resas:
        cle = f"{r.canal}:{r.ref}"
        if r.mois >= periode or r.mois not in mois_factures:
            continue
        vues.add(cle)
        avant = connues.get(cle)
        if r.statut != "ok":
            if avant:
                regul.append((r, -avant["ttc"], f"Annulée après facturation de {r.mois}"))
        elif not avant:
            regul.append((r, r.montant_ttc, f"Absente de la facture de {r.mois}"))
        elif abs(avant["ttc"] - r.montant_ttc) > 0.009:
            regul.append((r, round(r.montant_ttc - avant["ttc"], 2),
                          f"Montant modifié depuis la facture de {r.mois} ({avant['ttc']:.2f} €)"))
    for cle, avant in connues.items():
        if cle not in vues and avant["mois"] in mois_couverts and avant["mois"] < periode:
            points.append(f"{cle} facturée en {avant['mois']} ({avant['ttc']:.2f} €) n'apparaît plus "
                          "dans l'export : annulation ou suppression à vérifier")
    return regul, points


# Mise en forme Excel
POLICE = "Arial"
GRIS = PatternFill("solid", start_color="D9D9D9")
BLEU = PatternFill("solid", start_color="DDEBF7")
FIN = Side(style="thin", color="999999")
CADRE = Border(top=FIN, bottom=FIN, left=FIN, right=FIN)
EUR = '#,##0.00 €;-#,##0.00 €;"-"'


def _entete(ws, ligne, titres, largeurs=None):
    for i, t in enumerate(titres, 1):
        c = ws.cell(ligne, i, t)
        c.font = Font(name=POLICE, bold=True)
        c.fill = GRIS
        c.border = CADRE
        c.alignment = Alignment(wrap_text=True, vertical="center")
    if largeurs:
        for i, w in enumerate(largeurs, 1):
            ws.column_dimensions[get_column_letter(i)].width = w


def _ecrire(ws, ligne, valeurs, formats=None):
    for i, v in enumerate(valeurs, 1):
        c = ws.cell(ligne, i, v)
        c.font = Font(name=POLICE)
        c.border = CADRE
        if formats and formats.get(i):
            c.number_format = formats[i]


def generer_excel(periode, lignes, regul, points, sortie):
    wb = Workbook()
    ws = wb.active
    ws.title = "Relevé"
    libelle = datetime.strptime(periode, "%Y-%m").strftime("%m/%Y")
    ws["A1"] = f"Relevé des nuitées — période {libelle}"
    ws["A1"].font = Font(name=POLICE, bold=True, size=14)
    ws["A2"] = (f"Généré le {date.today():%d/%m/%Y}. Séjours rattachés au mois de la première nuitée. "
                "Montants TVA comprise, HTVA et TVA recalculés par séjour.")
    ws["A2"].font = Font(name=POLICE, italic=True, size=9)

    titres = ["Canal", "N° réservation", "Client", "Chambre(s)", "Arrivée", "Départ", "Nuits",
              "Nuitées chambre", "Réservé le", "Montant TVAC", "Taux TVA", "Montant HTVA", "TVA",
              "Commission Booking (info)", "Paiement", "Remarques"]
    _entete(ws, 4, titres, [9, 20, 26, 24, 11, 11, 7, 9, 11, 13, 8, 13, 11, 13, 30, 40])
    fmt = {5: "DD/MM/YYYY", 6: "DD/MM/YYYY", 9: "DD/MM/YYYY", 10: EUR, 11: "0%", 12: EUR, 13: EUR, 14: EUR}
    debut = 5
    l = debut
    for r in sorted(lignes, key=lambda x: (x.arrivee, x.canal, x.client)):
        _ecrire(ws, l, [r.canal, r.ref, r.client, r.chambres, r.arrivee, r.depart, r.nuits,
                        r.nuits * r.nb_chambres, r.reserve_le, r.montant_ttc, r.taux_tva,
                        f"=ROUND(J{l}/(1+K{l}),2)", f"=ROUND(J{l}-L{l},2)",
                        r.commission or None, r.paiement, "; ".join(r.remarques)], fmt)
        l += 1
    fin = l - 1

    # Régularisations des mois précédents
    l += 1
    ws.cell(l, 1, "Régularisations sur mois déjà facturés").font = Font(name=POLICE, bold=True)
    l += 1
    debut_reg = l
    if regul:
        for r, montant, motif in regul:
            sens = 0 if motif.startswith("Montant") else (1 if montant > 0 else -1)
            _ecrire(ws, l, ["Régul. " + r.canal, r.ref, r.client, r.chambres, r.arrivee, r.depart,
                            sens * r.nuits, sens * r.nuits * r.nb_chambres, r.reserve_le, montant,
                            r.taux_tva, f"=ROUND(J{l}/(1+K{l}),2)", f"=ROUND(J{l}-L{l},2)", None, "",
                            motif], fmt)
            l += 1
    else:
        ws.cell(l, 1, "Aucune").font = Font(name=POLICE, italic=True)
        l += 1
    fin_reg = max(l - 1, debut_reg)

    # Synthèse à reporter sur la facture
    l += 1
    ws.cell(l, 1, "Synthèse à reporter sur la facture").font = Font(name=POLICE, bold=True, size=12)
    l += 1
    _entete(ws, l, ["", "", "Ligne", "", "", "", "Nuits", "Nuitées chambre", "", "Montant TVAC", "",
                    "Montant HTVA", "TVA", "Commission Booking (info)"])
    l += 1
    plage = lambda col: f"{col}{debut}:{col}{fin}"
    plage_r = lambda col: f"{col}{debut_reg}:{col}{fin_reg}"
    syntheses = []
    for canal in ("Booking", "Site"):
        for taux in (0.06, 0.12):
            crit = f'{plage("A")},"{canal}",{plage("K")},{taux}'
            ws.cell(l, 3, f"Nuitées {canal} — TVA {int(taux * 100)} %")
            for col in "GHJLM":
                ws[f"{col}{l}"] = f"=SUMIFS({plage(col)},{crit})"
            if canal == "Booking":
                ws[f"N{l}"] = f"=SUMIFS({plage('N')},{crit})"
            syntheses.append(l)
            l += 1
    ws.cell(l, 3, "Régularisations")
    for col in "GHJLM":
        ws[f"{col}{l}"] = f"=SUM({plage_r(col)})"
    syntheses.append(l)
    l += 1
    ws.cell(l, 3, "TOTAL")
    for col in (7, 8, 10, 12, 13, 14):
        lettre = get_column_letter(col)
        ws.cell(l, col, f"=SUM({lettre}{syntheses[0]}:{lettre}{l - 1})")
    for ligne in syntheses + [l]:
        for col in range(3, 15):
            c = ws.cell(ligne, col)
            c.font = Font(name=POLICE, bold=(ligne == l))
            c.border = CADRE
            if col in (10, 12, 13, 14):
                c.number_format = EUR
            if ligne == l:
                c.fill = BLEU
    ws.freeze_panes = "A5"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToHeight = 0

    # Points à vérifier
    wp = wb.create_sheet("Points à vérifier")
    _entete(wp, 1, ["Point"], [120])
    for i, p in enumerate(points or ["Aucun"], 2):
        _ecrire(wp, i, [p])
        wp.cell(i, 1).alignment = Alignment(wrap_text=True)

    # Hypothèses
    wh = wb.create_sheet("Hypothèses")
    _entete(wh, 1, ["Règle", "Valeur"], [60, 60])
    regles = [
        ("Rattachement au mois", "Mois de la première nuitée (décision du propriétaire)"),
        ("TVA hébergement", "12 % pour les séjours depuis le 01/03/2026, 6 % avant"),
        ("Régime transitoire", "Réservé avant le 01/03/2026 et arrivée avant le 01/07/2026 : 6 %"),
        ("Montant Booking", "Colonne Tarif de l'export Booking, TVA comprise (confirmé)"),
        ("Montant site", "Colonne Total de l'export MotoPress, TVA comprise"),
        ("Commission Booking", "Information uniquement, hors facture (autoliquidation 21 % par le comptable)"),
        ("Annulations Booking", "Exclues des nuitées ; listées dans Points à vérifier si montant non nul"),
    ]
    for i, (a, b) in enumerate(regles, 2):
        _ecrire(wh, i, [a, b])
    wb.save(sortie)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--periode", required=True, help="Mois à facturer, format AAAA-MM")
    p.add_argument("--booking", required=True, help="Export Réservations de l'extranet Booking (.xls)")
    p.add_argument("--site", required=True, help="Export CSV MotoPress Hotel Booking")
    p.add_argument("--registre", default=str(Path(__file__).with_name("registre.json")))
    p.add_argument("--sortie", help="Fichier Excel produit")
    p.add_argument("--valider", action="store_true", help="Enregistrer ce mois comme facturé")
    a = p.parse_args()

    resas = lire_booking(a.booking) + lire_site(a.site)
    registre_path = Path(a.registre)
    registre = json.loads(registre_path.read_text()) if registre_path.exists() else {"mois": [], "reservations": {}}

    du_mois = [r for r in resas if r.mois == a.periode]
    lignes = [r for r in du_mois if r.statut == "ok"]
    points = []
    for r in du_mois:
        if r.statut != "ok":
            points.append(f"{r.canal} {r.numero or r.ref} ({r.client}) au statut « {r.statut} » exclue des nuitées"
                          + (f" ; montant de {r.montant_ttc:.2f} € à traiter avec le comptable" if r.montant_ttc else ""))
    for r in lignes:
        if r.nuits <= 0:
            points.append(f"{r.canal} {r.ref} ({r.client}) : nombre de nuitées incohérent")
        if r.montant_ttc == 0:
            points.append(f"{r.canal} {r.ref} ({r.client}) : montant nul")
        if r.depart.strftime("%Y-%m") > a.periode and r.depart.day > 1:
            r.remarques.append("Séjour à cheval sur deux mois, entièrement rattaché à ce mois")
        points += [f"{r.canal} {r.ref} ({r.client}) : {m}" for m in r.remarques if "Doublon" in m]
    if a.periode in registre["mois"]:
        points.append(f"Le mois {a.periode} a déjà été validé : ce relevé est une réédition")
    regul, pts = controler_registre(resas, registre, a.periode)
    points += pts

    sortie = a.sortie or f"Releve_nuitees_{a.periode}.xlsx"
    generer_excel(a.periode, lignes, regul, points, sortie)

    total = sum(r.montant_ttc for r in lignes)
    print(f"{len(lignes)} réservations, {sum(r.nuits for r in lignes)} nuitées, {total:.2f} € TVAC, "
          f"{len(regul)} régularisation(s), {len(points)} point(s) à vérifier -> {sortie}")

    if a.valider:
        if a.periode not in registre["mois"]:
            registre["mois"].append(a.periode)
        for r in lignes:
            registre["reservations"][f"{r.canal}:{r.ref}"] = {"mois": r.mois, "ttc": r.montant_ttc,
                                                              "nuits": r.nuits}
        for r, montant, _ in regul:
            cle = f"{r.canal}:{r.ref}"
            if r.statut != "ok":
                registre["reservations"].pop(cle, None)
            else:
                registre["reservations"][cle] = {"mois": r.mois, "ttc": r.montant_ttc, "nuits": r.nuits}
        registre_path.write_text(json.dumps(registre, indent=2, ensure_ascii=False))
        print(f"Mois {a.periode} enregistré comme facturé dans {registre_path}")


if __name__ == "__main__":
    main()
