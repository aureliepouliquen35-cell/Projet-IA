---
name: Nova Services — Gestion des demandes
status: final
created: 2026-11-08
updated: 2026-11-08
sources:
  - ../../prds/prd-projet-ia-2026-11-08/prd.md
design: DESIGN.md
---

# EXPERIENCE.md — Nova Services

> **Ce document décrit comment l'application fonctionne pour ses utilisateurs** : quels écrans existent, ce qu'il y a sur chacun, ce qui se passe quand on agit, et ce qu'on affiche quand il n'y a rien, quand ça charge ou quand ça échoue. L'aspect visuel (couleurs, police, boutons) est dans [DESIGN.md](DESIGN.md). Les références comme `{colors.primary}` renvoient à ses tokens.
>
> Ce document ne répète pas les exigences du PRD : il les cite (FR-x, RM-x, UJ-x) et décrit leur traduction à l'écran.
>
> Les éléments marqués **(Should)** ne sont à réaliser qu'une fois tous les Must terminés (PRD §8.1). L'écran prévoit leur place, mais il doit fonctionner sans eux.
>
> Maquettes : [mockups/](mockups/). **En cas de désaccord entre une maquette et ce document, ce document l'emporte.** Les choix marqués `[HYPOTHÈSE]` ont tous été **confirmés par Aurel le 8 novembre 2026**. Ils sont regroupés à la fin.
>
> **État :** document validé le 8 novembre 2026 (rapport : [validation-report.md](validation-report.md), 18 corrections intégrées).

**Petit lexique**
- **Parcours** : la suite d'écrans et d'actions d'une personne pour atteindre un but (déposer une demande, traiter sa matinée…).
- **État d'un écran** : ce qu'affiche l'écran selon la situation. On en distingue quatre : **vide** (il n'y a encore rien à montrer), **chargement** (les données arrivent), **erreur** (quelque chose a échoué), **complet** (le cas normal, avec des données).
- **Squelette de chargement** : des blocs gris à la forme du contenu attendu, affichés pendant le chargement, pour que l'écran ne « saute » pas.
- **Toast** : petit message temporaire en bas de l'écran (« Statut mis à jour »), qui disparaît seul.
- **Fenêtre de confirmation** : fenêtre qui s'ouvre par-dessus la page pour faire confirmer une action importante.

## Foundation

- **Application web**, sans installation (NFR-1). Deux surfaces :
  - **Partie publique** (formulaire de dépôt, confirmation), pensée **téléphone d'abord** (décision d'Aurel). Elle doit être parfaite à 360 px de large (NFR-12).
  - **Espace interne** (connexion, demandes, administration), pensé **ordinateur d'abord** (décision d'Aurel), utilisable sur tablette.
- **Interface en français**, vouvoiement partout. `[HYPOTHÈSE]`
- **Système d'interface :** aucune bibliothèque de composants imposée. Les tokens de [DESIGN.md](DESIGN.md) sont pensés pour Tailwind CSS 4, déjà installé. Le choix d'une bibliothèque (par exemple shadcn/ui) revient à l'architecture ; elle devra alors reprendre ces tokens. `[HYPOTHÈSE]`
- **Rôles** (FR-24) : le **collaborateur** voit les demandes ; l'**administrateur** voit en plus une section *Administration*. Un collaborateur **ne voit aucun** menu ni bouton d'administration.

## Information Architecture

| Code | Écran | Accès | On y arrive depuis | But | Exigences |
|---|---|---|---|---|---|
| **P1** | Formulaire de dépôt | Public | Lien depuis le site de Nova | Déposer une demande | FR-1, FR-2, FR-5, FR-6 |
| **P2** | Confirmation | Public | Envoi réussi de P1 | Prouver l'enregistrement, donner la référence | FR-4, FR-31 |
| **I1** | Connexion | Public | Toute page interne sans session | Entrer dans l'espace interne | FR-8, FR-10 |
| **I2** | Choisir un nouveau mot de passe | Interne, bloquant | I1, à la première connexion ou après une réinitialisation | Remplacer le mot de passe temporaire | FR-21, FR-23 |
| **I3** | **Demandes** (accueil interne) | Interne | I1, menu « Demandes » | Voir, chercher, filtrer, repérer ce qui est à traiter | FR-11 à FR-14 |
| **I4** | Détail d'une demande | Interne | Clic sur une ligne de I3 | Lire, changer le statut, suivre l'historique | FR-15 à FR-20, FR-28 |
| **I5** | Nouvelle demande (saisie interne) | Interne | Menu « Nouvelle demande », bouton dans I3 | Saisir une demande reçue par téléphone ou par email | FR-30 |
| **A1** | Comptes | Administrateur | Menu « Administration › Comptes » | Créer, modifier, désactiver, réinitialiser | FR-21 à FR-23, FR-25 |
| **A2** | Catégories | Administrateur | Menu « Administration › Catégories » | Ajouter, renommer, désactiver, supprimer | FR-26 |
| **A3** | Informations générales | Administrateur | Menu « Administration › Informations générales » | Contacts affichés aux demandeurs | FR-31 |
| **A4** | Données personnelles **(Should)** | Administrateur | Menu « Administration › Données personnelles » | Lancer l'anonymisation | FR-29 |
| **S1** | Accès refusé | Interne | Adresse d'administration tapée par un collaborateur | Expliquer le refus | FR-24 |
| **S2** | Page introuvable | Tous | Adresse inconnue, demande supprimée | Ramener vers un écran utile | FR-28 |
| **S3** | Erreur inattendue | Tous | Panne d'une page | Permettre de réessayer et donner au support les informations utiles | NFR-9 |
| **E1, E2** | E-mails **(Could)** | Boîte de réception | Dépôt d'une demande | Confirmer au demandeur, prévenir les utilisateurs internes | FR-7, FR-32 |

