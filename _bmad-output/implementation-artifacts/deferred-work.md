- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-preparer-application-environnement-essai.md`
  summary: Ajouter un test qui vérifie en base les droits réels d'`anon` et `authenticated` (pgTAP ou `has_table_privilege` / `has_function_privilege`) après la migration « socle des droits ».
  evidence: Le test actuel ne lit que le texte SQL ; une instruction sans effet laisserait les tests verts. Il faut une base locale (Docker, absent du poste) ou une base liée, à prévoir avec la première story qui crée une table (1.3).
