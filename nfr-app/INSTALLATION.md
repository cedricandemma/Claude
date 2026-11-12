# Notes de frais : mise en service (environ 15 minutes, une seule fois)

## 1. Créer le projet Apps Script

1. Ouvrez https://script.google.com avec votre compte Google et cliquez sur **Nouveau projet**. Nommez le « Notes de frais ».
2. Dans **Paramètres du projet** (roue dentée dans la barre de gauche), cochez **Afficher le fichier manifeste "appsscript.json" dans l'éditeur**.
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

Pour créer un fichier : bouton **+** à côté de **Fichiers**, puis **Script** ou **HTML**, et saisissez le nom sans extension (Logic, Ai, Pdf, Seed, Index). Le fichier Code.gs existe déjà avec une fonction myFunction : effacez tout son contenu avant de coller.

## 2. Initialiser les données

1. Enregistrez tout (icône disquette ou Ctrl+S).
2. Dans la barre au-dessus du code, à droite des boutons **Exécuter** et **Déboguer**, une liste déroulante affiche le nom d'une fonction. Ouvrez le fichier **Code.gs**, choisissez **setup** dans cette liste, puis cliquez sur **Exécuter**.
3. Une fenêtre **Autorisation requise** s'ouvre : cliquez sur **Examiner les autorisations** et choisissez votre compte Google.
4. L'écran **Google n'a pas validé cette application** apparaît. C'est normal : l'application est la vôtre et n'a pas été soumise à Google. Cliquez sur **Paramètres avancés** (en bas à gauche), puis sur **Accéder à Notes de frais (non sécurisé)**, et enfin sur **Autoriser** (ou **Continuer**).
5. Le **Journal d'exécution** en bas de l'écran affiche « Exécution terminée ». Le classeur **NFR Données** apparaît dans `NFR Claude`, avec les onglets Config, Personnes, Tarifs, Jours, Frais et Notes.
6. Ouvrez le fichier **Seed.gs**, choisissez **seedOctobre2026** dans la liste déroulante et cliquez sur **Exécuter** : octobre 2026 est repris avec vos 11 justificatifs.

Si la liste déroulante n'affiche pas **setup**, vérifiez que vous êtes bien dans Code.gs et que le fichier est enregistré.

## 3. Publier l'application

1. Bouton bleu **Déployer** en haut à droite, puis **Nouveau déploiement**.
2. Cliquez sur la roue dentée à côté de **Sélectionnez le type**, puis choisissez **Application Web**.
3. Description : « Notes de frais ». **Exécuter en tant que** : Moi. **Qui a accès** : Moi uniquement. Cliquez sur **Déployer**.
4. Copiez l'**URL** de l'application Web (elle se termine par `/exec`).

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

Remplacez le contenu du fichier concerné dans l'éditeur et enregistrez, puis **Déployer**, **Gérer les déploiements**, icône crayon (**Modifier**), **Version** : **Nouvelle version**, et **Déployer**. L'URL reste la même.

## Montants et Google en français

Dans l'application, les montants se saisissent avec une virgule (116,50). Dans le classeur NFR Données, Google Sheets en français attend aussi la virgule : tapez 22,08 pour un tarif et 0,42 pour la quote-part du domicile. Les dates de l'onglet Tarifs restent au format 2026-09-01.