**Menu latéral de l'espace interne** `[HYPOTHÈSE]` :
- *Demandes*, avec une **pastille** qui affiche le nombre à traiter ;
- *Nouvelle demande* ;
- *Administration* (titre de section, **administrateur seulement**) : *Comptes*, *Catégories*, *Informations générales*, *Données personnelles* (Should) ;
- en bas : nom, rôle, « Se déconnecter » (FR-9), numéro de version (NFR-4).

Il n'y a **pas** de tableau de bord séparé : l'accueil interne **est** la liste des demandes, avec le compteur en haut. Ainsi, Karim voit « 5 à traiter » dès la connexion (FR-14) sans clic supplémentaire. `[HYPOTHÈSE]`

**Fermeture :** chaque besoin du PRD §2.2 a son écran, et chaque écran sert au moins un parcours (voir [Key Flows](#key-flows)).

## Contenu des écrans

Pour chaque écran : ce qu'il contient, de haut en bas, puis ses quatre états.

### P1 — Formulaire de dépôt *(maquette : [mockups/key-formulaire-depot.html](mockups/key-formulaire-depot.html))*

1. En-tête : « Nova Services ».
2. Titre `page-title` : « Déposer une demande ». Sous-titre : « Nous vous répondons par email ou par téléphone. »
3. Phrase : « Les champs marqués * sont obligatoires. »
4. Bloc **Vos coordonnées** : Nom et prénom *, Email *, Téléphone, Entreprise.
5. Bloc **Votre demande** : Catégorie * (liste des catégories **actives**, aucune présélectionnée, premier choix « Choisissez une catégorie »), Objet * (avec le compteur « 0 / 150 »), Description * (avec le compteur « 0 / 5 000 » et l'aide « 10 caractères minimum »).
6. **Mention sur les données** (FR-5), dans un encadré gris :
   > Vos données (nom, coordonnées et contenu de votre demande) sont utilisées par Nova Services uniquement pour traiter votre demande. Elles sont conservées 3 ans après sa clôture. Pour les consulter ou les faire supprimer : *{contact données personnelles, FR-31}*.
7. Case obligatoire : « J'ai pris connaissance de l'usage de mes données. * »
8. Bouton principal pleine largeur : « Envoyer ma demande ».
9. Champ caché anti-robots (FR-6, Should), invisible et ignoré au clavier comme par les lecteurs d'écran.

**Longueurs maximales (FR-1)** : nom 100, email 100, téléphone 30, entreprise 100, objet 150, description 5 000 caractères. Le texte n'est **jamais coupé sans prévenir**, même après un copier-coller. Au-delà de la limite, le compteur (objet, description) passe en `{colors.danger}` et un message apparaît sous le champ.

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Formulaire vierge. Le bouton reste **actif** : on vérifie au clic, on ne désactive pas le bouton d'avance (sinon on ne comprend pas pourquoi il est grisé). |
| **Chargement** | Après le clic : bouton désactivé, libellé « Envoi en cours… » avec un indicateur tournant. Un second clic ne crée pas de deuxième demande. |
| **Erreur de saisie** (FR-2) | Rien n'est effacé. En haut, un encadré `alert-error` : « 2 champs sont à corriger », avec un lien vers chaque champ. Sous chaque champ : le message précis (« L'email est obligatoire », « L'email doit avoir la forme nom@exemple.fr », « La description doit faire au moins 10 caractères », « L'objet ne doit pas dépasser 150 caractères », « La description ne doit pas dépasser 5 000 caractères », « Cochez la case pour confirmer avoir lu l'usage de vos données »). Même forme pour les autres limites (« Le nom ne doit pas dépasser 100 caractères »…). La sélection passe à l'encadré du haut. |
| **Erreur technique** (FR-4) | Rien n'est effacé. Encadré `alert-error` : « Votre demande n'a pas pu être envoyée. Vos informations sont conservées : réessayez dans un instant. Si le problème continue, appelez-nous au *{téléphone, FR-31}*. » **Aucune** fausse confirmation. |
| **Trop d'envois** (FR-6, Should) | Encadré `alert-error` : « Trop de demandes ont été envoyées depuis votre connexion. Réessayez dans une heure, ou appelez-nous au *{téléphone}*. » |
| **Aucune catégorie active** | Impossible par construction (FR-26 interdit de désactiver la dernière). Aucun écran prévu. |
| **Complet** | Redirection vers P2. |

### P2 — Confirmation

1. Icône de validation verte, titre : « Votre demande a bien été enregistrée » (texte exact de FR-4).
2. Référence en grand (`reference`, 28 px) : `NOVA-2026-0042`, précédée de « Votre référence ».
3. « Notez-la : elle vous sera demandée si nous vous rappelons. »
4. Rappel : objet de la demande et email saisi (« Nous vous répondrons à claire.martin@… »).
5. Bloc contact (FR-31) : « Une question urgente ? *{téléphone}* — *{email de contact}* ».
6. Lien discret : « Déposer une autre demande ».

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Sans demande à afficher (adresse ouverte directement), retour au formulaire P1. |
| **Chargement** | Sans objet : la page s'affiche avec la réponse de l'envoi. |
| **Erreur** | Sans objet : en cas d'échec, on reste sur P1 (voir ci-dessus). |
| **Complet** | Contenu ci-dessus. **Actualiser la page réaffiche la même référence** et ne crée pas de deuxième demande (FR-4). |

### I1 — Connexion

Titre « Espace interne Nova Services », champs Email et Mot de passe (avec un bouton « Afficher » pour voir le mot de passe), bouton « Se connecter ». Lien « Mot de passe oublié ? » **(Could)** ; tant qu'il n'existe pas, le texte « Mot de passe oublié ? Contactez votre administrateur. » le remplace.

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Formulaire vierge, curseur dans le champ Email. |
| **Chargement** | Bouton « Connexion… » désactivé. |
| **Erreur** | « Identifiants incorrects » (même message que l'email existe ou non, FR-8). Après 5 échecs : « Trop de tentatives, réessayez plus tard ». Le mot de passe est effacé, l'email est conservé. |
| **Session expirée** (FR-9) | Encadré d'information : « Votre session a expiré. Reconnectez-vous pour continuer. » Après connexion, retour à la page demandée. `[HYPOTHÈSE]` |
| **Session terminée par un administrateur** (FR-22) | Compte désactivé pendant qu'il était connecté : à sa prochaine action, retour ici avec l'encadré neutre « Votre session a pris fin. Contactez votre administrateur si besoin. » Une nouvelle tentative de connexion donne « Identifiants incorrects » (FR-8). |
| **Complet** | Redirection vers I3, ou vers I2 si le mot de passe doit être changé. |

### I2 — Choisir un nouveau mot de passe

Texte : « Pour sécuriser votre compte, choisissez votre propre mot de passe. » Champs « Nouveau mot de passe » et « Confirmer », règle visible sous le champ : « 12 caractères minimum ». Bouton « Enregistrer et continuer ». Pas de menu latéral : aucune autre page n'est accessible tant que ce n'est pas fait (FR-21). En haut à droite : le lien **« Se déconnecter »** (FR-9), pour la personne qui s'est trompée de compte.

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Deux champs vierges, curseur dans le premier. |
| **Chargement** | Bouton « Enregistrement… » désactivé. |
| **Erreur** | Sous le champ concerné : « 12 caractères minimum », « Les deux mots de passe ne sont pas identiques », « Choisissez un mot de passe différent du mot de passe temporaire ». Erreur technique : « Votre mot de passe n'a pas pu être enregistré. Réessayez. » Les champs sont vidés, par sécurité. |
| **Complet** | Arrivée sur I3 avec le toast « Mot de passe enregistré ». |

### I3 — Demandes (accueil interne) *(maquette : [mockups/key-liste-demandes.html](mockups/key-liste-demandes.html))*

1. Titre « Demandes » + bouton principal « Nouvelle demande » (vers I5).
2. **Carte compteur** : « **5** à traiter », sous-texte « Nouvelles + urgentes non traitées » (le « + urgentes » s'ajoute avec FR-19). Un clic applique le filtre « À traiter ».
3. **Barre de recherche** : « Rechercher par référence, nom, email, entreprise ou objet » (FR-12).
4. **Filtres** (FR-13) : Statut, Catégorie, Canal (FR-30) ; puis **(Should)** Priorité, Attribution (« Toutes », « Attribuées à moi », « Non attribuées », puis les noms), « Sans activité ». Bouton « Réinitialiser » visible dès qu'un filtre est actif.
   - Le filtre **Catégorie** liste d'abord les catégories actives puis, sous un trait, les catégories désactivées suivies de « (désactivée) », car elles restent filtrables (FR-26, RM-11).
   - Le filtre **Attribution** propose aussi les comptes désactivés qui ont encore des demandes, suivis de « (désactivé) ».
5. Ligne de résultat : « 42 demandes » (FR-13).
6. **Tableau** (FR-11), colonnes : Référence · Déposée le · Demandeur · Objet · Catégorie · Statut · Attribuée à (Should). Badge *Urgente* devant l'objet, badge *Sans activité* sous le statut (Should). La priorité *Normale* n'est pas affichée dans la liste. Une demande attribuée à un compte désactivé affiche « Lucas Bernard (désactivé) ». Tri : plus récentes en premier.
7. Pagination : 25 par page, « Page 1 sur 2 », boutons Précédente / Suivante (FR-11).

| État | Ce qu'on affiche |
|---|---|
| **Vide — aucune demande en base** | Compteur à 0. À la place du tableau : « Aucune demande pour le moment. Les demandes déposées sur le formulaire apparaîtront ici. » + bouton secondaire « Saisir une demande reçue par téléphone ». |
| **Vide — rien à traiter** | Compteur « **0** à traiter » et sous-texte « Tout est à jour ». Le tableau reste affiché normalement. Pas de félicitations (voir SM-C3 : on ne pousse pas à clôturer vite). |
| **Vide — recherche sans résultat** | « Aucune demande trouvée » (texte exact de FR-12), puis « Vérifiez l'orthographe ou retirez des filtres. » + bouton « Réinitialiser ». |
| **Chargement** | Squelette : la carte compteur et 8 lignes grises. Les filtres restent utilisables. Pendant une nouvelle recherche, le tableau précédent reste visible, légèrement estompé. |
| **Erreur** | À la place du tableau : « Impossible de charger les demandes. » + bouton « Réessayer ». Le compteur affiche « — » plutôt qu'un chiffre faux. |
| **Complet** | Contenu ci-dessus, avec la maquette comme référence. |

### I4 — Détail d'une demande *(maquette : [mockups/key-detail-demande.html](mockups/key-detail-demande.html))*

**En-tête :** fil d'Ariane (« Demandes › NOVA-2026-0042 », retour à la liste **avec les filtres conservés**), référence, objet en titre, badge de statut et priorité. La priorité *Urgente* a son badge rouge ; la priorité *Normale* est écrite discrètement en gris (« Priorité normale »).

**Colonne principale (gauche) :**
1. **Demande** : description telle que saisie, retours à la ligne compris (FR-15), texte simple (aucun code exécuté, NFR-11).
2. **Demandeur** : nom, email (lien « écrire »), téléphone, entreprise. Lien « Voir ses autres demandes » qui lance une recherche sur son email (repérage des doublons, FR-12).
3. **Informations** : catégorie (suivie de « (désactivée) » si elle l'a été depuis), canal, déposée le, date de clôture (si *Traitée*).
4. **Historique** (FR-17) : du plus ancien au plus récent. Chaque ligne indique quoi, qui et quand : « Demande créée — Demandeur — 8 nov. 2026, 8 h 47 ».
5. **Commentaire interne (Should, FR-20)** : zone de texte « Ajouter un commentaire interne (jamais visible par le demandeur) » + bouton « Publier ». Sous le bouton : « Un commentaire publié ne peut plus être modifié. »

**Panneau d'actions (droite)** `[HYPOTHÈSE]` :
1. **Statut** : statut actuel + seulement les passages permis (FR-16). Depuis *Nouvelle* : « Passer En cours », « Marquer Traitée ». Depuis *En cours* : « Marquer Traitée ». Depuis *Traitée* : « Rouvrir (En cours) ». **Jamais** de retour à *Nouvelle*.
2. **Attribuée à (Should)** : nom, ou « Personne » ; bouton « Me l'attribuer » ; liste des comptes **actifs** seulement (FR-18) ; « Retirer l'attribution ». Si la personne attribuée a été désactivée : « Lucas Bernard (désactivé) », et l'on peut réattribuer à un compte actif.
3. **Priorité (Should)** : choix entre Normale et Urgente.
4. **Zone administrateur** (administrateur seulement), séparée par un trait : bouton danger discret « Supprimer la demande… ».

| État | Ce qu'on affiche |
|---|---|
| **Vide — historique** | Impossible : il contient toujours au moins « Demande créée ». |
| **Vide — aucun commentaire** | Rien de spécial : la zone de saisie suffit. |
| **Chargement** | Squelette de la colonne et du panneau. Pendant une action (statut, attribution) : le bouton concerné affiche un indicateur, les autres restent utilisables. |
| **Erreur — action refusée** | Toast d'erreur : « Le statut n'a pas pu être modifié. Réessayez. » L'écran revient à l'état réel. |
| **Erreur — modifiée entre-temps** | Si un collègue a agi en même temps (FR-16) : encadré d'information « Cette demande a été modifiée par Lucas à 9 h 11. L'affichage a été mis à jour. » L'historique montre les deux actions dans l'ordre réel. `[HYPOTHÈSE]` |
| **Erreur — demande supprimée ou inexistante** | Page S2 : « Cette demande n'existe pas ou a été supprimée. » + « Retour aux demandes ». |
| **Anonymisée (Should)** | Bandeau gris en haut : « Données personnelles anonymisées le … ». Champs personnels affichés « [anonymisé] ». Actions masquées sauf la suppression. L'historique se termine par « Données personnelles anonymisées », avec pour auteur l'administrateur qui a lancé l'anonymisation, ou « Système » si elle est automatique (Could, FR-17). |
| **Complet** | Contenu ci-dessus. Après chaque action : mise à jour immédiate du badge, nouvelle ligne d'historique, toast « Statut mis à jour ». |

**Suppression (FR-28)** — fenêtre de confirmation :
> **Supprimer définitivement la demande NOVA-2026-0042 ?**
> La demande et tout son historique seront effacés. Cette action est irréversible.
> [Annuler] [Supprimer définitivement]

Après suppression : retour à I3 et toast « Demande NOVA-2026-0042 supprimée ».

### I5 — Nouvelle demande (saisie interne)

Mêmes champs et mêmes vérifications que P1 (FR-30), sur une colonne de 560 px, avec en plus :
- **Canal *** en premier : choix entre « Téléphone » et « Email » (le canal *Formulaire* est réservé au dépôt public) ;
- à la place de la case du demandeur : « La personne a été informée de l'usage de ses données. * », avec un lien « Texte à lui lire » qui affiche la mention de P1.

Après enregistrement : ouverture du détail I4 de la nouvelle demande et toast « Demande NOVA-2026-0043 créée ». États vide, chargement et erreur : identiques à P1, sans la limite d'envois (FR-6).

### A1 — Comptes

Tableau : Nom · Email · Rôle · État (Actif / badge *Désactivé*) · Actions (« Modifier », « Réinitialiser le mot de passe », « Désactiver » ou « Réactiver »). Bouton principal « Créer un compte ».

- **Créer un compte** (fenêtre) : Nom *, Email *, Rôle * (Collaborateur par défaut), Mot de passe temporaire * (12 caractères minimum, bouton « Générer »). Aide : « Transmettez ce mot de passe vous-même à la personne. Elle devra le changer à sa première connexion. » Après création, le mot de passe temporaire reste affiché une fois, avec un bouton « Copier ».
- **Modifier** (fenêtre, FR-22) : champs Nom * et Rôle *. L'email est affiché mais **non modifiable**, car le PRD ne prévoit de modifier que le nom et le rôle. Bouton « Enregistrer », toast « Compte modifié ».
- **Réinitialiser le mot de passe** (fenêtre, FR-23) : titre « Réinitialiser le mot de passe de Lucas Bernard ». Champ « Nouveau mot de passe temporaire * » (12 caractères minimum, bouton « Générer »). Texte : « L'ancien mot de passe ne fonctionnera plus. Lucas devra choisir un nouveau mot de passe à sa prochaine connexion. » Après validation, le mot de passe temporaire s'affiche une seule fois avec « Copier », comme à la création.
- **Désactiver** (fenêtre) : « Lucas ne pourra plus se connecter. Son nom restera dans l'historique des demandes. »
- **Dernier administrateur** (FR-25) : l'action reste visible, mais la refuse avec le message exact : « Impossible : il doit rester au moins un administrateur actif. »

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Impossible : il y a au moins l'administrateur connecté. |
| **Chargement** | Squelette du tableau. |
| **Erreur** | « Cet email est déjà utilisé par un autre compte. » ou « 12 caractères minimum » sous le champ ; erreur de chargement : « Impossible de charger les comptes. » + « Réessayer ». |
| **Complet** | Tableau, toast « Compte créé » ou « Compte désactivé ». |

### A2 — Catégories

Liste : nom · État (Active / badge *Désactivée*) · nombre de demandes · Actions (« Renommer », « Désactiver » ou « Réactiver », « Supprimer » **seulement si 0 demande**). Champ « Nouvelle catégorie » + bouton « Ajouter ». « Renommer » transforme le nom en champ modifiable sur la ligne, avec « Enregistrer » et « Annuler ».

**La dernière catégorie active ne peut être ni désactivée, ni supprimée** (FR-26) : le formulaire de dépôt deviendrait inutilisable. Le bouton reste visible, mais l'action est refusée avec le message ci-dessous.

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Impossible : il reste toujours au moins une catégorie active. |
| **Chargement** | Squelette de la liste. Pendant une action, indicateur sur le bouton concerné. |
| **Erreur** | « Une catégorie active porte déjà ce nom. » ; « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. » ; « Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver. » ; erreur de chargement : « Impossible de charger les catégories. » + « Réessayer ». |
| **Complet** | Liste, toast « Catégorie Facturation ajoutée. Elle est déjà proposée dans le formulaire. » |

**Supprimer** ouvre une fenêtre de confirmation : « Supprimer la catégorie *Facturation* ? Elle n'a jamais été utilisée. Cette action est irréversible. »

### A3 — Informations générales

Trois champs : Téléphone de contact, Email de contact *, Contact pour les données personnelles *. Un aperçu montre où chaque information apparaît (« Affiché sur l'écran de confirmation »). Bouton « Enregistrer ».

| État | Ce qu'on affiche |
|---|---|
| **Vide** | Impossible après l'installation : les valeurs de départ sont saisies lors de la mise en place (documentation *Déploiement*). |
| **Chargement** | Squelette des trois champs ; bouton « Enregistrement… » pendant l'envoi. |
| **Erreur** | « L'email doit avoir la forme nom@exemple.fr » (FR-31) ; « Ce champ est obligatoire ». Erreur technique : « Les informations n'ont pas pu être enregistrées. Réessayez. », sans rien effacer. |
| **Complet** | Toast « Informations mises à jour. Elles sont visibles immédiatement. » |

### A4 — Données personnelles (Should)

Texte : « Les demandes clôturées depuis plus de 3 ans sont anonymisées : nom, coordonnées et textes sont effacés. » Indication « 0 demande concernée aujourd'hui ». Bouton « Lancer l'anonymisation » (désactivé s'il n'y a rien à faire), fenêtre de confirmation, puis résultat : « 3 demandes anonymisées. »

| État | Ce qu'on affiche |
|---|---|
| **Vide** | « Aucune demande à anonymiser aujourd'hui. » Le bouton est désactivé. |
| **Chargement** | Pendant l'exécution : « Anonymisation en cours… », bouton désactivé. On ne quitte pas la page sans prévenir. |
| **Erreur** | « L'anonymisation s'est interrompue. 1 demande sur 3 a été traitée. Relancez-la pour terminer. » Relancer ne traite que les demandes restantes. |
| **Complet** | « 3 demandes anonymisées. » + date de la dernière exécution. |

### S1 — Accès refusé · S2 — Page introuvable · S3 — Erreur inattendue

- S1 : « Accès refusé. Cette page est réservée aux administrateurs. » + « Retour aux demandes ».
- S2 : « Cette page n'existe pas ou a été supprimée. » + « Retour aux demandes » (si la personne est connectée) ou « Déposer une demande » (sinon).
- S3 : « Une erreur inattendue s'est produite. » + bouton « Réessayer » + lien « Retour aux demandes » (ou « Déposer une demande » côté public, avec le téléphone de Nova). Une ligne discrète à recopier pour le support : « Code : 7F3A · 8 nov. 2026, 9 h 14 · /demandes/NOVA-2026-0042 ». Ce sont les informations que le niveau 1 transmet au niveau 2 (NFR-9). Aucun détail technique n'est affiché.

## Voice and Tone

La voix de la marque est décrite dans [DESIGN.md, Brand & Style](DESIGN.md#brand--style). Ici : les textes de l'interface.

- **Vouvoiement**, phrases courtes, mots de tous les jours. `[HYPOTHÈSE]`
- **Boutons** : un verbe qui dit ce qui va se passer (« Envoyer ma demande », « Marquer Traitée »), jamais « OK » ou « Valider » seul.
- **Erreurs** : dire **quoi corriger**, sans accuser (FR-2).
- Les termes du **glossaire du PRD** (§3) sont repris tels quels : *demande*, *référence*, *Nouvelle / En cours / Traitée*, *Urgente*, *commentaire interne*, *canal*.

| À écrire | À éviter |
|---|---|
| « L'email est obligatoire » | « Champ invalide » |
| « Votre demande a bien été enregistrée » | « Succès ! 🎉 » |
| « Identifiants incorrects » | « Cet email n'existe pas » (révèle des informations, FR-8) |
| « Impossible : il doit rester au moins un administrateur actif. » | « Erreur 403 » |
| « 0 à traiter — Tout est à jour » | « Bravo, boîte vide ! » (pousse à clôturer vite, SM-C3) |
| « Aucune demande trouvée » | « Pas de résultats pour votre requête » |
| Dates : « 8 nov. 2026, 9 h 12 » | « 2026-11-08T09:12 » |

## Component Patterns

Comportement des composants. Leur aspect est dans [DESIGN.md, Components](DESIGN.md#components).

| Composant | Où | Règles de comportement |
|---|---|---|
| **Champ de formulaire** | P1, I5, I1, A1… | Vérification **à la sortie du champ** pour le format (email) et **à l'envoi** pour tout le reste. Un message d'erreur disparaît dès que le champ est corrigé. Le contenu n'est jamais effacé (sauf le mot de passe en cas d'échec de connexion). |
| **Résumé d'erreurs** | En haut des formulaires | Apparaît après un envoi refusé, reçoit la sélection, liste les erreurs avec un lien vers chaque champ. |
| **Bouton d'envoi** | Tous les formulaires | Désactivé **pendant** l'envoi uniquement, pour bloquer le double clic. |
| **Carte compteur** | I3 | Cliquable : applique le filtre « À traiter ». Se met à jour au plus tard au rafraîchissement (FR-14). |
| **Recherche** | I3 | Lance la recherche 300 ms après la dernière frappe, ou avec Entrée. Insensible aux majuscules et aux accents (FR-12). `[HYPOTHÈSE sur le délai]` |
| **Filtres** | I3 | S'appliquent tout de suite, se combinent avec la recherche. Ils sont **gardés dans l'adresse de la page** : revenir du détail retrouve la même liste, et on peut partager le lien. `[HYPOTHÈSE]` |
| **Ligne de tableau** | I3, A1 | Toute la ligne est cliquable et ouvre le détail. La référence est un vrai lien (ouverture dans un nouvel onglet possible). |
| **Boutons de statut** | I4 | Ne proposent que les passages permis (FR-16). L'effet est immédiat, sans bouton « Enregistrer » global. Pas de confirmation, sauf pour « Rouvrir ». `[HYPOTHÈSE]` |
| **Attribution (Should)** | I4 | « Me l'attribuer » en un clic. La liste ne propose que des comptes actifs (FR-18). |
| **Commentaire (Should)** | I4 | « Publier » désactivé tant que la zone est vide. Une fois publié, le commentaire est définitif. |
| **Fenêtre de confirmation** | I4 (suppression, réouverture), A1, A2, A4 | La sélection se place sur « Annuler ». Échap ferme la fenêtre. Une seule fenêtre à la fois. |
| **Toast** | Espace interne | En bas à droite, disparaît après 5 s. Les toasts d'erreur restent jusqu'à fermeture. Annoncés aux lecteurs d'écran. |
| **Badges** | I3, I4, A1, A2 | Toujours avec un texte. Non cliquables. |

## State Patterns

Règles communes. Les états propres à chaque écran sont dans [Contenu des écrans](#contenu-des-écrans).

| Situation | Règle |
|---|---|
| **Chargement court** (moins de 300 ms) | On n'affiche rien de spécial, pour éviter un clignotement. |
| **Chargement plus long** | Squelette à la forme du contenu. Jamais d'écran blanc. |
| **Action en cours** | Indicateur **sur le bouton concerné**, pas sur toute la page. |
| **Erreur de saisie** | Au plus près du champ + résumé en haut. Le contenu saisi est conservé. |
| **Erreur technique** | Message en français, sans code technique, avec une action (« Réessayer ») et, côté public, le téléphone de Nova. |
| **Liste vide** | Une phrase qui explique pourquoi c'est vide et, si possible, une action. |
| **Session expirée** | Retour à la connexion avec un message, puis retour à la page demandée. |
| **Compte désactivé pendant la session** (FR-22) | À la prochaine action : retour à la connexion avec « Votre session a pris fin. Contactez votre administrateur si besoin. » Le message est neutre et ne dit pas pourquoi. |
| **Administrateur rétrogradé pendant la session** (FR-22) | À la prochaine action : la section *Administration* disparaît du menu. S'il était sur une page d'administration, il voit S1. Ses autres pages fonctionnent normalement. |
| **Droits insuffisants** | Côté interface, l'élément est absent pour un collaborateur. S'il force l'adresse : page S1. |
| **Erreur inattendue** | Page S3, avec le code et l'heure à transmettre au support. |
| **Succès** | Toast court + mise à jour visible de l'écran (badge, historique). |

## Interaction Primitives

- **Souris et clavier** sont traités à égalité. Pas de raccourcis clavier spéciaux en v1. `[HYPOTHÈSE]`
- **Tab** suit l'ordre de lecture ; **Entrée** envoie un formulaire ; **Échap** ferme une fenêtre.
- **Pagination**, pas de défilement infini (FR-11).
- **Pas de glisser-déposer**, pas d'action au seul survol : tout doit marcher au doigt sur tablette.
- **Retour du navigateur** : depuis le détail, il ramène à la liste avec les mêmes filtres. Après déconnexion, il ne réaffiche aucune donnée (FR-9).
- **Liens externes** : l'email du demandeur ouvre la messagerie (`mailto:`). Le téléphone est un lien `tel:` sur tablette.

## Accessibility Floor

Comportement. Les contrastes de couleurs sont dans [DESIGN.md, Colors](DESIGN.md#colors).

- Objectif **WCAG 2.2 niveau AA** (référence internationale d'accessibilité), en priorité sur le formulaire public (NFR-12).
- **Chaque champ a une étiquette visible** reliée au champ ; les champs obligatoires sont signalés en texte, pas seulement par la couleur.
- **Formulaire entièrement utilisable au clavier**, contour de sélection toujours visible.
- Les **messages d'erreur sont annoncés** par les lecteurs d'écran et reliés à leur champ.
- **Le statut et la priorité ne reposent jamais sur la couleur seule** (FR-19) : toujours un mot.
- Lien « Aller au contenu » en tout premier élément de chaque page.
- Le **compteur** et les **toasts** sont annoncés quand ils changent.
- Le **nombre de résultats** (« 42 demandes ») est annoncé à chaque changement de recherche ou de filtre.
- Le tableau des demandes est un vrai tableau (en-têtes de colonnes reconnus par les lecteurs d'écran).
- Zones cliquables de 44 × 44 px minimum.
- La page reste lisible avec un zoom de 200 %.

## Responsive & Platform

| Largeur | Partie publique (P1, P2) | Espace interne |
|---|---|---|
| **Moins de 640 px** (téléphone) | Référence de conception. Une colonne, marges de 16 px, bouton pleine largeur. | Utilisable en dépannage : menu derrière un bouton « Menu », tableau remplacé par des cartes (référence, objet, statut). `[HYPOTHÈSE]` |
| **640 à 1 023 px** (tablette) | Formulaire centré, 560 px au plus. | Menu replié derrière « Menu ». Détail sur une colonne : panneau d'actions **sous** l'en-tête. |
| **1 024 px et plus** (ordinateur) | Formulaire centré, 560 px au plus. | Référence de conception. Menu fixe à gauche, tableau complet, détail sur deux colonnes. |

Navigateurs : versions récentes de Chrome, Firefox, Edge et Safari (NFR-12).

## Données personnelles à l'écran

Section propre à ce projet, liée au RGPD (le règlement européen sur les données personnelles).

- **Information avant collecte** : mention + case obligatoire sur P1 (FR-5) ; case « Personne informée » sur I5 (FR-30). Aucune demande ne peut être créée sans elle (RM-12).
- **Le moins possible à l'écran** : la liste n'affiche ni l'email ni le téléphone, seulement le nom. Les coordonnées complètes sont dans le détail.
- **Commentaires internes** : toujours signalés comme internes, jamais visibles par le demandeur.
- **Suppression** (FR-28) : réservée à l'administrateur, toujours confirmée avec la référence, irréversible et annoncée comme telle. Parcours complet : [Flux 5](#flux-5--sophie-efface-les-données-dune-personne-fr-28).
- **Anonymisation** (FR-29, Should) : déclenchée par l'administrateur ; les demandes concernées affichent clairement « [anonymisé] ».

## E-mails (Could)

Les deux e-mails sont des bonus (FR-7, FR-32). Ils suivent la même voix que l'interface, en texte simple, avec le logo en en-tête.

| E-mail | Objet | Contenu | Règles |
|---|---|---|---|
| **E1 — Confirmation au demandeur** (FR-7) | « Votre demande NOVA-2026-0042 est enregistrée » | « Bonjour Claire Martin, nous avons bien reçu votre demande « Accès impossible à l'outil de facturation ». Votre référence : NOVA-2026-0042. Nous vous répondons par email ou par téléphone. Une question urgente ? *{téléphone}*. » | L'écran P2 ne promet pas cet e-mail, car son envoi peut échouer sans bloquer le dépôt. |
| **E2 — Nouvelle demande, aux utilisateurs internes** (FR-32) | « Nouvelle demande NOVA-2026-0042 : Accès impossible à l'outil de facturation » | Référence, objet, catégorie, lien « Ouvrir la demande » (qui passe par la connexion). | **Jamais** la description ni les coordonnées du demandeur (FR-32). |

## Key Flows

### Flux 1 — Claire signale une panne (UJ-1)

*Claire, gérante d'un cabinet comptable, sur son téléphone, entre deux rendez-vous.*

1. Claire n'arrive plus à accéder à l'outil installé par Nova. Elle ouvre le lien « Nous contacter » du site de Nova : le formulaire P1 s'ouvre, sans connexion.
2. Elle saisit son nom, oublie son email, choisit *Problème technique*, écrit l'objet « Accès impossible à l'outil de facturation » et une description de trois lignes.
3. Elle lit la mention sur ses données, coche la case et appuie sur « Envoyer ma demande ».
4. **Cas limite :** le formulaire ne part pas. En haut, « 1 champ est à corriger » ; sous le champ Email, « L'email est obligatoire ». Tout le reste est encore là.
5. Elle saisit son email et renvoie. Le bouton affiche « Envoi en cours… ».
6. **Moment clé :** l'écran P2 s'affiche : « Votre demande a bien été enregistrée », et en grand `NOVA-2026-0042`. Claire fait une capture d'écran : elle a la preuve qu'elle n'a pas parlé dans le vide.

Échec technique : à l'étape 5, si l'enregistrement échoue, Claire voit « Votre demande n'a pas pu être envoyée. Vos informations sont conservées… » avec le téléphone de Nova, et non une fausse confirmation.

### Flux 2 — Karim attaque sa matinée (UJ-2)

*Karim, collaborateur, 9 h, à son bureau, sur ordinateur.*

1. Karim se connecte (I1). Il arrive directement sur « Demandes » (I3).
2. La carte compteur indique « **5** à traiter ». Il clique dessus : la liste ne montre plus que ces 5 demandes.
3. Il ouvre `NOVA-2026-0042` (Claire). Il lit la description et voit dans l'historique : « Demande créée — Demandeur — 8 h 47 ».
4. Dans le panneau d'actions, il clique sur « Me l'attribuer » (Should), puis sur « Passer En cours ».
5. **Moment clé :** le badge passe à *En cours* et l'historique ajoute « Karim — Statut : Nouvelle → En cours — 9 h 12 ». De retour sur la liste (mêmes filtres), le compteur affiche « **4** à traiter ». Karim sait que personne d'autre ne rappellera Claire.
6. Après son appel, il revient sur la demande, publie le commentaire interne « Rappelée, mot de passe réinitialisé côté outil » (Should), puis clique sur « Marquer Traitée ». La date de clôture apparaît.

Échec : si Lucas a déjà passé la demande *En cours* une minute avant, Karim voit « Cette demande a été modifiée par Lucas à 9 h 11. L'affichage a été mis à jour. » Son clic ne crée pas de deuxième événement, car le statut était déjà *En cours* (FR-16). L'historique montre l'action de Lucas, et Karim sait qu'il doit se coordonner avec lui avant d'appeler Claire.

### Flux 3 — Sophie accueille une nouvelle recrue (UJ-3)

*Sophie, administratrice, un lundi matin.*

1. Dans *Administration › Comptes* (A1), Sophie clique sur « Créer un compte ». Elle saisit « Lucas Bernard », son email, garde le rôle *Collaborateur* et clique sur « Générer ».
2. Le compte est créé. Le mot de passe temporaire s'affiche une fois, avec « Copier ». Elle le transmet à Lucas de vive voix.
3. À sa première connexion, Lucas arrive sur I2 et choisit son propre mot de passe.
4. Dans *Catégories* (A2), Sophie ajoute *Facturation*. **Moment clé :** le message confirme « Elle est déjà proposée dans le formulaire » ; Sophie ouvre P1 dans un autre onglet et la voit dans la liste, sans avoir appelé de développeur.
5. Six mois plus tard, elle désactive le compte de Lucas. La fenêtre rappelle que son nom restera dans l'historique.

**Cas limite :** Sophie, seule administratrice, tente de passer son propre compte en *Collaborateur*. Le message s'affiche : « Impossible : il doit rester au moins un administrateur actif. » Rien n'est modifié.

### Flux 4 — Karim saisit une demande reçue par téléphone (UJ-4)

*Karim, au téléphone avec un prospect.*

1. Pendant l'appel, il clique sur « Nouvelle demande » (I5) et choisit le canal *Téléphone*.
2. Il saisit les coordonnées et la demande. Il ouvre « Texte à lui lire » et lit la mention au prospect, mais **oublie de cocher la case**.
3. Il clique sur « Enregistrer la demande ». **Cas limite :** l'enregistrement est refusé. En haut, « 1 champ est à corriger » ; sous la case, « Confirmez que la personne a été informée de l'usage de ses données ». Rien n'est perdu. Il coche la case et enregistre à nouveau.
4. **Moment clé :** le détail de `NOVA-2026-0043` s'ouvre. Il donne la référence au prospect avant de raccrocher. L'historique indique « Créée par Karim (canal : Téléphone) ». Il n'y a plus de fichier à part.
5. Le prospect a précisé que sa production est à l'arrêt : dans le panneau d'actions, Karim choisit la priorité **Urgente** (Should). Le badge *Urgente* apparaît. Même quand Karim la passera *En cours*, la demande restera comptée dans « à traiter » jusqu'à ce qu'elle soit *Traitée* (FR-14, FR-19).

### Flux 5 — Sophie efface les données d'une personne (FR-28)

*Sophie, administratrice, reçoit un email de Paul Rousseau qui demande l'effacement de ses données.*

1. Dans « Demandes » (I3), Sophie tape l'email de Paul dans la recherche. La liste affiche « 2 demandes » (FR-12).
2. Elle ouvre la première, `NOVA-2026-0036`. En bas du panneau d'actions, dans la zone administrateur, elle clique sur « Supprimer la demande… ».
3. La fenêtre rappelle la référence et prévient que l'action est irréversible. Elle confirme avec « Supprimer définitivement ».
4. Retour à la liste avec le toast « Demande NOVA-2026-0036 supprimée ». Elle fait de même pour la seconde.
5. **Moment clé :** elle relance la recherche sur l'email de Paul. L'écran affiche « Aucune demande trouvée ». Elle peut répondre à Paul que ses données sont effacées. Seule une trace technique, sans données personnelles, reste dans les logs (FR-28).

**Cas limite :** Karim avait la demande de Paul ouverte dans un onglet. À sa prochaine action, il voit S2 : « Cette demande n'existe pas ou a été supprimée. »

---

## Hypothèses de ce document

Choix proposés par le rédacteur, **tous confirmés par Aurel le 8 novembre 2026**.

| # | Hypothèse | Pourquoi |
|---|---|---|
| E-H1 | Vouvoiement partout, y compris dans l'espace interne. | Ton professionnel cohérent, un seul style de texte. |
| E-H2 | L'accueil interne est la liste des demandes, sans tableau de bord séparé. | FR-14 : voir le compteur dès la connexion ; le PRD exclut les tableaux de bord (§7). |
| E-H3 | Menu latéral : Demandes, Nouvelle demande, puis Administration (administrateurs seulement). | Organisation simple par rôle (FR-24). |
| E-H4 | Panneau d'actions à droite dans le détail ; effet immédiat, sans bouton « Enregistrer » global. | Moins de clics pour Karim, et chaque action crée sa ligne d'historique. |
| E-H5 | Pas de confirmation pour changer de statut, sauf pour « Rouvrir ». | Changer de statut est fréquent et tracé ; rouvrir efface la date de clôture. |
| E-H6 | Filtres conservés dans l'adresse de la page. | Retour du détail vers la même liste, lien partageable. |
| E-H7 | Recherche lancée 300 ms après la dernière frappe. | Réactif sans surcharger le serveur. |
| E-H8 | Message « modifiée entre-temps » en cas d'action simultanée. | Rend visible la règle de cohérence de FR-16. |
| E-H9 | Après la session expirée, retour à la page demandée. | Évite de perdre sa place. |
| E-H10 | Sur téléphone, la liste interne s'affiche en cartes plutôt qu'en tableau. | Un tableau de 7 colonnes ne tient pas sur 360 px. |
| E-H11 | Pas de raccourcis clavier spéciaux en v1. | Simplicité ; le clavier standard suffit. |
| E-H12 | La liste n'affiche pas l'email ni le téléphone du demandeur. | Limiter les données personnelles visibles (RGPD) ; la recherche par email reste possible. |
