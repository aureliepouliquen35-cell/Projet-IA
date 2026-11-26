# Epic 4 Context: Régler l'application et respecter le RGPD

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Permettre à l'administrateur d'adapter l'application sans développeur et de répondre aux obligations du RGPD. Il peut d'abord **supprimer définitivement une demande** quand une personne demande l'effacement de ses données. Ce droit à l'effacement passe en premier. Il gère ensuite les catégories proposées dans le formulaire (ajouter, renommer, désactiver, réactiver, supprimer une catégorie jamais utilisée). Il modifie enfin les coordonnées affichées aux demandeurs (téléphone, email de contact, contact pour les données personnelles). C'est un Must du cahier des charges. L'epic s'appuie sur la section Administration et sur `exigerAdministrateur()`, livrés par l'epic 3, ainsi que sur le détail I4, la liste I3 et l'historique, livrés par l'epic 1.

## Stories

- Story 4.1 : Ajouter et renommer des catégories
- Story 4.2 : Désactiver, réactiver ou supprimer une catégorie
- Story 4.3 : Modifier les informations de contact affichées aux demandeurs
- Story 4.4 : Supprimer définitivement une demande

## Requirements & Constraints

**Suppression d'une demande (story 4.4, à construire en premier)**
- Seul un **administrateur** peut supprimer une demande (RM-7). Un collaborateur ne voit pas le bouton. S'il appelle directement l'action, le **serveur** la refuse : cacher le bouton ne suffit pas.
- Une confirmation est toujours demandée avant la suppression, avec un rappel de la référence. L'action est irréversible et annoncée comme telle.
- La suppression efface la demande **avec tout son historique**. C'est l'une des deux seules exceptions à « l'historique ne se modifie ni ne se supprime » (RM-5). L'autre exception est l'anonymisation, qui relève de l'epic 6.
- Une fois supprimée, la demande n'apparaît plus **nulle part** : ni dans la liste, ni dans la recherche, ni dans le compteur « à traiter », ni dans la pastille du menu.
- La suppression laisse une trace dans le journal technique : référence, auteur, date et heure. Cette trace ne contient **aucune** donnée personnelle supprimée (ni nom, ni coordonnées, ni texte du demandeur).
- Un collègue qui avait la demande ouverte voit, à sa prochaine action : « Cette demande n'existe pas ou a été supprimée. »
- RM-5 et RM-7 ont chacune leur test automatisé dans `tests/regles/`. L'événement `demande_supprimee` est vérifié dans `journal_technique`.

**Catégories (stories 4.1 et 4.2)**
- Une catégorie ajoutée est proposée **immédiatement** dans le formulaire public. Deux catégories actives ne peuvent pas porter le même nom.
- Une catégorie désactivée disparaît du formulaire. Les demandes qui l'utilisent la gardent, avec la mention « (désactivée) », et le filtre de la liste la propose encore (RM-11). Un renommage s'affiche aussi sur les demandes existantes.
- Une catégorie utilisée par au moins une demande ne peut pas être supprimée.
- La **dernière catégorie active** ne peut être ni désactivée ni supprimée, même si elle n'a jamais été utilisée.
- Les trois statuts *Nouvelle*, *En cours* et *Traitée* sont fixes (RM-3). Aucun écran ne permet d'ajouter, de renommer ou de supprimer un statut.

**Informations générales (story 4.3)**
- Trois informations sont modifiables : le téléphone, l'email de contact et le contact pour les données personnelles. Un changement apparaît aussitôt sur P1 (mention et messages d'erreur) et sur P2, sans nouvelle mise en production.
- L'email de contact doit avoir un format valide. Chaque modification est tracée dans le journal (auteur, date et heure).

## Technical Decisions

- **`supprimer_demande`** : l'application ne fait **jamais** de `delete` direct sur `demandes` ou `evenements`. Elle appelle cette fonction SQL, qui est le seul chemin possible, puisque les tables n'ont aucune règle RLS d'écriture. Dans la même transaction, la fonction :
  - vérifie l'utilisateur et son rôle administrateur, relu dans `profils` ;
  - verrouille la demande ;
  - efface ses événements, puis la demande.

  Les événements ne sont effacés **que** dans cette fonction. La fonction est `security definer`, avec `set search_path = ''`. Le droit de l'exécuter est retiré à `public` puis donné à `authenticated`, et la migration contient ces droits.
- **Double barrière** : la Server Function commence par `exigerAdministrateur()`, **et** la fonction SQL refait le même contrôle. Le rôle vient toujours de `profils`, jamais des métadonnées du compte Supabase.
- **Journal** : on écrit uniquement par `journaliser()`, avec l'événement `demande_supprimee`. Les détails ne contiennent que la référence et l'identifiant ou l'email de l'administrateur. L'événement de 4.3 est `parametres_modifies`. Il n'existe pas d'événement de journal pour les catégories.
- **Réponses** : le format est `{ ok: true, donnees }` ou `{ ok: false, code, message }`. Une demande inexistante ou déjà supprimée donne `INTROUVABLE`. Un non-administrateur donne `ACCES_REFUSE`. Une erreur prévue ne lève jamais d'exception.
- **Après la suppression** : la Server Function fait recalculer la liste, le détail et le compteur. Le toast affiché après la redirection vers I3 voyage dans le **cookie serveur signé** de `src/server/passage`, jamais dans l'adresse de la page.
- **Index** : un report demande d'indexer `evenements.demande_id`, dont la suppression en cascade a besoin, car Postgres n'indexe pas seul une clé étrangère. Vérifier s'il existe déjà.
- **Catégories** : les écritures passent par `ajouter_categorie` et `modifier_categorie` (renommer, désactiver, réactiver, supprimer). La règle de la dernière catégorie active est gardée **par la base**. `modifier_categorie` verrouille les lignes, compte les catégories actives restantes et refuse avec le message exact, même si deux administrateurs agissent en même temps (AD-10).
- **Informations générales** : la table `parametres` n'a qu'une seule ligne et s'écrit par `modifier_parametres`. Le formulaire a un schéma Zod dans `src/shared/schemas`, avec les messages exacts de l'UX.

