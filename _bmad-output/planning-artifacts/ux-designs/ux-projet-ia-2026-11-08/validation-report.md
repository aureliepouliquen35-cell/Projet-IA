# Rapport de validation UX — Nova Services

- **DESIGN.md :** `DESIGN.md`
- **EXPERIENCE.md :** `EXPERIENCE.md`
- **Source :** `../../prds/prd-projet-ia-2026-11-08/prd.md`
- **Date :** 2026-11-08
- **Relecture :** grille de contrôle bmad-ux, passée directement (pas de relecteurs en sous-agents)

## Verdict d'ensemble

Les deux documents forment un contrat solide pour la suite : les 4 parcours du PRD sont couverts, chacun avec un personnage, des étapes numérotées, un moment clé et un cas d'échec. Les trois écrans clés (formulaire, liste, détail) sont décrits dans leurs quatre états, et toutes les références de tokens existent. Aucun problème critique.

Les manques sont surtout sur les bords : 2 situations de session non prévues (compte désactivé ou rétrogradé pendant qu'on est connecté, pas de bouton « Se déconnecter » sur l'écran du premier mot de passe), 2 fonctions Must sans parcours (suppression RGPD, réinitialisation de mot de passe), des états incomplets sur les écrans d'administration, et quelques composants dessinés dans les maquettes mais sans fiche visuelle. Il reste 21 hypothèses non confirmées, dont 6 méritent un vrai regard.

**Problèmes :** Critique 0 · Élevée 2 · Moyenne 8 · Faible 8

## Verdicts par catégorie

- Couverture des parcours — **correct**
- Complétude des tokens — **solide**
- Couverture des composants — **correct**
- Couverture des états — **correct**
- Couverture des références visuelles — **solide**
- Surcharge et sur-spécification — **solide**
- Fidélité aux sources — **solide**
- Conformité de structure — **solide**

## Matrice fonctions → écrans → parcours

| FR | Priorité | Écran | Parcours | État | Problème |
|---|---|---|---|---|---|
| FR-1 | Must | P1 | Flux 1 | ✅ |  |
| FR-2 | Must | P1 | Flux 1 | ✅ |  |
| FR-3 | Must | P1 → P2 | Flux 1 | ✅ |  |
| FR-4 | Must | P2 | Flux 1 | ✅ |  |
| FR-5 | Must | P1 | Flux 1 | ✅ |  |
| FR-6 | Should | P1 | — (invisible pour un humain) | ✅ |  |
| FR-7 | Could | e-mail | — | ⚠️ | F15 |
| FR-8 | Must | I1 | Flux 2 | ✅ |  |
| FR-9 | Must | Menu, I1 | Flux 2 | ⚠️ | F2 |
| FR-10 | Must | I1 (redirection) | Flux 2 | ✅ |  |
| FR-11 | Must | I3 | Flux 2 | ✅ |  |
| FR-12 | Must | I3 | Flux 2 | ✅ |  |
| FR-13 | Must | I3 | Flux 2 | ✅ |  |
| FR-14 | Must | I3 | Flux 2 | ✅ |  |
| FR-15 | Must | I4 | Flux 2 | ✅ |  |
| FR-16 | Must | I4 | Flux 2 | ✅ |  |
| FR-17 | Must | I4 | Flux 2 | ✅ | F14 |
| FR-18 | Should | I4 | Flux 2 | ✅ | F13 |
| FR-19 | Should | I3, I4 | — | ⚠️ | F12 |
| FR-20 | Should | I4 | Flux 2 | ✅ |  |
| FR-21 | Must | A1, I2 | Flux 3 | ✅ |  |
| FR-22 | Must | A1 | Flux 3 | ⚠️ | F1, F4 |
| FR-23 | Must | A1 | — | ⚠️ | F4 |
| FR-24 | Must | Menu, S1 | Flux 3 | ✅ | F1 |
| FR-25 | Must | A1 | Flux 3 (cas limite) | ✅ |  |
| FR-26 | Must | A2 | Flux 3 | ⚠️ | F6, F9 |
| FR-27 | Must | aucun écran (voulu) | — | ✅ |  |
| FR-28 | Must | I4 | — | ⚠️ | F3 |
| FR-29 | Should | A4 | — (acceptable) | ✅ | F7 |
| FR-30 | Must | I5 | Flux 4 | ✅ | F11 |
| FR-31 | Must | A3 | — (simple réglage) | ⚠️ | F7 |
| FR-32 | Could | e-mail | — | ⚠️ | F15 |

