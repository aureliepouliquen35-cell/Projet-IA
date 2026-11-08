---
title: 'Story 1.1 — Préparer l''application et l''environnement d''essai'
type: 'chore'
created: '2026-11-08'
status: 'done'
baseline_commit: '056491d0289155f19c2e0ef557c4448776c64a36'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-projet-ia-2026-11-08/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le dépôt contient encore la page de démonstration de Next.js, sans l'identité de Nova, sans outil de tests, sans migrations versionnées ni liste des réglages attendus : aucune story suivante ne peut démarrer proprement.

**Approach:** Habiller l'application avec les tokens de DESIGN.md (Inter, couleurs, rayons, logo), installer shadcn/ui, lucide-react et Vitest, initialiser la Supabase CLI avec une première migration qui retire tout droit par défaut au rôle `anon`, documenter les 5 variables dans `.env.example`, et brancher la vérification des secrets.

## Boundaries & Constraints

**Always:** tokens de DESIGN.md déclarés une seule fois dans `src/app/globals.css` (bloc `@theme`), aucune couleur en dur dans les composants ; interface en français ; icônes lucide-react uniquement ; conserver `src/proxy.ts`, `src/lib/supabase/*` et les réglages existants de `next.config.ts` ; `.env*` reste ignoré par Git, sauf `.env.example`.

