---
title: 'Story 1.10 — Consulter le détail et l''historique d''une demande'
type: 'feature'
created: '2026-11-21'
status: 'done'
baseline_commit: '6900f5960cc2f35e21727dbe5479e01ef2789efe'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans « Demandes », on voit une ligne par demande, mais on ne peut pas l'ouvrir : impossible de lire la description, les coordonnées et l'historique avant de rappeler le client (FR-15, FR-17).

**Approach:** Nouvelle page I4 `/demandes/NOVA-2026-0042` : fil d'Ariane « ← Demandes », référence, objet en titre, badge de statut ; à gauche les blocs Demande (description, retours à la ligne gardés, texte simple), Demandeur, Informations et Historique (frise, du plus ancien au plus récent) ; à droite un panneau « Statut » qui montre seulement le statut actuel (les boutons arrivent en 1.11). Une nouvelle fonction SQL `lire_demande(p_reference)` renvoie la demande et ses événements ; toute la ligne du tableau devient cliquable, et la référence est un vrai lien.

## Boundaries & Constraints

**Always:** AD-1 (lecture par un Server Component et `src/server/lectures`), AD-7 (`exigerUtilisateur()` d'abord, puis `exiger_utilisateur_interne()` dans la base), AD-9 (`security definer`, `search_path = ''`, `authenticated` seul, aucune table ouverte), AD-3 (lecture seule des événements), AD-11/NFR-11 (description affichée comme texte, jamais comme HTML), AD-13 (le journal ne reçoit que la référence et un code, jamais les données du demandeur), AD-16 (nouvelle migration, anciennes intactes), AD-19 (tokens et icônes lucide) ; dates « 8 nov. 2026, 8 h 47 » (heure de Paris) ; libellés des canaux dans `src/shared/libelles.ts` ; email en lien `mailto:`, téléphone en lien `tel:` ; « Non renseigné » / « Non renseignée » pour un téléphone ou une entreprise absents ; squelette après 300 ms ; deux colonnes à partir de 1 024 px, une colonne en dessous (panneau sous l'en-tête).

**Never:** boutons de statut, date de clôture, toasts (1.11) ; priorité affichée (FR-19) ; « (désactivée) » après la catégorie (story des catégories) ; « Voir ses autres demandes » (2.4) ; attribution, commentaires, zone administrateur (Should) ; écriture dans une table ; modification des anciennes migrations ; email ou téléphone dans la liste ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Demande existante | `/demandes/NOVA-2026-0042` | tous les champs, badge, historique « Demande créée · Demandeur · 8 nov. 2026, 8 h 47 » | N/A |
| Référence en minuscules | `/demandes/nova-2026-0042` | même demande (référence mise en majuscules) | N/A |
| Référence inconnue ou mal formée | `NOVA-2026-9999`, `abc` | page « Cette demande n'existe pas ou a été supprimée. » + « Retour aux demandes » | mal formée : aucun appel à la base |
| Description piégée | `<script>alert(1)</script>` + retours à la ligne | affichée telle quelle, lignes gardées, rien d'exécuté | N/A |
| Champs facultatifs vides | pas de téléphone, pas d'entreprise | « Non renseigné », « Non renseignée » | N/A |
| Sans session | adresse ouverte déconnecté | renvoi vers la connexion (proxy + garde) | N/A |
| Panne | base injoignable, réponse inattendue | écran S3 avec code | journalisé : référence + code seulement |
| Retour par le fil d'Ariane | venu de `?q=helene&page=2` | liste avec la même recherche et la même page | adresse sans `q`/`page` : `/demandes` |

## Decisions (Aurel, 2026-11-21)