## Problèmes par gravité

### Critique (0)

### Élevée (2)

**F1 · [Couverture des états]** — Compte désactivé ou rétrogradé pendant qu'il est connecté : rien n'est prévu à l'écran (EXPERIENCE.md › State Patterns · FR-22)
Le PRD dit que la personne perd l'accès « au plus tard à sa prochaine action », mais aucun écran ne dit ce qu'elle voit alors. Le développeur devrait l'inventer.
*Correction :* Compte désactivé : à sa prochaine action, retour à la connexion avec un message neutre : « Votre session a pris fin. Contactez votre administrateur si besoin. » Administrateur rétrogradé : la section Administration disparaît du menu ; s'il était sur une page d'administration, il voit la page S1 « Accès refusé ».

**F2 · [Couverture des états]** — L'écran I2 (premier mot de passe) n'a pas de bouton « Se déconnecter » (EXPERIENCE.md › I2 · FR-9)
FR-9 exige le bouton sur toutes les pages internes. Or I2 n'a pas de menu latéral, donc pas de bouton. Quelqu'un qui s'est trompé de compte resterait bloqué.
*Correction :* Ajouter un lien « Se déconnecter » en haut à droite de I2.

### Moyenne (8)

**F3 · [Couverture des parcours]** — La suppression d'une demande (FR-28, Must, RGPD) n'a pas de parcours (EXPERIENCE.md › Key Flows)
La fenêtre de confirmation est décrite, mais pas le chemin complet : comment l'administratrice retrouve les demandes de la personne, puis vérifie qu'elles ont disparu.
*Correction :* Ajouter un flux 5 : Sophie reçoit une demande d'effacement par e-mail. Elle cherche l'e-mail de la personne dans la liste, trouve 2 demandes, ouvre chacune, clique « Supprimer la demande… » et confirme. Au moment clé, la recherche n'affiche plus que « Aucune demande trouvée ». Cas limite : un collègue avait la demande ouverte ; à sa prochaine action, il voit « Cette demande n'existe pas ou a été supprimée ».

**F4 · [Couverture des états]** — Les fenêtres « Modifier un compte » et « Réinitialiser le mot de passe » ne sont pas décrites (EXPERIENCE.md › A1 · FR-22, FR-23)
Seule la création de compte est détaillée. FR-23 est un Must.
*Correction :* Modifier : champs Nom et Rôle ; l'e-mail est affiché mais non modifiable (le PRD ne prévoit que nom et rôle). Réinitialiser : même principe que la création (nouveau mot de passe temporaire, bouton « Générer », affiché une seule fois avec « Copier »), avec le rappel « L'ancien mot de passe ne fonctionne plus. Cette personne devra en choisir un nouveau à sa prochaine connexion. »

**F5 · [Couverture des états]** — Pas de message quand un champ dépasse sa longueur maximale (EXPERIENCE.md › P1 · FR-1)
Le PRD fixe des limites : nom 100, e-mail 100, téléphone 30, entreprise 100, objet 150, description 5 000. Seul le minimum de la description a un message.
*Correction :* On ne coupe jamais le texte sans prévenir. Un compteur s'affiche sous l'objet (« 42 / 150 ») comme sous la description. Au-delà de la limite, le compteur passe en rouge et le message dit : « L'objet ne doit pas dépasser 150 caractères. » Même règle pour les autres champs.

