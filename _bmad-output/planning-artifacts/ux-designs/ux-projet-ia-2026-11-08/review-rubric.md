# Relecture des documents UX — projet-ia (Nova Services)

## Verdict d'ensemble
Les deux documents forment un contrat solide pour la suite : les 4 parcours du PRD sont couverts, chacun avec un personnage, des étapes numérotées, un moment clé et un cas d'échec. Les trois écrans clés (formulaire, liste, détail) sont décrits dans leurs quatre états, et toutes les références de tokens existent. Aucun problème critique.

Les manques sont surtout sur les bords : 2 situations de session non prévues (compte désactivé ou rétrogradé pendant qu'on est connecté, pas de bouton « Se déconnecter » sur l'écran du premier mot de passe), 2 fonctions Must sans parcours (suppression RGPD, réinitialisation de mot de passe), des états incomplets sur les écrans d'administration, et quelques composants dessinés dans les maquettes mais sans fiche visuelle. Il reste 21 hypothèses non confirmées, dont 6 méritent un vrai regard.

## 1. Couverture des parcours — correct
Chaque UJ du PRD (UJ-1 à UJ-4) a son flux, avec un personnage, des étapes, un moment clé et un cas d'échec, sauf le flux 4, qui n'a pas d'échec. Sur 32 fonctions (FR), 26 ont un écran et un parcours, ou n'en ont pas besoin. 6 ont un écran mais pas de parcours (FR-19, FR-23, FR-28 surtout) ou un contenu non décrit (FR-7, FR-32, des e-mails, en Could). Voir la matrice ci-dessous.
### Problèmes
- **medium** F3 · La suppression d'une demande (FR-28, Must, RGPD) n'a pas de parcours (EXPERIENCE.md › Key Flows). *Correction :* Ajouter un flux 5 : Sophie reçoit une demande d'effacement par e-mail. Elle cherche l'e-mail de la personne dans la liste, trouve 2 demandes, ouvre chacune, clique « Supprimer la demande… » et confirme. Au moment clé, la recherche n'affiche plus que « Aucune demande trouvée ». Cas limite : un collègue avait la demande ouverte ; à sa prochaine action, il voit « Cette demande n'existe pas ou a été supprimée ».
- **low** F11 · Le flux 4 (Karim au téléphone) n'a pas de cas d'échec (EXPERIENCE.md › Flux 4). *Correction :* Karim oublie de cocher « La personne a été informée… » : l'enregistrement est refusé, le message apparaît sous la case et rien n'est perdu.
- **low** F12 · La priorité Urgente (FR-19) n'apparaît dans aucun parcours (EXPERIENCE.md › Key Flows). *Correction :* Dans le flux 4, le prospect dit que c'est bloquant : Karim passe la demande en Urgente. Le badge apparaît dans la liste et la demande compte dans « à traiter » tant qu'elle n'est pas traitée. (Should)
- **low** F15 · Contenu des deux e-mails (FR-7, FR-32, Could) non décrit (EXPERIENCE.md · FR-7, FR-32). *Correction :* FR-7, e-mail au demandeur : objet « Votre demande NOVA-2026-0042 est enregistrée », rappel de l'objet et du téléphone de contact. FR-32, e-mail interne : « Nouvelle demande NOVA-2026-0042 : {objet} », un lien vers le détail, jamais la description. L'écran P2 ne promet pas d'e-mail, car son envoi peut échouer.

## 2. Complétude des tokens — solide
Les 31 couleurs ont toutes une valeur hexadécimale. Toutes les références {chemin.token} du texte existent. Les contrastes des combinaisons importantes sont donnés (statuts, bouton principal, accent). Seule remarque : une couleur est codée en dur dans une maquette (voir F16).

## 3. Couverture des composants — correct
Boutons, champs, badges, carte compteur, tableau, menu, historique, alertes et fenêtre de confirmation ont une fiche visuelle et une règle de comportement. Une dizaine de petits composants visibles dans les maquettes n'ont pas de fiche visuelle dans DESIGN.md.
### Problèmes
- **medium** F10 · Une dizaine de composants dessinés dans les maquettes n'ont pas de fiche visuelle (DESIGN.md › Components). *Correction :* Ajouter une fiche courte pour chacun dans DESIGN.md, avec deux nouveaux tokens : alert-info et toast. Les valeurs sont reprises des maquettes, rien de nouveau visuellement.

