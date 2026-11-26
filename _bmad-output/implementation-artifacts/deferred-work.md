- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-preparer-application-environnement-essai.md`
  summary: Ajouter un test qui vérifie en base les droits réels d'`anon` et `authenticated` (pgTAP ou `has_table_privilege` / `has_function_privilege`) après la migration « socle des droits ».
  evidence: Le test actuel ne lit que le texte SQL ; une instruction sans effet laisserait les tests verts. Il faut une base locale (Docker, absent du poste) ou une base liée, à prévoir avec la première story qui crée une table (1.3).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-enregistrer-erreurs-support.md`
  summary: Fixer la durée de conservation de `journal_technique` et la purge correspondante (proposition de l'architecture : 12 mois, par la tâche de nuit).
  evidence: Le journal peut contenir l'email ou l'identifiant d'un utilisateur interne, et rien ne supprime ses lignes ; l'architecture (§10) reporte ce choix à la documentation « Données personnelles ».
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-enregistrer-erreurs-support.md`
  summary: Prévoir un moyen protégé de provoquer une erreur en production (NFR-6 : « une erreur provoquée volontairement en production est retrouvable en moins de 5 minutes »).
  evidence: Les pages d'essai de la story 1.2 répondent S2 hors développement, pour ne pas ouvrir au public une porte d'écriture dans le journal ; il faudra une page réservée aux administrateurs (après 1.5/1.6), au plus tard pour 1.12.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-enregistrer-erreurs-support.md`
  summary: Les erreurs levées dans le navigateur (et une erreur de composant client rejouée côté navigateur) s'affichent en S3 sans code et ne sont pas journalisées.
  evidence: Elles n'ont pas d'empreinte Next.js ; les journaliser demande une action publique d'écriture, à limiter (anti-spam, story 6.5) ; le support peut s'appuyer sur l'heure et la page affichées par S3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-enregistrer-erreurs-support.md`
  summary: Dans la documentation Support (story 5.3), expliquer qu'on retrouve une erreur de page avec le code ET l'heure affichés par S3, car la même erreur garde le même code.
  evidence: Vérification d'Aurel le 19 nov. 2026 : trois ouvertures de /essais/erreur donnent toutes le code 1U8B2KJ ; décision de garder ce fonctionnement (code calculé par Next.js à partir de l'erreur).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-deposer-demande.md`
  summary: Afficher le téléphone de Nova sur l'écran S3 côté public (EXPERIENCE.md : « Déposer une demande » côté public, avec le téléphone de Nova).
  evidence: La spec 1.2 l'annonçait pour la story 1.3 (« table `parametres` »), mais la story 1.3 ne le demande pas et sa spec l'exclut. La table `parametres` existe désormais (colonne `telephone`), mais S3 s'affiche justement quand la base peut être injoignable : il faut décider d'où vient le numéro dans ce cas. À rattacher à la story 1.4, qui affiche déjà ce téléphone dans le message « Votre demande n'a pas pu être envoyée… ».
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-deposer-demande.md`
  summary: Créer les index des clés étrangères `evenements.demande_id` et `demandes.categorie_id` avec les stories qui lisent ces tables.
  evidence: La migration 1.3 ne crée que les index imposés par ses contraintes (la spec exclut les index de lecture). L'historique d'une demande (1.10), le filtre par catégorie (1.8) et la suppression en cascade (FR-28) en auront besoin ; Postgres n'indexe pas seul une clé étrangère.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-deposer-demande.md`
  summary: Exécuter réellement le SQL dans les tests (déclencheur de la référence, droits réels par rôle, verrou du compteur, refus `NV001` / `NV002` sans numéro consommé), au lieu de lire le texte de la migration.
  evidence: Les tests de `tests/regles` et `tests/depot` vérifient le texte SQL ; le comportement réel a été prouvé une fois à la main sur dev (bloc `do` annulé, 56 vérifications). Il faut une base de test (Docker, absent du poste, ou transaction annulée scriptée sur dev). Rejoint l'entrée de la story 1.1 sur les droits réels.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-recevoir-confirmation-reference.md`
  summary: Retirer l'ancienne `deposer_demande` à 8 paramètres (`public.deposer_demande(text, text, text, text, uuid, text, text, boolean)`), par une nouvelle migration, une fois la version à numéro d'envoi en production.
  evidence: La migration `20261119210000_numero_envoi.sql` crée la version à 9 paramètres et garde l'ancienne (AD-16 : on ne la supprime pas dans la migration qui la remplace). Plus aucun code ne l'appelle ; tant qu'elle existe, `service_role` peut encore créer une demande sans numéro d'envoi. Les tests de `tests/depot/migration-depot-demande.test.ts` et `tests/regles/` qui la lisent seront à adapter.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-recevoir-confirmation-reference.md`
  summary: Exécuter réellement la `deposer_demande` à 9 paramètres dans les tests : second envoi du même numéro (une seule demande, aucun numéro de référence consommé, mêmes référence, objet et email), deux envois simultanés du même numéro (verrou), et choix par PostgREST de la bonne version de la fonction.
  evidence: Les tests de la story 1.4 lisent le texte SQL et simulent la base ; l'effet réel a été prouvé une fois à la main sur dev (bloc annulé, 30 vérifications). Rejoint les entrées des stories 1.1 et 1.3 sur une base de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-creer-premier-compte-administrateur.md`
  summary: Exécuter réellement `creer_profil` et `modifier_parametres` dans les tests : profil et empreinte `$2…` pour un compte Auth au bon email, refus NV101 (email différent), NV102, 23505 (email en double), mise à jour de l'unique ligne, NV103, NV104.
  evidence: Les tests de la story 1.5 lisent le texte SQL et simulent la base (les codes d'erreur y sont écrits à la main) ; seule la vérification manuelle sur dev (docs/deploiement.md, étapes 4 et 5) prouve le comportement réel. Rejoint les entrées des stories 1.1, 1.3 et 1.4 sur une base de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-se-connecter-se-deconnecter.md`
  summary: Exécuter réellement `connexion_bloquee`, `enregistrer_tentative` et la règle RLS `profils_lecture_soi_meme` dans les tests (seuil de 5, fenêtre de 15 min, remise à zéro après une réussite, effacement après 24 h, lecture de sa seule ligne par `authenticated`).
  evidence: Les tests de la story 1.6 lisent le texte SQL et simulent la base (copie JavaScript de la règle dans `tests/aides/supabase-connexion.ts`) ; seule la vérification à l'écran sur dev prouve le comportement réel. Rejoint les entrées des stories 1.1, 1.3, 1.4 et 1.5 sur une base de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-choisir-mot-de-passe-rester-protege.md`
  summary: Après une reconnexion consécutive à l'expiration de la session (8 h), revenir à la page demandée au lieu d'arriver sur « Demandes » (EXPERIENCE.md, I1 « Session expirée » : « Après connexion, retour à la page demandée. [HYPOTHÈSE] »).
  evidence: Décision d'Aurel du 20 nov. 2026 (story 1.7) : arrivée sur « Demandes » pour l'instant. Garder la page demandée suppose de la transmettre sans la mettre dans l'adresse (AD-20, cookie de `src/server/passage`) et de n'accepter qu'une adresse interne (pas de renvoi vers un site extérieur).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-choisir-mot-de-passe-rester-protege.md`
  summary: Exécuter réellement `est_mot_de_passe_temporaire` et `terminer_changement_mdp` dans les tests (comparaison bcrypt vraie et fausse, NV105, NV106, sans effet si le drapeau est déjà faux, empreinte effacée, verrou du profil).
  evidence: Les tests de la story 1.7 lisent le texte SQL et simulent la base (copie JavaScript des règles dans `tests/aides/supabase-connexion.ts`) ; seule la vérification à l'écran sur dev prouve le comportement réel. Rejoint les entrées des stories 1.1 à 1.6 sur une base de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-choisir-mot-de-passe-rester-protege.md`
  summary: Tester en vrai (DOM ou parcours e2e) la fin de l'écran I2 (toast « Mot de passe enregistré » puis arrivée sur « Demandes » sans rechargement), le verrou du double envoi des formulaires I1 et I2, et la présence du `Toaster` dans le layout racine.
  evidence: Les tests actuels vérifient ces points en lisant le texte des fichiers, ou avec une fonction de remplacement ; Vitest tourne sans DOM et Playwright n'est pas installé. Il faut un environnement de test du navigateur (jsdom + Testing Library, ou Playwright, prévu par l'architecture pour SM-1).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-choisir-mot-de-passe-rester-protege.md`
  summary: Avec la réinitialisation du mot de passe par un administrateur (story 3.5), empêcher qu'une réinitialisation faite pendant le choix du mot de passe soit effacée par `terminer_changement_mdp` (le temporaire connu de l'administrateur deviendrait définitif).
  evidence: `choisirMotDePasse` change le mot de passe dans Auth puis appelle `terminer_changement_mdp`, qui efface l'empreinte présente sans vérifier que c'est celle comparée à l'étape 1. Impossible aujourd'hui (pas de réinitialisation) ; 3.5 devra par exemple dater l'empreinte et la passer à la fonction, ou faire la réinitialisation sous le même verrou.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-voir-demandes-compteur-a-traiter.md`
  summary: Exécuter réellement `exiger_utilisateur_interne`, `compter_a_traiter` et `lister_demandes` dans les tests (refus `NV201` sans session, compte inactif ou mot de passe à choisir ; colonne générée `a_traiter` ; page ramenée entre 1 et la dernière ; taille 1 à 100 ; tri date puis référence ; temps de réponse avec 5 000 demandes, NFR-13).
  evidence: Les tests de la story 1.8 lisent le texte SQL et simulent la base (copie JavaScript des règles dans `tests/aides/supabase-connexion.ts`) ; sur dev, seuls les refus d'`anon` et de `service_role` (`42501`) ont été vérifiés par appel REST. Rejoint les entrées des stories 1.1 à 1.7 sur une base de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-9-retrouver-demande-recherche.md`
  summary: Exécuter vraiment `lister_demandes` avec `p_q` sur une base Postgres de test (accents, majuscules, entreprise vide, `%` cherché tel quel), au lieu de la seule simulation JavaScript.
  evidence: Les tests FR-12 vérifient une copie JavaScript de la règle (NFD, qui diffère de `unaccent` pour œ, ß, ø) et le texte de la migration ; aucune base de test n'existe dans le dépôt (même constat qu'en 1.8).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-consulter-detail-historique-demande.md`
  summary: Exécuter vraiment `lire_demande` sur une base Postgres de test (référence inconnue → `null`, minuscules, ordre des événements par date puis identifiant, refus `NV201`).
  evidence: Les tests 1.10 lisent le texte de la migration et une simulation JavaScript ; aucune base de test n'existe dans le dépôt (même constat qu'en 1.8 et 1.9). Retirer le `order by` du `jsonb_agg` ne ferait échouer qu'un test sur le texte SQL.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-consulter-detail-historique-demande.md`
  summary: Écran S3 dans l'espace interne : une panne sur une page interne remonte à `src/app/error.tsx`, qui remplace aussi le menu latéral et ne propose pas « Retour aux demandes » (EXPERIENCE.md, S3).
  evidence: `src/app/(interne)` n'a pas d'`error.tsx` ; le détail (1.10) est la première page interne qui lève une panne au lieu d'afficher un état d'erreur sur place. `src/components/ecran-erreur.tsx` note déjà « Liens vers les demandes (personne connectée) : à venir ».
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-faire-avancer-demande-nouvelle-traitee.md`
  summary: Exécuter vraiment `changer_statut` et la nouvelle `lire_demande` sur une base Postgres de test (chaque ligne de la matrice, deux changements simultanés passés l'un après l'autre grâce au `for update`, contraintes `demandes_date_cloture_check` / `evenements_un_seul_auteur_check` / `evenements_statut_check`, nom d'un auteur désactivé).
  evidence: Les tests 1.11 lisent le texte de la migration et une copie JavaScript des règles (`tests/aides/supabase-connexion.ts`) ; aucune base de test n'existe dans le dépôt (même constat qu'en 1.8 à 1.10). Une erreur de sens dans le SQL passerait les tests.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-faire-avancer-demande-nouvelle-traitee.md`
  summary: Tester dans un vrai DOM le câblage des clics du panneau « Statut » (bouton → action, « Rouvrir la demande » de la fenêtre → action, « Annuler » → rien) et l'encadré « modifiée par … » qui reste affiché après `refresh()` (clé `demande.reference`).
  evidence: Les tests du dépôt tournent en environnement `node` avec `renderToStaticMarkup`, sans bibliothèque DOM : les gestionnaires de clic et l'état React ne s'exécutent pas. Vérification manuelle à l'écran en attendant.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-12-mettre-parcours-principal-en-ligne.md`
  summary: Lancer automatiquement (GitHub Actions) lint, types, tests Vitest et gitleaks à chaque envoi sur `main`, puisque chaque envoi publie directement la production sur Vercel.
  evidence: Relecture 1.12 : les vérifications de l'étape 1 de « Mise en ligne » (docs/deploiement.md) reposent sur un lancement à la main ; le dépôt est public et les commits vont directement sur `main`. Aucun dossier `.github/` n'existe encore (il arrive avec la sauvegarde de nuit, story 1.13, et l'exploitation, epic 5).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-13-sauvegarder-production-chaque-nuit.md`
  summary: Exécuter dans un test la requête SQL de `scripts/sauvegarde/sauvegarder.sh noter` (appel de `ecrire_journal` avec les variables psql) sur une vraie base Postgres portant la migration du journal.
  evidence: Relecture 1.13 : le faux `psql` des tests note seulement le texte envoyé ; une erreur de conversion ou de variable ne se verrait qu'au premier lancement réel (croix rouge sur l'étape « Noter »). Non vérifié faute de banc Postgres dans le dépôt ; le premier lancement à la main de la tâche le tranchera.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-saisir-demande-telephone-email.md`
  summary: Exécuter vraiment les fonctions SQL (refus NV001/NV002/NV401 et rejeu du numéro d'envoi de `saisir_demande`, comme celles des stories précédentes) dans les tests automatiques, et non plus seulement leur texte.
  evidence: `npm test` ne lit que le texte des migrations et une simulation qui recode les règles ; seul le parcours e2e manuel sur dev appelle la vraie base. Il faudrait un banc de base de données (Postgres local ou équivalent).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-retrouver-autres-demandes-demandeur.md`
  summary: « Voir ses autres demandes » montre aussi les demandes dont l'email (ou le nom, l'entreprise, l'objet) contient celui du demandeur (`anne@x.fr` trouve `marianne@x.fr`) ; une recherche sur l'email exact demanderait un nouveau paramètre d'adresse.
  evidence: la recherche FR-12 cherche un texte contenu (`strpos`) ; l'adresse de la liste a des paramètres fixes (architecture), d'où le report ; test « limite connue » dans `tests/regles/fr-12-recherche.test.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-reserver-administration-administrateurs.md`
  summary: Le côté administrateur de la section Administration (menu et tableau des comptes) n'a pas de test automatique de bout en bout ; il faudrait un compte administrateur de test sur dev, lu dans `.env.local` (variables séparées, test ignoré si elles manquent).
  evidence: `MenuLateral` rendu sans navigateur n'affiche que le repli `null` de `<Suspense>` ; `tests/e2e/administration.spec.ts` ne couvre que le collaborateur ; le critère 1 n'est vérifié qu'à l'écran.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-reserver-administration-administrateurs.md`
  summary: Story 3.3 — la section Administration du menu est dans le layout, qui n'est pas relu à la navigation : un administrateur rétrogradé la garde jusqu'au prochain rafraîchissement (la page A1, elle, affiche S1) ; FR-22 demande qu'elle disparaisse à sa prochaine action.
  evidence: commentaire de `src/components/interne/menu-lateral.tsx` (« Le menu n'est pas relu quand on passe d'une page… ») ; relevé par deux relecteurs de la 3.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-desactiver-reactiver-compte.md`
  summary: Exécuter la règle du dernier administrateur (RM-9) et le verrou de `modifier_compte` sur un vrai Postgres, avec deux appels simultanés.
  evidence: Les tests de la story 3.4 passent par une simulation TypeScript et la lecture du texte SQL ; l'e2e n'a volontairement pas d'identifiants administrateur. Réglerait la question : un test d'intégration sur une base locale (`supabase start`) qui lance deux `modifier_compte` en parallèle.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-reinitialiser-mot-de-passe-collegue.md`
  summary: Exécuter `reinitialiser_mdp` sur un vrai Postgres (forme de la réponse, codes NV202/NV204/NV205, remplacement de l'empreinte, `actif` intact).
  evidence: Les tests de la story 3.5 lisent le texte SQL et passent par une simulation TypeScript ; l'e2e ne vérifie que le refus `42501`. Réglerait la question : un test d'intégration sur une base locale (`supabase start`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-reinitialiser-mot-de-passe-collegue.md`
  summary: Fermer les sessions déjà ouvertes d'un compte quand son mot de passe est réinitialisé (cas d'un compte piraté).
  evidence: Aujourd'hui une session ouverte est seulement renvoyée vers I2 à la page suivante, et I2 ne demande pas le mot de passe temporaire ; comportement prévu par la fiche 3.5 pour un mot de passe oublié.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-reinitialiser-mot-de-passe-collegue.md`
  summary: Limiter le mot de passe temporaire à 72 octets (création et réinitialisation), comme le mot de passe choisi sur I2.
  evidence: `schemaCompte.motDePasseTemporaire` n'a pas de maximum ; au-delà, Supabase Auth refuse après l'écriture en base, et l'écran répond « Réessayez » à chaque essai.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-reinitialiser-mot-de-passe-collegue.md`
  summary: Donner un délai maximal aux appels de l'API d'administration de Supabase Auth (`createUser`, `updateUserById`, `deleteUser`).
  evidence: Les appels rpc ont `DELAI_MS`, pas ceux d'Auth dans `src/server/admin/index.ts` ; un Auth qui ne répond pas laisse la fenêtre bloquée en envoi.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-modifier-nom-role-compte.md`
  summary: Exécuter la vraie fonction SQL `modifier_compte` dans un test automatique (dernier administrateur sur un changement de rôle, rien changé, appel avec `p_actif` seul de la 3.4, refus 23514).
  evidence: Les tests lisent le texte SQL et une simulation JavaScript (`tests/aides/supabase-connexion.ts`) ; si les deux divergent, tout reste vert. Pas de Postgres local ni de compte administrateur de test.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-modifier-nom-role-compte.md`
  summary: Tester la sélection après un refus dans la fenêtre « Modifier » (encadré, champ Nom, liste Rôle).
  evidence: Vitest tourne en `node` sans DOM ; seuls les compteurs du réducteur sont vérifiés, comme pour les fenêtres des stories 3.2 et 3.5.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-modifier-nom-role-compte.md`
  summary: Parcours e2e côté administrateur de la story 3.3 (fenêtre « Modifier », dernier administrateur, rétrogradation dans une autre session puis menu sans Administration et S1).
  evidence: `tests/e2e/administration.spec.ts` ne couvre que le collaborateur ; même besoin d'un compte administrateur de test que le report de la 3.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-modifier-nom-role-compte.md`
  summary: Écrire les événements de comptes (`role_modifie`, et ceux des stories 3.2, 3.4, 3.5) dans la même transaction que la modification.
  evidence: `journaliser()` est appelé après le retour de la fonction SQL et avale ses erreurs ; un délai dépassé après l'écriture laisse un changement de rôle sans trace et affiche « n'a pas pu être modifié ».
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-supprimer-definitivement-demande.md`
  summary: Écrire `demande_supprimee` dans la même transaction que la suppression (ou signaler l'échec du journal), pour que toute suppression RGPD laisse une trace.
  evidence: `journaliser()` est appelé après le retour de `supprimer_demande` et avale ses erreurs ; un journal injoignable laisse une suppression sans trace (même modèle que les événements de comptes, report de la 3.3) ; AD-13 impose aujourd'hui `journaliser()`.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-supprimer-definitivement-demande.md`
  summary: Exécuter la vraie fonction SQL `supprimer_demande` en administrateur dans un test automatique (demande et événements effacés, `supprimee`, référence en majuscules, `introuvable`).
  evidence: Les tests lisent le texte SQL et une simulation JavaScript ; seul le refus collaborateur est vérifié sur dev. Pas de Postgres local ni de compte administrateur de test (même report qu'en 3.3 et 3.5).
