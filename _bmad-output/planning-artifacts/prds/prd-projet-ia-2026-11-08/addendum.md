---
title: Addendum au PRD — Nova Services
created: 2026-11-08
updated: 2026-11-08
prd: prd.md
---

# Addendum au PRD — Nova Services

Ce fichier complète le [PRD](prd.md). Il contient ce qui est utile aux étapes suivantes mais encombrerait le PRD : la vérification que le PRD couvre tout le cahier des charges, et les pistes techniques pour l'architecture. **Rien ici n'est une exigence nouvelle.**

## A. Couverture du cahier des charges

*À utiliser comme liste de contrôle avant le rendu (SM-2). Chaque ligne du CDC renvoie aux exigences du PRD qui la couvrent. Pour cocher une ligne, ajoutez « ✓ » dans la colonne « Preuve attendue », suivi du lien vers la preuve : capture, test ou document.*

### A.0 Contexte et mission

| Exigence du CDC | Couverte par | Preuve attendue |
|---|---|---|
| Centraliser les demandes, y compris celles reçues par téléphone ou par email | FR-1, FR-30 | Démo d'une saisie avec le canal *Téléphone* |
| Éviter les oublis | FR-14 (compteur, demandes sans activité) | Démo du compteur |
| Éviter les doublons | FR-12 (recherche par email) | Démo de la recherche |
| Donner de la visibilité sur le traitement | FR-11, FR-16, FR-17 | Démo de la liste et de l'historique |
| Application simple | §7 Non-objectifs, NFR-12 | Démo + SM-5 |
| Analyser le besoin, identifier les utilisateurs, définir les fonctionnalités | Ce PRD | PRD validé |
| Organiser le projet | Epics, stories et sprint-status (étapes BMAD suivantes) | Fichiers dans `_bmad-output/` |
| Démarche assistée par l'IA | NFR-14 | Note « Démarche IA » |
| Fonctionnalités ajoutées pour l'expérience utilisateur | Étiquettes `[AJOUT]` dans le PRD, avec leur justification (sous l'exigence pour les Must, en §C pour les autres) | Liste des `[AJOUT]` réalisés |

### A.1 Besoins de la direction

| Exigence du CDC | Couverte par | Preuve attendue |
|---|---|---|
| Moyen simple de transmettre une demande | FR-1, FR-2, SM-5 | Démo du formulaire |
| Savoir que la demande est enregistrée | FR-4 | Capture de l'écran de confirmation |
| Retrouver l'ensemble des demandes | FR-11, FR-12 | Démo liste et recherche |
| Consulter le contenu | FR-15 | Démo du détail |
| Identifier celles qui nécessitent une intervention | FR-13, FR-14 | Démo du compteur et des filtres |
| Suivre leur évolution | FR-16, FR-17 | Démo de l'historique |

### A.2 Fonctionnalités

| Exigence du CDC | Couverte par | Preuve attendue |
|---|---|---|
| Déposer une demande | FR-1 | Démo |
| Nom, coordonnées, objet, catégorie, description | FR-1 | Démo |
| Enregistrer en base de données | FR-3 | Demande visible en base |
| Confirmation après envoi | FR-4 | Capture |
| Connexion à un espace sécurisé | FR-8, FR-9, FR-10 | Démo + test d'accès sans connexion |
| Liste des demandes | FR-11 | Démo |
| Détail d'une demande | FR-15 | Démo |
| Rechercher ou filtrer | FR-12, FR-13 | Démo |
| Modifier le statut | FR-16 | Démo |
| Statuts Nouvelle, En cours, Traitée | FR-27, RM-3 | Démo |
| Historique simple du traitement | FR-17, RM-5 | Démo |
| Gestion des comptes utilisateurs | FR-21, FR-22, FR-23 | Démo |
| Droits collaborateur et administrateur | FR-24, FR-25 | Test de refus d'accès |
| Paramètres gérés par l'administrateur | FR-26 (catégories), FR-31 (informations générales) | Démo |

### A.3 Mise en production et fonctionnement

| Exigence du CDC | Couverte par | Preuve attendue |
|---|---|---|
| Accessible en ligne | NFR-1 | Adresse HTTPS |
| Paramètres dev et prod séparés | NFR-2 | Documentation + configuration |
| Aucun secret dans le code | NFR-3, SM-7 | Rapport de l'outil de détection |
| Versionner, identifier les versions déployées | NFR-4 | Tags Git + version affichée |
| Retour à une version précédente | NFR-5, SM-4 | Procédure + trace d'un test |
| Consulter les erreurs et événements | NFR-6 | Capture des logs |
| Sauvegarde et restauration | NFR-7, SM-4 | Procédure + trace d'un test |
| Actions en cas d'indisponibilité | NFR-8 | Fiche |
| Support niveau 1 et niveau 2 | NFR-9 | Fiche |
| Accès, sécurité, protection des données | NFR-10, NFR-11 | Documents 4 et 5 de NFR-10 (*Sécurité et accès*, *Protection des données personnelles*) |
| Code généré par l'IA compris, vérifié, testé | NFR-14 | Tests + relecture |
| Documentation synthétique (5 thèmes) | NFR-10 | 5 documents dans le dépôt |

