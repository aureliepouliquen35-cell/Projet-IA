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
