---
title: 'Story 2.4 — Retrouver les autres demandes d''un même demandeur'
type: 'feature'
created: '2026-11-24'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dans le détail d'une demande, rien ne permet de voir d'un clic les autres demandes de la même personne : pour repérer un doublon, il faut recopier l'email dans la recherche de la liste.

**Approach:** Ajouter dans le bloc « Demandeur » du détail (I4) le lien « Voir ses autres demandes » (icône loupe, sous les champs, comme la maquette), qui ouvre la liste `/demandes?q=<email>` : la recherche sur l'email du demandeur, sans aucun filtre, donc toutes ses demandes quel que soit leur statut. La recherche (FR-12) le permet déjà côté base (`strpos` sur l'email, sans filtre de statut par défaut) : pas de migration. Couvrir par des tests le lien (adresse, filtres retirés, email avec `+`, `&`, majuscules) et la règle « l'email trouve toutes ses demandes, quel que soit leur statut » (`tests/regles/`).

</frozen-after-approval>

## Implementation Notes

- Choix de l'agent : le libellé est « Voir ses autres demandes », sans le nombre « (1) » de la maquette : EXPERIENCE.md (I4) et le critère de la story donnent ce texte, et le nombre demanderait une lecture de plus à chaque détail.
- Choix de l'agent : le lien retire les filtres et la page de la liste d'où l'on vient (sinon un filtre *Nouvelle* cacherait des demandes de la personne, contraire au critère « quel que soit leur statut »).
- Fichiers : `src/app/(interne)/demandes/[reference]/contenu-demande.tsx` (lien `AutresDemandes` sous les champs du bloc Demandeur, 44 px, loupe), `src/shared/messages.ts` (`MESSAGES_DETAIL.autresDemandes`), `src/shared/adresse-liste.ts` (commentaire de la convention), `tests/detail/ecran-demande.test.tsx`, `tests/regles/fr-12-recherche.test.ts`, `tests/e2e/autres-demandes.spec.ts` (nouveau).
- Aucune migration : la recherche de la story 1.9 / 2.1 trouvait déjà toutes les demandes d'un email, sans filtre de statut par défaut.
- Vérifications : lint, `tsc`, `npm run test` (79 fichiers, 1 506 tests avant la relecture ; fichiers voisins revérifiés après), `npm run build` sans erreur ; `npx playwright test tests/e2e/autres-demandes.spec.ts` réussi sur dev (laisse deux demandes « Essai automatique doublon … » sur dev).
- Vérifié à l'écran par Aurel le 24 nov. 2026 : tous les critères sont bons. Commit local sur `main`, sans envoi.

## Review Triage Log

| # | Constat | Verdict | Preuve | Suite |
|---|---------|---------|--------|-------|
| 1 | La recherche par contenu montre aussi `marianne@…` pour `anne@…` | low | Réel ; c'est la recherche FR-12 décidée (UX : « lance une recherche sur son email ») ; l'adresse a des paramètres fixes | defer (deferred-work.md) |
| 2 | Le test « et seulement elles » ne peut pas voir ce cas | low | Réel : emails fabriqués jamais inclus l'un dans l'autre | patch : test « limite connue » |
| 3 | Fiche plus courte que la 2.3, décisions non validées | false | Chemin court (oneshot) : sections retirées par le modèle ; les deux choix sont signalés à Aurel | rejeté |
| 4 | Pas de test navigateur | false | `tests/e2e/autres-demandes.spec.ts` ajouté et réussi sur dev | rejeté |
| 5 | Lien affiché même s'il n'y a pas d'autre demande | low | Texte exact de l'UX ; la liste montre alors une seule ligne, celle qu'on quitte | rejeté |
| 6 | La liste d'origine est perdue après le lien | low | Voulu (un filtre cacherait des demandes) ; Retour du navigateur | patch : documenté |
| 7 | Convention de l'adresse non mise à jour | low | Vérifié : en-tête de `adresse-liste.ts` muet | patch |
| 8 | Test « 44 px » sur les noms de classes | low | Convention des stories (Vitest sans DOM) ; l'e2e clique le lien | rejeté |