**Never:** créer une table, un formulaire, une page interne ou toute fonction métier (stories suivantes) ; mettre une vraie clé dans un fichier suivi par Git ; mode sombre ; commit (Aurel vérifie d'abord).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page d'accueil | `npm run dev`, ouvrir `/` | Logo Nova, police Inter, bleu `#1E3A8A`, boutons principal et secondaire, page en français | N/A |
| Variables | lecture de `.env.example` | 5 noms d'AD-15, valeurs fictives, aucun secret préfixé `NEXT_PUBLIC_` | test Vitest en échec si une variable manque |
| Migration | `npx supabase db push` sur dev | migration « socle des droits » listée comme appliquée | CLI non liée → message clair, rien n'est appliqué |

## Decisions (Aurel, 2026-11-08)

- Le projet Supabase déjà relié dans `.env.local` devient le projet **dev** ; Aurel vérifie dans le tableau de bord qu'il est en Europe et sans vraies données.
- La migration est préparée par l'agent ; Aurel l'applique lui-même avec 3 commandes fournies (connexion, liaison, application), car elles demandent sa connexion Supabase.
- gitleaks est installé sur le poste avec winget.

</frozen-after-approval>

## Code Map

- `src/app/layout.tsx` -- remplacer Geist par Inter (`next/font/google`, variable CSS), `lang="fr"`, titre « Nova Services ».
- `src/app/page.tsx` -- page de démonstration Next à remplacer par une page d'accueil provisoire (remplacée en story 1.3 par le formulaire).
- `src/app/globals.css` -- `@import "tailwindcss"` + bloc `@theme inline` à réécrire avec les tokens ; retirer le mode sombre.
- `next.config.ts` -- `cacheComponents`, `partialPrefetching` et le loader `@tailwindcss/turbopack` : ne pas toucher (pas de `postcss.config`).
- `src/proxy.ts`, `src/lib/supabase/{client,server,proxy}.ts` -- `[ADOPTED]`, ne pas modifier.
- `public/*.svg` -- images de la démo Next, plus utilisées après remplacement de la page.
- `.gitignore` -- ignore `.env*` : ajouter l'exception `!.env.example`.
- `package.json` -- ajouter scripts `test`, `secrets` ; dépendances shadcn (clsx, tailwind-merge, class-variance-authority, radix), lucide-react ; devDependencies vitest, supabase.
- Maquettes `ux-designs/.../mockups/*.html` -- SVG du logo à reprendre tel quel.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/globals.css` -- déclarer tous les tokens de DESIGN.md (couleurs, typographie, rayons 6/10/14/20, ombres) et les variables attendues par shadcn/ui, mappées sur ces tokens -- AD-19, UX-DR1.
- [x] `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx` -- initialiser shadcn/ui et ajouter le composant Button, variantes principal / secondaire / discret / danger habillées selon DESIGN.md -- UX-DR3.
- [x] `src/components/logo.tsx` -- logo Nova (SVG des maquettes + « **Nova** Services »), `aria-label` -- UX-DR2.
- [x] `src/app/layout.tsx`, `src/app/page.tsx` -- Inter, `lang="fr"`, page d'accueil provisoire en français avec logo, titre, texte, boutons, une icône lucide ; supprimer `public/*.svg` devenus inutiles -- UX-DR14.
- [x] `supabase/config.toml`, `supabase/migrations/<horodatage>_socle_droits.sql` -- `supabase init` puis migration qui retire les droits par défaut d'`anon` (tables, séquences, fonctions) et le droit d'exécution par défaut des fonctions -- AD-9, AD-16.
- [x] `.env.example`, `.gitignore` -- 5 variables d'AD-15 avec valeurs fictives et commentaires en français ; exception `!.env.example` -- AD-15.
- [x] `vitest.config.mts`, `tests/socle/env-example.test.ts` -- Vitest (environnement node, alias `@`) et un test qui vérifie `.env.example` (5 noms présents, aucun `NEXT_PUBLIC_` secret, aucune valeur réelle) -- NFR-14.
- [x] `package.json` -- scripts `test` (`vitest run`) et `secrets` (gitleaks, sortie masquée).

**Acceptance Criteria:**
- Given le dépôt, when je lance l'application en local, then une page s'affiche avec le logo Nova Services, la police Inter et les couleurs de DESIGN.md.
- Given le projet Supabase dev en Europe, when j'applique les migrations avec la Supabase CLI, then elles apparaissent comme appliquées dans le tableau de bord de dev.
- Given `.env.example`, when je l'ouvre, then il liste les 5 variables d'AD-15 avec des valeurs fictives, `.env.local` n'est pas dans le dépôt, et gitleaks ne trouve aucun secret.
- Given Vitest installé, when je lance la commande de tests, then elle s'exécute sans erreur.

## Implementation Notes

- **Supabase CLI 3.0 vise la base locale par défaut** : `db push` et `migration list` sans option ciblent Docker (127.0.0.1:54322). Pour dev, ajouter `--remote` : `npx supabase login`, `npx supabase link --project-ref <ref>` (ref = sous-domaine de `NEXT_PUBLIC_SUPABASE_URL` dans `.env.local`, mot de passe de la base demandé), `npx supabase db push --remote`, puis `npx supabase migration list --remote`. Sans liaison : `ProjectRefNotLinkedError`, rien n'est appliqué.
- shadcn 4.23 (`init -b radix -p nova`) installe le paquet `cn` à la place de clsx + tailwind-merge : remplacé par clsx + tailwind-merge (comme prévu), avec `extendTailwindMerge` qui connaît les tokens nommés (`text-label`, `shadow-soft`, `h-control`…). Le CLI `shadcn` est en devDependencies (seul son `tailwind.css` sert, à la compilation). Après chaque `shadcn add`, vérifier l'import de `cn` (`@/lib/utils`) et remplacer les classes `dark:` / couleurs par défaut.
- `@theme static` avec `--color-*: initial` : les couleurs par défaut de Tailwind n'existent plus, seules celles de DESIGN.md. Variante `dark` rattachée à une classe `.dark` jamais posée (aucun mode sombre selon le système).
- `@types/node` passé de ^20 à ^24 (Node 24 de l'architecture) : vitest 5.1 refuse ^20.
- Logo : tracé SVG repris des maquettes, couleurs par classes de tokens (`fill-primary`, `fill-accent-nova-light`). `src/app/favicon.ico` (logo Next) remplacé par `src/app/icon.svg` (symbole Nova ; couleurs écrites dans le fichier image, seul endroit possible).
- gitleaks 8.30.1 installé par winget (nouveau terminal nécessaire pour le PATH). `npm run secrets` = `gitleaks git --redact --no-banner` : analyse l'historique Git, donc les fichiers non commités ne sont vus qu'après commit. Faux positif dans `_bmad/_config/files-manifest.csv` (empreintes SHA-256) écarté par `.gitleaks.toml`, limité à ce fichier et aux valeurs de 64 caractères hexadécimaux.
- Audit de la matrice : lignes « Page d'accueil » et « Migration » couvertes par `tests/socle/accueil.test.tsx` (rendu serveur de la page, `lang="fr"`, Inter, bleu `#1e3a8a`, pas de mode sombre) et `tests/socle/migration-socle-droits.test.ts` (fichier unique, révocations d'`anon`, aucune table ni fonction) ; `vitest.config.mts` inclut aussi `*.test.tsx`. L'application réelle sur dev reste vérifiée par `npx supabase migration list --remote` (AC 2, faite par Aurel).

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge | Les fonctions déjà présentes dans `public` gardent l'EXECUTE accordé à `public` : `anon` en hérite | medium | La migration révoque seulement `from anon` sur les fonctions existantes ; le droit passe par `public` | patch |
| 2 | blind + verif | Test de migration : la ligne `revoke execute … from authenticated` n'est pas vérifiée | low | Aucune assertion dans `migration-socle-droits.test.ts` ; correction directe | patch |
| 3 | verif | Aucun test ne vérifie les vrais droits en base (pgTAP / `has_table_privilege`) | medium | Le test ne lit que le texte SQL ; une base locale (Docker) ou liée est nécessaire | defer |
| 4 | blind + verif | `extendTailwindMerge` de `cn` non testé : `text-label` peut disparaître sans test rouge | medium | Sonde du relecteur : `twMerge` par défaut retire `text-label` | patch |
| 5 | blind + verif | `type="button"` par défaut du Button non testé | low | Aucun rendu de `<Button>` simple sous test | patch |
| 6 | verif | Mode sombre et classes du thème vérifiés seulement sur le texte CSS | medium | Supprimer `@custom-variant dark` ou renommer `--container-form` laisse les tests verts | patch |
| 7 | edge | Test `.gitignore` : `indexOf` ne voit pas un `.env*` répété après l'exception | low | Correction directe (`lastIndexOf`) | patch |
| 8 | edge | Défauts de privilèges pour `supabase_admin` | false | `postgres` n'est pas membre de `supabase_admin` sur Supabase : l'instruction échouerait ; les migrations et l'éditeur SQL créent les objets en tant que `postgres` | rejeté |
| 9 | blind | `anon` garde `USAGE` sur le schéma `public` | low | Sans droit sur les objets, `USAGE` n'ouvre aucune donnée ; l'intention vise les droits sur tables/séquences/fonctions | rejeté |
| 10 | blind | `auto_expose_new_tables` non renseigné (= true) | false | Le commentaire du CLI indique que c'est le comportement du cloud ; le passer à `false` en local créerait un écart dev local / cloud ; la migration s'applique aux deux | rejeté |
| 11 | blind | Variantes en français : les futurs composants shadcn (`variant: "outline"`) casseront | false | Échec bruyant à la vérification TypeScript ; noms imposés par la spec ; adaptation notée dans Implementation Notes | rejeté |
| 12 | blind | `--color-*: initial` retire `white`/`black` (overlays shadcn), jetons sidebar/chart absents | low | Aucun composant actuel n'en dépend ; la story qui ajoute une fenêtre ajoutera son jeton ; consigne déjà notée | rejeté |
| 13 | blind | Tailles de texte en `px` et non en `rem` | low | DESIGN.md fixe des px ; le zoom du navigateur agrandit les px (WCAG 1.4.4 tenu) | rejeté |
| 14 | blind + edge | Boutons de l'accueil vers `#bientot` ; `aria-disabled` sans effet sur un lien | low | Page provisoire remplacée en 1.3 ; le clic mène au message « ouvriront prochainement » ; aucun appelant `aria-disabled` | rejeté |
| 15 | blind | Tests : `expect` à la collecte, layout vérifié par regex | false | Une ligne invalide fait quand même échouer `npm run test` ; importer `layout.tsx` charge `next/font`, indisponible sous Vitest | rejeté |
| 16 | blind + edge | gitleaks hors npm, pas de CI, pas de `engines` | low | Échec bruyant (« commande introuvable ») ; installation décidée par winget ; CI hors de cette story | rejeté |
| 17 | blind + edge | `favicon.ico` supprimé : `/favicon.ico` en 404, pas d'`apple-icon`, couleurs écrites dans `icon.svg` | low | Le navigateur suit le `<link rel="icon">` vers `icon.svg` ; le proxy exclut seulement ce chemin, sans effet ; un fichier image ne lit pas les tokens CSS | rejeté |
| 18 | blind | `config.toml` modèle du CLI (inscription ouverte, mot de passe 6, redirection https) | low | Ne sert qu'à la base locale Docker, inutilisée ; les réglages d'authentification relèvent des stories 1.5 à 1.7 (tableau de bord) | rejeté |
| 19 | blind | Pas de module qui valide les variables ni de `server-only` | false | Aucun code ne lit encore les secrets ; `supabase-secret.ts` arrive avec les stories qui en ont besoin (AD-15) | rejeté |
| 20 | blind | Petits écarts : `gutter-desktop` inutilisé, survol danger en `color-mix`, pas de `title.template` | low | Page étroite (formulaire) ; survol dérivé des tokens, sans couleur en dur ; pas encore de sous-page | rejeté |
| 21 | edge | `variant={null}` laisse le bouton sans style | false | Dans cva, `null` signifie « aucune variante » par choix explicite ; aucun appelant ne le passe | rejeté |
| 22 | edge | `asChild` avec un `<button>` enfant sans `type` | low | Aucun appelant ; le commentaire vise le `<button>` simple | rejeté |
| 23 | edge | `svg.lucide { stroke-width }` écrase une prop `strokeWidth` | low | DESIGN.md impose 1,75 partout ; aucun appelant ne change l'épaisseur ; un correctif demande un fournisseur dédié | rejeté |
| 24 | edge | Test `.env.example` : valeur entre guillemets ou commentaire en fin de ligne | low | Il faudrait écrire une vraie clé suivie de « exemple » ; gitleaks la détecterait ; le correctif ajoute une garde | rejeté |
| 25 | edge | `npm run secrets` ne voit les nouveaux fichiers qu'après commit | low | Le commit reste local jusqu'à l'envoi sur GitHub : lancer `npm run secrets` après le commit et avant l'envoi ; fichiers de cette story analysés à part (aucun secret) | rejeté |

## Design Notes

shadcn/ui appelle `accent` la couleur de survol de ses menus. Pour ne jamais mettre le violet de DESIGN.md sur un bouton (règle de DESIGN.md), l'`accent` de shadcn est mappé sur le gris `surface-subtle`, et l'accent violet de DESIGN.md est exposé sous le nom `accent-nova` (`accent-nova`, `accent-nova-soft`, `accent-nova-light`).

## Verification

**Commands:**
- `npm run lint` -- expected: aucune erreur.
- `npm run test` -- expected: tests verts.
- `npm run build` -- expected: build réussi.
- `npx supabase migration list` -- expected (après liaison) : migration présente en local et sur dev.
- `npm run secrets` -- expected : « no leaks found ».

**Manual checks (if no CLI):**
- Ouvrir `http://localhost:3000` à 360 px et en grand écran : logo, Inter, bleu, aucune trace de la démo Next.
