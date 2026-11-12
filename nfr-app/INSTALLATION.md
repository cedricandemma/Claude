# Notes de frais : mise en service (environ 15 minutes, une seule fois)

## 1. Créer le projet Apps Script

1. Ouvrez https://script.google.com avec votre compte Google et cliquez sur **Nouveau projet**. Nommez le « Notes de frais ».
2. Dans **Paramètres du projet** (roue dentée à gauche), cochez **Afficher le fichier manifeste « appsscript.json » dans l'éditeur**.
3. Revenez à l'éditeur (`< >`) et créez les fichiers suivants, puis collez dans chacun le contenu du fichier du même nom présent dans `NFR Claude/Programme` :

| Fichier dans l'éditeur | Type | Contenu à coller |
|---|---|---|
| appsscript.json | (existant) | appsscript.json |
| Code.gs | (existant, remplacer) | Code.gs |
| Logic.gs | Script | Logic.gs |
| Ai.gs | Script | Ai.gs |
| Pdf.gs | Script | Pdf.gs |
| Seed.gs | Script | Seed.gs |
| Index | HTML | Index.html |

Pour créer un fichier : bouton **+** à côté de « Fichiers », puis **Script** ou **HTML**, et saisissez le nom sans extension.

## 2. Initialiser les données

1. En haut de l'éditeur, choisissez la fonction **setup** et cliquez sur **Exécuter**.
2. Google demande l'autorisation d'accéder à Drive, Sheets et aux services externes : acceptez (écran « Application non validée » : Paramètres avancés, puis Accéder à Notes de frais).
3. Le classeur **NFR Données** apparaît dans `NFR Claude`. Il contient les onglets Config, Personnes, Tarifs, Jours, Frais, Notes.
4. Choisissez ensuite la fonction **seedOctobre2026** et exécutez la : octobre 2026 est repris avec vos 11 justificatifs.

## 3. Publier l'application

1. **Déployer**, **Nouveau déploiement**, type **Application Web**.
2. Exécuter en tant que : **Moi**. Qui a accès : **Moi uniquement**.
3. Copiez l'URL obtenue (elle se termine par `/exec`).

Sur iPhone : ouvrez l'URL dans Safari, bouton Partager, **Sur l'écran d'accueil**. Sur ordinateur : ajoutez la en favori.

## 4. Clé API Claude (lecture automatique des tickets et vérification des tarifs)

1. Créez un compte sur https://console.anthropic.com, ajoutez un crédit (5 dollars suffisent pour de nombreux mois), puis **API Keys**, **Create Key**.
2. Dans l'application : roue dentée, collez la clé, **Enregistrer**. Elle est stockée dans les propriétés privées du script, jamais dans le classeur.

## 5. Utilisation mensuelle

1. **Au fil du mois**, touchez **+** pour photographier un ticket ou déposer un PDF ou l'Excel de la borne. L'application propose date, montant et catégorie ; pour un restaurant, indiquez la société avec qui vous avez mangé, puis **Valider**.
2. **Calendrier** : les jours ouvrables sont en prestation Flexso par défaut, les fériés belges sont exclus. Touchez un jour pour le passer en homeworking, congé, maladie ou étranger. **Saisir une période** sert aux voyages et aux congés.
3. **Note** : **Vérifier les tarifs et générer le PDF**. Tout écart de tarif trouvé sur internet vous est soumis ; rien n'est modifié sans votre clic sur **Appliquer**. Le PDF (récapitulatif et justificatifs numérotés J01, J02…) est enregistré dans le dossier du mois.

Les notes d'Emma Russell se font en choisissant son nom en haut à gauche ; ses fichiers vont dans `NFR Claude/Emma Russell`.

## Mise à jour du programme

Remplacez le contenu du fichier concerné dans l'éditeur, puis **Déployer**, **Gérer les déploiements**, crayon, **Version : nouvelle version**. L'URL reste la même.
