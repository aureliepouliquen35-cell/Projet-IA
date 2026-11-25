---
title: 'Story 3.2 — Créer un compte pour un nouveau collègue'
type: 'feature'
created: '2026-11-24'
status: 'done'
baseline_commit: 'de8cfc0d9ba646ff37fd2470189fe7e5e7c4a170'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un administrateur ne peut créer un compte que par la procédure d'installation en ligne de commande : il n'a aucun moyen, dans l'application, de donner accès à une nouvelle recrue (FR-21, RM-8).

**Approach:** Ajouter dans A1 le bouton « Créer un compte », qui ouvre une fenêtre (Nom, Email, Rôle, Mot de passe temporaire avec « Générer »). Une Server Function réservée aux administrateurs réutilise `creerCompte()` de `src/server/admin` (compte Auth « email confirmé » puis `creer_profil`). Après la création, la fenêtre affiche une seule fois le mot de passe temporaire avec « Copier », le toast « Compte créé » apparaît et le tableau se met à jour. La première connexion passe déjà par I2 (`doit_changer_mdp = vrai`, story 1.7).

## Boundaries & Constraints

**Always:** `exigerAdministrateur()` en premier dans la Server Function, sinon `ACCES_REFUSE` sans rien créer (AD-7, RM-7) ; validation par `schemaCompte` partagé, côté navigateur pour les messages et côté serveur qui fait foi (AD-11) ; textes exacts d'EXPERIENCE.md (A1) ; « Cet email est déjà utilisé par un autre compte. » et « 12 caractères minimum » sous le champ ; Rôle « Collaborateur » par défaut ; `compte_cree` au journal avec l'identifiant de l'administrateur comme auteur, jamais de mot de passe dans le journal, les réponses d'erreur ou l'adresse ; mot de passe tiré par un générateur cryptographique, 16 caractères de l'alphabet existant (sans 0/O/o/1/l/I) ; fenêtre de 440 px au plus, Échap ferme, une seule fenêtre à la fois ; accessibilité (étiquettes, erreurs reliées, focus visible, toast annoncé) ; test RM-8 dans `tests/regles/`.

**Never:** nouvelle migration ou changement de `creer_profil` ; envoi d'email ; colonne « Actions » (Modifier, Réinitialiser, Désactiver : stories 3.3 à 3.5) ; clé secrète hors de `src/server/admin` ; mot de passe gardé après la fermeture de la fenêtre ; création de comptes par les tests automatiques sur dev (un compte ne se supprime jamais) ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Générer | clic sur « Générer » | le champ reçoit un nouveau mot de passe de 16 caractères, visible en clair | N/A |
| Création réussie | champs valides | la fenêtre montre le mot de passe une seule fois + « Copier » ; toast « Compte créé » ; le compte apparaît dans le tableau | N/A |
| Email déjà pris | email d'un compte existant (casse différente comprise) | « Cet email est déjà utilisé par un autre compte. » sous Email ; saisie gardée ; rien n'est créé | N/A |
| Saisie invalide | nom vide, email mal formé, mot de passe < 12 | message sous chaque champ, rien n'est envoyé ; le serveur refuse aussi (`VALIDATION`) | N/A |
| Collaborateur | appelle la Server Function directement | `ACCES_REFUSE`, aucun appel à Supabase | N/A |
| Panne | Supabase injoignable, profil refusé | encadré « Le compte n'a pas pu être créé. Réessayez. » ; saisie gardée | journalisée par `creerCompte` ou l'enveloppe (code court) |
| Double clic | deux clics sur « Créer le compte » | un seul envoi | N/A |
| Fermeture | Échap, « Annuler » ou « Fermer » | fenêtre fermée ; à la réouverture, formulaire vierge, mot de passe oublié | N/A |

## Decisions

- Pas de question ouverte : tout est tranché par l'UX, l'architecture et le code de la story 1.5.
- Le générateur passe dans `src/shared` (Web Crypto, utilisable dans le navigateur) : « Générer » ne fait aucun aller-retour réseau. `src/server/admin` le réexporte pour la procédure d'installation.
- Fenêtre de formulaire (Dialog Radix), pas une fenêtre de confirmation : la sélection va sur « Nom » à l'ouverture, puis sur « Copier » après la création.
- Bouton d'envoi « Créer le compte » ; après la création, un seul bouton « Fermer ». Après une copie réussie, « Copier » devient « Copié ».

</frozen-after-approval>

## Code Map

