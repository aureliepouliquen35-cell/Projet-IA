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