- Le fil d'Ariane se souvient de la liste **par l'adresse du détail** : chaque lien de la liste porte ses `q` et `page` (`/demandes/NOVA-2026-0042?q=helene&page=2`, lus avec `lireRecherche` et `lirePage`) ; « ← Demandes » renvoie vers `adresseListe({ q, page })`. Marche après un rechargement, dans un nouvel onglet et sans JavaScript.
- Plan gardé entier (environ 2 700 tokens).
- Migration : comme en 1.8 et 1.9, l'agent essaie `npx.cmd supabase db push --remote --yes` sur dev ; en cas de refus, il donne la commande à Aurel.

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261121090000_recherche_demandes.sql`, `20261120230000_liste_demandes.sql` -- modèles des droits, `exiger_utilisateur_interne()` : ne pas modifier.
- `supabase/migrations/20261119180000_depot_demande.sql:114-213` -- colonnes de `demandes` et `evenements` (seul auteur possible aujourd'hui : `auteur_libelle` `demandeur`/`systeme` ; seul type écrit : `creation`). Pas d'index sur `evenements.demande_id` (deferred-work, ligne 21).
- `src/server/lectures/demandes.ts` -- `ResultatLecture`, `lire()`, `essai()`, `reponseInattendue`, `DELAI_MS`, schémas Zod : modèle de `lireDemande`.
- `src/components/interne/tableau-demandes.tsx` -- lignes sans lien : ajouter le lien de la référence étiré sur toute la ligne.
- `src/app/(interne)/demandes/{page,contenu-demandes}.tsx` -- modèle page + `<Suspense>` + `connection()` ; passe `q` et `page` au tableau.
- `src/components/interne/{badge-statut,etat-liste}.tsx`, `src/components/ecran-erreur.tsx` (`EcranPageIntrouvable`, `message`), `src/app/error.tsx` (S3).
- `src/shared/{adresse-liste,libelles,messages,dates,constantes}.ts` -- `adresseListe`, `lireRecherche`, `lirePage`, `formaterDateHeure`, `FORME_REFERENCE`.
- `tests/aides/supabase-connexion.ts` (simulation `rpc`), `tests/liste/*` -- à étendre.
- `node_modules/next/dist/docs/` -- segments dynamiques (`params` en promesse, `PageProps`), `notFound`, `not-found.tsx` de segment, `Link` : à relire avant d'écrire.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261121150000_detail_demande.sql` -- index `evenements (demande_id, date_creation)` ; `lire_demande(p_reference text)` → `null` si inconnue, sinon `{ id, reference, nom, email, telephone, entreprise, objet, description, categorie, canal, statut, date_depot, evenements: [{ type, auteur, date }] }` (tri date puis id) ; mêmes droits que `lister_demandes`.
- [x] `src/shared/libelles.ts`, `src/shared/messages.ts` -- `LIBELLES_CANAUX`, libellés des événements (« Demande créée »), auteurs (« Demandeur », « Système »), textes de I4 (titres des blocs, « Non renseigné(e) », « Retour aux demandes », message « demande introuvable »).
- [x] `src/server/lectures/demande.ts` -- `lireDemande(reference)` (`cache`) : garde, forme vérifiée et majuscules, `rpc`, Zod ; `null` = introuvable ; panne levée sans donnée personnelle.
- [x] `src/app/(interne)/demandes/[reference]/{page,contenu-demande,not-found}.tsx` + `src/components/interne/{historique-demande,squelette-demande,fil-ariane}.tsx` -- écran I4 et ses états.
- [x] `src/components/interne/tableau-demandes.tsx`, `contenu-demandes.tsx` -- lien vers le détail avec `q` et `page` de la liste (`adresseDetail` dans `src/shared/adresse-liste.ts`), ligne entière cliquable.
- [x] `tests/detail/*`, `tests/aides/supabase-connexion.ts` -- matrice : texte de la migration, lecture (forme, introuvable, panne sans donnée au journal), rendu HTML (champs, `<script>` échappé, retours à la ligne, historique ordonné, fil d'Ariane, liens de la liste).

**Acceptance Criteria:**
- Given la liste, when je clique sur une ligne, then le détail s'ouvre avec la référence, l'objet, le statut, la description avec ses retours à la ligne, les coordonnées, la catégorie, le canal et la date de dépôt.
- Given le détail, when je regarde l'historique, then je vois « Demande créée », « Demandeur » et « 8 nov. 2026, 8 h 47 », du plus ancien au plus récent.
- Given une description qui contient `<script>`, when je l'affiche, then le texte apparaît tel quel, sans être exécuté.
- Given le fil d'Ariane « ← Demandes », when je clique dessus, then je retrouve la liste avec la même recherche et la même page.

## Implementation Notes

- **Migration pas encore appliquée sur dev** : `npx.cmd supabase db push --remote --yes` refusé à l'agent (permission). À lancer par Aurel, puis `npx.cmd supabase migration list --remote` (10 migrations attendues). Tant qu'elle n'est pas appliquée, la liste marche, mais ouvrir un détail donne l'écran S3.
- Hors Code Map : `LienMenu` découpé en `LienMenu` + `VueLienMenu`, placé sous `<Suspense>` dans `menu-lateral.tsx` (sinon `next build` échoue : `usePathname()` sous un segment dynamique avec Cache Components). Au chargement complet d'un détail, « Demandes » peut apparaître un instant inactif.
- `EcranPageIntrouvable` reçoit `message` et `actions` facultatifs (S2 général inchangé) ; `essai`, `DELAI_MS`, `reponseInattendue` exportés de `src/server/lectures/demandes.ts` pour `lireDemande`.
- Liens : `lienTelephone` (`src/shared/contacts.ts`) réutilisé ; téléphone sans chiffre affiché sans lien ; `mailto:` encodé (`@` gardé lisible).
- Après vérification à l'écran (Aurel, 21 nov. 2026) : la pastille « feuille avec point d'interrogation » faisait croire à une anomalie. Décision : plus d'icône sur les deux écrans « introuvable » (S2 public et demande introuvable) ; `EcranErreur` : `icone` facultative. Le logo au-dessus du message est gardé, aussi dans l'espace interne (essayé sans : « ça fait vide »). S3 inchangé.
- Vérifié à l'écran par Aurel le 21 nov. 2026 : tous les critères sont bons (ligne cliquable et détail complet, historique, `<script>` affiché tel quel, fil d'Ariane qui garde la recherche et la page, demande introuvable).
- Migration appliquée sur dev par Aurel (`npx.cmd supabase db push --remote --yes`).
- Vérifié : lint, `tsc --noEmit`, 64 fichiers / 1 076 tests, `npm run build` (avant le dernier changement d'icône). Pas de commit (consigne d'Aurel : vérification à l'écran d'abord).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | verif + blind + edge | Tests « du plus ancien au plus récent » : la simulation trie elle-même les événements, l'application ne trie pas | low | Vérifié : `detailSimule` fait `.sort(...)` (`tests/aides/supabase-connexion.ts:112`) ; retirer le tri et tester que l'ordre reçu est gardé = correction directe | patch |
| 2 | verif | Ordre SQL (`order by e.date_creation, e.id`) jamais exécuté | medium | Réel ; pas de base de test dans le dépôt (comme 1.8 et 1.9) ; vérification à l'écran sur dev | defer |
| 3 | verif + blind | Plus aucun test de l'élément actif « Demandes » rendu par `MenuLateral` après le découpage `<Suspense>` | low | Vérifié : seuls `LienMenu` seul et un test sur le texte du fichier ; ajout d'un rendu = correction directe | patch |
| 4 | verif + blind + edge | Téléphone sans chiffre (branche sans lien) non testé ; `numeroAppel` copie `lienTelephone` de `src/shared/contacts.ts` | low | Vérifié : même expression aux deux endroits | patch |
| 5 | blind + edge | Lien `mailto:` non encodé : un email avec `?`, `&` ou `#` (accepté par `FORME_EMAIL`) ajoute des champs au message | low | Vérifié : `FORME_EMAIL` = `[^\s@]+@[^\s@]+\.[^\s@]+` ; encodage = correction directe | patch |
| 6 | blind | `ParametresAdresse` déclaré deux fois | low | Vérifié ; import du type existant | patch |
| 7 | blind | Test de migration figé (`toHaveLength(10)`, `at(-1)`) : cassera à la migration suivante | low | Vérifié ; déjà corrigé ainsi pour le test 1.9 | patch |
| 8 | blind | Commentaire de test périmé en double (`ecran-demandes.test.tsx:44`) | low | Vérifié | patch |
| 9 | edge | Un type d'événement ou un auteur autre que `creation` / `demandeur`-`systeme` fait tomber le détail en S3 | medium | Réel, mais aucune fonction n'écrit d'autre événement avant 1.11 ; risque au retour arrière (AD-16) quand 1.11 sera en ligne | defer |
| 10 | blind | Panne sur le détail : `src/app/error.tsx` remplace aussi le menu, sans « Retour aux demandes » | medium | Réel ; manque de l'écran S3 existant (« Liens vers les demandes : à venir », `ecran-erreur.tsx`), pas créé par 1.10 | defer |
| 11 | blind + edge | Référence inconnue : code HTTP 200 (`notFound()` sous `<Suspense>`) | low | Réel (doc Next.js, streaming) ; écran correct, page interne non indexée ; la correction déplacerait la lecture hors du `<Suspense>` | rejeté |
| 12 | blind + edge | Historique vide sans message | false | `deposer_demande` écrit « Demande créée » dans la même transaction ; EXPERIENCE.md : « Impossible » | rejeté |
| 13 | blind + edge | `tel:` faux pour « poste 12 » ou « +33 (0)6… » | low | Saisie rare ; la règle est celle de `lienTelephone` déjà en place | rejeté |
| 14 | blind | Écran « demande introuvable » : logo en double à côté du menu | low | Réel mais rare (référence inconnue) ; il faudrait une variante de l'écran S2 | rejeté |
| 15 | blind | Titre d'onglet identique pour toutes les demandes | low | Pas demandé par l'UX ; ajout de `generateMetadata` | rejeté |
| 16 | blind | Ligne cliquable : texte non sélectionnable, `relative` sur `<tr>` dans les vieux WebKit, pas de contour sur la ligne | low | Choix du plan (Design Notes) ; navigateurs récents seulement (NFR-12) ; contour de sélection visible sur la référence | rejeté |
| 17 | blind | `ESSAI_LISTE_DEMANDES` agit aussi sur le détail | low | Réglage de développement seulement | rejeté |
| 18 | blind | Clé React des événements sans identifiant | low | Liste figée, pas de réordonnancement ; 1.11 pourra renvoyer `id` | rejeté |
| 19 | blind | Repli du menu qui répète les propriétés du lien | low | Duplication de trois valeurs ; le test du n° 3 couvre le comportement | rejeté |
| 20 | blind | `exigerUtilisateur()` appelé deux fois | false | `cache` de React : une seule lecture du profil par requête ; double appel voulu (chaque lecture se garde elle-même) | rejeté |

## Design Notes

- Ligne cliquable sans JavaScript : la référence est un `<Link>` dont une zone `after:absolute after:inset-0` couvre la ligne (`relative` sur `<tr>`) ; clavier et nouvel onglet marchent.
- Historique générique (`type`, `auteur`, `date`) : 1.11 ajoutera ancien/nouveau statut et nom de l'auteur interne dans `lire_demande` sans changer l'écran.

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` -- expected: aucune erreur, tests verts.
- `npx.cmd supabase db push --remote --yes` puis `migration list --remote` -- expected: 10 migrations sur dev (sinon commande donnée à Aurel).

**Manual checks:**
- `npm run dev` : les quatre critères avec le compte collaborateur de test.
