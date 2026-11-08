# Epic 1 Context: Déposer une demande et la faire traiter

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Rendre utilisable, en ligne, le parcours principal de Nova Services : un client dépose une demande sans compte et reçoit une référence ; un collaborateur connecté la retrouve par la recherche, la passe *En cours* puis *Traitée*, et l'historique montre les trois étapes avec auteur et heure. Les données de production sont sauvegardées chaque nuit dès la mise en ligne. C'est la priorité absolue du projet : sans cet epic, rien d'autre n'a de valeur.

## Stories

- Story 1.1 : Préparer l'application et l'environnement d'essai
- Story 1.2 : Enregistrer les erreurs pour le support
- Story 1.3 : Déposer une demande
- Story 1.4 : Recevoir la confirmation avec sa référence
- Story 1.5 : Créer le premier compte administrateur
- Story 1.6 : Se connecter et se déconnecter
- Story 1.7 : Choisir son mot de passe et rester protégé
- Story 1.8 : Voir toutes les demandes et le compteur « à traiter »
- Story 1.9 : Retrouver une demande par la recherche
- Story 1.10 : Consulter le détail et l'historique d'une demande
- Story 1.11 : Faire avancer une demande de Nouvelle à Traitée
- Story 1.12 : Mettre le parcours principal en ligne
- Story 1.13 : Sauvegarder la production chaque nuit

## Requirements & Constraints

- Budget : offres gratuites uniquement (Vercel Hobby, Supabase Free, GitHub public). Le dépôt GitHub est **public** : rien de secret ni de personnel ne doit y entrer, même dans l'historique.
- Interface entièrement en français, vouvoiement, textes exacts de l'UX.
- Formulaire public utilisable à 360 px de large, au clavier, avec étiquettes visibles ; espace interne pensé pour ordinateur.
- Une demande a toujours une référence unique `NOVA-AAAA-NNNN`, le statut *Nouvelle* et la priorité *Normale* à sa création ; trois statuts fixes ; jamais de retour à *Nouvelle* ; chaque action laisse une ligne d'historique non modifiable.
- Aucune donnée n'est accessible sans connexion ; pas d'inscription publique ; mots de passe de 12 caractères au moins ; messages de connexion neutres ; blocage après 5 échecs ; expiration après 8 h d'inactivité.
- Les erreurs et événements importants sont retrouvables en moins de 5 minutes, sans mot de passe ni texte des demandeurs.
- Chaque règle métier touchée a un test automatisé ; tous les tests passent avant de terminer une story.
- Deux environnements séparés : **dev** (poste local, tests) et **prod** (production Vercel sur `main`).

## Technical Decisions

- Stack existante à garder : Next.js 16.4.5 (App Router, `src/proxy.ts` remplace l'ancien middleware), React 19.3, TypeScript 5.9, Tailwind CSS 4, `@supabase/supabase-js` et `@supabase/ssr` (clients dans `src/lib/supabase`). Ajouts décidés : shadcn/ui, lucide-react, Zod, Vitest, Playwright, Supabase CLI. Lire la doc locale de Next.js (`node_modules/next/dist/docs/`) avant d'écrire du code Next.
- Organisation en couches : interface (`src/app`, `src/components`) → actions et lectures serveur (`src/server/actions`, `src/server/lectures`) → socle (`src/server/garde`, `journal`, `depot`, `admin`, `connexion`, `passage`, `src/lib/supabase`) → base (`supabase/migrations`). `src/shared` (schémas Zod, libellés, constantes) est utilisable partout.
- Le navigateur ne parle jamais directement à la base. Toute écriture passe par une fonction SQL nommée, qui vérifie l'appelant et écrit l'historique dans la même transaction ; RLS activé partout, rôle `anon` sans aucun droit ; clé secrète seulement dans `src/server/supabase-secret.ts`, importable par 4 modules (règle ESLint).
- Structure de la base uniquement par migrations versionnées (Supabase CLI), appliquées sur dev puis prod. Chaque table est créée par la première story qui en a besoin.
- Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SECRET_EMPREINTE_IP`, `SECRET_COOKIES`, listées dans `.env.example` avec des valeurs fictives. Aucune clé secrète ne porte le préfixe `NEXT_PUBLIC_`. gitleaks vérifie l'absence de secrets.
- Thème : tous les tokens de DESIGN.md déclarés une seule fois dans `src/app/globals.css` (bloc `@theme` de Tailwind 4), utilisés par les composants shadcn/ui ; aucune couleur en dur ; icônes uniquement lucide-react.
- Réponses des Server Functions au format `{ ok: true, donnees }` ou `{ ok: false, code, message, champs? }`, avec des codes fermés ; erreurs imprévues journalisées avec un code court ; `onRequestError` dans `src/instrumentation.ts`.
- Noms métier en français sans accents ; `snake_case` en base, `camelCase` en TypeScript, fichiers en `kebab-case` ; dates en `timestamptz`, affichées en heure de Paris (« 8 nov. 2026, 9 h 12 »).
- Commits directement sur `main`, au format `type: description`, seulement à la demande d'Aurel.

## UX & Interaction Patterns

- Identité : bleu profond `#1E3A8A` (actions), accent violet améthyste `#6D28D9` (petites touches, jamais dans un badge ni un bouton), police Inter, références en chasse fixe, coins de 6 / 10 / 14 / 20 px, ombres très douces, logo « étoile à 4 branches » dans un carré bleu + « **Nova** Services ».
- Un seul bouton principal par écran ; étiquettes au-dessus des champs ; erreurs sous le champ et résumé en haut ; contenu jamais effacé après une erreur.
- Statuts toujours écrits en toutes lettres dans un badge en forme de pilule ; jamais la couleur seule.
- États de chaque écran : vide (phrase + action), chargement (squelette après 300 ms), erreur (message + « Réessayer »), complet.
- Maquettes de référence : formulaire de dépôt (téléphone), liste des demandes, détail d'une demande (ordinateur) ; les documents UX l'emportent sur les maquettes.

## Cross-Story Dependencies

- 1.1 pose le socle (thème, composants, environnement dev, migrations, tests) utilisé par toutes les stories suivantes.
- 1.2 (format d'erreur, journal) doit précéder toute story qui crée des Server Functions.
- 1.3 crée les tables des demandes ; 1.5 crée les profils et la procédure d'installation ; 1.6 et 1.7 dépendent de 1.5 ; 1.8 à 1.11 dépendent de 1.3 et 1.6 ; 1.12 dépend de tout l'epic ; 1.13 dépend de 1.12.
- Les epics suivants (filtres, comptes, réglages, exploitation) s'appuient sur cet epic.
