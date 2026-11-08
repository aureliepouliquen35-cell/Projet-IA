---
title: Réconciliation PRD ↔ cahier des charges — Nova Services
created: 2026-11-08
source: docs/cahier-des-charges-nova-services.md
prd: prd.md
addendum: addendum.md
---

# Réconciliation PRD ↔ cahier des charges (CDC)

## Verdict

Le PRD et son addendum couvrent **toutes les fonctions explicites du CDC**, et chacune est en Must. Aucun écart n'est critique. Les écarts restants portent sur trois points :
1. des **intentions du CDC** mal traduites en exigences testables : la centralisation des demandes reçues par téléphone ou par email, les « principaux paramètres », les « oublis », l'« application simple » et la vérification de **tout** ce que l'IA produit ;
2. des **étiquettes** mal posées : `[CDC]` sur des choix du rédacteur, et une règle de priorité floue pour `[PRÉCISION]` ;
3. quelques **incohérences internes** : historique « jamais supprimé » alors que l'on peut supprimer une demande, une ligne de MVP sans exigence, un statut de validation contradictoire.

Bilan : 0 critique, 2 hautes, 9 moyennes, 11 basses.

## 1. Traçabilité ligne par ligne

Légende : ✅ couvert fidèlement · ⚠️ couvert partiellement ou de façon faible · ❌ absent.

### Contexte et mission

| Élément du CDC | Couverture PRD | Verdict | Constat |
|---|---|---|---|
| Types de demandes : information, problème technique, rendez-vous, question administrative, sollicitation nécessitant l'intervention d'un collaborateur | FR-26 (5 catégories initiales) | ⚠️ | Le 5ᵉ type du CDC devient « Autre » (R-19). |
| Clients **et prospects** | §2.1, FR-1 | ⚠️ | Rien ne distingue un client d'un prospect (R-19). |
| Demandes reçues par email et par téléphone, recopiées à la main | §1, §2.3, UJ-4 `[HYPOTHÈSE]` | ⚠️ | C'est le cœur du problème, mais il n'est traité que par une hypothèse, qui entre en conflit avec FR-5, FR-6 et FR-17 (R-01). |
| Oublis | §1, FR-14 | ⚠️ | Le compteur ne montre que les *Nouvelle*. Une demande qui reste *En cours* sans suite est invisible (R-03). |
| Doublons | FR-12 (recherche par email), §8.2 | ⚠️ | Couverture minimale, mais acceptable (R-22). |
| Manque de visibilité sur le traitement | FR-11, FR-16, FR-17 | ✅ | |
| « Application **simple** » | NFR-12 (Should, `[HYPOTHÈSE]`), SM-5 (secondaire) | ⚠️ | Intention du CDC portée seulement par un Should hypothétique (R-11). |
| Centraliser les demandes et suivre leur traitement | §1, FR-3, FR-11 | ⚠️ | Seules les demandes du formulaire sont centralisées (R-01). |
| Concevoir, développer, mettre en production avec l'IA | NFR-14 | ⚠️ | Seule la vérification du code est couverte. L'approche elle-même n'est pas documentée (R-04). |
| Avant le développement : analyser, identifier les utilisateurs, définir les fonctionnalités, **organiser le projet** | PRD §2 et §4 ; §0 cite les étapes BMAD | ⚠️ | « Organiser le projet » n'a ni livrable ni ligne de couverture (R-10). |

### Besoins de la direction

| Élément du CDC | Couverture PRD | Verdict |
|---|---|---|
| Moyen simple de transmettre une demande | FR-1, FR-2, SM-5 | ✅ |
| Savoir que la demande a bien été enregistrée | FR-4 (FR-7 en Could) | ✅ |
| Retrouver l'ensemble des demandes | FR-11, FR-12, RM-6 | ✅ |
| Consulter leur contenu | FR-15 | ✅ |
| Identifier celles qui nécessitent une intervention | FR-13, FR-14 | ⚠️ (R-03, R-12) |
| Suivre leur évolution | FR-16, FR-17 | ✅ |