- `src/server/admin/index.ts` -- `creerCompte(saisie, { auteur })` complet (Auth, `creer_profil`, retour arrière, `CONFLIT` + `champs.email`, `compte_cree`) : à réutiliser tel quel. `genererMotDePasseTemporaire`, `ALPHABET_MOT_DE_PASSE`, `LONGUEUR_MOT_DE_PASSE_TEMPORAIRE` : à déplacer dans `src/shared`. Son message `ERREUR_INTERNE` du retour arrière manqué est technique : l'écran montre toujours `creationImpossible`.
- `src/shared/schemas/compte.ts` -- `schemaCompte`, `validerCompte`, `CHAMPS_COMPTE` ; `src/shared/schemas/validation.ts`.
- `src/shared/messages.ts:66` -- `MESSAGES_COMPTE` (erreurs déjà prêtes) ; `:175` `MESSAGES_COMPTES` (A1) : y ajouter les textes de la fenêtre.
- `src/shared/constantes.ts:42,72` -- `ROLES`, `LIBELLES_ROLES`.
- `src/server/actions/saisir-demande.ts`, `enveloppe.ts` -- modèle de Server Function (`executerAction`, `refresh()`).
- `src/app/(interne)/demandes/nouvelle/formulaire-saisie.tsx` -- modèle de formulaire contrôlé (`useReducer`, réducteur exporté et testé, verrou d'envoi, `afficherSucces`) ; `src/components/formulaire/champ.tsx`, `ui/input.tsx`, `ui/native-select.tsx`, `ui/button.tsx`, `ui/alert.tsx`.
- `src/components/ui/alert-dialog.tsx` -- style de fenêtre à reprendre pour `ui/dialog.tsx` (radix-ui `Dialog`).
- `src/app/(interne)/admin/comptes/contenu-comptes.tsx`, `src/components/interne/tableau-comptes.tsx` -- placer le bouton à droite du titre « Comptes » (affiché seulement à l'administrateur, pas dans l'état d'erreur de lecture : il reste utile, le garder aussi).
- `tests/comptes/*`, `tests/regles/rm-08-pas-d-inscription.test.ts`, `tests/aides/supabase-connexion.ts` -- modèles et simulations ; tests Vitest en `node` avec `renderToStaticMarkup` (pas de DOM).

## Tasks & Acceptance

**Execution:**
- [x] `src/shared/mot-de-passe-temporaire.ts` -- générateur Web Crypto (`crypto.getRandomValues`, tirage sans biais) + constantes ; `src/server/admin/index.ts` le réexporte -- « Générer » dans le navigateur, installation inchangée.
- [x] `src/server/actions/creer-compte.ts` -- `actionCreerCompte(saisie)` : enveloppe, `exigerAdministrateur()` (sinon `ACCES_REFUSE`), `creerCompte(saisie, { auteur: admin.id })`, `refresh()` après réussite ; renvoie `{ id, nom, email, role }`, jamais le mot de passe.
- [x] `src/shared/messages.ts` -- textes de la fenêtre (titre, étiquettes, aide, Générer, Créer le compte, Annuler, Fermer, Copier, Copié, Compte créé).
- [x] `src/components/ui/dialog.tsx` -- fenêtre de formulaire au style de `alert-dialog.tsx`.
- [x] `src/components/interne/creer-compte.tsx` -- bouton, fenêtre, formulaire (réducteur exporté), affichage unique du mot de passe + « Copier ».
- [x] `src/app/(interne)/admin/comptes/contenu-comptes.tsx` -- bouton « Créer un compte » à côté du titre.
- [x] `tests/comptes/creer-compte-ecran.test.tsx`, `tests/comptes/action-creer-compte.test.ts`, `tests/regles/rm-08-pas-d-inscription.test.ts`, `tests/comptes/mot-de-passe-temporaire.test.ts` -- matrice ci-dessus (réducteur, rendu, action : refus collaborateur, conflit, validation, panne, aucun mot de passe renvoyé).

**Acceptance Criteria:**
- Given la fenêtre « Créer un compte », when je saisis nom, email et rôle, puis clique sur « Générer », then un mot de passe temporaire de 12 caractères au moins est proposé.
- Given un email déjà utilisé, when je valide, then je lis « Cet email est déjà utilisé par un autre compte. »
- Given une création réussie, when la fenêtre se met à jour, then le mot de passe temporaire s'affiche une seule fois avec « Copier », et le compte apparaît dans la liste avec le toast « Compte créé ».
- Given ce nouveau compte, when la personne se connecte, then elle doit d'abord choisir son propre mot de passe.

## Implementation Notes

- L'alphabet compte 56 caractères : un octet ≥ 224 est rejeté (tirage sans biais), puis un nouveau tirage complète le mot de passe.
- `actionCreerCompte` remplace tout message `ERREUR_INTERNE` de `creerCompte` (clés absentes, retour arrière manqué, qui contient l'identifiant du compte) par `creationImpossible`, en gardant `codeSupport` : les détails ne vont qu'au journal.
- La fenêtre ne se ferme pas pendant l'envoi (Échap ignoré, « Annuler » désactivé) ni par un clic à côté : un compte créé dont le mot de passe n'aurait pas été vu serait perdu.
- `Champ` reçoit une propriété `apres` (bouton « Générer » sur la ligne du champ). Le résumé d'erreurs du haut (règle commune des formulaires) apparaît aussi dans la fenêtre ; les identifiants des champs sont préfixés `compte-`.
- Après la création, la fenêtre rappelle Nom, Email et Rôle (étiquettes existantes), puis le mot de passe dans un champ en lecture seule, « Copier » et l'aide d'A1. Seuls textes hors EXPERIENCE.md : « Création… » sur le bouton pendant l'envoi, le nom « Générer un mot de passe temporaire » pour les lecteurs d'écran, et « Accès refusé. » pour la réponse `ACCES_REFUSE`.
- Les tests Vitest doivent être lancés depuis `C:\…` (lettre de lecteur en majuscule) : depuis `c:\…`, Vitest charge deux fois ses modules et toutes les suites échouent (« reading 'config' »).

- Après relecture (8 corrections, 9 constats rejetés, aucun report) : décisions d'envoi et de fermeture sorties en aides pures testées (`preparerEnvoiCreation`, `actionFermeture`) ; clés absentes journalisées avec un code ; « Compte créé » annoncé dans la fenêtre ; erreurs serveur effacées à un nouvel envoi.
- Vérifications de l'agent principal (2026-11-24) : lint, `tsc`, build sans erreur ; 85 fichiers / 1 652 tests Vitest verts. Aucune migration. Pas de commit : Aurel vérifie d'abord à l'écran.
- Vérifié à l'écran par Aurel le 25 nov. 2026 : tous les critères sont bons ; commit ensuite.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif + blind | Verrou de double envoi d'`envoyer()` jamais exécuté par un test | medium | Pré-vérifié : le test « double clic » part d'un verrou déjà fermé ; retirer le verrou laisse tout vert | patch (aide pure exportée + test) |
| 2 | verif + blind | Refus de fermeture pendant l'envoi et remise à zéro à la fermeture non testés | medium | Pré-vérifié : aucun test n'appelle `changerOuverture` ; sans `reinitialisation`, le mot de passe resterait à la réouverture | patch (aide pure exportée + test) ; focus et clic extérieur : pas de DOM de test |
| 3 | edge + blind | Clés secrètes absentes : `ERREUR_INTERNE` sans code ni journal, panne muette en production | medium | Vérifié : `creerCompte` renvoie `echec(...MESSAGE_CLES_ABSENTES)` sans `codeSupport` ni `journaliser` | patch |
| 4 | blind | Commentaire de l'action : « le navigateur reçoit … le code du support », alors que l'écran ne l'affiche pas | low | Vérifié : `EncadrePanne` n'affiche que `creationImpossible` (comme I5) | patch (commentaire) |
| 5 | blind | Toast « Compte créé » hors de la fenêtre modale : masqué aux lecteurs d'écran (`aria-hidden` de Radix) | low | Vérifié : `Toaster` dans `layout.tsx`, frère du portail de la fenêtre | patch (annonce dans la fenêtre, texte existant) |
| 6 | blind | Après un `CONFLIT`, l'erreur serveur reste sous Email pendant un nouvel envoi, et après une panne | low | Vérifié : « envoi » n'efface que `panne` ; correction directe | patch |
| 7 | blind | Donnée de test : l'identifiant de Lucas est celui de Karim (`ID_KARIM`) | low | Vérifié : même UUID ; correction directe | patch |
| 8 | blind | Ligne de commentaire trop longue dans `tableau-comptes.tsx` | low | Vérifié ; correction directe | patch |
| 9 | edge + blind | `ACCES_REFUSE` (administrateur rétrogradé fenêtre ouverte) affiché comme une panne « Réessayez » | low | Réel, mais la rétrogradation n'existe pas encore (story 3.3, déjà reportée pour le menu) ; demanderait une nouvelle branche | rejeté (à reprendre avec la 3.3) |
| 10 | edge | Retour arrière manqué ou profil validé après 10 s : « n'a pas pu être créé » alors que le compte existe | low | Cas rare (double panne) ; journalisé avec l'identifiant ; demanderait un nouveau message hors UX | rejeté |
| 11 | edge | Réseau coupé après la création : nouvel essai → « email déjà utilisé » | low | Commun à toutes les actions ; rare ; nouvelle branche | rejeté |
| 12 | edge + blind | Mot de passe saisi de plus de 72 octets refusé par Supabase en panne générique | low | Personne ne tape 72 caractères ; la correction touche le schéma partagé et ajoute un texte hors UX | rejeté |
| 13 | blind | Échec de copie sans retour ; « Copié » ne revient jamais à « Copier » | low | Presse-papiers disponible en https et sur localhost ; le mot de passe reste visible et sélectionnable | rejeté |
| 14 | blind | « Générer » non annoncé aux lecteurs d'écran | low | Demande un texte hors UX ; la valeur du champ est lisible | rejeté |
| 15 | blind | Un Échap sur l'écran du mot de passe le perd pour de bon | false | Comportement voulu par la matrice figée (« Échap … fenêtre fermée ») | rejeté |
| 16 | blind | `role` non typé dans l'action « saisie » | false | La liste ne propose que les deux rôles et le schéma refuse toute autre valeur | rejeté |
| 17 | blind | Test RM-8 : doublon et `vi.resetModules()` sans nettoyage | low | Aucun tort nommé ; les tests passent isolés et ensemble | rejeté |

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.

**Manual checks:**
- `npm run dev` : les quatre critères avec le compte administrateur ; puis connexion avec le nouveau compte → I2.