### A.4 Résultat attendu (liste finale du CDC)

*Les preuves sont celles des tableaux A.2 et A.3.*

| Exigence du CDC | Couverte par |
|---|---|
| Interface de dépôt des demandes | FR-1 à FR-7, FR-30 |
| Espace interne authentifié | FR-8 à FR-10 |
| Gestion des utilisateurs et des droits | FR-21 à FR-25 |
| Gestion des demandes et de leurs statuts | FR-11 à FR-20, FR-30 |
| Base de données | FR-3, NFR-2, NFR-7 |
| Application versionnée et accessible en ligne | NFR-1, NFR-4 |
| Logs et suivi des erreurs | NFR-6 |
| Sauvegarde et restauration | NFR-7 |
| Retour à une version précédente | NFR-5 |
| Documentation synthétique | NFR-10, NFR-14 |

## B. Contexte technique existant (pour l'architecture)

*Ce sont des constats et des pistes, **pas des décisions**. L'étape `bmad-architecture` tranchera.*

**Déjà présent dans le dépôt** (commit initial) :
- Next.js 16.4 (React 19), TypeScript, Tailwind CSS 4.
- Bibliothèques Supabase (`@supabase/supabase-js`, `@supabase/ssr`) et un dossier `src/lib/supabase`.
- `src/proxy.ts` : dans cette version de Next.js, ce fichier joue le rôle de l'ancien « middleware ». C'est un candidat naturel pour rediriger vers la connexion (FR-10).

**Correspondances possibles avec les exigences** (à valider) :

| Exigence | Piste |
|---|---|
| FR-8 à FR-10, FR-21 à FR-23, NFR-11 | Supabase Auth : mots de passe hachés. Création du compte par l'administrateur côté serveur, avec un mot de passe temporaire et un indicateur « doit changer son mot de passe », vérifié dans `src/proxy.ts`. Aucun email requis. Désactiver l'inscription publique. |
| FR-24, NFR-11 | Règles d'accès dans la base (*Row Level Security*) **et** vérifications dans les actions serveur. Ne jamais se fier à l'interface seule. |
| FR-3, RM-2 | Référence générée côté base (séquence + année) pour garantir l'unicité. |
| FR-17, RM-5 | Table d'historique alimentée par le serveur ou par un trigger (action déclenchée automatiquement par la base de données), sans droit de modification ni de suppression. |
| FR-25 | Contrôle côté serveur, ou contrainte en base, avant toute rétrogradation ou désactivation d'un administrateur. |
| FR-6 | Champ « pot de miel » + limite de débit par adresse IP. |
| FR-7 | Service d'envoi d'emails transactionnels (à choisir). |
| NFR-1, NFR-4, NFR-5 | Un hébergeur comme Vercel permet de revenir en un clic à un déploiement précédent. À combiner avec les tags Git. |
| NFR-2 | Deux projets Supabase (développement et production) et des variables d'environnement par environnement. |
| NFR-6 | Logs de l'hébergeur et de Supabase. Un outil de suivi d'erreurs (type Sentry) est optionnel. |
| NFR-7 | Sauvegardes quotidiennes selon l'offre Supabase choisie. Vérifier la durée de conservation de l'offre gratuite, et prévoir un export manuel (`pg_dump`) si besoin. |
| NFR-5 (base de données) | Migrations de base (scripts qui modifient la structure de la base, version après version) versionnées dans le dépôt. Privilégier des migrations qui restent compatibles avec la version précédente. |

## C. Justification des choix de priorité

La règle générale est au §0 du PRD, et la justification de chaque exception figure sous l'exigence concernée (« Pourquoi Must »). Voici les raisons qui n'apparaissent pas dans le PRD :

- **Attribution, priorité et commentaires internes = Should.** Ce sont des ajouts utiles : ils évitent qu'une demande soit traitée deux fois et facilitent le suivi. Mais le CDC ne les demande pas. Aurel a demandé qu'ils soient étiquetés comme ajouts.
- **Anti-spam = Should.** Ajout demandé par Aurel. Il est utile parce que le formulaire est public, mais le CDC ne l'exige pas.
- **Email de confirmation et email aux utilisateurs internes = Could.** Ils nécessitent un service d'envoi d'emails, que la partie Must évite volontairement (FR-21).
