---
status: final
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-projet-ia-2026-11-08/prd.md
  - _bmad-output/planning-artifacts/prds/prd-projet-ia-2026-11-08/addendum.md
  - _bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-projet-ia-2026-11-08/architecture.md
---

# Nova Services — Découpage en epics et stories

## Overview

Ce document découpe le travail de l'application Nova Services en **epics** (grands blocs de travail qui apportent chacun quelque chose d'utilisable) et en **stories** (petites unités de travail, réalisables une par une). Il part du [PRD](prds/prd-projet-ia-2026-11-08/prd.md), de l'UX ([DESIGN.md](ux-designs/ux-projet-ia-2026-11-08/DESIGN.md), [EXPERIENCE.md](ux-designs/ux-projet-ia-2026-11-08/EXPERIENCE.md)) et de l'[architecture](architecture/architecture-projet-ia-2026-11-08/architecture.md), tous validés.

## Requirements Inventory

### Functional Requirements

FR1 (Must) : Le demandeur remplit, sans compte, sur ordinateur ou téléphone, le formulaire de dépôt (nom, email, téléphone, entreprise, objet, catégorie active, description), avec les limites de longueur du PRD.
FR2 (Must) : L'envoi est refusé tant qu'un champ obligatoire manque ou est mal rempli ; un message dit quoi corriger, et rien de ce qui a été saisi n'est effacé.
FR3 (Must) : La demande est enregistrée avec une référence unique, le statut Nouvelle, la priorité Normale, la date de dépôt, et un événement « Demande créée ».
FR4 (Must) : Un écran confirme « Votre demande a bien été enregistrée » avec la référence, seulement si l'enregistrement a réussi ; l'actualiser ne crée pas de deuxième demande.
FR5 (Must) : Le formulaire affiche la mention sur les données personnelles (conservation 3 ans après clôture), et une case obligatoire.
FR6 (Should) : Les envois automatisés sont rejetés (champ caché, 10 envois par heure et par adresse IP au plus), sans CAPTCHA.
FR7 (Could) : Le demandeur reçoit un email de confirmation avec sa référence.
FR8 (Must) : Un utilisateur interne actif se connecte par email et mot de passe ; messages neutres ; blocage 15 minutes après 5 échecs ; un compte désactivé ne peut pas se connecter.
FR9 (Must) : Bouton « Se déconnecter » sur toutes les pages internes ; le retour arrière n'affiche plus de données ; expiration après 8 h d'inactivité.
FR10 (Must) : Toute page interne ouverte sans connexion renvoie vers la connexion ; aucune donnée n'est accessible sans connexion.
FR11 (Must) : La liste affiche toutes les demandes, des plus récentes aux plus anciennes, par pages de 25 ; un clic ouvre le détail.
FR12 (Must) : La recherche trouve par référence, nom, email, entreprise ou objet, sans tenir compte des majuscules ni des accents ; « Aucune demande trouvée » sinon.
FR13 (Must pour statut et catégorie, Should pour priorité et attribution) : Filtres combinables avec la recherche, nombre de résultats affiché, bouton « Réinitialiser ».
FR14 (Must ; Should pour les urgentes et « Sans activité ») : Compteur des demandes à traiter dès la connexion, cliquable ; mention « Sans activité » après 7 jours.
FR15 (Must) : Le détail affiche tous les champs, la référence, la date de dépôt, le statut et l'historique complet ; la description garde ses retours à la ligne.
FR16 (Must) : Changement de statut selon les transitions permises (jamais de retour à Nouvelle, réouverture permise) ; chaque changement crée un événement ; date de clôture enregistrée ou effacée ; cohérence en cas d'actions simultanées.
FR17 (Must) : Historique automatique (quoi, qui, quand), du plus ancien au plus récent, impossible à modifier ou supprimer, sauf les exceptions RGPD.
FR18 (Should) : S'attribuer une demande, l'attribuer à un autre compte actif, ou retirer l'attribution ; événement d'historique.
FR19 (Should) : Priorité Normale ou Urgente, repérable dans la liste par un libellé ; événement d'historique.
FR20 (Should) : Commentaire interne, ni modifiable ni supprimable, jamais visible par le demandeur.
FR21 (Must) : L'administrateur crée un compte (nom, email, rôle, mot de passe temporaire) ; pas d'inscription publique ; changement obligatoire à la première connexion ; premier administrateur créé par une procédure d'installation.
FR22 (Must) : L'administrateur modifie le nom et le rôle d'un compte, le désactive ou le réactive ; effet à la prochaine action ; jamais de suppression de compte.
FR23 (Must ; « Mot de passe oublié » en Could) : L'administrateur réinitialise un mot de passe avec un nouveau mot de passe temporaire.
FR24 (Must) : Droits selon le rôle, vérifiés côté serveur ; un collaborateur ne voit aucune fonction d'administration.
FR25 (Must) : Impossible de désactiver ou de rétrograder le dernier administrateur actif, même en cas d'actions simultanées.
FR26 (Must) : L'administrateur ajoute, renomme, désactive, réactive une catégorie, et supprime une catégorie jamais utilisée ; la dernière catégorie active ne peut être ni désactivée ni supprimée.
FR27 (Must) : Trois statuts fixes, non paramétrables.
FR28 (Must) : L'administrateur supprime définitivement une demande, après confirmation avec la référence ; trace dans les logs sans données personnelles.
FR29 (Should) : L'administrateur lance l'anonymisation des demandes clôturées depuis plus de 3 ans (automatique en Could).
FR30 (Must) : Un utilisateur interne saisit une demande reçue par téléphone ou par email, avec le canal et la case « Personne informée » ; filtre par canal.
FR31 (Must) : L'administrateur modifie le téléphone, l'email de contact et le contact données personnelles, visibles aussitôt sur le formulaire et la confirmation.
FR32 (Could) : Les utilisateurs internes reçoivent un email à chaque nouvelle demande (référence et objet seulement).

### NonFunctional Requirements

NFR1 (Must) : Application en ligne, en HTTPS, sans installation.
NFR2 (Must) : Environnements de développement et de production séparés, avec des bases distinctes.
NFR3 (Must) : Aucun secret dans le dépôt, ni dans l'historique ; fichier d'exemple des réglages ; outil de détection sans résultat.
NFR4 (Must) : Chaque mise en production a un tag Git ; la version en ligne est visible dans l'espace interne.
NFR5 (Must) : Procédure écrite et testée de retour à la version précédente (moins de 15 minutes).
NFR6 (Must) : Logs des erreurs et des événements importants, filtrables par date et gravité, sans mot de passe ni texte des demandes ; une erreur retrouvée en moins de 5 minutes.
NFR7 (Must) : Sauvegarde quotidienne gardée 7 jours ; restauration écrite et testée ; perte maximale de 24 h.
NFR8 (Must) : Fiche « plan en cas d'indisponibilité ».
NFR9 (Must) : Fiche « support à deux niveaux ».
NFR10 (Must) : Cinq documents : Déploiement, Maintenance, Support, Sécurité et accès, Protection des données personnelles.
NFR11 (Must) : Mots de passe hachés, 12 caractères minimum, droits vérifiés côté serveur, aucun code injectable.
NFR12 (Should) : Interface en français, formulaire utilisable à 360 px, étiquettes visibles, clavier, navigateurs récents.
NFR13 (Should) : Moins de 2 secondes avec 5 000 demandes.
NFR14 (Must) : Vérification des éléments produits par l'IA, règles métier RM-1 à RM-14 couvertes par des tests automatisés, note « Démarche IA ».

### Additional Requirements

