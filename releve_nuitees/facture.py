"""Facture Word « Clients divers » reprenant le détail des nuitées sur un ou plusieurs mois.

Usage :
    python facture.py --du 2026-07 --au 2026-09 --booking export_booking.xls --site export_site.csv \
        --numero 2026-SB-03 --date 30/09/2026

Toutes les nuitées sont facturées à 12 % (pas de régime transitoire sur la facture).
Le rendu Word est fait par facture.js (bibliothèque npm docx).
"""

import argparse
import json
import re
import subprocess
import tempfile
from datetime import date, datetime
from pathlib import Path

from releve import lire_booking, lire_site

TAUX_TVA = 0.12
MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
           "septembre", "octobre", "novembre", "décembre"]
ICI = Path(__file__).parent


def libelle_mois(mois):
    a, m = mois.split("-")
    return f"{MOIS_FR[int(m) - 1].capitalize()} {a}"


PARTICULES = {"de", "van", "der", "den", "du", "le", "la", "von"}


def nom_propre(nom):
    """« de baere, wendelien » -> « Wendelien de Baere », « STEPHANIE Carion » -> « Stephanie Carion »."""
    if "," in nom and ";" not in nom:
        nom_famille, prenom = [x.strip() for x in nom.split(",", 1)]
        nom = f"{prenom} {nom_famille}"
    mots = []
    for i, m in enumerate(nom.split()):
        if m.islower() or (m.isupper() and len(m) > 1):
            m = m.lower() if (i and m.lower() in PARTICULES) else m.capitalize()
        mots.append(m)
    return " ".join(mots)


def chambre(nom):
    return ", ".join(re.sub(r"\s+\d+$", "", c.strip()) for c in nom.split(","))


def reference(r):
    if r.canal == "Booking":
        return r.ref
    commande = r.ref.split("-")[0]
    return f"#{commande}" if len(commande) < 8 else "Sans n°"


def preparer(resas, du, au):
    lignes = [r for r in resas if r.statut == "ok" and du <= r.mois <= au]
    lignes.sort(key=lambda r: (r.arrivee, r.canal, r.client))
    mois = []
    for m in sorted({r.mois for r in lignes}):
        detail = []
        for r in (x for x in lignes if x.mois == m):
            htva = round(r.montant_ttc / (1 + TAUX_TVA), 2)
            detail.append({
                "canal": "booking.com" if r.canal == "Booking" else "chezspoons.com",
                "ref": reference(r),
                "client": nom_propre(r.client),
                "chambre": chambre(r.chambres),
                "arrivee": f"{r.arrivee:%d/%m/%Y}",
                "depart": f"{r.depart:%d/%m/%Y}",
                "nuits": r.nuits,
                "ttc": r.montant_ttc,
                "taux": TAUX_TVA,
                "htva": htva,
                "tva": round(r.montant_ttc - htva, 2),
            })
        mois.append({
            "mois": m,
            "libelle": libelle_mois(m),
            "lignes": detail,
            "sejours": len(detail),
            "nuits": sum(d["nuits"] for d in detail),
            "ttc": round(sum(d["ttc"] for d in detail), 2),
            "htva": round(sum(d["htva"] for d in detail), 2),
            "tva": round(sum(d["tva"] for d in detail), 2),
        })
    return mois


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--du", required=True, help="Premier mois facturé, AAAA-MM")
    p.add_argument("--au", help="Dernier mois facturé, AAAA-MM (par défaut = --du)")
    p.add_argument("--booking", required=True)
    p.add_argument("--site", required=True)
    p.add_argument("--numero", default="2026-SB-XX")
    p.add_argument("--date", default=f"{date.today():%d/%m/%Y}", help="Date de facture JJ/MM/AAAA")
    p.add_argument("--conditions", default="Payé")
    p.add_argument("--sortie")
    a = p.parse_args()
    au = a.au or a.du

    mois = preparer(lire_booking(a.booking) + lire_site(a.site), a.du, au)
    periode = libelle_mois(a.du) if a.du == au else f"{libelle_mois(a.du)} à {libelle_mois(au)}"
    data = {
        "numero": a.numero,
        "date": a.date,
        "conditions": a.conditions,
        "periode": periode,
        "taux": TAUX_TVA,
        "mois": mois,
        "total": {k: round(sum(m[k] for m in mois), 2) for k in ("ttc", "htva", "tva")}
                 | {k: sum(m[k] for m in mois) for k in ("sejours", "nuits")},
        "logo": str(ICI / "assets" / "logo_chez_spoons.png"),
    }
    sortie = a.sortie or f"Chez_Spoons_Facture_{a.numero}_Clients_divers.docx"
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    subprocess.run(["node", str(ICI / "facture.js"), f.name, sortie], check=True)
    t = data["total"]
    print(f"{t['sejours']} séjours, {t['nuits']} nuits, {t['htva']:.2f} € HTVA + {t['tva']:.2f} € TVA "
          f"= {t['ttc']:.2f} € TVAC -> {sortie}")


if __name__ == "__main__":
    main()
