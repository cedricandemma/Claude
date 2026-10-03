#!/usr/bin/env python3
"""Génère les fichiers CSV d'upload Statbel (enquête Tourisme et hôtellerie, nuitées)
à partir des exports de réservations du site (MotoPress Hotel Booking, .csv)
et de Booking.com (.xls).

Usage :
    python3 statbel_export.py <dossier_exports> [--mois 2026-04] [--out <dossier_sortie>]

Un fichier statbel_AAAA-MM.csv est produit par mois, au format du modèle Excel
Statbel enregistré en CSV (séparateur point-virgule, sans ligne de titres) :
    pays ; but du séjour ; date (aaaa-mm-jj) ; nuits ; personnes ; unités ; région BE
"""
import argparse
import csv
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import xlrd

# Codes Statbel : à vérifier dans l'onglet CountryCode / la liste du modèle
# Tourism_template_XBRL.xlsx. Modifier ici si Statbel utilise d'autres valeurs.
BUT_LOISIRS = "1"
BUT_PROFESSIONNEL = "2"
REGION_BRUXELLES = "1"
REGION_FLANDRE = "2"
REGION_WALLONIE = "3"

# Hypothèse pour le site web, qui n'exporte pas le nombre d'occupants :
# chambres doubles, donc 2 personnes par chambre.
PERSONNES_PAR_CHAMBRE_SITE = 2


def region_depuis_code_postal(cp):
    m = re.search(r"\b(\d{4})\b", cp or "")
    if not m:
        return ""
    n = int(m.group(1))
    if 1000 <= n <= 1299:
        return REGION_BRUXELLES
    if 1300 <= n <= 1499 or 4000 <= n <= 7999:
        return REGION_WALLONIE
    if 1500 <= n <= 3999 or 8000 <= n <= 9999:
        return REGION_FLANDRE
    return ""


def lire_site(path):
    """Export MotoPress : une ligne par chambre, même ID si plusieurs chambres."""
    sejours = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if row["Status"].strip().lower() != "confirmed":
                continue
            arrivee = datetime.strptime(row["Check-in"], "%d/%m/%Y").date()
            depart = datetime.strptime(row["Check-out"], "%d/%m/%Y").date()
            pays = row["Country"].strip().upper()
            s = sejours.setdefault(row["ID"], {
                "source": "site", "ref": row["ID"], "nom": f'{row["First Name"]} {row["Last Name"]}',
                "pays": pays, "but": BUT_LOISIRS, "arrivee": arrivee,
                "nuits": (depart - arrivee).days, "unites": 0, "personnes": 0,
                "region": region_depuis_code_postal(row["Postcode"]) if pays == "BE" else "",
            })
            s["unites"] += 1
            s["personnes"] += PERSONNES_PAR_CHAMBRE_SITE
    return list(sejours.values())


def ouvrir_xls(path):
    data = Path(path).read_bytes()
    try:
        return xlrd.open_workbook(file_contents=data)
    except AssertionError:
        # Certains exports Booking.com ont un conteneur OLE mal formé :
        # le flux BIFF commence juste après l'en-tête de 512 octets.
        return xlrd.open_workbook(file_contents=data[512:], ignore_workbook_corruption=True)


def lire_booking(path):
    sh = ouvrir_xls(path).sheet_by_index(0)
    entetes = [h.replace("&nbsp;", "").strip() for h in sh.row_values(0)]
    sejours = []
    for r in range(1, sh.nrows):
        v = dict(zip(entetes, sh.row_values(r)))
        if str(v["Statut"]).strip().lower() != "ok":
            continue
        arrivee = datetime.strptime(v["Arrivée"], "%Y-%m-%d").date()
        depart = datetime.strptime(v["Départ"], "%Y-%m-%d").date()
        pays = str(v["Booker country"]).strip().upper()
        motif = str(v["Motif du voyage"]).strip().lower()
        sejours.append({
            "source": "booking", "ref": str(v["Numéro de réservation"]).split(".")[0],
            "nom": v["Nom du client"], "pays": pays,
            "but": BUT_PROFESSIONNEL if motif == "affaires" else BUT_LOISIRS,
            "arrivee": arrivee, "nuits": (depart - arrivee).days,
            "unites": int(v["Hébergements"] or 1), "personnes": int(v["Personnes"] or 2),
            "region": region_depuis_code_postal(str(v.get("Adresse", ""))) if pays == "BE" else "",
        })
    return sejours


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dossier")
    ap.add_argument("--mois", help="AAAA-MM ; par défaut tous les mois présents")
    ap.add_argument("--out", default=".")
    args = ap.parse_args()

    sejours = []
    for p in sorted(Path(args.dossier).iterdir()):
        if p.suffix.lower() == ".csv" and not p.name.startswith("statbel_"):
            sejours += lire_site(p)
        elif p.suffix.lower() == ".xls":
            sejours += lire_booking(p)

    par_mois = defaultdict(list)
    for s in sejours:
        par_mois[s["arrivee"].strftime("%Y-%m")].append(s)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for mois in sorted(par_mois):
        if args.mois and mois != args.mois:
            continue
        lignes = sorted(par_mois[mois], key=lambda s: s["arrivee"])
        with open(out / f"statbel_{mois}.csv", "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, delimiter=";")
            for s in lignes:
                w.writerow([s["pays"], s["but"], s["arrivee"].isoformat(), s["nuits"],
                            s["personnes"], s["unites"], s["region"]])
        nuitees = sum(s["nuits"] * s["personnes"] for s in lignes)
        print(f"\n{mois} : {len(lignes)} séjours, {nuitees} nuitées -> statbel_{mois}.csv")
        for s in lignes:
            alerte = "  <- région BE inconnue" if s["pays"] == "BE" and not s["region"] else ""
            print(f'  {s["arrivee"]} {s["source"]:7} {s["ref"]:>11} {s["pays"]} '
                  f'{s["nuits"]}n {s["personnes"]}p {s["unites"]}ch {s["nom"]}{alerte}')


if __name__ == "__main__":
    sys.exit(main())
