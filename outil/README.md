# Chez Spoons : facturation et Statbel

`chez_spoons.html` est un outil autonome : on l'ouvre dans Chrome, Edge, Firefox ou Safari, sans installation et sans connexion internet. Les fichiers déposés restent sur l'ordinateur.

## Utilisation

1. Déposer l'export Booking.com (.xls) et l'export MotoPress du site (.csv). Plusieurs fichiers sont acceptés, une même réservation n'est comptée qu'une fois.
2. Choisir la période (du / au).
3. Saisir le numéro et la date de facture.
4. Onglet Facture : « Imprimer ou enregistrer en PDF », destination « Enregistrer au format PDF ».
5. Onglet Statbel : un CSV par mois de départ, à charger dans le websurvey, avec le tableau en libellés pour une saisie manuelle.
6. Onglet Points à vérifier : annulations, doublons du site, séjours à cheval sur deux périodes.

## Règles

| Sujet | Facture | Statbel |
|---|---|---|
| Séjours retenus | Arrivée dans la période | Départ dans la période, un fichier par mois |
| Montants | Tarif Booking et Total MotoPress, TVA comprise, 12 % | Non utilisés |
| Annulations | Exclues (Booking « ok » seulement, site sans Cancelled ni Abandoned) | Exclues |
| Personnes | | Booking : colonne Personnes ; site : 2 par chambre |
| But du séjour | | Affaires (Booking) : code 3 ; sinon code 1 |
| Région BE | | Code postal du site ; sinon 1 réservation sur 5 en Wallonie, les autres en Flandre |

Les factures imprimées avec un numéro sont mémorisées dans le navigateur, et l'outil prévient si une nouvelle période recoupe une facture déjà émise (avril à septembre 2026 inclus d'office).

## Modifier l'outil

Les règles sont dans `core.js`, l'interface dans `chez_spoons.template.html`. `python3 build.py` assemble `chez_spoons.html` avec le logo et SheetJS (`vendor/xlsx.full.min.js`, licence Apache 2.0).
