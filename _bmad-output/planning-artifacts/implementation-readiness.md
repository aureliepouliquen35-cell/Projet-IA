---
title: Bilan de préparation à la construction — Nova Services
date: 2026-11-08
verdict: CONCERNS → levées
reviewed:
  - prds/prd-projet-ia-2026-11-08/prd.md
  - ux-designs/ux-projet-ia-2026-11-08/DESIGN.md
  - ux-designs/ux-projet-ia-2026-11-08/EXPERIENCE.md
  - architecture/architecture-projet-ia-2026-11-08/architecture.md
  - epics.md
---

# Bilan de préparation à la construction — Nova Services

**Question posée :** un développeur peut-il réaliser chaque story sans inventer une décision qu'aucun document n'enregistre ?

**Verdict initial : prêt avec réserves (CONCERNS).** 10 manques, dont 5 moyens et 5 mineurs, aucun bloquant. **Les 10 corrections ont été validées par Aurel le 8 novembre 2026 et intégrées dans [epics.md](epics.md)**, qui passe au statut final. Le projet est prêt pour la construction.

## 1. Chaque story vient-elle du PRD, de l'UX ou de l'architecture ?

Oui. Les 42 stories citent leurs sources dans leur ligne *Réf.* Dans l'autre sens, aucune exigence n'est orpheline :

| Source | Éléments | Couverts par au moins une story |
|---|---|---|
| PRD — fonctions | FR-1 à FR-32 | 32 / 32 |
| PRD — qualités | NFR-1 à NFR-14 | 14 / 14 |
| PRD — règles métier | RM-1 à RM-14 | 14 / 14 |
| UX — règles d'interface | UX-DR1 à UX-DR19 | 19 / 19 |
| UX — écrans | P1, P2, I1 à I5, A1 à A4, S1 à S3, E1, E2 | 16 / 16 |
| Architecture — règles | AD-1 à AD-20 | citées dans les stories qui les appliquent |

## 2. Chaque story a-t-elle des critères vérifiables ?

Oui : chaque story a 2 à 4 critères de la forme « Étant donné… quand… alors… ». Pour les stories du responsable technique (1.1, 1.2, 1.5, 1.12, 1.13, epic 5), certaines vérifications se font dans le tableau de bord de Supabase, l'onglet Actions de GitHub ou le terminal, et non dans l'application : c'est normal pour ces tâches.

## 3. Manques trouvés et solutions retenues

Aucun écran ne manquait. Les manques portaient sur des données et des règles.

| # | Gravité | Manque | Solution intégrée |
|---|---|---|---|
| 1 | Moyenne | Les données de production restaient sans sauvegarde entre la mise en ligne (1.12) et l'epic 5, avec en plus un risque de pause de Supabase. | Nouvelle story **1.13 « Sauvegarder la production chaque nuit »**, juste après la mise en ligne. La story 5.1 ne garde que la restauration testée. |
| 2 | Moyenne | Les coordonnées de Nova affichées dès la story 1.3 n'avaient pas de valeur de départ, et leur écran de modification n'arrive qu'en 4.3. | Valeurs d'exemple clairement fictives au départ (1.3), remplacées en production par la procédure d'installation (nouveau critère 4 de la story 1.5). |
| 3 | Moyenne | Aucun critère ne vérifiait que le journal enregistre les événements exigés par NFR-6. | Nouvelle règle commune à toutes les stories, et vérification d'ensemble dans la story 5.4. |
| 4 | Moyenne | Aucune story n'installait l'outil de tests, alors que la story 1.3 écrit déjà des tests. | Vitest installé dans la story 1.1 (nouveau critère 4). |
| 5 | Moyenne | L'effacement après 24 h des tentatives de connexion et des empreintes d'IP n'avait pas de mécanisme décidé. | Effacement automatique à chaque nouvel enregistrement, sans tâche planifiée (stories 1.6 et 6.5). |
| 6 | Faible | La story 1.11 ne testait pas le passage direct de *Nouvelle* à *Traitée*, pourtant permis. | Ajouté au critère 2 de la story 1.11. |
| 7 | Faible | Rien ne vérifiait la règle qui limite l'usage de la clé secrète. | Nouveau critère 3 de la story 1.3, la première à utiliser cette clé. |
| 8 | Faible | SM-5 (dépôt en moins de 2 minutes) et SM-6 (retrouver une demande en moins de 30 secondes) n'étaient vérifiés nulle part. | Ajoutés au critère 3 de la story 5.4. |
| 9 | Faible | Pendant l'epic 1, il n'existe qu'un compte administrateur. | La procédure d'installation peut aussi créer un compte collaborateur de test sur dev (story 1.5). |
| 10 | Faible | La story 2.3 utilise le filtre par canal construit en 2.1. | Résolu par l'ordre de construction (2.1 avant 2.3). |

## 4. Contrôles de structure

| Contrôle | Résultat |
|---|---|
| Aucune story ne dépend d'une story placée après elle | OK, avec l'ordre de construction ci-dessous |
| Chaque table est créée par la première story qui en a besoin | OK (`journal_technique` 1.2 ; `categories`, `parametres`, `demandes`, `evenements`, `compteurs_reference` 1.3 ; `profils`, `mdp_temporaires` 1.5 ; `tentatives_connexion` 1.6 ; `envois_formulaire` 6.5) |
| Pas de modèle de départ à installer | OK : le projet part du dépôt existant (story 1.1) |
| Les epics apportent chacun quelque chose d'utilisable, sans dépendre d'un epic suivant | OK |
| Conflits entre documents | Aucun conflit trouvé |
| Retouches répétées d'un même écran | La liste est retouchée dans les epics 1, 2 et 6. C'est accepté : cela garde les Must prioritaires sur les Should (choix d'Aurel). |

## 5. Ordre de construction validé

1. **1.1 → 1.12** : le parcours principal, jusqu'à la mise en ligne.
2. **1.13** : la sauvegarde de nuit, dès la mise en ligne.
3. **2.1 → 2.3 → 2.2 → 2.4** : centraliser toutes les demandes.
4. **3.1 → 3.2 → 3.4 → 3.5 → 3.3** : les comptes et les droits.
5. **4.4 → 4.1 → 4.2 → 4.3** : le droit à l'effacement, puis les réglages.
6. **5.1 → 5.2 → 5.3 → 5.4** : l'exploitation ; les preuves de qualité juste avant le rendu.
7. *Peut attendre (Should)* : 6.1 → 6.2 → 6.3 → 6.5 → 6.4 → 6.7 → 6.6 → 6.8.
8. *Bonus (Could)* : 7.4 → 7.3 → 7.1 → 7.2. Les stories 7.1 à 7.3 demandent un nom de domaine.

## 6. Suite

Créer le fichier de suivi d'avancement (`bmad-sprint-planning`), puis construire la story 1.1 (`bmad-build`).