## UX & Interaction Patterns

**Flux 5 — effacer les données d'une personne (story 4.4)**
1. Dans I3, l'administrateur cherche l'email de la personne. La liste affiche par exemple « 2 demandes ».
2. Il ouvre la première demande. En bas du panneau d'actions se trouve la **zone administrateur**, réservée aux administrateurs et séparée par un trait. Elle contient le bouton danger discret « Supprimer la demande… », avec l'icône corbeille. Dans la maquette, c'est un lien rouge en semi-gras, sans fond.
3. La fenêtre de confirmation s'ouvre. Elle a une largeur de 440 px au plus, une pastille rouge clair avec l'icône corbeille, la référence en chasse fixe dans le titre, et des boutons alignés à droite :
   > **Supprimer définitivement la demande NOVA-2026-0042 ?**
   > La demande et tout son historique seront effacés. Cette action est irréversible.
   > [Annuler] (secondaire) [Supprimer définitivement] (`button-danger` : fond `{colors.danger}`, texte blanc)
4. Après la suppression, l'administrateur revient sur I3 et voit le toast « Demande NOVA-2026-0042 supprimée ». Le format est « Demande {référence} supprimée ».
5. S'il relance la recherche sur le même email, il lit « Aucune demande trouvée ».

- **Collègue qui avait la demande ouverte** : à sa prochaine action, il voit la page S2 « Cette demande n'existe pas ou a été supprimée. » avec le bouton « Retour aux demandes ». Pour une adresse inconnue, S2 affiche le texte général « Cette page n'existe pas ou a été supprimée. ».
- **Fenêtre de confirmation** : la sélection se place sur « Annuler », Échap ferme la fenêtre, et une seule fenêtre est ouverte à la fois. Le bouton danger (fond rouge) est réservé à la fenêtre qui confirme une suppression.
- **Toasts** : ils s'affichent en bas à droite et disparaissent après 5 s. Un toast d'erreur reste affiché jusqu'à ce qu'on le ferme. Les toasts sont annoncés aux lecteurs d'écran.

**A2 — Catégories (stories 4.1 et 4.2)**
- La page affiche une liste : nom · état (Active ou badge *Désactivée*) · nombre de demandes · actions. Les actions sont « Renommer » (champ modifiable sur la ligne, avec « Enregistrer » et « Annuler »), « Désactiver » ou « Réactiver », et « Supprimer » **seulement si 0 demande**. En haut : un champ « Nouvelle catégorie » et un bouton « Ajouter ».
- Après un ajout, le toast affiche « Catégorie Facturation ajoutée. Elle est déjà proposée dans le formulaire. »
- Pour la dernière catégorie active, le bouton reste visible, mais l'action est refusée avec le message exact.
- Messages d'erreur :
  - « Une catégorie active porte déjà ce nom. »
  - « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. »
  - « Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver. »
  - En cas d'échec du chargement : « Impossible de charger les catégories. » + « Réessayer ».
- Le bouton « Supprimer » ouvre une fenêtre de confirmation : « Supprimer la catégorie *Facturation* ? Elle n'a jamais été utilisée. Cette action est irréversible. »
- Pendant le chargement, un squelette de la liste s'affiche. Pendant une action, un indicateur apparaît sur le bouton concerné.

**A3 — Informations générales (story 4.3)**
- Trois champs : Téléphone de contact, Email de contact * et Contact pour les données personnelles *. Un aperçu indique où chaque information apparaît, par exemple « Affiché sur l'écran de confirmation ». Bouton « Enregistrer », qui affiche « Enregistrement… » pendant l'envoi.
- Messages d'erreur :
  - « L'email doit avoir la forme nom@exemple.fr »
  - « Ce champ est obligatoire »
  - En cas d'erreur technique : « Les informations n'ont pas pu être enregistrées. Réessayez. », sans rien effacer.
- Après l'enregistrement, le toast affiche « Informations mises à jour. Elles sont visibles immédiatement. »

## Cross-Story Dependencies

- **Ordre de construction : 4.4 → 4.1 → 4.2 → 4.3.** Le droit à l'effacement passe d'abord, les réglages ensuite.
- La story 4.4 réutilise ce que l'epic 1 a déjà livré :
  - le détail I4 et son panneau d'actions ;
  - la recherche et le compteur de I3 ;
  - la page S2 ;
  - le journal ;
  - le cookie de passage ;
  - le format d'erreur.

  Elle réutilise aussi `exigerAdministrateur()`, livré par l'epic 3.
- La 4.2 dépend de la 4.1, qui crée la page A2 et les fonctions SQL des catégories. Le filtre Catégorie de I3, qui liste les catégories désactivées avec « (désactivée) », vient de l'epic 2.
- La table `categories`, avec ses cinq catégories de départ, et la table `parametres` existent déjà depuis l'epic 1. Vérifier dans le code ce qui existe déjà autour de `modifier_parametres` avant d'en créer une autre.
- L'epic 6 (anonymisation, Should) devra laisser la suppression possible sur une demande anonymisée. L'epic 5 documente la procédure de suppression dans `docs/donnees-personnelles.md`.