### Fonctionnalités

| Élément du CDC | Couverture PRD | Priorité | Verdict |
|---|---|---|---|
| Déposer une demande (client ou prospect) | FR-1 | Must | ✅ |
| Nom, coordonnées, objet, catégorie, description | FR-1 | Must | ✅ |
| Enregistrer en base | FR-3 | Must | ✅ (R-15) |
| Confirmation après envoi | FR-4 | Must | ✅ |
| Connexion à un espace sécurisé | FR-8, FR-9, FR-10 | Must | ✅ |
| Liste des demandes | FR-11 | Must | ✅ |
| Détail d'une demande | FR-15 | Must | ✅ |
| Rechercher **ou** filtrer | FR-12, FR-13 | Must | ✅ (le PRD fait les deux) |
| Modifier le statut | FR-16 | Must | ✅ |
| **Au minimum** les statuts Nouvelle, En cours, Traitée | FR-27, RM-3 | Must | ⚠️ « exactement trois » est étiqueté `[CDC]` (R-05) |
| Historique simple | FR-17, RM-5 | Must | ✅ (R-08) |
| Gestion des comptes utilisateurs | FR-21, FR-22, FR-23 | Must | ⚠️ pas de changement de son propre mot de passe (R-16) |
| Différencier collaborateur et administrateur | FR-24, FR-25 | Must | ✅ |
| Admin : principaux paramètres de fonctionnement | FR-26 (FR-27 et FR-28 cités dans l'addendum A.2) | Must | ⚠️ une seule chose est vraiment paramétrable (R-02) |
| Ajouts possibles s'ils améliorent l'UX ou aident les équipes | FR-6, FR-7, FR-18 à FR-20, addendum C | Should/Could | ✅ (R-10 : pas de ligne de couverture) |

### Développement assisté par l'IA

| Élément du CDC | Couverture PRD | Verdict |
|---|---|---|
| L'IA peut aider (structure, interfaces, code, erreurs, documentation) | Non repris | ⚠️ c'est permissif, mais la démarche n'est pas tracée (R-04) |
| Éléments générés **compris, vérifiés et testés avant intégration** | NFR-14 | ⚠️ limité au **code**, et aux tests des seules règles métier (R-04) |
| Le développeur reste responsable | NFR-14 | ✅ |

### Mise en production

| Élément du CDC | Couverture PRD | Verdict |
|---|---|---|
| Environnement de production en ligne | NFR-1 | ✅ |
| Paramètres dev et prod séparés | NFR-2 | ✅ |
| Aucun identifiant, mot de passe, clé ou **information sensible** dans le code | NFR-3, SM-7 | ⚠️ les données personnelles réelles (jeux de test) ne sont pas citées (R-20) |
| Versionner, identifier les versions déployées | NFR-4 | ✅ |
| Procédure de retour arrière | NFR-5, SM-4 | ✅ |

### Fonctionnement

| Élément du CDC | Couverture PRD | Verdict |
|---|---|---|
| Dispositif simple pour consulter erreurs et événements | NFR-6, Q5 | ✅ (R-21) |
| Sauvegarde et restauration | NFR-7, SM-4 | ✅ |
| Actions en cas d'indisponibilité | NFR-8 | ✅ |
| Support niveau 1 / niveau 2 | NFR-9 | ✅ (R-21) |
| Documenter accès, sécurité, données personnelles | NFR-10 (docs 4 et 5), NFR-11 | ✅ |

### Résultat attendu

| Élément du CDC | Couverture PRD | Verdict |
|---|---|---|
| Application fonctionnelle, sécurisée, déployée | SM-1, NFR-11, NFR-1 | ✅ |
| Interface de dépôt | FR-1 à FR-5 | ✅ |
| Espace interne authentifié | FR-8 à FR-10 | ✅ |
| Gestion des utilisateurs et des droits | FR-21 à FR-25 | ✅ |
| Gestion des demandes et des statuts | FR-11 à FR-17, FR-27 | ✅ |
| Base de données | FR-3 | ✅ |
| Versionnée et accessible en ligne | NFR-1, NFR-4 | ✅ |
| Logs et suivi des erreurs | NFR-6 | ✅ |
| Stratégie de sauvegarde et de restauration | NFR-7 | ✅ |
| Procédure de retour arrière | NFR-5 | ✅ |
| Documentation synthétique (5 thèmes) | NFR-10 | ✅ |

---

## 2. Constats

### Haute

#### R-01 — La centralisation des demandes reçues par téléphone ou par email ne repose que sur une hypothèse, et cette hypothèse entre en conflit avec trois exigences
- **Où :** §2.3, UJ-4, H-1, FR-5, FR-6, FR-17 ; §7 et §8.2.
- **Problème :** le CDC dit que les demandes arrivent **surtout par email et par téléphone**, et que l'application doit les **centraliser**. Dans le PRD, ce flux n'existe qu'à travers une `[HYPOTHÈSE]` : le collaborateur remplit le formulaire public. Ce contournement casse plusieurs règles :
  - **FR-6** : la limite de 5 envois par heure depuis une même connexion bloquerait Karim dès la 6ᵉ saisie de la matinée, ou plusieurs collaborateurs derrière la même adresse IP du bureau ;
  - **FR-5** : le collaborateur coche à la place de la personne la case « j'ai été informé ». L'information RGPD n'a donc pas réellement été donnée ;
  - **FR-17** : l'auteur de l'événement « Demande créée » est « Demandeur ». La trace de qui a saisi la demande est perdue ;
  - aucun champ ne garde le **canal d'origine** (formulaire, téléphone, email). On ne peut donc pas vérifier que les fichiers à part ont disparu.
- **Correction :** faire valider ce point par Aurel et le passer en `[PRÉCISION]`. Ajouter une exigence **« Saisir une demande depuis l'espace interne »** (Must, car elle découle de « centraliser ») :
  - champ *Canal* (Formulaire / Téléphone / Email) ;
  - l'auteur de la création est l'utilisateur interne ;
  - pas de limite anti-spam pour un utilisateur connecté ;
  - la case de consentement est remplacée par la mention « personne informée oralement ou par email ».

  Version minimale si l'on garde le formulaire public : exempter les sessions authentifiées de FR-6, enregistrer l'auteur réel dans FR-17, et ajouter un critère d'acceptation à UJ-4.

#### R-02 — « Principaux paramètres » : une seule chose est vraiment paramétrable, et la couverture est gonflée
- **Où :** §4.6, FR-26, FR-27, FR-28 ; addendum A.2, ligne « Paramètres gérés par l'administrateur ».
- **Problème :** le CDC demande que l'administrateur gère « **les principaux paramètres** nécessaires au fonctionnement », au pluriel. Seules les catégories sont modifiables (FR-26). L'addendum cite aussi FR-27, alors que FR-27 dit justement que les statuts **ne sont pas** paramétrables, et FR-28, qui est une action sur une demande et non un réglage. Un évaluateur peut juger cette exigence à peine couverte.
- **Correction :** deux options.
  - Ajouter une exigence **FR-30 « Paramètres généraux »**, Must `[PRÉCISION]` : coordonnées de contact affichées sur la confirmation et en cas de panne (NFR-8), contact pour les données personnelles et texte de la mention FR-5, durée de conservation utilisée par FR-29, et adresse de notification si l'email aux collaborateurs (R-09) est retenu.
  - Ou faire valider explicitement par Aurel que « paramètres = catégories » suffit, et l'écrire.

  Dans les deux cas, retirer FR-27 et FR-28 de cette ligne de l'addendum A.2.

### Moyenne

#### R-03 — Les « oublis » ne sont combattus que pour les demandes *Nouvelle*
- **Où :** FR-14, FR-11, glossaire « Demandes à traiter », §8.1.
- **Problème :** le CDC cite les **oublis** comme premier problème et demande d'« identifier celles qui nécessitent une intervention ». En Must, le compteur ne compte que les *Nouvelle*. Une demande passée *En cours* puis laissée de côté n'est plus signalée nulle part : pas de date de dernière activité, pas de tri par ancienneté. Cela reste vrai même avec l'attribution, qui est seulement en Should.
- **Correction :** ajouter en Must, dans FR-11 ou FR-15, la **date de dernière activité**, avec un tri possible sur cette date. Ou ajouter à FR-14 un indicateur « *En cours* sans activité depuis plus de N jours » (`[HYPOTHÈSE]` sur N).

#### R-04 — Développement assisté par l'IA : exigence réduite au code et difficile à prouver
- **Où :** NFR-14 ; addendum A.3 (« Tests + relecture ») ; mission du CDC.
- **Problème :**
  - le CDC exige que les **éléments générés**, et pas seulement le code, soient « compris, vérifiés et **testés avant intégration** ». Or le CDC prévoit aussi que l'IA produise des interfaces et de la documentation. NFR-14 ne parle que du code ;
  - les tests automatisés ne visent que les règles métier ;
  - « relu et compris » n'a aucun critère observable ;
  - la **démarche** assistée par l'IA, qui est le cœur de la mission, ne produit aucun livrable.
- **Correction :** renommer NFR-14 en « Éléments générés par l'IA vérifiés » et ajouter ces critères :
  - chaque story est vérifiée contre ses critères d'acceptation **avant** fusion, avec une trace (revue, PR ou commit) ;
  - la documentation générée est relue, et la doc *Déploiement* est testée (H-23) ;
  - une courte note « Démarche IA » dans la documentation : outils, usages, vérifications faites.

#### R-05 — « Exactement trois statuts » est étiqueté `[CDC]`, alors que le CDC dit « au minimum »
- **Où :** RM-3 `[CDC]`, glossaire « Statut », FR-27.
- **Problème :** le CDC demande de « gérer **au minimum** » les trois statuts. Le choix de n'en avoir **que** trois est un resserrement : il est acceptable, mais c'est une `[PRÉCISION]`, pas une exigence du CDC.
- **Correction :** étiqueter RM-3 `[CDC]` (les trois statuts) + `[PRÉCISION]` (pas d'autre statut). Dans FR-27, citer « au minimum » et donner la raison du choix (déjà présente en §8.2).

#### R-06 — Règle de priorité ambiguë pour `[PRÉCISION]`, et FR-5 étiqueté de façon contradictoire
- **Où :** §0 (« sauf deux exceptions justifiées (FR-5 et FR-25) ») ; FR-5, FR-23, FR-26, FR-28 et FR-29 ; addendum C.
- **Problème :**
  - §0 appelle FR-5 une « fonction ajoutée », et l'addendum C parle de « deux ajouts ». Pourtant FR-5 porte l'étiquette `[PRÉCISION]`, pas `[AJOUT]` ;
  - les exigences `[PRÉCISION]` sont tantôt en Must (FR-23, FR-26, FR-28), tantôt en Should (FR-29), et aucune règle ne le dit ;
  - FR-28 (supprimer une demande) n'est pas dans le CDC. C'est de fait un 3ᵉ ajout en Must, justifié par le RGPD, mais il n'est pas déclaré comme exception.
- **Correction :** écrire la règle dans §0. Par exemple : « Une `[PRÉCISION]` hérite de la priorité de l'exigence du CDC qu'elle précise ; si elle n'en précise aucune, elle suit la règle des ajouts. » Ensuite, aligner l'étiquette de FR-5 (choisir `[AJOUT]` ou `[PRÉCISION]`, et le même mot partout). Enfin, soit ajouter FR-28 aux exceptions avec sa justification, soit le rattacher explicitement à une exigence du CDC.

#### R-07 — Le statut de validation de FR-5 et FR-25 se contredit
- **Où :** §0 (légende : `[AJOUT]` = « validée par Aurel » ; « exceptions justifiées ») et addendum C (« à faire valider par Aurel »).
- **Problème :** selon le passage, les deux exceptions en Must sont soit validées, soit encore en attente.
- **Correction :** trancher. Si elles ne sont pas validées, les étiqueter `[HYPOTHÈSE]` et les ajouter au §12. Sinon, retirer « à faire valider » de l'addendum C.

#### R-08 — Historique « jamais supprimé » contre suppression et anonymisation
- **Où :** FR-17 (« Aucun utilisateur, même administrateur, ne peut… supprimer un événement »), RM-5 `[CDC]`, FR-20 (commentaires figés, H-12), FR-28, FR-29.
- **Problème :**
  1. FR-28 fait disparaître la demande « nulle part dans l'application ». Ses événements d'historique disparaissent donc aussi, ce qui contredit FR-17 et RM-5.
  2. FR-29 n'efface que le nom, l'email, le téléphone et l'entreprise. Or la **description** et les **commentaires internes** peuvent contenir des données personnelles, et les commentaires ne peuvent pas être modifiés (H-12). Après anonymisation, il resterait donc des données personnelles impossibles à effacer.
  3. Le caractère non modifiable de l'historique n'est pas dans le CDC (« historique simple »). RM-5 ne devrait donc pas porter la seule étiquette `[CDC]`.
- **Correction :** ajouter à FR-17 et RM-5 une exception : « sauf suppression complète de la demande (FR-28) ». Étendre FR-29 à la description et aux commentaires (les vider ou les remplacer par « [anonymisé] »), ou documenter la limite dans NFR-10. Étiqueter RM-5 `[CDC]` + `[PRÉCISION]`.

#### R-09 — Une ligne du MVP n'a aucune exigence
- **Où :** §8.1, Could : « Email aux collaborateurs à chaque nouvelle demande ».
- **Problème :** aucune exigence FR, aucune étiquette `[AJOUT]`, aucun critère d'acceptation. Cet élément sort de la traçabilité.
- **Correction :** créer une exigence Could `[AJOUT]` avec ses critères (destinataires, contenu sans données sensibles, un échec ne bloque pas le dépôt), ou retirer la ligne.

#### R-10 — La table de couverture (addendum A) ne reprend pas tout le CDC
- **Où :** addendum A.1 à A.3 ; SM-2.
- **Problème :** SM-2 s'appuie sur cette table. Il y manque :
  - le **contexte** : oublis, doublons, visibilité, centralisation, « application simple » ;
  - la **mission** : « organiser le projet », démarche IA ;
  - la règle « autres fonctionnalités si elles améliorent l'UX » (justifier les ajouts) ;
  - la liste **« Résultat attendu »**.
- **Correction :** ajouter une section A.0 « Contexte et mission ». Preuves possibles :
  - le PRD ;
  - les epics, stories et sprint-status pour « organiser le projet » ;
  - la note « Démarche IA » (R-04) ;
  - une ligne par ajout, renvoyant à l'addendum C ;
  - une section A.4 « Résultat attendu » qui renvoie aux lignes existantes.

#### R-11 — L'intention « application simple » ne repose que sur un Should hypothétique
- **Où :** NFR-12 (Should, `[HYPOTHÈSE]`), SM-5 (secondaire).
- **Problème :** « simple » est un mot du CDC, dans le contexte (« application simple ») comme dans les besoins (« moyen simple »). Aucun critère Must ne le vérifie, à part celui de FR-1 (« le formulaire s'ouvre sur téléphone »).
- **Correction :** étiqueter NFR-12 `[CDC]` (simplicité) + `[HYPOTHÈSE]` (seuils), et passer en Must un critère minimal de simplicité. Par exemple : SM-5 (dépôt en moins de 2 minutes) devient un critère d'acceptation de FR-1, et UJ-2 (changer un statut) se fait en 3 clics au plus depuis la liste.

### Basse

#### R-12 — Le glossaire « Demandes à traiter » inclut une notion qui n'est qu'en Should
- **Où :** glossaire ; FR-14 ; §8.1 (« compteur des Nouvelles »).
- **Problème :** le glossaire définit « à traiter » comme les *Nouvelle* **plus** les *Urgentes* non traitées. Or la priorité (FR-19) est en Should. Pour le MVP Must, la définition est donc fausse.
- **Correction :** écrire « … plus, une fois FR-19 réalisé, celles de priorité *Urgente*… ».

#### R-13 — « Collaborateur » est employé à la place d'« utilisateur interne »
- **Où :** glossaire (« Attribution… le collaborateur », « Priorité… fixée par un collaborateur ») ; FR-11 et FR-13 (« collaborateur attribué ») ; RM-14 ; §2.2 ; addendum C.
- **Problème :** FR-18 permet d'attribuer une demande à un administrateur (« autre utilisateur interne actif »). Le mot « collaborateur » désigne pourtant un rôle précis dans le glossaire. Ce flou risque de produire un filtre ou une règle limités au seul rôle *Collaborateur*.
- **Correction :** remplacer par « utilisateur interne attribué », ou définir « collaborateur attribué = tout utilisateur interne ».

#### R-14 — Étiquettes `[CDC]` posées sur des déductions
- **Où :**
  - FR-2 « `[CDC]` (implicite) » ;
  - FR-9, expiration automatique de la session ;
  - §2.2 « sans appeler ni chercher à qui écrire » et « savoir qui a fait quoi » ;
  - §2.1 : l'administrateur a tous les droits du collaborateur ;
  - FR-17 : l'auteur de chaque événement (« qui »).
- **Problème :** la légende dit que `[CDC]` = « exigé **explicitement** ». Ces points sont des déductions raisonnables, mais ce sont des précisions.
- **Correction :** les étiqueter `[CDC]` + `[PRÉCISION]`. La priorité Must reste justifiée par la règle proposée en R-06.

#### R-15 — FR-3 `[CDC]` contient des éléments ajoutés ou Should
- **Où :** FR-3 (« la priorité *Normale* », la référence).
- **Problème :** la priorité dépend de FR-19 (Should, `[AJOUT]`), et la référence est une `[PRÉCISION]` (FR-4, RM-2). Pourtant FR-3 en fait des obligations Must.
- **Correction :** écrire « la priorité *Normale* (une fois FR-19 réalisé) » et étiqueter la référence `[PRÉCISION]` dans FR-3.

#### R-16 — Comptes : l'utilisateur ne peut pas changer son propre mot de passe, et un ajout n'est pas étiqueté
- **Où :** FR-21, FR-23 ; Q2 ; FR-7.
- **Problème :**
  - aucune fonction ne permet à un utilisateur de changer son propre mot de passe, sauf à la première connexion ;
  - le lien « Mot de passe oublié » (Could) n'est pas étiqueté `[AJOUT]` ;
  - FR-21 dépend peut-être de l'envoi d'emails (Q2), alors que le seul envoi d'email prévu (FR-7) est en Could. C'est une dépendance cachée.
- **Correction :** ajouter « changer son mot de passe » (Should `[PRÉCISION]`, ou Must si l'on choisit le mot de passe provisoire). Étiqueter « Mot de passe oublié » `[AJOUT]`. Dans Q2, noter la dépendance à un service d'envoi d'emails.

#### R-17 — FR-26 : la suppression et le renommage de catégorie ne sont pas définis
- **Où :** FR-26.
- **Problème :** les actions listées sont ajouter, renommer, désactiver et réactiver. Or un critère d'acceptation interdit de « supprimer une catégorie utilisée ». On ne sait donc pas si la suppression d'une catégorie **non** utilisée existe. On ne sait pas non plus si un renommage modifie le libellé des demandes passées.
- **Correction :** trancher : retirer le critère sur la suppression, ou ajouter « supprimer une catégorie jamais utilisée ». Préciser l'effet du renommage (`[HYPOTHÈSE]`).

#### R-18 — Durée de conservation : la notion de « date de traitement » n'est pas définie, et la règle est plus forte que sa mise en œuvre
- **Où :** FR-29, RM-13, FR-5.
- **Problème :**
  - « Traitée depuis plus de 3 ans » suppose une date de passage à *Traitée*. Cette date n'est définie ni dans FR-3 ni dans le glossaire, et le cas d'une demande rouverte n'est pas traité ;
  - RM-13 est écrite comme une règle absolue, et FR-5 promet 3 ans aux demandeurs, alors que la mise en œuvre (FR-29) n'est qu'en Should.
- **Correction :** définir la date (dernier passage à *Traitée*). Écrire RM-13 au conditionnel (« une fois FR-29 réalisé »). Dans NFR-10, doc 5, prévoir une procédure manuelle tant que FR-29 n'est pas livré.

#### R-19 — Le 5ᵉ type de demande et la distinction client / prospect manquent
- **Où :** FR-26 (catégories initiales), FR-1.
- **Problème :** le CDC cite les « sollicitations nécessitant l'intervention d'un collaborateur », qui deviennent « Autre ». Le CDC distingue aussi « client ou prospect », mais aucun champ ne garde cette information.
- **Correction :** facultatif. Ajouter un champ « Vous êtes : client / prospect » (Could, `[PRÉCISION]`), et expliquer pourquoi « Autre » remplace le 5ᵉ type.

#### R-20 — NFR-3 : les « informations sensibles » ne sont couvertes que partiellement
- **Où :** NFR-3.
- **Problème :** le CDC interdit d'enregistrer « identifiants, mots de passe, clés **ou informations sensibles** » dans le code source. NFR-3 ne vise que les secrets techniques. Des données personnelles réelles pourraient donc se retrouver dans le dépôt (jeux de test, exports `pg_dump`, logs).
- **Correction :** ajouter un critère : « aucune donnée personnelle réelle ni aucun export de base dans le dépôt ; les jeux de test sont fictifs ».

#### R-21 — Petits écarts dans NFR-6 et NFR-9
- **Où :** NFR-6, FR-22, NFR-9, Q3.
- **Problème :**
  - FR-22 veut que la **réactivation** soit enregistrée dans les logs, mais NFR-6 ne la liste pas. Il manque aussi la réinitialisation de mot de passe (FR-23) et les changements de catégories (paramètres) ;
  - NFR-9 dit que le niveau 1 est assuré par « un administrateur Nova ». C'est présenté comme acquis, alors que la question Q3 est encore ouverte. Ce point n'est pas étiqueté `[HYPOTHÈSE]`.
- **Correction :** compléter la liste de NFR-6. Étiqueter le point de NFR-9 `[HYPOTHÈSE]` et l'ajouter au §12.

#### R-22 — Doublons : on ne les trouve que par une recherche manuelle
- **Où :** FR-12, §8.2.
- **Problème :** le seul moyen de repérer un doublon est de chercher l'email du demandeur. C'est acceptable, mais peu visible.
- **Correction :** facultatif. Dans FR-15, afficher « Autres demandes de ce demandeur (même email) » (Should `[AJOUT]`). Le coût est faible et cela répond directement au problème de doublons du CDC.

---

## 3. Contrôles internes sans anomalie

- **Renvois entre exigences :** tous les renvois FR, NFR, RM, SM, UJ et H pointent vers des éléments qui existent.
- **Hypothèses :** toutes les étiquettes `[HYPOTHÈSE]` du texte apparaissent au §12, sauf NFR-9 (R-21).
- **MVP §8.1 :** les listes Must, Should et Could correspondent aux priorités des exigences. Seule exception : la ligne sans exigence (R-09).
- **Priorités :** aucune exigence étiquetée `[CDC]` n'est en dessous de Must. Les sous-parties Should ou Could de FR-13, FR-14 et FR-23 portent sur des ajouts.
