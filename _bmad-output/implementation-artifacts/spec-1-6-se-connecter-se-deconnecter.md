---
title: 'Story 1.6 — Se connecter et se déconnecter'
type: 'feature'
created: '2026-11-20'
status: 'done'
baseline_commit: '6955c07d0bf0637187a1833ba58b96232c93c8ed'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les comptes internes existent (1.5), mais aucun écran ne permet d'entrer dans l'espace interne ni d'en sortir, et rien n'empêche encore une personne non connectée d'ouvrir une page interne.

**Approach:** Écran I1 à `/connexion` et Server Function de connexion (`src/server/connexion`) qui compte les échecs récents dans une nouvelle table `tentatives_connexion` **avant** d'appeler Supabase (AD-8), refuse un compte inactif avec le même message, et journalise. `src/proxy.ts` renvoie vers `/connexion` toute page interne sans session et interdit leur mise en cache ; `src/server/garde` (`exigerUtilisateur`) relit le profil ; une première page interne `/demandes` porte « Se déconnecter », qui ferme la session et recharge complètement `/connexion`.

## Boundaries & Constraints

**Always:** AD-7 (proxy à chaque requête, profil relu dans `profils`, rôle jamais lu des métadonnées Auth), AD-8 (5 échecs d'affilée en 15 minutes → blocage ; seuls messages : « Identifiants incorrects », « Trop de tentatives, réessayez plus tard », que l'email existe ou non ; contrôle avant l'appel à Supabase), AD-9 (RLS, fonctions `security definer` + `search_path = ''`, `enregistrer_tentative` et `connexion_bloquee` réservées à `service_role` ; lecture du profil par une règle RLS « sa propre ligne » pour `authenticated`), AD-11 (schéma Zod dans `src/shared/schemas`), AD-12 (réponses `Reponse<T>`, enveloppe `executerAction`), AD-13 (`connexion_reussie`, `connexion_echouee`, `connexion_bloquee`, jamais de mot de passe), AD-14 (tentatives de plus de 24 h effacées à chaque enregistrement), AD-16 (nouvelle migration) ; textes exacts de l'UX (I1), vouvoiement ; mot de passe effacé et email gardé après un échec ; bouton « Connexion… » désactivé pendant l'envoi.

**Never:** écran I2, redirection « doit changer son mot de passe », expiration après 8 h, message « session expirée » ou « session terminée » (1.7, 3.x) ; menu latéral complet, liste, compteur (1.8) ; retour à la page demandée après connexion ; lien « Mot de passe oublié ? » actif ; règle RLS donnant à un utilisateur la lecture des autres profils ; modification des anciennes migrations ; commit.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bons identifiants | compte actif | session ouverte, tentative réussie enregistrée, `connexion_reussie`, arrivée sur `/demandes` | N/A |
| Mauvais mot de passe / email inconnu | 1er à 4e échec | « Identifiants incorrects », échec enregistré, `connexion_echouee` | mot de passe vidé, email gardé |
| Compte inactif | bons identifiants, `actif = faux` | session refermée aussitôt, « Identifiants incorrects », compté comme échec | N/A |
| Blocage | 5 échecs d'affilée depuis moins de 15 min (sans réussite entre) | « Trop de tentatives, réessayez plus tard », Supabase non appelé, même avec le bon mot de passe ; `connexion_bloquee` ; essai non compté | fin du blocage 15 min après le 1er des 5 échecs |
| Saisie vide ou mal formée | email vide / sans @, mot de passe vide | message sous le champ, Supabase non appelé, rien enregistré | `VALIDATION` |
| Page interne sans session | `/demandes` ouvert sans être connecté | redirection vers `/connexion` | N/A |
| Déconnexion puis Retour | clic « Se déconnecter », puis Retour du navigateur | `/connexion` ; aucune donnée interne réaffichée | page interne `no-store`, rechargée si restaurée du cache |
| Panne | base ou Auth injoignable | « Une erreur inattendue s'est produite. » | `ERREUR_INTERNE` journalisée par l'enveloppe |

## Decisions (Aurel, 2026-11-20)

- Page `/demandes` **minimale** : en-tête avec le logo, le nom et le rôle de la personne connectée, le bouton « Se déconnecter » ; au centre, le titre « Demandes » et une phrase d'attente (« La liste des demandes arrive dans une prochaine version. »). La story 1.8 la remplacera.
- Migration : l'agent essaie `npx supabase db push --remote` sur dev ; en cas de refus, il donne la commande à Aurel.
- Plan gardé entier malgré sa longueur (environ 3 000 tokens).

</frozen-after-approval>

## Code Map

- `src/proxy.ts`, `src/lib/supabase/proxy.ts` -- `updateSession` rafraîchit la session (`getClaims`) : y ajouter la redirection des pages internes sans session et l'en-tête `Cache-Control: no-store`, en gardant les cookies rafraîchis. Le `matcher` reste tel quel.
- `src/lib/supabase/server.ts` -- `createClient()` (clé publique, cookies) : pour `signInWithPassword`, `signOut({ scope: "local" })` et la lecture du profil.
- `src/server/supabase-secret.ts` -- `creerClientSecret()`, importable par `src/server/connexion` (règle ESLint déjà prévue) : seulement pour `connexion_bloquee` et `enregistrer_tentative`.
- `src/server/journal/index.ts` -- `journaliser` ; les trois événements de connexion sont déjà dans la liste fermée.
- `src/server/actions/enveloppe.ts`, `src/server/actions/deposer-demande.ts` -- modèle de Server Function (`"use server"`, `executerAction`, `echec`/`succes`).
- `src/shared/reponse.ts` -- codes `VALIDATION`, `TROP_DE_TENTATIVES`, `ERREUR_INTERNE`.
- `src/shared/schemas/compte.ts`, `validation.ts`, `src/shared/messages.ts`, `src/shared/constantes.ts` (`FORME_EMAIL`) -- modèles de schéma et de messages.
- `src/app/(public)/formulaire-depot.tsx` + `tests/depot/formulaire-depot.test.tsx` -- modèle de formulaire client (champs contrôlés, `onSubmit`, réducteur testable sans navigateur) ; `src/components/formulaire/champ.tsx`, `src/components/ui/{input,button,alert}.tsx`, `src/components/logo.tsx` à réutiliser.
- `supabase/migrations/20261120090000_comptes.sql` -- `profils` (RLS sans règle, droits retirés) : ne pas modifier ; modèle de style.
- `next.config.ts` -- `cacheComponents: true` : toute lecture de cookies dans une page doit être sous `<Suspense>` (doc `authentication-with-cache-components.md`) ; pas de `use cache: private` pour le profil (garderait les données dans le navigateur).
- `tests/regles/rm-08-pas-d-inscription.test.ts` -- `/inscription` doit toujours afficher S2 : la redirection ne vise que les préfixes internes.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261120120000_connexion.sql` -- `tentatives_connexion` (email en minuscules, date, réussite, index email + date) ; RLS, droits retirés ; `connexion_bloquee(p_email)` (≥ 5 échecs de moins de 15 min postérieurs à la dernière réussite) ; `enregistrer_tentative(p_email, p_reussite)` (efface > 24 h puis insère) ; `service_role` seul ; règle RLS `select` sur `profils` limitée à `id = auth.uid()` + `grant select` à `authenticated`.
- [x] `src/shared/schemas/connexion.ts`, `src/shared/messages.ts` -- schéma (email obligatoire et bien formé, mis en minuscules ; mot de passe obligatoire, jamais nettoyé) et `MESSAGES_CONNEXION` (textes d'I1).
- [x] `src/shared/acces.ts` -- `ADRESSE_CONNEXION`, `ADRESSE_ACCUEIL_INTERNE` (`/demandes`), `PREFIXES_INTERNES` (`/demandes`, `/admin`) et `estPageInterne(chemin)`.
- [x] `src/server/connexion/index.ts` -- `connecter(email, motDePasse)` → `reussie | refusee | bloquee` : blocage, `signInWithPassword`, profil actif, `signOut` si inactif, tentative, journal ; erreurs Auth autres qu'identifiants refusés → levées.
- [x] `src/server/garde/index.ts` -- `lireUtilisateur()` (claims + profil, `null` si absent ou inactif) et `exigerUtilisateur()` (redirige vers `/connexion`) ; renvoie `{ id, nom, role }`.
- [x] `src/server/actions/se-connecter.ts`, `src/server/actions/se-deconnecter.ts` -- Server Functions dans l'enveloppe ; la connexion redirige vers `/demandes`.
- [x] `src/lib/supabase/proxy.ts` -- redirection et `no-store` pour `estPageInterne`.
- [x] `src/app/connexion/page.tsx`, `src/app/connexion/formulaire-connexion.tsx` -- I1 (titre, champs, « Afficher », curseur dans Email, erreurs, « Mot de passe oublié ? Contactez votre administrateur. »).
- [x] `src/app/(interne)/layout.tsx`, `src/app/(interne)/demandes/page.tsx`, `src/components/interne/bouton-deconnexion.tsx` -- page minimale (décision d'Aurel) ; profil lu sous `<Suspense>` ; « Se déconnecter » puis `window.location.replace("/connexion")` ; rechargement si la page revient du cache du navigateur (`pageshow` persisté).
- [x] `tests/connexion/*`, `tests/regles/rm-10-compte-desactive.test.ts` -- matrice (clients simulés), schéma, texte de la migration, proxy (page interne sans session → `/connexion`, page publique et `/inscription` inchangées, `no-store`), garde, formulaire (réducteur : mot de passe vidé, email gardé).

**Acceptance Criteria:**
- Given je ne suis pas connecté, when j'ouvre `/demandes`, then j'arrive sur `/connexion`.
- Given 5 mauvais essais pour un email (existant ou non), when j'essaie une 6e fois, même avec le bon mot de passe, then je lis « Trop de tentatives, réessayez plus tard » ; 15 minutes plus tard, la connexion refonctionne.
- Given un compte passé à `actif = faux` dans la base de dev, when je saisis ses bons identifiants, then je lis « Identifiants incorrects ».
- Given je suis connecté, when je clique sur « Se déconnecter » puis sur Retour, then je suis sur la connexion et aucune donnée interne ne s'affiche.

## Implementation Notes

- **Migration appliquée sur dev par Aurel** (le contrôle de permissions avait refusé `npx supabase db push --remote` à l'agent). Sous PowerShell, `npx.ps1` est bloqué par la stratégie d'exécution : utiliser `npx.cmd supabase db push --remote`.
- La garde est appelée dans chaque page interne, pas seulement dans le layout : d'après la doc locale de Next.js, un layout ne protège pas ses pages (elles sont envoyées quand même et ne sont pas revérifiées à chaque navigation). Les futures pages internes suivent ce modèle.
- Ajouts : limite de 100 caractères sur l'email de connexion (et dans la base) ; `user_banned` traité comme des identifiants refusés ; la sélection passe au résumé d'erreurs après une saisie refusée, comme sur P1.
- `tests/comptes/migration-comptes.test.ts` adapté : il exigeait que la migration 1.5 soit la dernière.
- Vérifié à l'écran par Aurel le 20 nov. 2026 : tous les critères sont bons.

## Spec Change Log

## Review Triage Log

| # | Couche | Constat | Verdict | Preuve | Suite |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge | Des essais envoyés en parallèle passent tous le contrôle du blocage avant qu'un échec soit écrit | low | Réel ; mais Supabase Auth limite déjà les connexions par adresse IP (environ 30 par 5 min), donc au plus quelques dizaines d'essais au lieu de 5, contre des mots de passe de 12 caractères. La correction demande de nouvelles fonctions SQL (réserver l'essai avant Auth) | rejeté (signalé à Aurel) |
| 2 | blind | Blocage par email seulement : on peut bloquer le compte d'un collègue en tapant 5 faux mots de passe | low | Voulu par le PRD (FR-8 : « le compte est bloqué ») et AD-8 | rejeté |
| 3 | blind | Les essais bloqués et les emails tapés (même inconnus) remplissent le journal | low | Réel ; borné par la limite de Supabase par IP ; l'email tapé sert au support (« Karim n'arrive pas à se connecter ») | rejeté |
| 4 | blind | Le temps de réponse diffère pour un compte inactif | low | Écart réel mais de quelques dizaines de ms ; le masquer demanderait une attente artificielle | rejeté |
| 5 | blind + edge | `signInWithPassword`, `signOut` et `getClaims` sans délai maximum | low | Réel mais rare ; même choix qu'en 1.5 (n° 10) | rejeté |
| 6 | blind + edge | Le proxy prend une panne d'Auth pour « non connecté » (renvoi vers la connexion au lieu de S3) | low | Rare ; la connexion affiche alors l'erreur inattendue ; correction = branche en plus | rejeté |
| 7 | blind | Redirection 307 du proxy pour un POST (Server Action sur une page interne après expiration) | maybe-false | Aucune action interne en 1.6 sauf la déconnexion, qui marche dans ce cas ; à revoir avec l'expiration (1.7) | rejeté (n'irait que jusqu'à low) |
| 8 | blind | `/connexion` ne renvoie pas une personne déjà connectée vers « Demandes » | low | Non demandé ; une nouvelle connexion est sans effet gênant | rejeté |
| 9 | blind + edge | Déconnexion : si la session ne peut pas être relue (jeton expiré et Auth injoignable), Supabase renvoie une erreur sans effacer les cookies, et le bouton n'en tient pas compte | low | Vérifié dans `GoTrueClient._signOut` (`sessionError` → retour sans `_removeSession`) ; il faut à la fois un jeton expiré et Auth en panne ; la page interne repasse quand même par la garde | rejeté |
| 10 | blind | « Déconnexion… » défini mais pas affiché ; bouton sans `aria-busy` | low | `MESSAGES_INTERNE.deconnexionEnCours` jamais utilisé | patch |
| 11 | blind | Rien ne relie `PREFIXES_INTERNES` aux dossiers de `src/app/(interne)` | low | Une future page interne hors préfixe serait sans renvoi ni `no-store` | patch |
| 12 | blind + verif | Le test de la migration 1.6 exige qu'elle soit la dernière et qu'il y en ait 6 | low | Cassera à la story 1.7, comme le test 1.5 cette fois-ci | patch |
| 13 | verif | Garde de la page `/demandes` vérifiée seulement par le texte du fichier | medium | Remplacer l'appel par `lireUtilisateur` laisserait tous les tests verts | patch |
| 14 | verif | Nom et rôle de l'en-tête jamais testés | low | Aucun test ne lit `LIBELLES_ROLES` ni l'en-tête rendu | patch |
| 15 | verif + blind | Rechargement au retour (`pageshow`) vérifié seulement par le texte du fichier | medium | `document.addEventListener` au lieu de `window` passerait les tests | patch |
| 16 | verif | Compteurs de sélection (`appelsResume`, `appelsMotDePasse`) non testés | low | Les supprimer laisse les tests verts | patch |
| 17 | verif | Verrou du double envoi (`envoyer`) non exécuté par les tests | low | Même schéma non testé que P1 ; le bouton est aussi désactivé pendant l'envoi | rejeté |
| 18 | verif | Fonctions SQL et règle RLS jamais exécutées | medium | Pas de base de test dans le dépôt ; vérification à la main sur dev | defer |
| 19 | edge | Après un échec, la sélection est donnée au mot de passe encore désactivé (envoi pas terminé) : elle se perd | low | L'effet suit `appelsMotDePasse` seul ; l'état « échec » est rendu avant la fin de la transition, quand le `fieldset` est encore désactivé | patch |
| 20 | blind | Squelette de l'en-tête non annoncé aux lecteurs d'écran | low | Pas de `role="status"`, contrairement à celui de la page | patch |
| 21 | blind | « Afficher » reste actif après un échec | low | Comportement acceptable ; l'UX ne dit rien | rejeté |
| 22 | edge | Formulaire figé si la redirection après réussite ramène à `/connexion` | low | Il faut un profil désactivé entre deux requêtes ; rare | rejeté |
| 23 | edge | Page interne finissant par `.png` exclue du proxy | false | Aucune page interne n'a une telle adresse | rejeté |
| 24 | edge | Page restaurée du cache affichée un instant avant le rechargement | maybe-false | `no-store` + cookies changés : Chrome et Firefox ne la gardent pas ; à vérifier à l'écran | rejeté (n'irait que jusqu'à low) |

## Design Notes

- Les comptes créés en 1.5 ont « doit changer son mot de passe » : dans cette story, ils entrent directement sur `/demandes` ; l'écran I2 et sa redirection arrivent en 1.7.
- Un essai pendant le blocage n'est pas enregistré : sinon chaque essai prolongerait le blocage au-delà des 15 minutes annoncées.
- Mauvais identifiants → code `VALIDATION` sans champ, message « Identifiants incorrects » ; blocage → `TROP_DE_TENTATIVES`.
- Déconnexion par rechargement complet (pas de navigation interne de Next.js) : le cache du routeur, qui garde les pages déjà vues, est vidé.

## Verification

**Commands:**
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (depuis PowerShell), `npm run build` -- expected: aucune erreur, tests verts.
- `npx supabase migration list --remote` -- expected: 6 migrations sur dev.

**Manual checks:**
- `npm run dev` : les quatre critères ci-dessus avec le compte collaborateur de test.
