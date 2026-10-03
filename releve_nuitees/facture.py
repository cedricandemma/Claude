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
import zipfile
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
    if r.numero:
        return r.numero
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


MARQUEUR = "\u27e6NUM\u27e7"
STORE_ID = "{6B2E1F4A-3C5D-4E8F-9A1B-2C3D4E5F6A7B}"
NS_FACTURE = "urn:chezspoons:facture"


def lier_numero(chemin, numero):
    """Remplace le marqueur par des contrôles de contenu Word liés à une même donnée XML.

    Modifier le numéro dans l'un d'eux (page 1) met à jour tous les autres (pieds de page des annexes).
    """
    run = re.compile(r'<w:r>(<w:rPr>(?:(?!</w:rPr>).)*</w:rPr>)?<w:t xml:space="preserve">' + MARQUEUR + r'</w:t></w:r>')
    compteur = iter(range(900001, 999999))

    def sdt(m):
        rpr = m.group(1) or ""
        return (f'<w:sdt><w:sdtPr>{rpr}<w:alias w:val="Numéro de facture"/><w:tag w:val="numero_facture"/>'
                f'<w:id w:val="{next(compteur)}"/>'
                f'<w:dataBinding w:prefixMappings="xmlns:ns0=\'{NS_FACTURE}\'" '
                f'w:xpath="/ns0:facture[1]/ns0:numero[1]" w:storeItemID="{STORE_ID}"/><w:text/></w:sdtPr>'
                f'<w:sdtContent><w:r>{rpr}<w:t xml:space="preserve">{numero}</w:t></w:r></w:sdtContent></w:sdt>')

    with zipfile.ZipFile(chemin) as z:
        parts = {n: z.read(n) for n in z.namelist()}
    for n in list(parts):
        if n.startswith("word/") and n.endswith(".xml") and MARQUEUR.encode() in parts[n]:
            parts[n] = run.sub(sdt, parts[n].decode("utf-8")).encode("utf-8")
            assert MARQUEUR.encode() not in parts[n], f"marqueur non remplacé dans {n}"
    parts["customXml/item1.xml"] = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                                    f'<facture xmlns="{NS_FACTURE}"><numero>{numero}</numero></facture>').encode()
    parts["customXml/itemProps1.xml"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>'
        f'<ds:datastoreItem ds:itemID="{STORE_ID}" '
        'xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml">'
        f'<ds:schemaRefs><ds:schemaRef ds:uri="{NS_FACTURE}"/></ds:schemaRefs></ds:datastoreItem>').encode()
    parts["customXml/_rels/item1.xml.rels"] = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
        'customXmlProps" Target="itemProps1.xml"/></Relationships>').encode()
    rels = parts["word/_rels/document.xml.rels"].decode()
    rels = rels.replace("</Relationships>",
                        '<Relationship Id="rIdFactureXml" Type="http://schemas.openxmlformats.org/officeDocument/'
                        '2006/relationships/customXml" Target="../customXml/item1.xml"/></Relationships>')
    parts["word/_rels/document.xml.rels"] = rels.encode()
    ct = parts["[Content_Types].xml"].decode()
    if 'Extension="xml"' not in ct:
        ct = ct.replace("<Default ", '<Default Extension="xml" ContentType="application/xml"/><Default ', 1)
    ct = ct.replace("</Types>", '<Override PartName="/customXml/itemProps1.xml" '
                    'ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>')
    parts["[Content_Types].xml"] = ct.encode()
    with zipfile.ZipFile(chemin, "w", zipfile.ZIP_DEFLATED) as z:
        for n in ["[Content_Types].xml"] + [n for n in parts if n != "[Content_Types].xml"]:
            z.writestr(n, parts[n])


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
    p.add_argument("--registre", default=str(ICI / "registre.json"))
    p.add_argument("--valider", action="store_true",
                   help="Inscrire les mois et les réservations facturés au registre")
    a = p.parse_args()
    au = a.au or a.du

    resas = lire_booking(a.booking) + lire_site(a.site)
    registre_path = Path(a.registre)
    if registre_path.exists():
        deja = [m for m in json.loads(registre_path.read_text())["mois"] if a.du <= m <= au]
        if deja:
            print(f"Attention : mois déjà facturés dans cette période : {', '.join(deja)}")
    mois = preparer(resas, a.du, au)
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
    lier_numero(sortie, a.numero)
    t = data["total"]
    print(f"{t['sejours']} séjours, {t['nuits']} nuits, {t['htva']:.2f} € HTVA + {t['tva']:.2f} € TVA "
          f"= {t['ttc']:.2f} € TVAC -> {sortie}")
    if a.valider:
        valider(Path(a.registre), resas, a.du, au, data)


def valider(chemin, resas, du, au, data):
    """Même registre que releve.py : les mois suivants signaleront ajouts, modifications et annulations."""
    registre = json.loads(chemin.read_text()) if chemin.exists() else {"mois": [], "reservations": {}}
    for m in data["mois"]:
        if m["mois"] not in registre["mois"]:
            registre["mois"].append(m["mois"])
    registre["mois"].sort()
    for r in resas:
        if r.statut == "ok" and du <= r.mois <= au:
            registre["reservations"][f"{r.canal}:{r.ref}"] = {"mois": r.mois, "ttc": r.montant_ttc, "nuits": r.nuits}
    registre.setdefault("factures", []).append({
        "numero": data["numero"], "date": data["date"], "du": du, "au": au,
        "ttc": data["total"]["ttc"], "htva": data["total"]["htva"], "tva": data["total"]["tva"],
    })
    chemin.write_text(json.dumps(registre, indent=2, ensure_ascii=False))
    print(f"Mois {du} à {au} inscrits au registre {chemin}")


if __name__ == "__main__":
    main()