## 4. Couverture des états — correct
P1, P2, I1, I3 et I4 sont très bien couverts (vide, chargement, erreur, complet, plus les cas particuliers). Les écrans d'administration A2, A3, A4 et l'écran I2 n'ont que des messages d'erreur partiels. Deux situations de session et plusieurs cas limites des catégories et des comptes manquent.
### Problèmes
- **high** F1 · Compte désactivé ou rétrogradé pendant qu'il est connecté : rien n'est prévu à l'écran (EXPERIENCE.md › State Patterns · FR-22). *Correction :* Compte désactivé : à sa prochaine action, retour à la connexion avec un message neutre : « Votre session a pris fin. Contactez votre administrateur si besoin. » Administrateur rétrogradé : la section Administration disparaît du menu ; s'il était sur une page d'administration, il voit la page S1 « Accès refusé ».
- **high** F2 · L'écran I2 (premier mot de passe) n'a pas de bouton « Se déconnecter » (EXPERIENCE.md › I2 · FR-9). *Correction :* Ajouter un lien « Se déconnecter » en haut à droite de I2.
- **medium** F4 · Les fenêtres « Modifier un compte » et « Réinitialiser le mot de passe » ne sont pas décrites (EXPERIENCE.md › A1 · FR-22, FR-23). *Correction :* Modifier : champs Nom et Rôle ; l'e-mail est affiché mais non modifiable (le PRD ne prévoit que nom et rôle). Réinitialiser : même principe que la création (nouveau mot de passe temporaire, bouton « Générer », affiché une seule fois avec « Copier »), avec le rappel « L'ancien mot de passe ne fonctionne plus. Cette personne devra en choisir un nouveau à sa prochaine connexion. »
- **medium** F5 · Pas de message quand un champ dépasse sa longueur maximale (EXPERIENCE.md › P1 · FR-1). *Correction :* On ne coupe jamais le texte sans prévenir. Un compteur s'affiche sous l'objet (« 42 / 150 ») comme sous la description. Au-delà de la limite, le compteur passe en rouge et le message dit : « L'objet ne doit pas dépasser 150 caractères. » Même règle pour les autres champs.
- **medium** F6 · Les catégories désactivées : affichage non précisé dans le filtre et le détail (EXPERIENCE.md › I3, I4 · FR-26, RM-11). *Correction :* Filtre Catégorie : d'abord les catégories actives, puis, sous un trait, les désactivées suivies de « (désactivée) ». Détail : le nom suivi de « (désactivée) ». P1 et I5 ne proposent que les actives.
- **medium** F7 · États incomplets sur I2, A2, A3 et A4 (EXPERIENCE.md › I2, A2, A3, A4). *Correction :* Ajouter pour chacun un petit tableau d'états (vide, chargement, erreur, complet), comme pour les autres écrans. Par exemple, A3 : « L'e-mail doit avoir la forme nom@exemple.fr ».
- **medium** F8 · Pas d'écran « erreur inattendue » (EXPERIENCE.md › IA, State Patterns · NFR-9). *Correction :* Ajouter un écran S3 : « Une erreur inattendue s'est produite. » avec un bouton « Réessayer », un lien « Retour aux demandes », et une ligne à recopier pour le support : heure, page et code court de l'erreur.
- **medium** F9 · La dernière catégorie active pourrait être supprimée (EXPERIENCE.md › A2 · FR-26 (trou du PRD)). *Correction :* Appliquer la même règle à la suppression, avec le même message : « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. » Noter cette règle comme nouvelle hypothèse (E-H13), à reporter dans le PRD plus tard.
- **low** F13 · Demande attribuée à un compte ensuite désactivé : affichage non précisé (EXPERIENCE.md › I3, I4 · FR-18). *Correction :* Afficher « Lucas Bernard (désactivé) » dans la liste et le détail. Le filtre Attribution le propose encore, mais la liste pour réattribuer ne montre que les comptes actifs.
- **low** F14 · Auteur de l'événement d'anonymisation non précisé (EXPERIENCE.md › I4 · FR-17, FR-29). *Correction :* Ligne d'historique « Données personnelles anonymisées », avec pour auteur l'administrateur qui l'a lancée, ou « Système » si elle est automatique (Could).

## 5. Couverture des références visuelles — solide
Les 3 maquettes sont liées depuis l'écran qu'elles illustrent dans EXPERIENCE.md. La règle « les documents l'emportent sur les maquettes » est écrite. DESIGN.md ne renvoie qu'au dossier, pas à chaque maquette.
### Problèmes
- **low** F18 · DESIGN.md ne renvoie pas à chaque maquette (DESIGN.md › en-tête). *Correction :* Lister les 3 maquettes et ce que chacune illustre.

## 6. Surcharge et sur-spécification — solide
Pas de répétition inutile du PRD : les exigences sont citées par leur numéro. Les tableaux sont utilisés là où ils aident. Le petit lexique et les explications sont utiles pour un lecteur débutant.

## 7. Fidélité aux sources — solide
Les chemins sources: sont valides. Les noms UJ, les termes du glossaire et les textes imposés par le PRD (« Votre demande a bien été enregistrée », « Aucune demande trouvée », « Identifiants incorrects », message du dernier administrateur) sont repris mot pour mot. Quelques petites divergences entre texte et maquettes.
### Problèmes
- **low** F16 · Petits écarts entre le texte et les maquettes (EXPERIENCE.md › IA ; mockups/). *Correction :* Écrire « pastille » dans le texte. Préciser : priorité normale affichée discrètement dans le détail, jamais dans la liste. Remplacer #3B2A6B par le token {colors.text}.
- **low** F17 · Le nombre de résultats n'est pas annoncé aux lecteurs d'écran (EXPERIENCE.md › Accessibility Floor). *Correction :* Ajouter : « 42 demandes » est annoncé à chaque changement de recherche ou de filtre.

## 8. Conformité de structure — solide
DESIGN.md suit l'ordre canonique des sections. EXPERIENCE.md contient toutes les sections obligatoires, plus Responsive & Platform (justifiée : deux surfaces) et deux sections inventées utiles (Contenu des écrans, Données personnelles à l'écran). La section Inspiration n'est pas nécessaire : aucun produit de référence n'est cité.

## Notes mécaniques
- Tous les `{chemin.token}` cités dans le texte existent dans le frontmatter de DESIGN.md.
- Les chemins `sources:` des deux documents mènent bien au PRD.
- Les noms des composants sont identiques dans les deux documents.
- Pas de diagramme Mermaid à vérifier.
