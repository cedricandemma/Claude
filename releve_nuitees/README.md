# Relevé mensuel des nuitées

Cet outil produit chaque mois le relevé des nuitées (Booking.com et site direct) qui accompagne la facture envoyée au comptable.

## Utilisation mensuelle

1. Dans l'extranet Booking, ouvrez Réservations, filtrez sur les arrivées de la période et téléchargez l'export (.xls).
2. Dans WordPress, exportez les réservations MotoPress Hotel Booking (.csv) pour la même période.
3. Déposez les deux fichiers dans le dossier Drive « Bookings Claude ».
4. Lancez :

```
python releve.py --periode 2026-09 --booking "Arrivée du ....xls" --site mphb-bookings-....csv
```

5. Relisez l'onglet « Points à vérifier », reportez la synthèse sur la facture, puis relancez avec `--valider` pour inscrire le mois au registre.

Les exports peuvent couvrir plusieurs mois. L'outil ne garde que les séjours dont la première nuitée tombe dans la période, et utilise le reste pour contrôler les mois déjà facturés.

## Règles appliquées

| Sujet | Règle |
|---|---|
| Rattachement | Mois de la première nuitée, même si le séjour se termine le mois suivant |
| TVA | 12 % pour les séjours depuis le 01/03/2026, 6 % avant |
| Régime transitoire | Réservé avant le 01/03/2026 et arrivée avant le 01/07/2026 : 6 % |
| Montants | Tarif Booking et Total MotoPress considérés TVA comprise ; HTVA et TVA calculés par séjour, par formule Excel |
| Commission Booking | Information uniquement, elle n'entre pas dans la facture |
| Annulations Booking | Exclues des nuitées et signalées si un montant subsiste |
| Doublons MotoPress | Une réservation abandonnée identique à une réservation payée est écartée et signalée |

## Registre et régularisations

`--valider` enregistre dans `registre.json` les réservations facturées et leur montant. Lors des mois suivants, l'outil compare ce registre aux nouveaux exports et ajoute une ligne de régularisation lorsqu'une réservation d'un mois déjà facturé est apparue, a changé de montant ou a été annulée. Une réservation qui disparaît de l'export du site est signalée dans « Points à vérifier », car MotoPress n'exporte pas le statut.

## Dépendances

```
pip install pandas xlrd openpyxl
```

## Facture Word « Clients divers »

`facture.py` produit la facture Word à partir des mêmes exports, sur un ou plusieurs mois. Toutes les nuitées y sont à 12 %.

```
python facture.py --du 2026-07 --au 2026-09 --booking "Arrivée du ....xls" --site mphb-bookings-....csv \
    --numero 2026-SB-03 --date 30/09/2026
```

La première page porte le logo, les coordonnées de la société, le récapitulatif par mois et les totaux. L'annexe en format paysage reprend le détail par réservation : canal, numéro de réservation, client, chambre, arrivée, départ, nuits, montant TVAC, taux de TVA, montant HTVA et TVA, avec un sous-total par mois.

Le numéro de facture est un champ lié : le modifier en page 1, à l'intérieur de son cadre, met à jour le pied de page des annexes. `--valider` inscrit les mois, les réservations et la facture au registre partagé avec `releve.py` ; l'outil prévient ensuite si une nouvelle facture couvre un mois déjà facturé.

Le rendu Word passe par `facture.js`, qui demande Node.js et le paquet npm `docx`. Le logo est dans `assets/logo_chez_spoons.png`.

## Historique

Avril à septembre 2026 : facturés (facture 2026-SB-XX du 30/09/2026, 9 371,89 € TVAC, numéro définitif attribué dans le logiciel comptable). Le prochain mois à traiter est octobre 2026.
