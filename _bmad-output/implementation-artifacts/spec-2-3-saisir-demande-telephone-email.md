---
title: 'Story 2.3 — Saisir une demande reçue par téléphone ou par email'
type: 'feature'
created: '2026-11-24'
status: 'done'
baseline_commit: '55020ce152d37ed3c2b9605a40932f7092188d07'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les demandes reçues au téléphone ou par email ne peuvent pas être enregistrées dans l'application : elles restent dans des fichiers à part, et la liste n'est pas complète.

**Approach:** Nouvel écran I5 « Nouvelle demande » (`/demandes/nouvelle`), ouvert depuis le menu, le bouton de la liste et l'état vide : le formulaire de P1, avec en plus le **Canal *** (Téléphone / Email) en premier et la case « La personne a été informée de l'usage de ses données. * » avec « Texte à lui lire ». Une nouvelle migration crée `saisir_demande` (seul chemin d'écriture) et une lecture de ce que le formulaire affiche. Après l'enregistrement : détail de la demande, toast « Demande NOVA-… créée », historique au nom de la personne connectée avec le canal.

## Boundaries & Constraints

**Always:** AD-2 (aucune écriture directe ; `saisir_demande` vérifie l'appelant par `exiger_utilisateur_interne`, verrouille le compteur annuel, crée la demande *Nouvelle*/*Normale* avec le canal et l'événement `creation` dont l'auteur est l'utilisateur interne, dans la même transaction) ; AD-4 ; AD-7/AD-9 (`security definer`, `search_path = ''`, `revoke … from public`, `grant execute` à `authenticated` seul ; lecture du formulaire par une fonction SQL `authenticated`, jamais la clé secrète) ; AD-11 (un schéma Zod `src/shared/schemas/saisie.ts`, mêmes limites et messages que P1 + canal et case, utilisé par le navigateur et la Server Function ; la base répète les refus) ; AD-12 (réponses `{ ok, … }`, refus prévus en `VALIDATION`, pannes journalisées sans donnée saisie) ; AD-16 (nouvelle migration, anciennes intactes) ; AD-20 (numéro d'envoi tiré à l'affichage, gardé après refus ou panne : un second envoi renvoie la demande déjà créée ; rien dans l'adresse) ; libellés des canaux dans `src/shared/libelles.ts` ; *Formulaire* refusé comme canal saisi ; rien de saisi n'est perdu après un refus ; pas de limite d'envois ; test RM-12 de la saisie dans `tests/regles/`.

**Never:** priorité, attribution, « Voir ses autres demandes », clic sur la carte compteur (2.2, 2.4, epic 6) ; modification du formulaire public P1 ou de son comportement ; modification des anciennes migrations ; section Administration du menu ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Saisie complète | canal Téléphone, champs valides, case cochée | détail I4 de la nouvelle demande + toast « Demande NOVA-2026-NNNN créée » ; Informations : canal Téléphone ; historique au nom de la personne connectée, avec « (canal : Téléphone) » | N/A |
| Case oubliée | tout rempli sauf la case | rien n'est créé ; en haut « 1 champ est à corriger » ; sous la case « Confirmez que la personne a été informée de l'usage de ses données » ; saisie intacte | même refus par la Server Function et par la base |
| Canal oublié | aucun canal choisi | « Le canal est obligatoire » sous le choix, dans le résumé | idem |
| Canal interdit | appel direct avec `formulaire` ou `fax` | refus `VALIDATION`, rien n'est créé | base : refus prévu |
| Champs de P1 | vide, trop long, email mal formé, description < 10 | mêmes messages qu'en P1 | N/A |
| Double envoi | même numéro d'envoi renvoyé | la demande déjà créée, aucune seconde | N/A |
| Catégorie désactivée entre-temps | catégorie inactive à l'envoi | « Cette catégorie n'est plus proposée. Choisissez-en une autre. » | refus prévu |
| Panne à l'envoi | base injoignable | encadré « La demande n'a pas pu être enregistrée. Réessayez. » ; saisie intacte, même numéro d'envoi | journalisée, code court |
| Formulaire illisible | lecture des catégories impossible | écran S3 | journalisée |
| Liste | filtre `?canal=telephone` | la demande saisie apparaît | N/A |

## Decisions (validées par Aurel, 2026-11-24)

- **Ligne d'historique d'une demande saisie** : elle suit la présentation des autres lignes (quoi, puis qui · quand) : « **Demande créée (canal : Téléphone)** » puis « **Karim** · 24 nov. 2026, 10 h 12 ». C'est ainsi que se lit le critère « Créée par *mon nom* (canal : Téléphone) ». Les demandes du formulaire public restent « Demande créée » · « Demandeur ».
- Plan gardé entier (environ 3 000 tokens).

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261119210000_numero_envoi.sql` -- `deposer_demande` à 9 paramètres : modèle de `saisir_demande` (verrou du numéro d'envoi, compteur annuel, NV001/NV002). Ne pas modifier.
- `supabase/migrations/20261120230000_liste_demandes.sql:71` -- `exiger_utilisateur_interne()` renvoie l'id de l'appelant (NV201).
- `supabase/migrations/20261121200000_changer_statut.sql` -- `evenements.auteur_id` (un seul auteur : `auteur_id` ou `auteur_libelle`) ; `lire_demande` renvoie déjà `canal` et `auteur_nom` : rien à changer côté lecture SQL.
- `supabase/migrations/20261122140000_filtres_demandes.sql` -- `lister_categories` : modèle de droits ; filtre `canal` déjà en place.
- `src/server/depot/index.ts` -- `REFUS_PREVUS`, `CODES_REFUS_PREVUS`, contrôle de la ligne renvoyée : à reprendre (pas à appeler : clé secrète).
- `src/server/actions/deposer-demande.ts`, `changer-statut.ts` -- forme d'une Server Function (`executerAction`, `exigerUtilisateur`, `createClient`, `DELAI_MS`).
- `src/shared/schemas/depot.ts` -- `schemaDepot`, `CHAMPS_DEPOT`, `FORME_IDENTIFIANT` ; `src/shared/schemas/validation.ts` -- `validerSaisie(schema, champs, saisie)` générique.
- `src/app/(public)/formulaire-depot.tsx` -- réducteur, `envoyerDepot`, verrou, numéro d'envoi, champs, mention de P1 : logique à reprendre pour I5 sans changer P1 (une extraction commune est permise si P1 garde son comportement et ses tests).
- `src/components/formulaire/{champ,resume-erreurs}.tsx`, `src/components/ui/*` -- `Champ`, `ChampCase`, `ResumeErreurs`, `Checkbox`, `NativeSelect`.
- `src/server/lectures/demande.ts`, `src/components/interne/historique-demande.tsx`, `src/app/(interne)/demandes/[reference]/contenu-demande.tsx` -- historique : passer le canal de la demande pour l'événement `creation` d'un auteur interne.
- `src/components/interne/menu-lateral.tsx`, `lien-menu.tsx` (`estActif` préfixe : `/demandes/nouvelle` ne doit pas activer « Demandes ») ; `src/components/interne/etat-liste.tsx` (`EtatListeVide`) ; `src/app/(interne)/demandes/page.tsx` (titre).
- `src/app/connexion/nouveau-mot-de-passe/formulaire-mot-de-passe.tsx:361` -- toast puis `router.push` : précédent suivi pour le toast.
- `src/shared/{libelles,messages,constantes}.ts` ; `tests/aides/supabase-connexion.ts` (simulation `rpcSession`), `tests/aides/formulaire-depot.tsx`, `tests/regles/rm-12-information-donnees.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261124100000_saisie_demande.sql` -- `saisir_demande(p_canal, p_nom, p_email, p_telephone, p_entreprise, p_categorie_id, p_objet, p_description, p_personne_informee, p_numero_envoi)` → `table(reference)` : appelant vérifié, numéro d'envoi verrouillé et rejoué, NV001 (case), NV002 (catégorie), NV401 (canal ni `telephone` ni `email`) ; `lire_formulaire_saisie()` → `{ categories: [{id, nom}] actives par ordre, contact_donnees }` ; droits `authenticated` seul.
- [x] `src/shared/schemas/saisie.ts`, `src/shared/messages.ts`, `src/shared/constantes.ts` -- `CANAUX_SAISIE`, `CHAMPS_SAISIE` (canal en premier), schéma, `validerSaisieInterne`, messages I5.
- [x] `src/server/lectures/saisie.ts` -- `lireFormulaireSaisie()` (garde, Zod) ; `src/server/actions/saisir-demande.ts` -- `actionSaisirDemande(saisie, numeroEnvoi)` → `{ reference }`, refus prévus en `VALIDATION` avec champs.
- [x] `src/app/(interne)/demandes/nouvelle/{page,formulaire-saisie}.tsx` -- écran I5 (560 px, squelette, canal en boutons radio non présélectionnés, « Texte à lui lire » qui déplie la mention de P1, « Enregistrer la demande ») ; réussite → toast puis `router.push` vers le détail.
- [x] `historique-demande.tsx`, `contenu-demande.tsx`, `libelles.ts` -- ligne de création d'une demande saisie : « Demande créée (canal : Téléphone) », puis le nom de l'auteur interne · date (voir Decisions).
- [x] `menu-lateral.tsx`, `lien-menu.tsx`, `demandes/page.tsx`, `etat-liste.tsx` -- menu « Nouvelle demande » (icône plus dans un carré) ; bouton principal « Nouvelle demande » à côté du titre ; bouton secondaire « Saisir une demande reçue par téléphone » dans l'état vide.
- [x] `tests/saisie/*`, `tests/regles/rm-12-information-donnees.test.ts`, `tests/aides/supabase-connexion.ts`, `tests/e2e/saisie-demande.spec.ts` -- matrice ci-dessus, texte de la migration (droits, codes, canal, auteur), action, schéma, rendu HTML (I5, menu actif, historique), parcours navigateur sur dev.

**Acceptance Criteria:**
- Given le menu « Nouvelle demande », when je l'ouvre, then je vois les champs du formulaire public, plus le canal (Téléphone ou Email) et la case « La personne a été informée de l'usage de ses données ».
- Given la case oubliée, when j'enregistre, then l'enregistrement est refusé avec le message sous la case, et rien n'est perdu.
- Given une saisie complète, when j'enregistre, then le détail s'ouvre avec le toast « Demande NOVA-… créée » et l'historique au nom de la personne connectée avec « canal : Téléphone ».
- Given la liste, when je filtre sur le canal Téléphone, then cette demande apparaît.

## Implementation Notes

- **Migration pas encore appliquée sur dev** : `npx.cmd supabase db push --remote --yes` a été refusé à l'agent (permission). Tant qu'elle ne l'est pas, « Nouvelle demande » affiche l'écran d'erreur. `tests/e2e/saisie-demande.spec.ts` est écrit, pas encore lancé (il attend la migration ; chaque passage laisse une demande « Essai automatique saisie … » sur dev).
- SQL vérifié seulement par des tests qui lisent le texte de la migration ; il reprend `deposer_demande` (story 1.4).
- Mention de P1 extraite dans `src/components/formulaire/mention-donnees.tsx` (même texte pour P1 et I5 ; rendu de P1 inchangé, ses tests passent).
- Refus prévus de `saisir_demande` dans `src/server/actions/refus-saisie.ts` : un fichier « use server » n'exporte que des actions.
- Choix de l'agent : canal autre que Téléphone/Email (appel direct) → « Le canal doit être Téléphone ou Email » ; « Enregistrement… » pendant l'envoi ; formulaire dans une carte blanche ; boutons radio sans `aria-invalid` (interdit par le lint sur ce rôle ; message relié, bordure rouge).
- Vérifications de l'agent : lint, `tsc`, `npm run test` (77 fichiers, 1 451 tests) et build sans erreur. Revérifié par l'agent principal : 25 fichiers de tests (story et voisins) verts.
- Après les corrections de relecture : lint, `tsc`, `npm run test` (77 fichiers, 1 455 tests) et build sans erreur.
- 2026-11-24 : migration appliquée sur dev par l'agent principal, avec l'accord d'Aurel, après l'écran d'erreur `PGRST202` (`db push`, 13 migrations, projet `aodcgbzapnruciesaycg`). `npm run test:e2e` sur dev : 3 réussis, dont `saisie-demande.spec.ts`.
- Vérifié à l'écran par Aurel le 24 nov. 2026 : tous les critères sont bons (menu, écran I5, case oubliée refusée sans perte, canal obligatoire, toast, historique « Demande créée (canal : Téléphone) », filtre Téléphone, demandes du formulaire public inchangées). Commit local sur `main`, sans envoi.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif | Contrôle de l'email à la sortie du champ (`sortie`) jamais testé pour I5 | medium | Vérifié : aucun test de `tests/saisie` n'envoie `sortie` | patch |
| 2 | verif | Formulaire figé après réussite (`redirection`) jamais testé pour I5 | medium | Vérifié : aucun appel de `reduireSaisie` avec `reussite` | patch |
| 3 | verif | Refus et rejeu de `saisir_demande` jamais exécutés par `npm test` (texte SQL + simulation) | medium | Réel ; aucun banc de base de données dans le dépôt, convention des stories précédentes ; seul l'e2e sur dev l'exécute | defer |
| 4 | blind + edge | Rejeu d'un numéro d'envoi : la demande existante est renvoyée même si la saisie a été corrigée entre-temps, ou si elle vient d'un autre canal | low | Réel mais seulement après une réponse perdue puis une correction, ou un appel direct avec un UUID connu ; même règle que P1 (AD-20) ; le détail montre le vrai contenu | rejeté |
| 5 | blind | NV201 de la base (compte désactivé entre la garde et l'appel) → `ERREUR_INTERNE` | low | Course de quelques millisecondes ; même choix que `changer_statut` | rejeté |
| 6 | blind | Numéro d'envoi mal formé → encadré de panne au lieu de « Rechargez la page » | low | Seul un appel direct l'envoie : le formulaire tire toujours un UUID valide ; même chose en P1 | rejeté |
| 7 | blind + edge | Après NV002, la catégorie désactivée reste dans la liste | low | Impossible aujourd'hui : la désactivation arrive avec la story 4.2 ; même chose en P1 | rejeté |
| 8 | blind | Verrou rouvert avant la fin du passage au détail | false | La remise à zéro et `router.push` sont dans la même transition : le formulaire vierge n'apparaît qu'avec le détail (même schéma que P1) | rejeté |
| 9 | blind | P1 modifié malgré « Never » | false | Extraction permise par le Code Map ; mêmes classes, même `data-slot`, même icône ; tests de P1 verts | rejeté |
| 10 | blind | Deuxième copie de `commencePar` dans `lien-menu.tsx` | low | Vérifié : même logique qu'`acces.ts` ; correction directe (export + import) | patch |
| 11 | blind | Groupe radio sans `aria-required` / `aria-invalid` | low | Les boutons portent `required`, la légende nomme le groupe, l'erreur est reliée | rejeté |
| 12 | blind | Composant avec état non testé en vrai navigateur ; tests sur le texte du fichier | low | Vitest sans DOM (choix des stories précédentes) ; le parcours e2e le couvre une fois la migration appliquée | rejeté |
| 13 | blind | Liens visibles même si la migration n'est pas en production | low | La mise en production pousse les migrations avant le code (procédure de la story 1.12) | rejeté |
| 14 | blind | `saisir_demande` ne nettoie pas `nom`, `email`, `objet`, `description` | low | Le serveur nettoie (Zod) avant l'appel ; mêmes limites que `deposer_demande` | rejeté |
| 15 | blind | `refresh()` relit le formulaire juste avant de le quitter | low | Une lecture de plus ; c'est ce qui met à jour la pastille du menu | rejeté |
| 16 | blind | Texte de l'état vide et bouton sans « email » | false | Textes de l'UX (EXPERIENCE.md, I3), repris mot pour mot | rejeté |
| 17 | blind | L'e2e laisse une demande d'essai sur dev | low | Noté dans les Implementation Notes ; objet reconnaissable | rejeté |
| 18 | edge | Aucune catégorie active : formulaire impossible | low | Impossible aujourd'hui (5 catégories, désactivation en 4.2) ; même chose en P1 | rejeté |
| 19 | edge | Quitter I5 pendant l'envoi : renvoi au détail de la demande créée | low | Rare ; la demande est bien créée ; même comportement que P1 | rejeté |

## Design Notes

- **Toast** : posé dans le navigateur juste avant `router.push` (comme « Mot de passe enregistré », story 1.7 ; le `Toaster` du layout racine survit au changement de page). Il n'y a pas de redirection serveur : le cookie de passage d'AD-20 n'est pas nécessaire, et rien ne passe par l'adresse.
- **Pas de colonne `saisie_par`** sur `demandes` : l'auteur de l'événement `creation` (`auteur_id`) dit déjà qui a saisi la demande.
- **Encadré de panne** : P1 renvoie le demandeur vers le téléphone de Nova ; en interne, ce serait absurde, d'où un message court avec « Réessayez ».
- Légendes des blocs : « Demandeur » et « Demande » (au lieu de « Vos coordonnées » / « Votre demande », qui s'adressent au demandeur).

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (depuis PowerShell), `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `npx.cmd supabase migration list --remote` -- expected: 13 migrations sur dev (`aodcgbzapnruciesaycg`).
- `npm run test:e2e` -- expected: parcours de saisie réussi sur dev.

**Manual checks:**
- `npm run dev`, compte collaborateur de test : les quatre critères.