- **Pas de modèle de départ (starter) à installer** : le projet part du dépôt existant (Next.js 16.4.5, React 19.3, TypeScript 5.9, Tailwind 4, bibliothèques Supabase, `src/proxy.ts`) `[ADOPTED]`. La story 1.1 complète ce socle.
- Deux projets Supabase, **dev** et **prod**, en Europe ; poste local → dev, production Vercel (branche `main`) → prod (AD-15).
- `.env.example` avec `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SECRET_EMPREINTE_IP`, `SECRET_COOKIES` ; détection de secrets par gitleaks (AD-15).
- Structure de la base uniquement par migrations `supabase/migrations/`, appliquées sur dev puis prod (AD-16).
- Toute écriture passe par une fonction SQL nommée (`deposer_demande`, `saisir_demande`, `changer_statut`, `attribuer_demande`, `changer_priorite`, `ajouter_commentaire`, `supprimer_demande`, `anonymiser_demandes`, `creer_profil`, `modifier_compte`, `ajouter_categorie`, `modifier_categorie`, `modifier_parametres`, `enregistrer_tentative`, `ecrire_journal`), protégée (droits propriétaire, chemin de recherche vide, droit d'exécution donné explicitement) (AD-2, AD-9).
- RLS sur toutes les tables, rôle `anon` sans aucun droit, clé secrète limitée à `src/server/admin`, `depot`, `connexion`, `journal`, avec une règle ESLint (AD-9).
- Historique en ajout seul (AD-3) ; référence par compteur annuel verrouillé (AD-4) ; transitions et définition « à traiter » uniques dans la base (AD-5).
- Garde `src/proxy.ts` (session, redirections, premier mot de passe, compte inactif, 8 h, pas de cache) et `exigerUtilisateur()` / `exigerAdministrateur()` au début de chaque action et lecture (AD-7).
- Blocage des connexions par `tentatives_connexion` (AD-8) ; comptes créés par Auth puis `creer_profil` (AD-6).
- Un schéma Zod par formulaire dans `src/shared/schemas` (AD-11).
- Format de réponse `{ ok, … }` et codes fermés ; enveloppe des actions ; `onRequestError` dans `src/instrumentation.ts` ; écran S3 avec code (AD-12).
- Journal technique en table, via `journaliser()`, liste d'événements fermée (AD-13) ; empreinte d'IP, purge 24 h (AD-14).
- Cookie serveur signé pour passer des informations entre pages (`src/server/passage`) ; numéro d'envoi unique contre les doubles créations (AD-20).
- Thème : tokens de DESIGN.md dans `globals.css`, composants shadcn/ui, icônes lucide-react (AD-19).
- Mise en production : Vercel Hobby, tag `vX.Y.Z` = version de `package.json` affichée, retour arrière Vercel (AD-17).
- Sauvegarde chiffrée chaque nuit par GitHub Actions, 7 jours, `sauvegarde_reussie` au journal, contrôle mensuel, mot de passe de chiffrement aussi hors GitHub ; restauration testée sur dev (AD-18).
- Tests : Vitest (un fichier par règle RM dans `tests/regles/`) et Playwright (parcours SM-1), sur dev uniquement.
- Premier administrateur créé par une procédure d'installation documentée (FR-21).
- Performance : lecture paginée, index, test avec 5 000 demandes (NFR-13).
- Documentation dans `docs/` : `deploiement.md`, `maintenance.md`, `support.md`, `securite-acces.md`, `donnees-personnelles.md`.

### UX Design Requirements

UX-DR1 : Déclarer les tokens de DESIGN.md (couleurs dont l'accent violet, police Inter et police à chasse fixe, rayons 6/10/14/20 px, espacements, ombres douces) dans `globals.css` et les utiliser partout.
UX-DR2 : Logo Nova Services (carré bleu, étoile violette à 4 branches, « **Nova** Services ») en haut du formulaire public et du menu.
UX-DR3 : Boutons principal, secondaire, discret et danger, avec leurs états (survol, focus visible, désactivé, « Envoi en cours… »), un seul bouton principal par écran.
UX-DR4 : Champs de saisie avec étiquette visible, astérisque, aide, état d'erreur (bordure rouge, icône, message), compteur de caractères pour l'objet et la description.
UX-DR5 : Résumé d'erreurs en haut des formulaires, qui reçoit la sélection et renvoie vers chaque champ.
UX-DR6 : Badges de statut (pilule : Nouvelle, En cours, Traitée), badges Urgente, Sans activité, Désactivé(e), toujours avec le mot écrit.
UX-DR7 : Carte compteur « à traiter » cliquable, avec étoile décorative.
UX-DR8 : Tableau des demandes (en-têtes, lignes de 56 px cliquables, référence en chasse fixe) et pagination.
UX-DR9 : Menu latéral : logo, éléments avec icônes, pastille du nombre à traiter, section Administration réservée aux administrateurs, nom, rôle, « Se déconnecter », numéro de version.
UX-DR10 : Historique en frise verticale, commentaires internes dans un encadré marqué « Interne ».
UX-DR11 : Alertes erreur, succès, information ; toasts (5 s, erreurs jusqu'à fermeture, annoncés aux lecteurs d'écran).
UX-DR12 : Fenêtre de confirmation (sélection sur « Annuler », Échap ferme, une seule à la fois).
UX-DR13 : Petits contrôles : bouton de filtre, case à cocher, liste déroulante, choix Normale / Urgente, fil d'Ariane, squelette de chargement, pastille d'icône.
UX-DR14 : Icônes au trait lucide-react (18, 16 ou 13 px), toujours accompagnées d'un mot.
UX-DR15 : États communs : rien de spécial sous 300 ms, puis squelette ; listes vides avec une phrase et une action ; erreur technique avec « Réessayer ».
UX-DR16 : Accessibilité WCAG 2.2 AA : tout au clavier, lien « Aller au contenu », annonces (compteur, toasts, nombre de résultats), zones de 44 px, zoom 200 %.
UX-DR17 : Responsive : P1 et P2 en une colonne à 360 px ; espace interne avec menu fixe à partir de 1 024 px, menu replié et détail sur une colonne sur tablette, liste en cartes sur téléphone.
UX-DR18 : Textes : vouvoiement, messages exacts d'EXPERIENCE.md, dates au format « 8 nov. 2026, 9 h 12 ».
UX-DR19 : Pages S1 (accès refusé), S2 (page introuvable), S3 (erreur inattendue avec code, heure et page).

### FR Coverage Map

| Exigence | Epic | Story | En bref |
|---|---|---|---|
| FR1 | Epic 1 | 1.3 | Formulaire de dépôt |
| FR2 | Epic 1 | 1.3 | Vérification sans perte de saisie |
| FR3 | Epic 1 | 1.3 | Enregistrement, référence, statut Nouvelle |
| FR4 | Epic 1 | 1.4 | Écran de confirmation |
| FR5 | Epic 1 | 1.3 | Mention données personnelles et case |
| FR6 | Epic 6 | 6.5 | Anti-spam (Should) |
| FR7 | Epic 7 | 7.1 | Email au demandeur (Could) |
| FR8 | Epic 1 | 1.6 | Connexion, messages neutres, blocage |
| FR9 | Epic 1 | 1.6, 1.7 | Déconnexion, expiration après 8 h |
| FR10 | Epic 1 | 1.6 | Espace interne protégé |
| FR11 | Epic 1 | 1.8 | Liste des demandes |
| FR12 | Epic 1, Epic 2 | 1.9, 2.4 | Recherche, autres demandes d'un même demandeur |
| FR13 | Epic 2, Epic 6 | 2.1, 6.1, 6.2 | Filtres (statut, catégorie, canal ; priorité et attribution en Should) |
| FR14 | Epic 1, Epic 2, Epic 6 | 1.8, 2.2, 6.2, 6.4 | Compteur, filtre « à traiter », urgentes et « Sans activité » (Should) |
| FR15 | Epic 1 | 1.10 | Détail d'une demande |
| FR16 | Epic 1 | 1.11 | Changement de statut |
| FR17 | Epic 1 | 1.10, 1.11 | Historique |
| FR18 | Epic 6 | 6.1 | Attribution (Should) |
| FR19 | Epic 6 | 6.2 | Priorité (Should) |
| FR20 | Epic 6 | 6.3 | Commentaire interne (Should) |
| FR21 | Epic 1, Epic 3 | 1.5, 1.7, 3.2 | Premier administrateur, premier mot de passe, création de compte |
| FR22 | Epic 3 | 3.3, 3.4 | Modifier, désactiver, réactiver un compte |
| FR23 | Epic 3, Epic 7 | 3.5, 7.3 | Réinitialisation par l'administrateur ; « Mot de passe oublié » (Could) |
| FR24 | Epic 3 | 3.1 | Droits selon le rôle |
| FR25 | Epic 3 | 3.3, 3.4 | Dernier administrateur |
| FR26 | Epic 4 | 4.1, 4.2 | Catégories |
| FR27 | Epic 4 | 4.2 | Statuts fixes |
| FR28 | Epic 4 | 4.4 | Suppression d'une demande |
| FR29 | Epic 6, Epic 7 | 6.6, 7.4 | Anonymisation (Should) ; automatique (Could) |
| FR30 | Epic 2 | 2.3 | Saisie d'une demande reçue par téléphone ou par email |
| FR31 | Epic 4 | 4.3 | Informations générales |
| FR32 | Epic 7 | 7.2 | Email aux collègues (Could) |
| NFR1, NFR2, NFR4 | Epic 1 | 1.1, 1.12 | En ligne, deux environnements, version visible |
| NFR3, NFR14 | Epic 1, Epic 5 | 1.1, 5.4 | Aucun secret, règles métier testées |
| NFR5 | Epic 5 | 5.2 | Retour à la version précédente |
| NFR6 | Epic 1 | 1.2 | Journal technique |
| NFR7 | Epic 1, Epic 5 | 1.13, 5.1 | Sauvegarde de nuit (1.13), restauration testée (5.1) |
| NFR8, NFR9, NFR10 | Epic 5 | 5.3 | Documentation |
| NFR11 | Epic 1, Epic 3 | 1.3, 1.5, 1.6, 3.1 | Sécurité |
| NFR12 | Epic 1, Epic 6 | 1.3, 6.7 | Simplicité et accessibilité |
| NFR13 | Epic 6 | 6.8 | Performance |

## Epic List

Les epics sont classés **par ordre de priorité**. On ne commence un epic qu'après avoir terminé et vérifié le précédent.

| Priorité | Epic | Ce que l'on peut faire à la fin | Exigences | Peut attendre ? |
|---|---|---|---|---|
| **1** | **Epic 1 — Déposer une demande et la faire traiter** | Le parcours complet, en ligne et sauvegardé chaque nuit : un client dépose une demande et reçoit sa référence ; un collaborateur connecté la retrouve et la fait passer de *Nouvelle* à *En cours*, puis à *Traitée*. | FR1 à FR5, FR8 à FR12, FR14 à FR17, FR21 (en partie) ; NFR1, NFR2, NFR4, NFR6, NFR7 (sauvegarde) | **Non** : c'est le cœur du projet (SM-1). |
| **2** | **Epic 2 — Centraliser toutes les demandes** | Les collaborateurs filtrent la liste, affichent d'un clic ce qui est à traiter, saisissent les demandes reçues par téléphone ou par email et repèrent les doublons. | FR12 à FR14, FR30 | **Non** : Must du cahier des charges. |
| **3** | **Epic 3 — Gérer les comptes et les droits** | L'administrateur crée, modifie, désactive les comptes et réinitialise les mots de passe ; un collaborateur n'a aucun accès à l'administration. | FR21 à FR25 | **Non** : Must. |
| **4** | **Epic 4 — Régler l'application et respecter le RGPD** | L'administrateur gère les catégories, les contacts affichés aux demandeurs, et peut supprimer une demande à la demande d'une personne. | FR26 à FR28, FR31 | **Non** : Must. |
| **5** | **Epic 5 — Exploiter l'application sans risque** | Restauration et retour arrière testés, documentation complète, règles métier testées, aucun secret dans le dépôt. | NFR3, NFR5, NFR7 à NFR10, NFR14 | **Non** : Must, exigé pour le rendu (SM-2, SM-4). |
| 6 | Epic 6 — Confort de traitement *(Should)* | Attribution, priorité, commentaires, « Sans activité », anti-spam, anonymisation, confort sur tablette et téléphone, rapidité. | FR6, FR13 et FR14 (en partie), FR18 à FR20, FR29 ; NFR12, NFR13 | **Oui** : seulement quand les epics 1 à 5 sont terminés et vérifiés (SM-C1). |
| 7 | Epic 7 — Bonus *(Could)* | Emails automatiques, « Mot de passe oublié », anonymisation automatique. | FR7, FR23 (en partie), FR29 (en partie), FR32 | **Oui** : bonus. Les stories 7.1 à 7.3 demandent un nom de domaine, soit environ 10 à 15 € par an, hors budget actuel. |

**Ce qui peut attendre, en clair :** tout l'epic 6 et tout l'epic 7. L'application est complète et conforme au cahier des charges à la fin de l'epic 5.

### Ordre de construction

Validé par Aurel le 8 novembre 2026. Il va de la story la plus utile à la moins utile, et respecte les dépendances : une story n'utilise jamais ce qui est construit après elle.

| Étape | Stories | Pourquoi à ce moment |
|---|---|---|
| 1 | 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8 → 1.9 → 1.10 → 1.11 → 1.12 | Le parcours principal (SM-1), dans l'ordre, jusqu'à la mise en ligne. |
| 2 | 1.13 | Protéger tout de suite les données de production. |
| 3 | 2.1 → 2.3 → 2.2 → 2.4 | Centraliser : filtres d'abord (la 2.3 utilise le filtre par canal), puis la saisie des demandes reçues par téléphone ou par email. |
| 4 | 3.1 → 3.2 → 3.4 → 3.5 → 3.3 | Comptes : pouvoir couper l'accès d'une personne qui part passe avant la simple modification d'un nom. |
| 5 | 4.4 → 4.1 → 4.2 → 4.3 | Le droit à l'effacement d'abord, puis les réglages. |
| 6 | 5.1 → 5.2 → 5.3 → 5.4 | Exploitation ; la story 5.4 en dernier, juste avant le rendu. |
| 7 *(peut attendre)* | 6.1 → 6.2 → 6.3 → 6.5 → 6.4 → 6.7 → 6.6 → 6.8 | Should, seulement après les étapes 1 à 6. |
| 8 *(bonus)* | 7.4 → 7.3 → 7.1 → 7.2 | Could ; 7.4 est gratuite, les autres demandent un nom de domaine. |

Le bilan de préparation qui a conduit à cet ordre est dans [implementation-readiness.md](implementation-readiness.md).

### Règles communes à toutes les stories

Une story est terminée seulement quand :

- ses critères d'acceptation sont vérifiés à l'écran, sur l'environnement d'essai (**dev**) ;
- les règles d'architecture citées dans sa ligne *Réf.* sont respectées (AD-1 à AD-20) ;
- chaque règle métier (RM) qu'elle touche a son test automatisé dans `tests/regles/`, et tous les tests passent (NFR-14) ;
- les textes affichés sont ceux d'EXPERIENCE.md, et l'écran respecte DESIGN.md et les bases de l'accessibilité : étiquettes visibles, utilisation au clavier, statut jamais indiqué par la couleur seule ;
- les tables nécessaires sont créées par une migration, **seulement quand la story en a besoin** ;
- chaque événement de la liste d'AD-13 que la story produit (connexion, création de compte, changement de rôle, désactivation, réinitialisation, suppression, paramètres modifiés…) est vérifié dans la table `journal_technique`, sans aucune donnée de demandeur (NFR-6).

---

## Epic 1 : Déposer une demande et la faire traiter

**Priorité 1 — Must.** À la fin de cet epic, le parcours principal (SM-1) fonctionne en ligne. Un client dépose une demande et reçoit sa référence ; un collaborateur connecté la retrouve par la recherche, la passe *En cours*, puis *Traitée*, et l'historique montre ces trois étapes. Les données de production sont sauvegardées chaque nuit dès la mise en ligne.

### Story 1.1 : Préparer l'application et l'environnement d'essai

En tant que responsable technique,
je veux une application qui démarre avec l'identité visuelle de Nova et se connecte à une base d'essai,
pour pouvoir construire les écrans sur une base propre et sans secret dans le dépôt.

**Critères d'acceptation :**

1. **Étant donné** le dépôt existant, **quand** je lance l'application en local, **alors** une page s'affiche avec le logo Nova Services, la police Inter et les couleurs de DESIGN.md.
2. **Étant donné** le projet Supabase **dev** créé en Europe, **quand** j'applique les migrations avec la Supabase CLI, **alors** elles apparaissent comme appliquées dans le tableau de bord de dev.
3. **Étant donné** le fichier `.env.example`, **quand** je l'ouvre, **alors** il liste les 5 variables d'AD-15 avec des valeurs fictives, `.env.local` n'est pas dans le dépôt, et gitleaks ne trouve aucun secret.
4. **Étant donné** l'outil de tests (Vitest) installé, **quand** je lance la commande de tests, **alors** elle s'exécute sans erreur, prête à recevoir les tests des règles métier.

*Réf. : NFR-2, NFR-3 · AD-15, AD-16, AD-19 · UX-DR1, UX-DR2, UX-DR3, UX-DR14 · composants shadcn/ui et lucide-react installés.*

### Story 1.2 : Enregistrer les erreurs pour le support

En tant que responsable technique,
je veux que toute erreur soit enregistrée avec un code court et affichée proprement,
pour retrouver un problème en moins de 5 minutes sans montrer de détail technique aux utilisateurs.

**Critères d'acceptation :**

1. **Étant donné** une page de test qui provoque une erreur, **quand** je l'ouvre, **alors** l'écran S3 affiche « Une erreur inattendue s'est produite », un code court, l'heure et la page.
2. **Étant donné** ce code, **quand** je filtre la table `journal_technique` dans le tableau de bord de Supabase, **alors** je trouve la ligne correspondante, avec son niveau « erreur » et sa date.
3. **Étant donné** une adresse qui n'existe pas, **quand** je l'ouvre, **alors** l'écran S2 « Cette page n'existe pas ou a été supprimée » s'affiche.
4. **Étant donné** une Server Function de test qui renvoie une erreur prévue, **quand** je l'appelle, **alors** elle répond au format commun (`ok: false`, code de la liste fermée, message en français).

*Réf. : NFR-6, NFR-9 · AD-12, AD-13 · UX-DR19 · Table créée : `journal_technique`.*

### Story 1.3 : Déposer une demande

En tant que demandeur,
je veux remplir un formulaire simple depuis mon téléphone, sans créer de compte,
pour transmettre ma demande à Nova Services sans chercher qui appeler.

**Critères d'acceptation :**

1. **Étant donné** que j'ouvre le formulaire sur un écran de 360 px de large, **quand** il s'affiche, **alors** je vois les 7 champs avec leurs étiquettes, les 5 catégories de départ, la mention sur les données (conservation 3 ans) et la case à cocher, sans défilement horizontal.
2. **Étant donné** que j'ai oublié mon email ou la case sur les données, **quand** j'appuie sur « Envoyer ma demande », **alors** l'encadré « 1 champ est à corriger » et le message de l'UX (« L'email est obligatoire », ou celui de la case) s'affichent, et tout ce que j'ai saisi est toujours là.
3. **Étant donné** un fichier situé hors des 4 modules autorisés qui importe la clé secrète, **quand** je lance la vérification du code (lint), **alors** une erreur est signalée.
4. **Étant donné** un formulaire correctement rempli, **quand** j'envoie, **alors** la demande apparaît dans la base de dev avec une référence `NOVA-2026-0001`, le statut *Nouvelle*, la priorité *Normale*, le canal *Formulaire* et un événement « Demande créée » par « Demandeur ».

*Réf. : FR-1, FR-2, FR-3, FR-5 · RM-1, RM-2, RM-12 · AD-2, AD-4, AD-9, AD-11 · P1 · UX-DR4, UX-DR5, UX-DR11, UX-DR13 (case à cocher, liste déroulante), UX-DR17 · Tables créées : `categories` (5 catégories de départ), `parametres` (valeurs d'exemple clairement fictives, remplacées en production par la procédure de la story 1.5), `demandes`, `evenements`, `compteurs_reference`.*

### Story 1.4 : Recevoir la confirmation avec sa référence

En tant que demandeur,
je veux voir aussitôt un écran qui me donne ma référence,
pour avoir la preuve que ma demande est bien enregistrée.

**Critères d'acceptation :**

1. **Étant donné** que ma demande vient d'être enregistrée, **quand** l'écran suivant s'affiche, **alors** je lis « Votre demande a bien été enregistrée », ma référence en grand, l'objet, mon email et le téléphone de contact de Nova.
2. **Étant donné** l'écran de confirmation, **quand** je l'actualise, **alors** la même référence s'affiche, et aucune deuxième demande n'est créée.
3. **Étant donné** que l'enregistrement échoue (base indisponible), **quand** j'envoie, **alors** je reste sur le formulaire, avec mes informations, le message « Votre demande n'a pas pu être envoyée… » et le téléphone de Nova, et aucune confirmation ne s'affiche.
4. **Étant donné** que j'ouvre l'adresse de la confirmation sans venir du formulaire, **quand** la page se charge, **alors** je suis renvoyé au formulaire, et aucune information d'une autre demande n'est visible dans l'adresse ni à l'écran.

*Réf. : FR-4 · AD-20 (cookie signé, numéro d'envoi unique) · P2.*

### Story 1.5 : Créer le premier compte administrateur

En tant que responsable technique,
je veux une procédure écrite qui crée le premier compte administrateur,
pour ouvrir l'espace interne sans aucune page d'inscription publique.

**Critères d'acceptation :**

1. **Étant donné** la procédure écrite dans `docs/deploiement.md`, **quand** je la suis sur dev, **alors** un compte apparaît dans Supabase Auth et dans `profils`, avec le rôle *administrateur*, actif, et « doit changer son mot de passe ». Sur dev, la même procédure peut aussi créer un compte *collaborateur* de test.
2. **Étant donné** les réglages d'Auth de dev, **quand** je les ouvre, **alors** les inscriptions publiques sont désactivées et la longueur minimale du mot de passe est de 12 caractères.
3. **Étant donné** l'application, **quand** je cherche une page d'inscription, **alors** il n'en existe aucune.
4. **Étant donné** la procédure suivie en production, **quand** j'ouvre ensuite l'écran de confirmation, **alors** il affiche les vraies coordonnées de Nova (téléphone, email de contact, contact pour les données personnelles), et non plus les valeurs d'exemple.

*Réf. : FR-21 (premier administrateur), FR-31 (valeurs de départ) · RM-8 · NFR-11 · AD-6 · Tables créées : `profils`, `mdp_temporaires`.*

### Story 1.6 : Se connecter et se déconnecter

En tant que collaborateur,
je veux me connecter avec mon email et mon mot de passe, puis me déconnecter,
pour accéder aux demandes en sachant que personne d'autre ne peut les voir.

**Critères d'acceptation :**

1. **Étant donné** que je ne suis pas connecté, **quand** j'ouvre l'adresse d'une page interne, **alors** j'arrive sur la page de connexion.
2. **Étant donné** la page de connexion, **quand** je saisis un email ou un mot de passe faux, **alors** le message est « Identifiants incorrects », que l'email existe ou non ; après 5 échecs, le message devient « Trop de tentatives, réessayez plus tard » pendant 15 minutes.
3. **Étant donné** un compte actif, **quand** je saisis les bons identifiants, **alors** j'entre dans l'espace interne ; un compte désactivé (dans la base de dev) reçoit « Identifiants incorrects ».
4. **Étant donné** que je suis connecté, **quand** je clique sur « Se déconnecter », **alors** je reviens à la page de connexion, et le bouton Retour du navigateur ne réaffiche aucune donnée.

*Réf. : FR-8, FR-9, FR-10 · NFR-11 · AD-7, AD-8, AD-13 · I1 · Table créée : `tentatives_connexion`. Les tentatives de plus de 24 h sont effacées automatiquement à chaque nouvel enregistrement, sans tâche planifiée (AD-14).*

### Story 1.7 : Choisir son mot de passe et rester protégé

En tant que collaborateur,
je veux choisir mon propre mot de passe à ma première connexion, et être déconnecté si je m'absente longtemps,
pour que mon compte reste sûr.

**Critères d'acceptation :**

1. **Étant donné** un compte qui doit changer son mot de passe, **quand** je me connecte, **alors** l'écran « Choisir un nouveau mot de passe » s'affiche, avec le lien « Se déconnecter », et aucune autre page n'est accessible tant que je n'ai pas terminé.
2. **Étant donné** cet écran, **quand** je saisis moins de 12 caractères, deux mots de passe différents, ou le mot de passe temporaire, **alors** le message correspondant de l'UX s'affiche et rien n'est enregistré.
3. **Étant donné** un nouveau mot de passe valide, **quand** je l'enregistre, **alors** j'arrive sur l'espace interne avec le toast « Mot de passe enregistré ».
4. **Étant donné** une session sans activité depuis plus de 8 heures, **quand** je clique sur une page, **alors** je reviens à la connexion avec le message « Votre session a expiré. Reconnectez-vous pour continuer. »

*Réf. : FR-9, FR-21 · AD-6, AD-7 · I2, I1.*

### Story 1.8 : Voir toutes les demandes et le compteur « à traiter »

En tant que collaborateur,
je veux voir dès ma connexion la liste de toutes les demandes et le nombre de demandes à traiter,
pour savoir immédiatement ce qui m'attend.

**Critères d'acceptation :**

1. **Étant donné** que je me connecte, **quand** l'accueil s'affiche, **alors** je vois le menu latéral (logo, « Demandes » avec sa pastille, mon nom et mon rôle, « Se déconnecter », le numéro de version) et la carte « *N* à traiter », égale au nombre de demandes *Nouvelle*.
2. **Étant donné** des demandes en base, **quand** je regarde la liste, **alors** chaque ligne montre la référence, la date de dépôt, le demandeur, l'objet, la catégorie et un badge de statut écrit en toutes lettres, des plus récentes aux plus anciennes.
3. **Étant donné** plus de 25 demandes, **quand** je regarde le bas de la liste, **alors** je lis « Page 1 sur 2 » et je peux passer à la page suivante.
4. **Étant donné** aucune demande en base, **quand** j'ouvre la liste, **alors** je lis « Aucune demande pour le moment… » ; pendant un chargement lent, un squelette s'affiche ; en cas d'échec, « Impossible de charger les demandes. » avec « Réessayer ».

*Réf. : FR-11, FR-14 (partie Must) · NFR-4 · RM-6 · AD-1, AD-5, AD-7, AD-9 · I3 · UX-DR6 à UX-DR9, UX-DR15.*

### Story 1.9 : Retrouver une demande par la recherche

En tant que collaborateur,
je veux taper une référence, un nom, un email, une entreprise ou un mot de l'objet,
pour retrouver une demande en moins de 30 secondes.

**Critères d'acceptation :**

1. **Étant donné** la demande `NOVA-2026-0042`, **quand** je tape sa référence, **alors** elle est la seule affichée, et le nombre de résultats indique « 1 demande ».
2. **Étant donné** une demandeuse « Hélène Dupuis », **quand** je tape `helene` ou `HÉLÈNE`, **alors** sa demande est trouvée.
3. **Étant donné** un texte qui ne correspond à rien, **quand** je lance la recherche, **alors** je lis « Aucune demande trouvée » et « Vérifiez l'orthographe ou retirez des filtres. »

*Réf. : FR-12 · SM-6 · conventions « Recherche » et « Adresse de la liste » · I3 · UX-DR13 (pastille d'icône).*

### Story 1.10 : Consulter le détail et l'historique d'une demande

En tant que collaborateur,
je veux ouvrir une demande et lire tout son contenu et son historique,
pour comprendre la demande avant de rappeler le client.

**Critères d'acceptation :**

1. **Étant donné** la liste, **quand** je clique sur une ligne, **alors** le détail s'ouvre avec la référence, l'objet, le statut, la description avec ses retours à la ligne, les coordonnées, la catégorie, le canal et la date de dépôt.
2. **Étant donné** le détail, **quand** je regarde l'historique, **alors** je vois « Demande créée — Demandeur — 8 nov. 2026, 8 h 47 », du plus ancien au plus récent.
3. **Étant donné** une description qui contient `<script>`, **quand** je l'affiche, **alors** le texte apparaît tel quel, sans être exécuté.
4. **Étant donné** le fil d'Ariane « ← Demandes », **quand** je clique dessus, **alors** je retrouve la liste avec la même recherche et la même page.

*Réf. : FR-15, FR-17 · NFR-11 · AD-1, AD-3 · I4 · UX-DR10, UX-DR13 (fil d'Ariane), UX-DR18.*

### Story 1.11 : Faire avancer une demande de Nouvelle à Traitée

En tant que collaborateur,
je veux passer une demande *En cours*, puis *Traitée*, et la rouvrir si besoin,
pour que tout le monde sache où elle en est.

**Critères d'acceptation :**

1. **Étant donné** une demande *Nouvelle*, **quand** je clique sur « Passer En cours », **alors** le badge devient *En cours*, l'historique ajoute « Statut : Nouvelle → En cours » avec mon nom et l'heure, et le compteur « à traiter » baisse de 1.
2. **Étant donné** une demande *Nouvelle*, **quand** je regarde les actions, **alors** « Passer En cours » et « Marquer Traitée » sont proposées ; pour une demande *En cours*, seule « Marquer Traitée » l'est. Après « Marquer Traitée », la date de clôture s'affiche. Le retour à *Nouvelle* n'est jamais proposé.
3. **Étant donné** une demande *Traitée*, **quand** je clique sur « Rouvrir (En cours) » et confirme dans la fenêtre, **alors** elle repasse *En cours* et sa date de clôture disparaît.
4. **Étant donné** qu'un collègue a changé le statut juste avant moi, **quand** je clique, **alors** je lis « Cette demande a été modifiée par … à … L'affichage a été mis à jour. », et l'historique indique le statut réel avant mon action.

*Réf. : FR-16, FR-17 · RM-3, RM-4, RM-5 · AD-2, AD-3, AD-5 · I4 · UX-DR11 (toast), UX-DR12.*

### Story 1.12 : Mettre le parcours principal en ligne

En tant que responsable technique,
je veux publier l'application sur une adresse en HTTPS, reliée à la base de production,
pour que le parcours principal soit utilisable par de vrais utilisateurs.

**Critères d'acceptation :**

1. **Étant donné** le projet Supabase **prod** et le projet Vercel reliés à `main`, **quand** j'envoie `main` sur GitHub, **alors** l'application est publiée sur une adresse `*.vercel.app`, en HTTPS.
2. **Étant donné** une demande de test créée sur dev, **quand** j'ouvre la liste en production, **alors** elle n'y apparaît pas.
3. **Étant donné** le test Playwright du parcours SM-1, **quand** je le lance sur dev, **alors** il passe : dépôt, référence, recherche, *En cours*, *Traitée*, et trois lignes d'historique dans l'ordre.
4. **Étant donné** le tag `v0.1.0` posé sur `main`, **quand** j'ouvre l'espace interne en production, **alors** le menu affiche la version `v0.1.0`.

*Réf. : NFR-1, NFR-2, NFR-4 · SM-1 · AD-15, AD-16, AD-17 · premier administrateur de prod créé avec la procédure de la story 1.5.*

### Story 1.13 : Sauvegarder la production chaque nuit

En tant que responsable technique,
je veux une sauvegarde chiffrée de la base de production chaque nuit, dès la mise en ligne,
pour ne jamais perdre plus de 24 heures de demandes.

**Critères d'acceptation :**

1. **Étant donné** la tâche GitHub Actions planifiée, **quand** je regarde l'onglet Actions le matin, **alors** la sauvegarde de la nuit a réussi, et son fichier est chiffré et gardé 7 jours.
2. **Étant donné** le journal technique, **quand** je le filtre sur `sauvegarde_reussie`, **alors** la dernière ligne a moins de 24 heures.
3. **Étant donné** le mot de passe de chiffrement, **quand** je vérifie où il est rangé, **alors** il est dans les secrets GitHub et aussi hors de GitHub (gestionnaire de mots de passe), et jamais dans le dépôt.

*Réf. : NFR-7 · AD-18 · la restauration est testée à la story 5.1.*

---

## Epic 2 : Centraliser toutes les demandes

**Priorité 2 — Must.** Toutes les demandes, y compris celles reçues par téléphone ou par email, sont au même endroit, et l'on trouve vite ce qui compte.

### Story 2.1 : Filtrer la liste des demandes

En tant que collaborateur,
je veux filtrer la liste par statut, par catégorie et par canal, en même temps que la recherche,
pour ne voir que les demandes qui m'intéressent.

**Critères d'acceptation :**

1. **Étant donné** la liste, **quand** je choisis le statut *Nouvelle* et la catégorie *Problème technique*, et que je tape « imprimante », **alors** seules les demandes qui remplissent les trois conditions s'affichent, et leur nombre est indiqué.
2. **Étant donné** un filtre actif, **quand** je clique sur « Réinitialiser », **alors** toutes les demandes réapparaissent.
3. **Étant donné** des filtres appliqués, **quand** j'ouvre une demande puis reviens en arrière, **alors** je retrouve exactement les mêmes filtres, qui figurent aussi dans l'adresse de la page.

*Réf. : FR-13 (partie Must), FR-30 (filtre par canal) · conventions « Adresse de la liste » · I3 · UX-DR13 (bouton de filtre), UX-DR16 (nombre de résultats annoncé).*

### Story 2.2 : Afficher d'un clic les demandes à traiter

En tant que collaborateur,
je veux cliquer sur le compteur « à traiter »,
pour voir directement les demandes qui attendent une intervention.

**Critères d'acceptation :**

1. **Étant donné** la carte « 5 à traiter », **quand** je clique dessus, **alors** la liste n'affiche plus que ces 5 demandes, et le filtre « À traiter » apparaît comme actif.
2. **Étant donné** aucune demande *Nouvelle*, **quand** j'ouvre l'accueil, **alors** la carte affiche « 0 à traiter » et « Tout est à jour », sans message de félicitations.
3. **Étant donné** que je passe une demande *En cours*, **quand** je reviens à la liste, **alors** le compteur et la pastille du menu ont baissé de 1.

*Réf. : FR-14 · AD-5 (définition unique de « à traiter ») · I3 · UX-DR7.*

### Story 2.3 : Saisir une demande reçue par téléphone ou par email

En tant que collaborateur,
je veux enregistrer moi-même une demande reçue au téléphone ou par email,
pour qu'aucune demande ne reste dans un fichier à part.

**Critères d'acceptation :**

1. **Étant donné** le menu « Nouvelle demande », **quand** je l'ouvre, **alors** je vois les champs du formulaire public, plus le canal (*Téléphone* ou *Email*) et la case « La personne a été informée de l'usage de ses données ».
2. **Étant donné** que j'ai oublié de cocher cette case, **quand** j'enregistre, **alors** l'enregistrement est refusé avec le message sous la case, et rien n'est perdu.
3. **Étant donné** une saisie complète, **quand** j'enregistre, **alors** le détail de la nouvelle demande s'ouvre avec le toast « Demande NOVA-2026-… créée », et l'historique indique « Créée par *mon nom* (canal : Téléphone) ».
4. **Étant donné** la liste, **quand** je filtre sur le canal *Téléphone*, **alors** cette demande apparaît.

*Réf. : FR-30 · RM-12 · AD-2, AD-4, AD-11, AD-20 · I5.*

### Story 2.4 : Retrouver les autres demandes d'un même demandeur

En tant que collaborateur,
je veux voir en un clic toutes les demandes d'une même personne,
pour repérer les doublons et ne pas traiter deux fois la même chose.

**Critères d'acceptation :**

1. **Étant donné** le détail d'une demande, **quand** je clique sur « Voir ses autres demandes », **alors** la liste s'ouvre avec la recherche sur l'email du demandeur.
2. **Étant donné** que je tape l'email d'un demandeur dans la recherche, **quand** les résultats s'affichent, **alors** toutes ses demandes apparaissent, quel que soit leur statut.

*Réf. : FR-12 (doublons) · I4, I3.*

---

## Epic 3 : Gérer les comptes et les droits

**Priorité 3 — Must.** L'administrateur gère seul les accès, et l'application garde toujours au moins un administrateur actif.

### Story 3.1 : Réserver l'administration aux administrateurs

En tant qu'administrateur,
je veux une section Administration que moi seul peux voir, avec la liste des comptes,
pour gérer les accès sans que les collaborateurs puissent y toucher.

**Critères d'acceptation :**

1. **Étant donné** que je suis administrateur, **quand** j'ouvre le menu, **alors** je vois la section « Administration » et, dans « Comptes », la liste des comptes avec nom, email, rôle et état.
2. **Étant donné** que je suis collaborateur, **quand** j'ouvre le menu, **alors** je ne vois aucune section ni aucun bouton d'administration.
3. **Étant donné** que je suis collaborateur, **quand** je tape directement l'adresse de la page « Comptes », **alors** je vois l'écran « Accès refusé. Cette page est réservée aux administrateurs. »

*Réf. : FR-24 · RM-7 · AD-7, AD-9 · A1, S1 · UX-DR9, UX-DR19.*

### Story 3.2 : Créer un compte pour un nouveau collègue

En tant qu'administrateur,
je veux créer un compte avec un mot de passe temporaire que je transmets moi-même,
pour donner accès à une nouvelle recrue sans aucun email.

**Critères d'acceptation :**

1. **Étant donné** la fenêtre « Créer un compte », **quand** je saisis nom, email et rôle, puis clique sur « Générer », **alors** un mot de passe temporaire de 12 caractères au moins est proposé.
2. **Étant donné** un email déjà utilisé, **quand** je valide, **alors** je lis « Cet email est déjà utilisé par un autre compte. »
3. **Étant donné** une création réussie, **quand** la fenêtre se met à jour, **alors** le mot de passe temporaire s'affiche une seule fois avec « Copier », et le compte apparaît dans la liste avec le toast « Compte créé ».
4. **Étant donné** ce nouveau compte, **quand** la personne se connecte, **alors** elle doit d'abord choisir son propre mot de passe.

*Réf. : FR-21 · RM-8 · AD-6 · A1.*

### Story 3.3 : Modifier le nom ou le rôle d'un compte

En tant qu'administrateur,
je veux corriger le nom d'un collègue ou changer son rôle,
pour que les droits suivent les responsabilités de chacun.

**Critères d'acceptation :**

1. **Étant donné** la fenêtre « Modifier », **quand** je change le nom ou le rôle, **alors** la modification est enregistrée ; l'email est affiché mais ne peut pas être modifié.
2. **Étant donné** que je suis le seul administrateur actif, **quand** j'essaie de me passer en collaborateur, **alors** je lis « Impossible : il doit rester au moins un administrateur actif. » et rien ne change.
3. **Étant donné** un administrateur que je viens de passer en collaborateur, **quand** il fait sa prochaine action, **alors** la section Administration disparaît de son menu, et une page d'administration ouverte affiche « Accès refusé ».

*Réf. : FR-22, FR-25 · RM-9 · AD-7, AD-10 · A1.*

### Story 3.4 : Désactiver ou réactiver un compte

En tant qu'administrateur,
je veux désactiver le compte d'une personne qui part, et pouvoir le réactiver,
pour couper son accès tout en gardant son nom dans l'historique.

**Critères d'acceptation :**

1. **Étant donné** la fenêtre de désactivation, **quand** je confirme, **alors** le compte porte le badge *Désactivé*, et la personne ne peut plus se connecter.
2. **Étant donné** une personne connectée dont je désactive le compte, **quand** elle fait sa prochaine action, **alors** elle revient à la connexion avec « Votre session a pris fin. Contactez votre administrateur si besoin. »
3. **Étant donné** une demande traitée par cette personne, **quand** j'ouvre son historique, **alors** son nom y figure toujours.
4. **Étant donné** le dernier administrateur actif, **quand** j'essaie de le désactiver, **alors** l'action est refusée avec le message du dernier administrateur. Un compte désactivé peut être réactivé.

*Réf. : FR-22, FR-25 · RM-9, RM-10 · AD-6, AD-7, AD-10, AD-13 · A1, I1.*

### Story 3.5 : Réinitialiser le mot de passe d'un collègue

En tant qu'administrateur,
je veux donner un nouveau mot de passe temporaire à un collègue qui a oublié le sien,
pour qu'il retrouve l'accès sans que je connaisse son mot de passe définitif.

**Critères d'acceptation :**

1. **Étant donné** la fenêtre « Réinitialiser le mot de passe de … », **quand** je valide un nouveau mot de passe temporaire, **alors** il s'affiche une seule fois avec « Copier ».
2. **Étant donné** cette réinitialisation, **quand** le collègue essaie son ancien mot de passe, **alors** il reçoit « Identifiants incorrects ».
3. **Étant donné** le nouveau mot de passe temporaire, **quand** il se connecte, **alors** il doit choisir un nouveau mot de passe avant toute autre page.

*Réf. : FR-23 · AD-6, AD-13 · A1, I2.*

---

## Epic 4 : Régler l'application et respecter le RGPD

**Priorité 4 — Must.** L'administrateur adapte l'application sans développeur, et peut effacer les données d'une personne qui le demande.

### Story 4.1 : Ajouter et renommer des catégories

En tant qu'administrateur,
je veux ajouter ou renommer une catégorie,
pour adapter le formulaire aux demandes réelles sans appeler un développeur.

**Critères d'acceptation :**

1. **Étant donné** la page « Catégories », **quand** j'ajoute *Facturation*, **alors** je lis « Catégorie Facturation ajoutée. Elle est déjà proposée dans le formulaire. », et elle apparaît dans le formulaire public.
2. **Étant donné** une catégorie active *Facturation*, **quand** j'ajoute ou renomme une autre catégorie en *Facturation*, **alors** je lis « Une catégorie active porte déjà ce nom. »
3. **Étant donné** une catégorie renommée, **quand** j'ouvre une demande qui l'utilise, **alors** le nouveau nom s'affiche.

*Réf. : FR-26 · AD-9 · A2.*

### Story 4.2 : Désactiver, réactiver ou supprimer une catégorie

En tant qu'administrateur,
je veux retirer une catégorie du formulaire sans perdre les demandes qui l'utilisent,
pour garder une liste claire.

**Critères d'acceptation :**

1. **Étant donné** une catégorie utilisée, **quand** je la désactive, **alors** elle disparaît du formulaire, mais les demandes la gardent avec la mention « (désactivée) », et le filtre de la liste la propose encore.
2. **Étant donné** une catégorie utilisée par une demande, **quand** je regarde ses actions, **alors** « Supprimer » n'est pas proposé ; une catégorie jamais utilisée peut être supprimée après confirmation.
3. **Étant donné** la dernière catégorie active, **quand** j'essaie de la désactiver ou de la supprimer, **alors** je lis « Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable. »
4. **Étant donné** l'espace d'administration, **quand** je le parcours, **alors** aucun écran ne permet d'ajouter, de renommer ou de supprimer un statut.

*Réf. : FR-26, FR-27 · RM-3, RM-11 · AD-10 · A2, I3, I4.*

### Story 4.3 : Modifier les informations de contact affichées aux demandeurs

En tant qu'administrateur,
je veux changer le téléphone, l'email de contact et le contact pour les données personnelles,
pour que les demandeurs aient toujours les bonnes coordonnées.

**Critères d'acceptation :**

1. **Étant donné** la page « Informations générales », **quand** je change le téléphone et enregistre, **alors** le nouveau numéro apparaît aussitôt sur l'écran de confirmation et dans les messages d'erreur du formulaire.
2. **Étant donné** un email de contact mal écrit, **quand** j'enregistre, **alors** je lis « L'email doit avoir la forme nom@exemple.fr » et rien n'est perdu.
3. **Étant donné** un nouveau contact pour les données personnelles, **quand** j'ouvre le formulaire public, **alors** la mention affiche ce contact.

*Réf. : FR-31 · AD-9, AD-13 · A3.*

### Story 4.4 : Supprimer définitivement une demande

En tant qu'administrateur,
je veux supprimer les demandes d'une personne qui demande l'effacement de ses données,
pour respecter son droit à l'effacement (RGPD).

**Critères d'acceptation :**

1. **Étant donné** le détail d'une demande, **quand** je suis administrateur, **alors** je vois « Supprimer la demande… » en bas du panneau d'actions ; un collaborateur ne le voit pas.
2. **Étant donné** ce bouton, **quand** je clique, **alors** une fenêtre demande « Supprimer définitivement la demande NOVA-… ? » et prévient que l'action est irréversible.
3. **Étant donné** que je confirme, **quand** je relance une recherche sur l'email de la personne, **alors** je lis « Aucune demande trouvée », et le compteur ne compte plus cette demande.
4. **Étant donné** un collègue qui avait la demande ouverte, **quand** il fait une action, **alors** il voit « Cette demande n'existe pas ou a été supprimée. »

*Réf. : FR-28 · RM-5, RM-7 · AD-2, AD-3, AD-13 · I4, S2 · Flux 5 d'EXPERIENCE.md.*

---

## Epic 5 : Exploiter l'application sans risque

**Priorité 5 — Must.** L'application peut être maintenue, réparée et reprise par quelqu'un d'autre, comme l'exige le cahier des charges.

### Story 5.1 : Restaurer une sauvegarde

En tant que responsable technique,
je veux une procédure de restauration testée,
pour savoir remettre les demandes en place si la base de production est abîmée.

**Critères d'acceptation :**

1. **Étant donné** une sauvegarde de nuit (story 1.13), **quand** je suis la procédure de `docs/maintenance.md` pour la restaurer sur dev, **alors** les demandes restaurées sont complètes, avec leur historique.
2. **Étant donné** ce test réel, **quand** j'ouvre la documentation, **alors** la date et la durée de la restauration y sont notées.
3. **Étant donné** la procédure, **quand** je la lis, **alors** elle explique où trouver le mot de passe de chiffrement et comment vérifier chaque mois que la sauvegarde de nuit tourne toujours.

*Réf. : NFR-7 · SM-4 · AD-18.*

### Story 5.2 : Revenir à la version précédente en moins de 15 minutes

En tant que responsable technique,
je veux une procédure testée pour remettre en ligne la version précédente,
pour réparer vite une mise en production ratée.

**Critères d'acceptation :**

1. **Étant donné** deux versions taguées en production, **quand** je suis la procédure de retour arrière de `docs/maintenance.md`, **alors** la version précédente est en ligne en moins de 15 minutes, et le menu affiche son numéro.
2. **Étant donné** ce test réel, **quand** j'ouvre la documentation, **alors** la date et la durée mesurée y sont notées.
3. **Étant donné** une version qui a modifié la base, **quand** je lis la procédure, **alors** elle explique quoi faire de la migration.

*Réf. : NFR-5 · SM-4 · AD-16, AD-17.*

### Story 5.3 : Rédiger la documentation d'exploitation

En tant que responsable technique,
je veux les cinq documents demandés par le cahier des charges,
pour qu'une autre personne puisse déployer, maintenir et dépanner l'application sans moi.

**Critères d'acceptation :**

1. **Étant donné** le dossier `docs/`, **quand** je l'ouvre, **alors** je trouve Déploiement, Maintenance, Support (avec les niveaux 1 et 2 et le plan en cas d'indisponibilité), Sécurité et accès, Protection des données personnelles.
2. **Étant donné** le document *Déploiement*, **quand** une personne qui n'a pas développé le projet le suit, **alors** elle met une version en ligne sans aide.
3. **Étant donné** le document *Support*, **quand** je le lis, **alors** il dit quelles informations le niveau 1 transmet au niveau 2 (heure, page, code d'erreur, référence) et comment vérifier chaque mois la sauvegarde de nuit.

*Réf. : NFR-8, NFR-9, NFR-10 · AD-18 (contrôle mensuel).*

### Story 5.4 : Prouver la qualité avant le rendu

En tant que responsable technique,
je veux vérifier que toutes les règles métier sont testées, qu'aucun secret n'a fuité et que chaque exigence a sa preuve,
pour rendre un projet conforme et vérifiable.

**Critères d'acceptation :**

1. **Étant donné** les tests automatisés, **quand** je les lance, **alors** chaque règle RM-1 à RM-14 réalisée a au moins un test, et tous passent.
2. **Étant donné** tout l'historique Git, **quand** je lance gitleaks, **alors** aucun secret n'est trouvé ; et le journal technique contient au moins une ligne de chaque événement d'AD-13 lié aux fonctions réalisées, sans aucune donnée de demandeur.
3. **Étant donné** le tableau de couverture du cahier des charges (addendum du PRD, §A), **quand** je le relis, **alors** chaque ligne a sa preuve (capture, test ou document), y compris SM-5 (une personne qui découvre le formulaire dépose une demande en moins de 2 minutes) et SM-6 (un collaborateur retrouve une demande en moins de 30 secondes).
4. **Étant donné** la documentation, **quand** je cherche la note « Démarche IA », **alors** elle décrit les outils utilisés, ce que l'IA a produit et comment cela a été vérifié.

*Réf. : NFR-3, NFR-6, NFR-14 · SM-2, SM-5, SM-6, SM-7, SM-8 · AD-13, AD-15.*

---

## Epic 6 : Confort de traitement *(Should — peut attendre)*

**Priorité 6 — Should.** À commencer **seulement** quand les epics 1 à 5 sont terminés et vérifiés (SM-C1). Ces fonctions rendent le travail plus confortable, mais l'application est conforme sans elles.

### Story 6.1 : S'attribuer une demande ou l'attribuer à un collègue

En tant que collaborateur,
je veux m'attribuer une demande ou la confier à un collègue,
pour que personne ne rappelle deux fois le même client.

**Critères d'acceptation :**

1. **Étant donné** le détail d'une demande, **quand** je clique sur « Me l'attribuer », **alors** mon nom s'affiche dans « Attribuée à », et l'historique ajoute « Attribuée à *mon nom* ».
2. **Étant donné** la liste de choix, **quand** je l'ouvre, **alors** elle ne propose que des comptes actifs ; un compte désactivé déjà attribué s'affiche « *Nom* (désactivé) ».
3. **Étant donné** la liste des demandes, **quand** je filtre sur « Attribuées à moi » ou « Non attribuées », **alors** seules les demandes correspondantes s'affichent, avec la colonne « Attribuée à ».

*Réf. : FR-18, FR-13 (partie Should) · RM-14 · AD-2 · I4, I3.*

### Story 6.2 : Marquer une demande comme urgente

En tant que collaborateur,
je veux passer une demande en priorité *Urgente*,
pour qu'elle reste visible tant qu'elle n'est pas traitée.

**Critères d'acceptation :**

1. **Étant donné** le choix Normale / Urgente du détail, **quand** je choisis *Urgente*, **alors** le badge « Urgente » apparaît devant l'objet dans la liste, et l'historique enregistre le changement.
2. **Étant donné** une demande urgente *En cours*, **quand** je regarde le compteur, **alors** elle fait partie des demandes « à traiter » jusqu'à ce qu'elle soit *Traitée*.
3. **Étant donné** la liste, **quand** je filtre sur la priorité *Urgente*, **alors** seules les demandes urgentes s'affichent.

*Réf. : FR-19, FR-14, FR-13 (parties Should) · AD-2, AD-5 · I3, I4 · UX-DR13 (choix segmenté).*

### Story 6.3 : Ajouter un commentaire interne

En tant que collaborateur,
je veux noter ce que j'ai fait sur une demande,
pour que mes collègues sachent où en est l'échange avec le client.

**Critères d'acceptation :**

1. **Étant donné** la zone « Ajouter un commentaire interne », **quand** elle est vide, **alors** le bouton « Publier » est désactivé.
2. **Étant donné** un commentaire publié, **quand** je regarde l'historique, **alors** il apparaît dans un encadré marqué « Interne — jamais visible par le demandeur », avec mon nom et l'heure.
3. **Étant donné** un commentaire publié, **quand** je cherche à le modifier ou à le supprimer, **alors** aucune action ne le permet.

*Réf. : FR-20 · RM-5 · AD-2, AD-3 · I4 · UX-DR10.*

### Story 6.4 : Repérer les demandes sans activité

En tant que collaborateur,
je veux voir les demandes *En cours* oubliées depuis plus de 7 jours,
pour relancer ce qui traîne.

**Critères d'acceptation :**

1. **Étant donné** une demande *En cours* sans événement depuis 8 jours, **quand** j'ouvre la liste, **alors** elle porte le badge « Sans activité ».
2. **Étant donné** le filtre « Sans activité », **quand** je l'active, **alors** seules ces demandes s'affichent.
3. **Étant donné** que j'ajoute une action sur cette demande, **quand** je reviens à la liste, **alors** le badge a disparu.

*Réf. : FR-14 (partie Should) · AD-5 · I3 · UX-DR6.*

### Story 6.5 : Bloquer les envois automatisés

En tant que responsable technique,
je veux rejeter les robots sans gêner les vrais demandeurs,
pour garder une liste de demandes propre.

**Critères d'acceptation :**

1. **Étant donné** le formulaire public, **quand** je le remplis normalement, **alors** aucun test visuel (CAPTCHA) n'est demandé.
2. **Étant donné** 10 envois depuis la même adresse IP en une heure, **quand** j'envoie un onzième formulaire, **alors** je lis « Trop de demandes ont été envoyées depuis votre connexion. Réessayez dans une heure, ou appelez-nous au … ».
3. **Étant donné** un envoi qui remplit le champ caché, **quand** il arrive, **alors** aucune demande n'est créée.
4. **Étant donné** la saisie interne d'une demande, **quand** un collaborateur en saisit plus de 10 en une heure, **alors** aucune limite ne s'applique.

*Réf. : FR-6 · SM-C2 · AD-14 · P1 · Table créée : `envois_formulaire`. Les lignes de plus de 24 h sont effacées automatiquement à chaque nouvel envoi, sans tâche planifiée.*

### Story 6.6 : Anonymiser les demandes anciennes

En tant qu'administrateur,
je veux effacer les données personnelles des demandes clôturées depuis plus de 3 ans,
pour respecter la durée de conservation annoncée aux demandeurs.

**Critères d'acceptation :**

1. **Étant donné** la page « Données personnelles » et aucune demande concernée, **quand** je l'ouvre, **alors** je lis « Aucune demande à anonymiser aujourd'hui. » et le bouton est désactivé.
2. **Étant donné** une demande de test clôturée il y a plus de 3 ans, **quand** je lance l'anonymisation et confirme, **alors** je lis « 1 demande anonymisée. », et son détail affiche « [anonymisé] » à la place des données personnelles et des textes.
3. **Étant donné** des demandes plus récentes ou non traitées, **quand** l'anonymisation est terminée, **alors** elles sont intactes, et l'historique de la demande anonymisée se termine par « Données personnelles anonymisées » avec mon nom.

*Réf. : FR-29 · RM-13 · AD-2, AD-3, AD-13 · A4, I4.*

### Story 6.7 : Utiliser l'application confortablement sur tablette, sur téléphone et au clavier

En tant que collaborateur,
je veux utiliser l'espace interne sur tablette, en dépannage sur téléphone, ou uniquement au clavier,
pour travailler dans toutes les situations.

**Critères d'acceptation :**

1. **Étant donné** une tablette (moins de 1 024 px), **quand** j'ouvre l'espace interne, **alors** le menu est replié derrière « Menu », et le panneau d'actions du détail passe sous le contenu.
2. **Étant donné** un téléphone, **quand** j'ouvre la liste, **alors** les demandes s'affichent en cartes (référence, objet, statut), sans défilement horizontal.
3. **Étant donné** le clavier seul, **quand** je parcours le formulaire public et la liste, **alors** tout est utilisable, le contour de sélection est toujours visible, et le lien « Aller au contenu » est le premier élément.
4. **Étant donné** un lecteur d'écran, **quand** je change un filtre ou qu'un toast s'affiche, **alors** le nombre de résultats et le message sont annoncés.

*Réf. : NFR-12 · UX-DR16, UX-DR17 · I3, I4, P1.*

### Story 6.8 : Garder une liste rapide avec beaucoup de demandes

En tant que collaborateur,
je veux que la liste, la recherche et les filtres restent rapides,
pour ne pas attendre quand l'historique de demandes grandit.

**Critères d'acceptation :**

1. **Étant donné** 5 000 demandes de test générées sur dev, **quand** j'ouvre la liste, **alors** elle s'affiche en moins de 2 secondes.
2. **Étant donné** ces 5 000 demandes, **quand** je combine une recherche et deux filtres, **alors** le résultat s'affiche en moins de 2 secondes.

*Réf. : NFR-13 · convention « Performance » · B3.*

---

## Epic 7 : Bonus *(Could — peut attendre)*

**Priorité 7 — Could.** Fonctions facultatives. Les stories 7.1 à 7.3 demandent un **nom de domaine** (environ 10 à 15 € par an) et un service d'envoi d'emails : à décider plus tard, hors budget actuel. La story 7.4 ne coûte rien.

### Story 7.1 : Recevoir un email de confirmation

En tant que demandeur,
je veux recevoir un email qui reprend ma référence,
pour la retrouver facilement plus tard.

**Critères d'acceptation :**

1. **Étant donné** une demande déposée, **quand** j'ouvre ma boîte de réception dans les 5 minutes, **alors** je trouve l'email « Votre demande NOVA-… est enregistrée » avec l'objet et le téléphone de Nova.
2. **Étant donné** que l'envoi de l'email échoue, **quand** je dépose ma demande, **alors** l'écran de confirmation s'affiche quand même, et l'échec est noté dans le journal technique.

*Réf. : FR-7 · E1 · AD-13.*

### Story 7.2 : Prévenir les collègues d'une nouvelle demande

En tant que collaborateur,
je veux recevoir un email à chaque nouvelle demande déposée,
pour réagir vite sans garder l'application ouverte.

**Critères d'acceptation :**

1. **Étant donné** une nouvelle demande déposée sur le formulaire, **quand** j'ouvre ma boîte de réception dans les 5 minutes, **alors** je trouve l'email avec la référence, l'objet, la catégorie et un lien vers la demande.
2. **Étant donné** cet email, **quand** je le lis, **alors** il ne contient jamais la description ni les coordonnées du demandeur.

*Réf. : FR-32 · E2.*

### Story 7.3 : Réinitialiser soi-même son mot de passe

En tant que collaborateur,
je veux un lien « Mot de passe oublié ? » sur la page de connexion,
pour retrouver l'accès sans attendre mon administrateur.

**Critères d'acceptation :**

1. **Étant donné** la page de connexion, **quand** je clique sur « Mot de passe oublié ? » et saisis mon email, **alors** un message neutre confirme l'envoi, que l'email existe ou non.
2. **Étant donné** l'email reçu, **quand** je suis le lien, **alors** je choisis un nouveau mot de passe de 12 caractères au moins, et l'ancien ne fonctionne plus.

*Réf. : FR-23 (partie Could) · AD-6, AD-8 · I1.*

### Story 7.4 : Anonymiser automatiquement chaque nuit

En tant qu'administrateur,
je veux que l'anonymisation se lance seule,
pour ne pas avoir à y penser.

**Critères d'acceptation :**

1. **Étant donné** une demande clôturée depuis plus de 3 ans, **quand** la tâche de nuit s'est exécutée, **alors** la demande est anonymisée, et son historique indique « Données personnelles anonymisées » par « Système ».
2. **Étant donné** le journal technique, **quand** je le filtre sur `anonymisation`, **alors** je vois le nombre de demandes traitées chaque nuit.

*Réf. : FR-29 (partie Could) · AD-18 (même tâche de nuit) · FR-17 (« Système »).*