**F6 · [Couverture des états]** — Les catégories désactivées : affichage non précisé dans le filtre et le détail (EXPERIENCE.md › I3, I4 · FR-26, RM-11)
Le PRD dit qu'elles restent sur les demandes et « restent filtrables ».
*Correction :* Filtre Catégorie : d'abord les catégories actives, puis, sous un trait, les désactivées suivies de « (désactivée) ». Détail : le nom suivi de « (désactivée) ». P1 et I5 ne proposent que les actives.

**F7 · [Couverture des états]** — États incomplets sur I2, A2, A3 et A4 (EXPERIENCE.md › I2, A2, A3, A4)
Il manque notamment l'erreur « e-mail de contact invalide » exigée par FR-31, la confirmation avant de supprimer une catégorie, l'état « anonymisation en cours » et son échec, ainsi que les chargements.
*Correction :* Ajouter pour chacun un petit tableau d'états (vide, chargement, erreur, complet), comme pour les autres écrans. Par exemple, A3 : « L'e-mail doit avoir la forme nom@exemple.fr ».

**F8 · [Couverture des états]** — Pas d'écran « erreur inattendue » (EXPERIENCE.md › IA, State Patterns · NFR-9)
Si une page plante, rien n'est prévu. Or le support doit transmettre l'heure, la page et le message d'erreur (NFR-9).
*Correction :* Ajouter un écran S3 : « Une erreur inattendue s'est produite. » avec un bouton « Réessayer », un lien « Retour aux demandes », et une ligne à recopier pour le support : heure, page et code court de l'erreur.

**F9 · [Couverture des états]** — La dernière catégorie active pourrait être supprimée (EXPERIENCE.md › A2 · FR-26 (trou du PRD))
Le PRD interdit de désactiver la dernière catégorie active, mais pas de la supprimer si elle n'a jamais servi. Le formulaire deviendrait alors inutilisable.
*Correction :* Appliquer la même règle à la suppression, avec le même message : « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. » Noter cette règle comme nouvelle hypothèse (E-H13), à reporter dans le PRD plus tard.

**F10 · [Couverture des composants]** — Une dizaine de composants dessinés dans les maquettes n'ont pas de fiche visuelle (DESIGN.md › Components)
Encadré d'information, toast, bouton de filtre, case à cocher, liste déroulante, choix Normale / Urgente, pagination, fil d'Ariane, squelette de chargement, pastille d'icône.
*Correction :* Ajouter une fiche courte pour chacun dans DESIGN.md, avec deux nouveaux tokens : alert-info et toast. Les valeurs sont reprises des maquettes, rien de nouveau visuellement.

### Faible (8)

**F11 · [Couverture des parcours]** — Le flux 4 (Karim au téléphone) n'a pas de cas d'échec (EXPERIENCE.md › Flux 4)
Les autres flux en ont un.
*Correction :* Karim oublie de cocher « La personne a été informée… » : l'enregistrement est refusé, le message apparaît sous la case et rien n'est perdu.

**F12 · [Couverture des parcours]** — La priorité Urgente (FR-19) n'apparaît dans aucun parcours (EXPERIENCE.md › Key Flows)
L'écran la prévoit, mais aucun parcours ne montre son effet sur le compteur.
*Correction :* Dans le flux 4, le prospect dit que c'est bloquant : Karim passe la demande en Urgente. Le badge apparaît dans la liste et la demande compte dans « à traiter » tant qu'elle n'est pas traitée. (Should)

**F13 · [Couverture des états]** — Demande attribuée à un compte ensuite désactivé : affichage non précisé (EXPERIENCE.md › I3, I4 · FR-18)
Le cas se produit au départ de Lucas (flux 3).
*Correction :* Afficher « Lucas Bernard (désactivé) » dans la liste et le détail. Le filtre Attribution le propose encore, mais la liste pour réattribuer ne montre que les comptes actifs.

