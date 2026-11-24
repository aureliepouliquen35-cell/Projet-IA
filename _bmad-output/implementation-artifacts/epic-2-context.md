# Epic 2 Context: Centraliser toutes les demandes

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Réunir au même endroit toutes les demandes de Nova Services, y compris celles reçues par téléphone ou par email, et permettre aux collaborateurs de trouver vite ce qui compte : filtrer la liste (statut, catégorie, canal) en même temps que la recherche, afficher d'un clic les demandes « à traiter », saisir soi-même une demande reçue hors formulaire, et repérer les doublons d'un même demandeur. C'est un Must du cahier des charges (centraliser les demandes qui arrivent surtout par email ou téléphone), qui s'appuie directement sur la liste, la recherche et le détail livrés par l'epic 1.

## Stories

- Story 2.1 : Filtrer la liste des demandes
- Story 2.2 : Afficher d'un clic les demandes à traiter
- Story 2.3 : Saisir une demande reçue par téléphone ou par email
- Story 2.4 : Retrouver les autres demandes d'un même demandeur

## Requirements & Constraints

- Filtres Must : **statut**, **catégorie**, **canal** ; ils se combinent avec la recherche (ex. *Nouvelle* + *Problème technique* + « imprimante »), le nombre de résultats est affiché, un bouton « Réinitialiser » retire tous les filtres. Priorité, attribution et « Sans activité » sont du Should (epic 6) : l'écran leur prévoit une place mais doit fonctionner sans eux.
- Le filtre Catégorie propose aussi les catégories désactivées (elles restent filtrables).
- **Demandes à traiter** : en Must, les demandes au statut *Nouvelle* ; la partie « *Urgente* non *Traitée* » arrive avec la priorité (Should). Le compteur baisse au plus tard au rafraîchissement quand une demande quitte *Nouvelle*.
- Recherche : sur référence, nom, email, entreprise ou objet, sans tenir compte des majuscules ni des accents ; taper l'email d'un demandeur affiche **toutes** ses demandes, quel que soit leur statut (c'est le moyen de repérer les doublons, pas de détection automatique en v1).
- Saisie interne : mêmes champs, limites et vérifications que le formulaire public, plus le **canal** obligatoire (*Téléphone* ou *Email* ; *Formulaire* est réservé au dépôt public). La case « La personne a été informée de l'usage de ses données » remplace celle du demandeur ; sans elle, aucune demande ne peut être créée (règle métier RM-12, à couvrir par un test dans `tests/regles/`). Pas de limite d'envois pour la saisie interne.
- L'événement de création d'une demande saisie indique l'utilisateur interne comme auteur et le canal (« Créée par Karim (canal : Téléphone) ») ; le canal est affiché dans le détail.
- Toute lecture et action interne exige un utilisateur connecté et actif ; aucune donnée sans connexion.

## Technical Decisions

- **Adresse de la liste** : paramètres fixes `q`, `statut`, `categorie`, `canal`, `priorite`, `attribution`, `sans_activite`, `a_traiter`, `page`. Valeurs : codes fermés pour `statut` (`nouvelle`, `en_cours`, `traitee`) et `canal` (`formulaire`, `telephone`, `email`) ; UUID pour `categorie` ; `oui` pour `a_traiter`. Tri plus récentes d'abord, pages de 25. Les filtres vivent dans l'adresse : retour du détail et lien partageable retrouvent la même liste.
- **Une seule fonction de lecture paginée** renvoie à la fois la page de résultats et le nombre total ; jamais de chargement de toutes les demandes dans l'application ; index créés par migration (objectif < 2 s avec 5 000 demandes).
- **« À traiter » défini une seule fois, dans la base** : le compteur et le filtre `a_traiter=oui` utilisent la même définition (jamais recodée en TypeScript).
- **Saisie interne** par la fonction SQL `saisir_demande` (seul chemin d'écriture, aucune écriture directe sur `demandes`/`evenements`) : elle vérifie l'appelant, attribue la référence `NOVA-AAAA-NNNN` via le compteur annuel verrouillé, crée la demande (statut *Nouvelle*, priorité *Normale*) et l'événement `creation`, dans la même transaction. `security definer`, `search_path = ''`, `revoke … from public` puis `grant execute` au rôle `authenticated`.
- **Numéro d'envoi unique** tiré au hasard à l'affichage d'I5 : un second envoi avec le même numéro renvoie la demande déjà créée. Le toast après redirection passe par le cookie serveur signé (`src/server/passage`), jamais par l'adresse.
- **Un schéma Zod** pour le formulaire I5 dans `src/shared/schemas` (limites et messages exacts de l'UX), utilisé côté navigateur et côté serveur ; la base répète les limites.
- Server Functions dans `src/server/actions`, lectures dans `src/server/lectures`, chacune commençant par `exigerUtilisateur()` ; réponses `{ ok: true, donnees }` / `{ ok: false, code, message, champs? }` ; après une action, Next.js recalcule liste, détail et compteur (pas de cache partagé de pages à données personnelles).
- Libellés des valeurs fermées (statuts, canaux) uniquement dans `src/shared/libelles.ts`.

## UX & Interaction Patterns

- **I3** : titre « Demandes » + bouton principal « Nouvelle demande » ; carte compteur « **N** à traiter », sous-texte « Nouvelles + urgentes non traitées » (le « + urgentes » seulement avec la priorité) ; barre de recherche ; filtres Statut, Catégorie, Canal ; « Réinitialiser » visible dès qu'un filtre est actif ; ligne « 42 demandes ».
- **Bouton de filtre** : 36 px, bordure grise, libellé « Statut : **Tous** » + chevron ; actif : fond `primary-soft`, bordure et texte bleus. Filtres appliqués tout de suite ; recherche lancée 300 ms après la dernière frappe ou avec Entrée.
- **Carte compteur** : cliquable, applique le filtre « À traiter » (qui apparaît alors actif) ; fond `primary`, chiffre 32 px gras blanc, étoile décorative `accent-light` à 35 %. Rien à traiter : « **0** à traiter » et « Tout est à jour », **sans félicitations**. La pastille du menu « Demandes » montre le même nombre. Erreur de chargement : compteur « — ».
- États : recherche/filtres sans résultat → « Aucune demande trouvée » + « Vérifiez l'orthographe ou retirez des filtres. » + « Réinitialiser » ; aucune demande en base → phrase + bouton secondaire « Saisir une demande reçue par téléphone » ; pendant une nouvelle recherche, le tableau précédent reste visible et estompé.
- Accessibilité : le nombre de résultats et le compteur sont annoncés aux lecteurs d'écran à chaque changement ; zones cliquables de 44 px.
- **I5** : une colonne de 560 px ; **Canal *** en premier (Téléphone / Email) ; même formulaire que P1 ; case « La personne a été informée de l'usage de ses données. * » avec lien « Texte à lui lire » qui affiche la mention de P1 ; bouton « Enregistrer la demande ». Case oubliée → résumé « 1 champ est à corriger » + sous la case « Confirmez que la personne a été informée de l'usage de ses données », rien n'est perdu. Succès → détail I4 de la nouvelle demande + toast « Demande NOVA-2026-0043 créée ».
- **I4** : lien « Voir ses autres demandes » dans le bloc Demandeur, qui ouvre la liste avec la recherche sur l'email ; fil d'Ariane « Demandes › NOVA-… » qui ramène à la liste avec ses filtres.

## Cross-Story Dependencies

- Ordre de construction : **2.1 → 2.3 → 2.2 → 2.4** (la 2.3 utilise le filtre par canal de la 2.1).
- Tout l'epic s'appuie sur l'epic 1 : liste paginée, compteur et définition « à traiter » en base, recherche sans accents, détail et historique, colonne `canal` déjà présente sur `demandes`, garde d'accès, format d'erreur, cookie de passage et numéro d'envoi.
- La 2.2 dépend du filtre `a_traiter` exposé par la lecture de la 2.1 ; la 2.4 réutilise la recherche (`q`) et l'adresse de la liste.
- L'epic 6 ajoutera aux filtres et au compteur la priorité, l'attribution et « Sans activité », sans changer l'adresse de la liste.