**F14 · [Couverture des états]** — Auteur de l'événement d'anonymisation non précisé (EXPERIENCE.md › I4 · FR-17, FR-29)
FR-17 prévoit « Système » pour une anonymisation automatique.
*Correction :* Ligne d'historique « Données personnelles anonymisées », avec pour auteur l'administrateur qui l'a lancée, ou « Système » si elle est automatique (Could).

**F15 · [Couverture des parcours]** — Contenu des deux e-mails (FR-7, FR-32, Could) non décrit (EXPERIENCE.md · FR-7, FR-32)
Ce sont aussi des écrans, au sens où quelqu'un les lit.
*Correction :* FR-7, e-mail au demandeur : objet « Votre demande NOVA-2026-0042 est enregistrée », rappel de l'objet et du téléphone de contact. FR-32, e-mail interne : « Nouvelle demande NOVA-2026-0042 : {objet} », un lien vers le détail, jamais la description. L'écran P2 ne promet pas d'e-mail, car son envoi peut échouer.

**F16 · [Fidélité aux sources]** — Petits écarts entre le texte et les maquettes (EXPERIENCE.md › IA ; mockups/)
Le menu est décrit avec le nombre « entre parenthèses », alors que la maquette montre une pastille. La mention « Priorité normale » est affichée dans le détail sans être décrite. Une couleur (#3B2A6B) est codée en dur dans la mention sur les données.
*Correction :* Écrire « pastille » dans le texte. Préciser : priorité normale affichée discrètement dans le détail, jamais dans la liste. Remplacer #3B2A6B par le token {colors.text}.

**F17 · [Fidélité aux sources]** — Le nombre de résultats n'est pas annoncé aux lecteurs d'écran (EXPERIENCE.md › Accessibility Floor)
Quand on change un filtre, une personne aveugle ne sait pas que la liste a changé.
*Correction :* Ajouter : « 42 demandes » est annoncé à chaque changement de recherche ou de filtre.

**F18 · [Couverture des références visuelles]** — DESIGN.md ne renvoie pas à chaque maquette (DESIGN.md › en-tête)
Il renvoie seulement au dossier mockups/.
*Correction :* Lister les 3 maquettes et ce que chacune illustre.

## Hypothèses non confirmées (21)

| Type | # | Hypothèse |
|---|---|---|
| À regarder | D-H1 | Le logo : carré bleu, étoile violette à 4 branches, « Nova Services » |
| À regarder | E-H1 | Vouvoiement partout, y compris entre collègues dans l'espace interne |
| À regarder | E-H2 | Pas de tableau de bord : l'accueil interne est la liste des demandes |
| À regarder | E-H4 | Les actions du détail s'appliquent au clic, sans bouton « Enregistrer » |
| À regarder | E-H5 | Pas de confirmation pour changer de statut, sauf pour « Rouvrir » |
| À regarder | E-H12 | La liste n'affiche ni l'e-mail ni le téléphone du demandeur |
| Choix courant | D-H2 | Police Inter |
| Choix courant | D-H3 | Statuts : bleu, ambre, vert ; Urgente en rouge |
| Choix courant | D-H4 | Pas de mode sombre en v1 |
| Choix courant | D-H5 | Menu latéral à gauche |
| Choix courant | D-H6 | Détail en deux colonnes |
| Choix courant | D-H7 | Pas de bibliothèque de composants imposée |
| Choix courant | D-H8 | Accent violet améthyste #6D28D9 |
| Choix courant | D-H9 | Icônes au trait type Lucide |
| Choix courant | E-H3 | Organisation du menu par rôle |
| Choix courant | E-H6 | Filtres gardés dans l'adresse de la page |
| Choix courant | E-H7 | Recherche 300 ms après la dernière frappe |
| Choix courant | E-H8 | Message « modifiée entre-temps » |
| Choix courant | E-H9 | Retour à la page demandée après une session expirée |
| Choix courant | E-H10 | Liste interne en cartes sur téléphone |
| Choix courant | E-H11 | Pas de raccourcis clavier spéciaux |

## Fichiers
- `review-rubric.md`
- `validation-report.html`
