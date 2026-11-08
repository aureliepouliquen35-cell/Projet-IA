---
title: Nova Services — Application de gestion des demandes clients
status: final
created: 2026-11-08
updated: 2026-11-08
source: docs/cahier-des-charges-nova-services.md
---

# PRD : Nova Services — Gestion des demandes clients

## 0. Objet du document

**État :** PRD validé par Aurel le 8 novembre 2026. Toutes les exigences sont rédigées, toutes les hypothèses sont validées, et les 5 questions ouvertes ne bloquent pas la suite (§11).

Ce document est un **PRD** (*Product Requirements Document*, ou « document des exigences produit »). Il décrit **ce que** l'application doit faire et **pour qui**. Il ne dit pas **comment** la construire : les choix techniques sont dans l'annexe [addendum.md](addendum.md) et seront tranchés lors de l'étape d'architecture.

Il s'adresse à Aurel (porteur du projet), à l'évaluateur du challenge et aux étapes suivantes de la méthode BMAD : conception UX (l'expérience utilisateur : écrans et parcours), architecture, puis découpage en epics et stories (de grands blocs de travail, eux-mêmes divisés en petites unités).

**Source unique :** le cahier des charges, conservé dans [docs/cahier-des-charges-nova-services.md](../../../../docs/cahier-des-charges-nova-services.md) (abrégé **CDC**).

### Comment lire les étiquettes

Chaque exigence porte une étiquette d'origine et une priorité.

| Étiquette | Signification |
|---|---|
| `[CDC]` | Exigé explicitement par le cahier des charges. |
| `[PRÉCISION]` | Point flou du CDC, précisé et **validé par Aurel** lors du cadrage. |
| `[AJOUT]` | Fonction **absente du CDC**, ajoutée et **validée par Aurel**. |
| `[HYPOTHÈSE]` | Choix fait par le rédacteur, absent du CDC, **validé par Aurel le 8 novembre 2026**. La liste complète est au §12. |

**Priorités (méthode MoSCoW) :**
- **Must** : obligatoire. Sans cela, le livrable ne répond pas au CDC.
- **Should** : souhaitable. À faire une fois tous les Must terminés.
- **Could** : bonus, si le temps le permet.
- **Won't** : exclu de cette version.

Règle retenue par Aurel : **toutes les fonctions exigées par le CDC sont en Must**. Une `[PRÉCISION]` prend la priorité de l'exigence du CDC qu'elle précise. Les `[AJOUT]` sont en Should ou en Could, sauf une exception justifiée : FR-25.

Les **critères d'acceptation** placés sous chaque exigence sont des vérifications observables : une personne peut les tester à la main et répondre « oui » ou « non ».

---

## 1. Vision

Aujourd'hui, Nova Services reçoit les demandes de ses clients et prospects par email et par téléphone, puis les recopie à la main dans plusieurs fichiers. Il en résulte des oublis, des doublons, et personne ne sait clairement où en est une demande. `[CDC]`

L'application remplace ces fichiers par **un point d'entrée unique** et **un tableau de suivi partagé** :
- le **demandeur** remplit un formulaire en ligne. Il obtient aussitôt une **référence** qui prouve que sa demande est enregistrée ;
- les **collaborateurs** retrouvent toutes les demandes au même endroit. Ils voient en un coup d'œil celles qui attendent une intervention et font avancer chaque demande de *Nouvelle* à *Traitée*. Un **historique** garde la trace de chaque action ;
- les **administrateurs** gèrent les comptes, les droits et les réglages.

L'objectif est volontairement modeste : une application **simple, fiable, sécurisée et en ligne**. Elle doit couvrir tout le CDC, y compris l'exploitation : sauvegardes, logs, retour à une version précédente et documentation. La richesse fonctionnelle passe après.

---

## 2. Utilisateurs

### 2.1 Profils

| Profil | Qui | Accès | Source |
|---|---|---|---|
| **Demandeur** | Client ou prospect professionnel de Nova Services. | Formulaire public, **sans compte**. | `[CDC]` + `[PRÉCISION]` (pas de compte) |
| **Collaborateur** | Salarié de Nova Services qui traite les demandes. | Espace interne, après connexion. | `[CDC]` |
| **Administrateur** | Responsable de l'application. Il a **tous les droits du collaborateur**, plus la gestion des comptes et des paramètres. | Espace interne, après connexion. | `[CDC]` |

### 2.2 Besoins (ce que chacun cherche à accomplir)

**Demandeur**
- Transmettre sa demande simplement, sans appeler ni chercher à qui écrire. `[CDC]`
- Avoir la certitude que sa demande est bien enregistrée. `[CDC]`
- Savoir que ses données personnelles sont traitées correctement. `[PRÉCISION]`

**Collaborateur**
- Retrouver **toutes** les demandes au même endroit, sans fichier à part. `[CDC]`
- Lire le contenu complet d'une demande. `[CDC]`
- Repérer immédiatement celles qui nécessitent une intervention. `[CDC]`
- Suivre l'évolution d'une demande et savoir qui a fait quoi. `[CDC]`
- Savoir qui s'occupe de quoi, pour ne pas traiter deux fois la même demande. `[AJOUT]`

**Administrateur**
- Donner ou retirer l'accès aux collaborateurs. `[CDC]`
- Adapter les réglages (par exemple les catégories) sans faire appel à un développeur. `[CDC]` + `[PRÉCISION]`
- Répondre aux obligations sur les données personnelles, par exemple supprimer une demande quand la personne le demande. `[PRÉCISION]`

### 2.3 Hors cible (version 1)
- Les **demandeurs qui veulent suivre leur demande en ligne** : pas d'espace client dans cette version. `[PRÉCISION]`
- Les **équipes extérieures** à Nova Services (prestataires, partenaires). `[HYPOTHÈSE]`

### 2.4 Parcours clés

- **UJ-1. Claire, gérante d'un cabinet comptable, signale une panne.**
  Claire n'arrive plus à accéder à l'outil que Nova lui a installé. Elle ouvre le formulaire depuis le site de Nova, sans se connecter. Elle saisit son nom, son email, choisit la catégorie *Problème technique*, écrit un objet et une description, puis coche la case d'information sur les données. Elle envoie. Un écran lui confirme l'enregistrement avec la référence `NOVA-2026-0042`, qu'elle note pour la donner si on la rappelle.
  **Cas limite :** elle oublie son email. Le formulaire lui signale le champ manquant **sans effacer** ce qu'elle a déjà écrit.

- **UJ-2. Karim, collaborateur, attaque sa matinée.**
  Karim se connecte. Dès la connexion, le compteur indique **« 5 à traiter »**. Il ouvre la liste filtrée sur *Nouvelle*, lit la demande de Claire, se l'attribue `[AJOUT]` et la passe *En cours*. Le compteur descend à 4. L'historique affiche « Karim — statut Nouvelle → En cours — 9 h 12 ». Après son appel à Claire, il ajoute un commentaire interne `[AJOUT]` et passe la demande à *Traitée*.

- **UJ-3. Sophie, administratrice, accueille une nouvelle recrue.**
  Sophie crée un compte collaborateur pour Lucas et lui transmet elle-même son mot de passe temporaire. Elle ajoute aussi une catégorie *Facturation*, aussitôt proposée dans le formulaire de dépôt. Six mois plus tard, Lucas quitte l'entreprise : Sophie désactive son compte. Lucas ne peut plus se connecter, mais son nom reste dans l'historique des demandes qu'il a traitées.
  **Cas limite :** Sophie, seule administratrice, essaie de se retirer le rôle d'administrateur. L'application refuse et explique pourquoi.

- **UJ-4. Karim saisit une demande reçue par téléphone.** `[PRÉCISION]`
  Un prospect appelle. Dans l'espace interne, Karim clique sur « Nouvelle demande », choisit le canal *Téléphone* et saisit les coordonnées et la demande. Il informe oralement le prospect de l'usage de ses données et coche « Personne informée ». La demande rejoint la liste comme toutes les autres, et l'historique indique « Créée par Karim (canal : Téléphone) ». Il n'y a plus de fichier à part.

---

## 3. Glossaire

*Ces termes sont utilisés tels quels dans tout le document et dans les étapes suivantes.*

- **Demande** : message déposé par un demandeur via le formulaire de dépôt, ou saisi pour lui par un utilisateur interne (FR-30). Elle a une référence, une catégorie, un statut et un historique. Elle peut aussi avoir une priorité et un utilisateur interne attribué.
- **Demandeur** : client ou prospect qui dépose une demande. Il n'a pas de compte.
- **Formulaire de dépôt** : page publique qui permet de créer une demande.
- **Référence** : identifiant unique et lisible d'une demande, au format `NOVA-AAAA-NNNN` (exemple : `NOVA-2026-0042`). `[HYPOTHÈSE sur le format]`
- **Catégorie** : type de demande, choisi lors de la création de la demande dans une liste gérée par l'administrateur. Elle est soit **active** (proposée dans le formulaire de dépôt), soit **désactivée**.
- **Statut** : étape de traitement d'une demande. Il y en a exactement trois : **Nouvelle**, **En cours**, **Traitée**.
- **Priorité** : niveau d'urgence fixé par un utilisateur interne : **Normale** (valeur par défaut) ou **Urgente**. `[AJOUT]`
- **Attribution** : lien entre une demande et l'utilisateur interne qui en est responsable (un collaborateur ou un administrateur). Une demande a zéro ou un utilisateur interne attribué. `[AJOUT]`
- **Date de clôture** : date et heure du **dernier** passage d'une demande au statut *Traitée*. Si la demande est rouverte, sa date de clôture est effacée, puis remplacée lors de la clôture suivante. Une demande qui n'est pas *Traitée* n'a pas de date de clôture.
- **Commentaire interne** : note ajoutée sur une demande par un utilisateur interne. Elle n'est jamais visible par le demandeur. `[AJOUT]`
- **Canal** : origine d'une demande : **Formulaire** (déposée par le demandeur), **Téléphone** ou **Email** (saisie par un utilisateur interne, FR-30).
- **Historique** : liste, dans l'ordre chronologique, des événements d'une demande.
- **Dernière activité** : date et heure du plus récent événement d'historique d'une demande.
- **Événement d'historique** : une ligne de l'historique, qui indique quoi, qui et quand. Elle ne peut être ni modifiée ni supprimée, sauf dans les deux cas liés au RGPD décrits en FR-17.
- **Utilisateur interne** : personne qui a un compte, c'est-à-dire un collaborateur ou un administrateur.
- **Compte** : accès d'un utilisateur interne (email, mot de passe, rôle). Il est soit **actif**, soit **désactivé**.
- **Rôle** : *Collaborateur* ou *Administrateur*. Il détermine les droits. Dans ce document, « collaborateur » désigne le **rôle**. Pour parler de toute personne qui a un compte, on dit « utilisateur interne ».
- **Espace interne** : ensemble des pages accessibles seulement après connexion.
- **Demandes à traiter** : demandes au statut *Nouvelle*, plus celles de priorité *Urgente* qui ne sont pas au statut *Traitée*.
- **Anonymisation** : effacement définitif des données personnelles d'une demande, c'est-à-dire le nom, les coordonnées et les textes libres (objet, description, commentaires internes). Voir FR-29. Le reste est conservé pour les statistiques.

---

## 4. Fonctionnalités

### 4.1 Dépôt et saisie d'une demande

**Description :** sur une page publique, sans compte, le demandeur remplit un formulaire et l'envoie. La demande est enregistrée avec le statut *Nouvelle*, et le demandeur voit une confirmation avec sa référence. Réalise UJ-1. Un utilisateur interne peut aussi saisir une demande reçue par téléphone ou par email (FR-30, UJ-4). *FR-30 et FR-32 sont placées ici par thème ; leurs numéros suivent l'ordre de création.*

#### FR-1 : Remplir le formulaire de dépôt — **Must** `[CDC]`
Le demandeur peut saisir les champs suivants :

| Champ | Obligatoire | Source |
|---|---|---|
| Nom et prénom | Oui | `[CDC]` (« nom ») |
| Email | Oui | `[CDC]` (« coordonnées ») + `[PRÉCISION]` |
| Téléphone | Non | `[PRÉCISION]` |
| Entreprise | Non | `[PRÉCISION]` |
| Objet (titre court) | Oui | `[CDC]` |
| Catégorie (liste des catégories actives) | Oui | `[CDC]` |
| Description | Oui | `[CDC]` |

**Critères d'acceptation :**
- Le formulaire s'ouvre sans connexion, sur ordinateur comme sur téléphone.
- La liste des catégories ne montre que les catégories **actives**.
- Les limites de longueur sont : nom, entreprise et email, 100 caractères au plus ; téléphone, texte libre de 30 caractères au plus ; objet, 150 caractères au plus ; description, de 10 à 5 000 caractères. `[HYPOTHÈSE]`
- En dehors de ces longueurs, seul le **format de l'email** est vérifié. Le téléphone n'a pas de format imposé, car les numéros peuvent être étrangers ou contenir des espaces. `[HYPOTHÈSE]`

#### FR-2 : Vérifier la saisie avant l'envoi — **Must** `[CDC]` (implicite)
Le système refuse l'envoi tant qu'un champ obligatoire manque ou qu'un champ est mal rempli.

**Critères d'acceptation :**
- Si l'email n'a pas un format valide (par exemple `claire@`), la demande n'est pas enregistrée et un message apparaît à côté du champ.
- Après une erreur, **tout ce qui a été saisi reste affiché**.
- Le message d'erreur dit quoi corriger, par exemple « L'email est obligatoire ».

#### FR-3 : Enregistrer la demande — **Must** `[CDC]`
Le système enregistre la demande dans la base de données. Il lui donne une référence unique, le statut *Nouvelle*, la priorité *Normale* et la date et l'heure de dépôt.

**Critères d'acceptation :**
- Toute demande envoyée apparaît dans la liste de l'espace interne (FR-11), avec exactement les informations saisies.
- Deux demandes n'ont jamais la même référence.
- Un **événement d'historique** « Demande créée » est enregistré automatiquement (voir FR-17).

#### FR-4 : Confirmer l'enregistrement — **Must** `[CDC]`
Après l'envoi, le demandeur voit un écran de confirmation avec sa référence. `[PRÉCISION]`

**Critères d'acceptation :**
- L'écran affiche « Votre demande a bien été enregistrée » et la référence.
- La confirmation n'apparaît **que si** la demande est réellement enregistrée. En cas d'échec technique, un message d'erreur invite à réessayer, sans afficher de fausse confirmation.
- Si le demandeur actualise la page de confirmation, aucune deuxième demande n'est créée.

#### FR-5 : Informer sur les données personnelles — **Must** `[PRÉCISION]`
Le formulaire affiche une courte mention : qui reçoit les données, pourquoi, combien de temps elles sont conservées, et qui contacter pour les faire supprimer. Le demandeur coche une case obligatoire avant d'envoyer.

*Pourquoi Must :* cette exigence précise celle du CDC sur la protection des données personnelles. Le RGPD (Règlement général sur la protection des données) oblige en effet à informer les personnes au moment où l'on collecte leurs données. Sans cette mention, le formulaire ne serait pas conforme.

**Critères d'acceptation :**
- Sans la case cochée, l'envoi est refusé avec un message clair.
- La mention indique que les données sont conservées **3 ans après la clôture de la demande** (voir FR-29).

#### FR-6 : Bloquer le spam simplement — **Should** `[AJOUT]`
Le système rejette les envois automatisés (robots) sans compliquer la vie d'un humain.

**Critères d'acceptation :**
- Aucun test visuel n'est imposé au demandeur, comme une image à déchiffrer ou un CAPTCHA. `[HYPOTHÈSE]`
- Un envoi qui remplit un champ caché, invisible pour un humain (technique dite du « pot de miel »), est rejeté sans être enregistré. `[HYPOTHÈSE]`
- Au-delà de **10 envois par heure depuis une même adresse IP** (l'adresse réseau de l'ordinateur ou du bureau), les envois suivants sont refusés avec un message invitant à réessayer plus tard. `[HYPOTHÈSE sur le seuil]`
- La saisie depuis l'espace interne (FR-30) n'est **pas soumise** à cette limite.
- Test : 10 envois successifs depuis la même adresse IP sont tous acceptés ; le 11ᵉ est refusé.

#### FR-7 : Envoyer un email de confirmation au demandeur — **Could** `[AJOUT]`
Le demandeur reçoit, à l'adresse saisie, un email qui reprend sa référence et l'objet de sa demande.

**Critères d'acceptation :**
- L'email arrive dans les 5 minutes suivant le dépôt de la demande. `[HYPOTHÈSE]`
- Si l'email ne peut pas partir, la demande reste enregistrée et l'écran de confirmation s'affiche quand même. L'échec est noté dans les logs (NFR-6).

#### FR-30 : Saisir une demande reçue par téléphone ou par email — **Must** `[PRÉCISION]`
Depuis l'espace interne, un utilisateur interne peut créer une demande pour un demandeur qui a appelé ou écrit. Il remplit les mêmes champs que FR-1, plus le **canal** (*Téléphone* ou *Email*). Réalise UJ-4.

*Pourquoi Must :* le CDC demande de **centraliser** les demandes, qui arrivent « principalement par email ou téléphone ». Sans cette saisie, ces demandes resteraient dans des fichiers à part.

**Critères d'acceptation :**
- Les règles de vérification de FR-2 s'appliquent.
- À la place de la case de FR-5, l'utilisateur interne coche « Personne informée de l'usage de ses données ». Sans cette case, la création est refusée.
- L'événement d'historique de création indique l'utilisateur interne comme auteur et le canal, par exemple « Créée par Karim (canal : Téléphone) ».
- Les demandes déposées via le formulaire de dépôt ont automatiquement le canal *Formulaire*.
- Le canal est affiché dans le détail, et il existe un filtre par canal.

#### FR-32 : Prévenir les utilisateurs internes d'une nouvelle demande — **Could** `[AJOUT]`
À chaque nouvelle demande déposée via le formulaire, les utilisateurs internes actifs reçoivent un email.

**Critères d'acceptation :**
- L'email part dans les 5 minutes suivant le dépôt. Il contient la référence et l'objet, jamais la description complète.
- Si l'email ne peut pas partir, le dépôt n'est pas bloqué et l'échec est noté dans les logs (NFR-6).

---

### 4.2 Connexion à l'espace interne

**Description :** les utilisateurs internes se connectent avec leur email et leur mot de passe. Aucune page de l'espace interne n'est accessible sans connexion. Réalise UJ-2 et UJ-3.

#### FR-8 : Se connecter — **Must** `[CDC]`
Un utilisateur interne dont le compte est **actif** peut se connecter avec son email et son mot de passe.

**Critères d'acceptation :**
- Un email ou un mot de passe faux donne le même message (« Identifiants incorrects »), qui ne révèle pas si l'email existe.
- Un compte **désactivé** ne peut pas se connecter, même avec le bon mot de passe.
- Après **5 échecs** d'affilée, le compte est bloqué pendant 15 minutes. `[HYPOTHÈSE]` Pendant ce blocage, le message reste générique (« Trop de tentatives, réessayez plus tard »), que l'email existe ou non.

#### FR-9 : Se déconnecter et être déconnecté automatiquement — **Must** `[CDC]` (« espace sécurisé »)
**Critères d'acceptation :**
- Un bouton « Se déconnecter » est visible sur toutes les pages de l'espace interne.
- Après déconnexion, le bouton « Retour » du navigateur ne réaffiche pas les données.
- Après **8 heures d'inactivité**, la session expire et l'utilisateur doit se reconnecter. `[HYPOTHÈSE]`

#### FR-10 : Protéger l'espace interne — **Must** `[CDC]`
**Critères d'acceptation :**
- Toute adresse de l'espace interne ouverte par une personne non connectée renvoie vers la page de connexion.
- Les données des demandes ne sont jamais accessibles sans connexion, ni par une page, ni en interrogeant directement le serveur.

---

### 4.3 Liste, recherche et filtres

**Description :** les utilisateurs internes voient **toutes** les demandes, les plus récentes en premier. Ils peuvent chercher et filtrer, et un compteur montre ce qui attend une intervention. Réalise UJ-2.

#### FR-11 : Afficher la liste des demandes — **Must** `[CDC]`
Pour chaque demande, la liste affiche : référence, date de dépôt, nom du demandeur, objet, catégorie et statut, ainsi que la priorité et l'utilisateur interne attribué une fois FR-18 et FR-19 réalisés.

**Critères d'acceptation :**
- Toutes les demandes sont visibles par tous les utilisateurs internes, qu'elles leur soient attribuées ou non. `[PRÉCISION]` (le CDC dit « l'ensemble des demandes »)
- L'ordre par défaut est de la plus récente à la plus ancienne. `[PRÉCISION]`
- Au-delà de 25 demandes, la liste est découpée en pages. `[HYPOTHÈSE]`
- Un clic sur une ligne ouvre le détail (FR-15).

#### FR-12 : Rechercher une demande — **Must** `[CDC]`
Un champ de recherche trouve les demandes dont la **référence**, le **nom**, l'**email**, l'**entreprise** ou l'**objet** contient le texte saisi.

**Critères d'acceptation :**
- Saisir `NOVA-2026-0042` affiche cette seule demande.
- Saisir `claire` trouve « Claire Martin » comme « CLAIRE MARTIN » : la recherche ignore les majuscules. Elle ignore aussi les accents (`helene` trouve « Hélène »). `[HYPOTHÈSE pour les accents]`
- Saisir l'email d'un demandeur affiche toutes ses demandes. C'est ainsi qu'on repère les doublons. `[PRÉCISION]`
- Si rien ne correspond, le message « Aucune demande trouvée » s'affiche.

#### FR-13 : Filtrer les demandes — **Must** `[CDC]`
Les filtres disponibles sont **statut** et **catégorie** (Must), puis **priorité** et **utilisateur interne attribué**, avec les options « Non attribuées » et « Attribuées à moi » (Should, avec FR-18 et FR-19).

**Critères d'acceptation :**
- Les filtres se combinent avec la recherche, par exemple statut *Nouvelle* + catégorie *Problème technique* + texte « imprimante ».
- Le nombre de résultats est affiché.
- Un bouton « Réinitialiser » retire tous les filtres.

#### FR-14 : Repérer les demandes à traiter — **Must** `[CDC]` + forme `[PRÉCISION]`
Dès la connexion, l'utilisateur interne voit un compteur des **demandes à traiter**. Un clic dessus affiche la liste correspondante.

**Critères d'acceptation :**
- Le compteur est égal au nombre de demandes au statut *Nouvelle* (**Must**). Il inclut aussi les demandes de priorité *Urgente* qui ne sont pas au statut *Traitée* (**Should**, avec FR-19).
- Quand une demande passe de *Nouvelle* à *En cours*, le compteur baisse de 1 au plus tard au rafraîchissement de la page.
- **Demandes sans activité (Should)** `[AJOUT]` : une demande *En cours* dont la dernière activité remonte à plus de **7 jours** porte la mention « Sans activité » dans la liste. Un filtre permet de les afficher. `[HYPOTHÈSE sur les 7 jours]`

---

### 4.4 Détail et traitement d'une demande

**Description :** depuis la page de détail, un utilisateur interne lit toute la demande, change son statut et voit son historique. Les fonctions Should y ajoutent l'attribution, la priorité et les commentaires internes. Réalise UJ-2.

#### FR-15 : Consulter le détail — **Must** `[CDC]`
**Critères d'acceptation :**
- La page affiche tous les champs saisis par le demandeur (FR-1), la référence, la date de dépôt, le statut actuel et l'historique complet (FR-17).
- La description s'affiche telle que saisie, retours à la ligne compris.
- Une page de détail ouverte par son adresse, par une personne non connectée, renvoie vers la connexion (FR-10).

#### FR-16 : Changer le statut — **Must** `[CDC]`
Un utilisateur interne peut changer le statut d'une demande selon ces règles `[PRÉCISION]` :

| Depuis \ Vers | Nouvelle | En cours | Traitée |
|---|:---:|:---:|:---:|
| **Nouvelle** | — | ✅ | ✅ |
| **En cours** | ❌ | — | ✅ |
| **Traitée** | ❌ | ✅ (réouverture) | — |

**Critères d'acceptation :**
- Le nouveau statut apparaît aussitôt dans le détail et dans la liste.
- **Le retour au statut *Nouvelle* est impossible** : l'option n'est pas proposée, et une tentative directe auprès du serveur est refusée.
- La réouverture d'une demande (*Traitée* → *En cours*) est permise.
- Chaque changement crée un événement d'historique « Statut : *ancien* → *nouveau* », avec l'auteur, la date et l'heure.
- Choisir le statut déjà en place ne crée aucun événement.
- Le passage à *Traitée* enregistre la date de clôture. La réouverture l'efface.
- Si deux utilisateurs internes changent le statut en même temps, chaque événement d'historique indique le statut qui était réellement en place juste avant lui. L'historique reste cohérent.

#### FR-17 : Conserver l'historique — **Must** `[CDC]`
Le système enregistre automatiquement un événement d'historique pour : la création de la demande, chaque changement de statut, et, une fois les fonctions Should réalisées, chaque attribution, changement de priorité, commentaire interne et anonymisation.

**Critères d'acceptation :**
- Chaque événement indique : **quoi** (par exemple « Statut : Nouvelle → En cours »), **qui** (nom de l'utilisateur interne, « Demandeur » pour une création via le formulaire de dépôt, ou « Système » pour une anonymisation automatique) et **quand** (date et heure).
- Les événements s'affichent du plus ancien au plus récent.
- Aucun utilisateur, même administrateur, ne peut modifier ou supprimer un événement depuis l'application.
- **Deux exceptions, liées au RGPD :**
  - la suppression d'une demande par un administrateur (FR-28) efface la demande **avec** son historique. La trace de la suppression est conservée dans les logs ;
  - l'anonymisation (FR-29) remplace le texte des commentaires internes par « [anonymisé] ». Les événements restent, avec leur auteur et leur date.
- Si le compte d'un utilisateur est désactivé, son nom reste affiché dans les événements passés.

#### FR-18 : Attribuer une demande — **Should** `[AJOUT]`
Un utilisateur interne peut s'attribuer une demande, l'attribuer à un autre utilisateur interne actif, ou retirer l'attribution.

**Critères d'acceptation :**
- Une demande a au plus un utilisateur interne attribué.
- La liste ne propose que des comptes **actifs**.
- Chaque attribution crée un événement d'historique « Attribuée à *Nom* » ou « Attribution retirée ».

#### FR-19 : Définir la priorité — **Should** `[AJOUT]`
Un utilisateur interne peut passer une demande en priorité *Normale* ou *Urgente*.

**Critères d'acceptation :**
- Les demandes de priorité *Urgente* sont visuellement repérables dans la liste, par un badge ou un libellé, éventuellement accompagné d'une couleur, mais jamais par la couleur seule (accessibilité).
- Chaque changement crée un événement d'historique.

#### FR-20 : Ajouter un commentaire interne — **Should** `[AJOUT]`
Un utilisateur interne peut ajouter un commentaire texte à une demande.

**Critères d'acceptation :**
- Le commentaire apparaît dans l'historique avec son auteur, la date et l'heure.
- Il est impossible de modifier ou de supprimer un commentaire une fois publié. `[HYPOTHÈSE]` Cela garde l'historique fiable. Seule l'anonymisation (FR-29) peut effacer le texte d'un commentaire.
- Aucun commentaire n'est jamais montré au demandeur : il n'existe d'ailleurs pas d'espace demandeur dans cette version.

---

### 4.5 Comptes et droits

**Description :** seul l'administrateur gère les comptes. Personne ne peut s'inscrire seul. Le premier compte administrateur est créé lors de l'installation. Réalise UJ-3.

#### FR-21 : Créer un compte — **Must** `[CDC]` + `[PRÉCISION]`
L'administrateur crée un compte en indiquant le nom, l'email et le rôle (*Collaborateur* ou *Administrateur*).

**Critères d'acceptation :**
- Il n'existe aucune page d'inscription publique.
- Deux comptes ne peuvent pas avoir le même email.
- L'administrateur définit un **mot de passe temporaire**, qu'il transmet lui-même au nouvel utilisateur. **Aucun email n'est envoyé** : la partie Must ne dépend d'aucun envoi d'email. `[PRÉCISION]`
- À sa première connexion, l'utilisateur **doit** choisir un nouveau mot de passe. Tant qu'il ne l'a pas fait, aucune autre page de l'espace interne n'est accessible.
- Le mot de passe temporaire respecte les règles de NFR-11 (12 caractères au moins) et ne peut pas être réutilisé comme mot de passe définitif.
- L'administrateur ne connaît jamais le mot de passe **définitif** de l'utilisateur.
- Le **premier administrateur** est créé par une procédure d'installation écrite dans la documentation *Déploiement* (NFR-10), jamais depuis une page publique. Une fois ce compte créé, cette procédure ne sert plus : un administrateur crée les comptes suivants depuis l'application.

#### FR-22 : Modifier, désactiver ou réactiver un compte — **Must** `[CDC]`
L'administrateur peut modifier le nom et le rôle d'un compte, le désactiver ou le réactiver.

**Critères d'acceptation :**
- Un compte désactivé ne peut plus se connecter. S'il était connecté, il perd l'accès au plus tard à sa prochaine action. `[HYPOTHÈSE]`
- De même, un administrateur rétrogradé en collaborateur perd ses droits d'administration au plus tard à sa prochaine action, sans attendre la fin de sa session.
- Un compte n'est **jamais supprimé**, seulement désactivé, pour garder un historique lisible. `[HYPOTHÈSE]`
- Les créations, changements de rôle, désactivations et réactivations sont tous enregistrés dans les logs (NFR-6).

#### FR-23 : Réinitialiser un mot de passe — **Must** `[PRÉCISION]`
L'administrateur peut réinitialiser le mot de passe d'un compte en définissant un nouveau mot de passe temporaire, selon le même principe que FR-21.

**Critères d'acceptation :**
- L'ancien mot de passe ne fonctionne plus après la réinitialisation.
- À sa connexion suivante, l'utilisateur doit choisir un nouveau mot de passe (même règle que FR-21).
- L'administrateur ne voit jamais le mot de passe définitif d'un utilisateur, ni l'ancien ni le nouveau.
- Un lien « Mot de passe oublié », qui permet à l'utilisateur de réinitialiser lui-même son mot de passe par email, est un bonus (**Could**).

#### FR-24 : Appliquer les droits selon le rôle — **Must** `[CDC]`

| Action | Collaborateur | Administrateur |
|---|:---:|:---:|
| Voir la liste, chercher, filtrer, voir le détail | ✅ | ✅ |
| Saisir une demande reçue par téléphone ou par email (FR-30) | ✅ | ✅ |
| Changer le statut | ✅ | ✅ |
| Attribuer, définir la priorité, commenter (Should) | ✅ | ✅ |
| Supprimer une demande | ❌ | ✅ |
| Gérer les comptes | ❌ | ✅ |
| Gérer les catégories et les informations générales (FR-26, FR-31) | ❌ | ✅ |
| Lancer l'anonymisation (FR-29) | ❌ | ✅ |

**Critères d'acceptation :**
- Un collaborateur ne voit ni menu ni bouton d'administration.
- Si un collaborateur tape directement l'adresse d'une page d'administration, ou appelle directement le serveur pour une action réservée, l'action est refusée **côté serveur** (« Accès refusé »). Cacher le bouton ne suffit pas.

#### FR-25 : Toujours garder un administrateur — **Must** `[AJOUT]`
Le système empêche de **désactiver** ou de **rétrograder** (passer au rôle *Collaborateur*) le **dernier compte administrateur actif**.

*Pourquoi Must alors que c'est un ajout :* sans cette règle, une seule erreur rendrait l'application impossible à administrer. Elle protège une fonction exigée par le CDC.

**Critères d'acceptation :**
- Avec un seul administrateur actif, toute tentative de le désactiver ou de le rétrograder est refusée avec le message : « Impossible : il doit rester au moins un administrateur actif. »
- Avec deux administrateurs actifs, l'un peut rétrograder l'autre. L'administrateur restant devient alors le dernier administrateur actif, et la règle le protège.
- La règle s'applique aussi quand un administrateur agit sur son **propre** compte.
- La règle tient même si deux administrateurs agissent **au même instant**, par exemple en se rétrogradant l'un l'autre : il reste toujours au moins un administrateur actif.
- **Si le dernier administrateur perd son accès** (mot de passe oublié, compte bloqué), le support de niveau 2 lui rend l'accès en suivant une procédure technique écrite (NFR-9, NFR-10). Cette procédure est testée au moins une fois avant le rendu.

---

### 4.6 Paramètres et données (administrateur)

**Description :** l'administrateur règle ce qui fait tourner l'application au quotidien et gère les obligations liées aux données personnelles. Le CDC parle des « principaux paramètres » : leur liste a été précisée avec Aurel. `[PRÉCISION]`

#### FR-26 : Gérer les catégories — **Must** `[PRÉCISION]`
L'administrateur peut **ajouter**, **renommer**, **désactiver** et **réactiver** une catégorie. Il peut aussi **supprimer** une catégorie qui n'a jamais été utilisée. À l'installation, il y a cinq catégories : *Demande d'information*, *Problème technique*, *Demande de rendez-vous*, *Question administrative*, *Autre*. Elles reprennent les exemples du CDC.

**Critères d'acceptation :**
- Une catégorie ajoutée apparaît immédiatement dans le formulaire de dépôt.
- Une catégorie désactivée disparaît du formulaire, mais les demandes qui l'utilisent la gardent et restent filtrables.
- Il est impossible de **supprimer** une catégorie utilisée par au moins une demande. `[HYPOTHÈSE]`
- Il est impossible de désactiver la dernière catégorie active, car le formulaire deviendrait inutilisable. `[HYPOTHÈSE]`
- Pour la même raison, il est impossible de **supprimer** la dernière catégorie active, même si elle n'a jamais été utilisée. Le message est le même que pour la désactivation. `[PRÉCISION]` (validée par Aurel le 8 novembre 2026, lors de la validation UX)
- Deux catégories actives ne peuvent pas porter le même nom.

#### FR-27 : Statuts fixes — **Must** `[CDC]` + `[PRÉCISION]`
Le CDC demande de gérer « **au minimum** » les statuts *Nouvelle*, *En cours* et *Traitée*. Aurel a choisi de s'en tenir à ces trois statuts, non paramétrables, pour garder des règles simples (voir §8.2).

**Critères d'acceptation :**
- Aucun écran ne permet d'ajouter, de renommer ou de supprimer un statut.

#### FR-28 : Supprimer une demande — **Must** `[PRÉCISION]`
L'administrateur peut supprimer définitivement une demande, par exemple quand une personne demande l'effacement de ses données (RGPD).

*Pourquoi Must :* cette exigence précise celle du CDC sur la protection des données personnelles. Le droit à l'effacement doit pouvoir être exercé.

**Critères d'acceptation :**
- Une confirmation est demandée avant la suppression, avec un rappel de la référence.
- Après suppression, la demande n'apparaît plus nulle part dans l'application, ni dans la liste, ni dans la recherche, ni dans les compteurs.
- La suppression est enregistrée dans les logs avec la référence, l'auteur, la date et l'heure, mais **sans** les données personnelles supprimées.

#### FR-29 : Anonymiser les demandes anciennes — **Should** `[PRÉCISION]`
Les demandes dont la **date de clôture** remonte à plus de **3 ans** sont anonymisées. Le nom, l'email, le téléphone et l'entreprise sont effacés. L'objet, la description et le texte des commentaires internes sont remplacés par « [anonymisé] », car ils peuvent contenir des données personnelles. La référence, la catégorie, le canal, les dates, les statuts et la liste des événements d'historique sont conservés. Une demande qui n'est pas *Traitée* n'est pas concernée : elle n'est pas anonymisée tant qu'elle n'est pas clôturée. `[HYPOTHÈSE]`

*Pourquoi Should :* en pratique, aucune demande n'aura 3 ans pendant le challenge. Ce qui reste **Must**, c'est d'écrire cette règle dans la documentation sur les données personnelles (NFR-10). `[HYPOTHÈSE sur ce découpage]`

**Critères d'acceptation :**
- L'administrateur peut lancer l'anonymisation depuis l'espace interne ; une exécution automatique régulière est un bonus (**Could**). `[HYPOTHÈSE]`
- Avec une demande de test dont la date de clôture remonte à plus de 3 ans, l'anonymisation la vide de ses données personnelles et laisse intactes les demandes plus récentes.
- Chaque demande anonymisée reçoit un événement d'historique « Données personnelles anonymisées ».
- Chaque exécution est notée dans les logs avec le nombre de demandes anonymisées.

#### FR-31 : Gérer les informations générales — **Must** `[PRÉCISION]`
L'administrateur peut modifier les informations affichées aux demandeurs :
- le **téléphone** et l'**email de contact** de Nova Services, affichés sur l'écran de confirmation (FR-4) et utilisables en cas de panne (NFR-8) ;
- le **contact pour les données personnelles**, affiché dans la mention de FR-5.

**Critères d'acceptation :**
- Une modification apparaît immédiatement sur le formulaire et sur l'écran de confirmation, sans nouvelle mise en production.
- L'email de contact doit avoir un format valide.
- Chaque modification est enregistrée dans les logs (auteur, date et heure).

---

## 5. Règles métier

*Synthèse des règles réparties dans les exigences. C'est la liste à vérifier en priorité dans les tests.*

| # | Règle | Exigence | Source |
|---|---|---|---|
| RM-1 | Une demande créée a toujours le statut *Nouvelle* et la priorité *Normale*. | FR-3 | `[CDC]` (statut) + `[AJOUT]` (priorité) |
| RM-2 | Chaque demande a une référence unique qui ne change jamais. | FR-3 | `[PRÉCISION]` |
| RM-3 | Il existe exactement trois statuts : *Nouvelle*, *En cours*, *Traitée*. | FR-27 | `[CDC]` (les 3 statuts) + `[PRÉCISION]` (pas d'autre statut) |
| RM-4 | Une demande ne revient jamais au statut *Nouvelle*. La réouverture (*Traitée* → *En cours*) est permise. Chaque changement de statut est tracé dans l'historique. | FR-16 | `[PRÉCISION]` |
| RM-5 | Toute action qui change une demande crée un événement d'historique, qui ne peut être ni modifié ni supprimé. Exceptions RGPD : la suppression de la demande efface son historique (trace dans les logs), et l'anonymisation efface le texte des commentaires. | FR-17, FR-28, FR-29 | `[CDC]` (historique) + `[PRÉCISION]` (non modifiable) |
| RM-6 | Tout utilisateur interne voit toutes les demandes. | FR-11 | `[PRÉCISION]` |
| RM-7 | Seul un administrateur peut supprimer une demande, gérer les comptes et gérer les catégories. | FR-24 | `[CDC]` + `[PRÉCISION]` |
| RM-8 | Personne ne peut s'inscrire seul : seul un administrateur crée les comptes. | FR-21 | `[PRÉCISION]` |
| RM-9 | Il reste toujours au moins un administrateur actif. | FR-25 | `[AJOUT]` |
| RM-10 | Un compte n'est jamais supprimé, seulement désactivé. Un compte désactivé ne peut pas se connecter. | FR-22 | `[HYPOTHÈSE]` |
| RM-11 | Une catégorie désactivée n'est plus proposée, mais reste sur les demandes existantes. | FR-26 | `[PRÉCISION]` |
| RM-12 | Aucune demande ne peut être créée sans que la personne ait été informée de l'usage de ses données : case cochée par le demandeur (formulaire) ou par l'utilisateur interne (saisie interne). | FR-5, FR-30 | `[PRÉCISION]` |
| RM-13 | Les demandes dont la date de clôture remonte à plus de 3 ans sont anonymisées. | FR-29 | `[PRÉCISION]` |
| RM-14 | Une demande a au plus un utilisateur interne attribué, choisi parmi les comptes actifs. | FR-18 | `[AJOUT]` |

---

## 6. Exigences non fonctionnelles

*Une exigence non fonctionnelle (NFR) décrit **comment** l'application doit se comporter (sécurité, fiabilité, exploitation), et non ce qu'elle fait. La plupart viennent directement des parties « Mise en production » et « Fonctionnement » du CDC : elles sont donc en **Must**.*

### 6.1 Mise en production

#### NFR-1 : Application accessible en ligne — **Must** `[CDC]`
- L'application de production répond sur une adresse publique en **HTTPS** (connexion chiffrée, le cadenas du navigateur).
- Le formulaire de dépôt et la page de connexion s'ouvrent depuis n'importe quel ordinateur relié à Internet, sans installation.

#### NFR-2 : Développement et production séparés — **Must** `[CDC]`
- Les environnements de développement et de production utilisent des **bases de données distinctes** : une demande de test créée en développement n'apparaît jamais en production. `[HYPOTHÈSE sur les bases distinctes]`
- Les réglages propres à chaque environnement (adresses, clés) sont fournis par l'environnement lui-même, sans modifier le code.

#### NFR-3 : Aucun secret dans le code — **Must** `[CDC]`
- Le dépôt Git ne contient aucun mot de passe, clé d'API (code d'accès à un service externe) ou identifiant, **ni dans la version actuelle, ni dans l'historique**.
- Un fichier d'exemple liste les réglages attendus avec des valeurs fictives.
- Un outil de détection de secrets passé sur tout le dépôt ne trouve rien. `[HYPOTHÈSE sur la méthode de vérification]`

#### NFR-4 : Versions identifiables — **Must** `[CDC]`
- Le projet est versionné avec Git.
- Chaque mise en production correspond à une version identifiée par un tag Git (par exemple `v1.0.0`).
- La version en ligne est visible dans l'espace interne, par exemple dans le pied de page, pour savoir sans hésiter ce qui tourne en production. `[HYPOTHÈSE]`

#### NFR-5 : Retour à la version précédente — **Must** `[CDC]`
- Une procédure écrite décrit, étape par étape, comment remettre en ligne la version précédente.
- La procédure a été **testée au moins une fois** avant le rendu, et la durée réelle est notée. Objectif : moins de 15 minutes. `[HYPOTHÈSE sur l'objectif]`
- La procédure dit quoi faire si la version à annuler a modifié la structure de la base de données.

### 6.2 Fonctionnement et exploitation

#### NFR-6 : Logs et suivi des erreurs — **Must** `[CDC]`
Les logs sont le journal technique de l'application.
- Ils enregistrent les erreurs techniques ainsi que les **événements importants** : connexion réussie ou échouée, création de compte, changement de rôle, désactivation, suppression d'une demande, anonymisation, échec d'envoi d'email. `[PRÉCISION de la liste]`
- Une personne autorisée peut les consulter et les filtrer par date et par niveau de gravité.
- Ils ne contiennent **jamais** de mot de passe et contiennent le moins possible de données personnelles (pas le texte des descriptions).
- Une erreur provoquée volontairement en production est retrouvable dans les logs en moins de 5 minutes. `[HYPOTHÈSE]`

#### NFR-7 : Sauvegarde et restauration — **Must** `[CDC]`
- La base de production est sauvegardée **au moins une fois par jour**, et les sauvegardes sont conservées **au moins 7 jours**. `[HYPOTHÈSE]`
- Une procédure écrite décrit comment restaurer une sauvegarde.
- La restauration a été **testée au moins une fois** sur un environnement séparé, et on a vérifié que les demandes restaurées sont complètes.
- Perte de données maximale acceptée : 24 heures. `[HYPOTHÈSE]`

#### NFR-8 : Plan en cas d'indisponibilité — **Must** `[CDC]`
Une fiche courte répond à ces questions :
- Comment s'aperçoit-on de la panne ?
- Qui prévenir ?
- Que vérifier, dans l'ordre (hébergeur, base de données, dernière mise en production) ?
- Quand faut-il revenir à la version précédente (NFR-5) ou restaurer une sauvegarde (NFR-7) ?
- Que dire aux demandeurs pendant la panne, par exemple « contactez-nous par téléphone au… » ?

#### NFR-9 : Support à deux niveaux — **Must** `[CDC]`
Une fiche décrit :
- le **niveau 1** : questions d'utilisation, mot de passe à réinitialiser, catégorie à ajouter. Il est assuré par un administrateur Nova et ne demande aucune compétence technique ;
- le **niveau 2** : bug, panne, restauration, retour à la version précédente. Il est assuré par la personne technique (le développeur) ;
- quand et comment le niveau 1 passe la main au niveau 2, et quelles informations il transmet (heure, page, message d'erreur, référence de la demande).

#### NFR-10 : Documentation synthétique — **Must** `[CDC]`
Cinq documents courts, rangés dans le dépôt :
1. **Déploiement** : mettre en ligne une nouvelle version.
2. **Maintenance** : mises à jour, logs, sauvegardes, retour arrière.
3. **Support** : les niveaux 1 et 2 (NFR-9) et le plan d'indisponibilité (NFR-8).
4. **Sécurité et accès** : qui a accès à quoi, gestion des comptes, gestion des secrets.
5. **Protection des données personnelles** : données collectées, finalité, durée de conservation (3 ans), droits des personnes, procédure de suppression (FR-28) et d'anonymisation (FR-29).

Critère : une personne qui n'a pas développé le projet peut suivre le document *Déploiement* sans aide. `[HYPOTHÈSE sur le critère]`

### 6.3 Qualités transverses

#### NFR-11 : Sécurité — **Must** `[CDC]` (« application sécurisée »)
- Les mots de passe sont stockés de façon **non réversible** (hachage) : même avec un accès à la base, on ne peut pas les relire.
- Les mots de passe font **au moins 12 caractères**. `[HYPOTHÈSE]` (recommandation courante de la CNIL, l'autorité française de protection des données)
- Les droits sont toujours vérifiés **côté serveur** (voir FR-24).
- Les textes saisis par le demandeur ne peuvent pas injecter de code dans les pages de l'espace interne. Exemple de test : une description contenant `<script>` s'affiche comme du simple texte.

#### NFR-12 : Simplicité et accessibilité — **Should** `[HYPOTHÈSE]`
- L'interface est en français.
- Le formulaire de dépôt est utilisable sur un téléphone, en largeur 360 px, sans défilement horizontal.
- Chaque champ a une étiquette visible, et le formulaire peut être rempli entièrement au clavier.
- L'application fonctionne sur les versions récentes de Chrome, Firefox, Edge et Safari.

#### NFR-13 : Performance raisonnable — **Should** `[HYPOTHÈSE]`
- Avec 5 000 demandes en base, la liste, la recherche et les filtres répondent en moins de 2 secondes.
- Volume prévu : quelques dizaines de demandes par semaine et une dizaine d'utilisateurs internes.

#### NFR-14 : Éléments générés par l'IA vérifiés — **Must** `[CDC]`
Cette exigence couvre tout ce que l'IA produit : code, interfaces et documentation.
- Avant d'intégrer une story (une petite unité de travail), on vérifie qu'elle respecte ses critères d'acceptation. La trace de cette vérification (revue ou commit) reste dans Git.
- Les règles métier du §5 sont couvertes par des **tests automatisés**, c'est-à-dire des programmes qui vérifient le comportement à chaque modification. `[HYPOTHÈSE sur le moyen]`
- La documentation générée est relue, et le document *Déploiement* est testé (NFR-10).
- Une courte note **« Démarche IA »** dans la documentation décrit les outils utilisés, ce que l'IA a produit et comment cela a été vérifié. `[HYPOTHÈSE]`
- Le développeur reste responsable de la solution finale.

---

## 7. Non-objectifs

Ce que l'application **ne fait pas** dans cette version. Cette liste évite d'ajouter des fonctions « tant qu'on y est ».

- Ce n'est **pas un outil de messagerie** : on ne répond pas au demandeur depuis l'application. La réponse se fait par téléphone ou par email, en dehors de l'application.
- Ce n'est **pas un CRM** (logiciel de gestion de la relation client) : pas de fiche client, pas d'historique commercial, pas de devis.
- **Pas de statistiques avancées** ni de tableaux de bord de performance.
- **Pas de délais de traitement garantis** (SLA) ni de relances automatiques.

Les fonctions reportées à une version 2 (espace demandeur, import automatique, pièces jointes, etc.) sont listées au §8.2, avec leurs raisons.

---

## 8. Périmètre du MVP

Le **MVP** (*Minimum Viable Product*, ou « produit minimum viable ») est la première version utilisable et livrable. On la complète ensuite.

### 8.1 Dans le MVP

**Must, condition du rendu :**
- Dépôt d'une demande : FR-1 à FR-5, et saisie interne FR-30.
- Connexion et espace sécurisé : FR-8 à FR-10.
- Liste, recherche, filtres par statut et par catégorie, compteur des demandes à traiter : FR-11 à FR-14.
- Détail, changement de statut, historique : FR-15 à FR-17.
- Comptes, rôles, droits, protection du dernier administrateur : FR-21 à FR-25.
- Catégories, statuts fixes, suppression d'une demande : FR-26 à FR-28, et informations générales FR-31.
- Exploitation et documentation : NFR-1 à NFR-11 et NFR-14.

**Should, à faire une fois tous les Must terminés et vérifiés :**
- Anti-spam (FR-6).
- Attribution (FR-18), priorité (FR-19), commentaires internes (FR-20), et les filtres et compteurs qui les utilisent.
- Repérage des demandes *En cours* sans activité depuis 7 jours (FR-14).
- Anonymisation lancée par l'administrateur (FR-29).
- Accessibilité et performance (NFR-12, NFR-13).

**Could, bonus :**
- Email de confirmation au demandeur (FR-7).
- Lien « Mot de passe oublié » utilisable par l'utilisateur lui-même (FR-23).
- Anonymisation automatique régulière (FR-29).
- Email aux utilisateurs internes à chaque nouvelle demande (FR-32).

### 8.2 Hors MVP (Won't, version 1)

| Élément | Raison |
|---|---|
| Suivi de la demande par le demandeur (espace client, lien de suivi) | Nécessite un système d'accès pour les demandeurs. Renvoyé à une v2. |
| Pièces jointes (captures d'écran, documents) | Stockage, taille, antivirus et données sensibles : complexité disproportionnée pour le MVP. |
| Réponse au demandeur depuis l'application | Transformerait l'outil en messagerie (voir §7). |
| Détection automatique des doublons | La recherche par email suffit pour la v1 (FR-12). |
| Statuts paramétrables | Les 3 statuts du CDC suffisent. Les rendre modifiables complique les règles (FR-27). |
| Import automatique des emails | Intégration technique lourde. La saisie depuis l'espace interne suffit (FR-30, UJ-4). |
| Connexion via un compte d'entreprise (Google, Microsoft) | Non demandée. Email et mot de passe suffisent. |

---

## 9. Critères de réussite

*Comment saura-t-on que le projet est réussi ? Chaque critère s'observe lors d'une démonstration ou d'une vérification.*

**Principaux**
- **SM-1 — Parcours complet en production.** Sur l'adresse en ligne : un demandeur dépose une demande et obtient sa référence. Un collaborateur la retrouve par la recherche, la passe *En cours* puis *Traitée*. L'historique montre au moins ces 3 événements, dans l'ordre (création et 2 changements de statut), avec auteur et heure. *Valide FR-1 à FR-4, FR-11, FR-12, FR-15 à FR-17, NFR-1.*
- **SM-2 — 100 % des Must du CDC démontrables.** Chaque ligne du tableau de couverture du CDC ([addendum.md](addendum.md), §A) est cochée avec une preuve : capture d'écran, test ou document. *Valide l'ensemble des Must.*
- **SM-3 — Droits étanches.** Un collaborateur qui tente d'ouvrir une page d'administration, ou d'appeler une action réservée, est refusé. Une visite sans connexion d'une page interne renvoie vers la connexion. *Valide FR-10, FR-24, NFR-11.*
- **SM-4 — Exploitation éprouvée.** Le retour à la version précédente et la restauration d'une sauvegarde ont chacun été **réellement exécutés** au moins une fois, avec la date et la durée notées dans la documentation. *Valide NFR-5, NFR-7.*

**Secondaires**
- **SM-5 — Dépôt rapide.** Une personne qui découvre le formulaire dépose une demande en **moins de 2 minutes**, sans aide. *Valide FR-1, FR-2, FR-4.*
- **SM-6 — Retrouver vite.** Un collaborateur retrouve une demande précise, à partir de sa référence ou du nom du demandeur, en **moins de 30 secondes**. *Valide FR-12, FR-13.*
- **SM-7 — Zéro secret.** Une analyse de tout l'historique Git ne trouve aucun secret. *Valide NFR-3.*
- **SM-8 — Règles métier testées.** Chaque règle RM-1 à RM-14 qui concerne une fonction réalisée est vérifiée par au moins un test automatisé, et tous les tests passent. *Valide NFR-14.*

**À ne pas maximiser (contre-indicateurs)**
- **SM-C1 — Nombre de fonctionnalités ajoutées.** Ajouter des Should ou des Could avant que tous les Must soient terminés et vérifiés est un échec, pas une réussite. *Contrebalance SM-2.*
- **SM-C2 — Sévérité de l'anti-spam.** Un anti-spam qui bloque un seul vrai demandeur coûte plus cher qu'un spam qui passe. *Contrebalance FR-6.*
- **SM-C3 — Vitesse de passage à « Traitée ».** Dans un usage réel, ne pas encourager à clôturer vite pour faire baisser le compteur. Une demande est *Traitée* quand le demandeur a réellement eu sa réponse. *Contrebalance FR-14.*

---

## 10. Contraintes

- **Délai et contexte :** challenge de formation évalué, réalisé seul, avec l'aide de l'IA. `[PRÉCISION]`
- **Données personnelles :** l'application traite des noms, des emails et des téléphones de professionnels. Le RGPD s'applique (FR-5, FR-28, FR-29, NFR-10).
- **Technique :** le projet démarre sur une base déjà installée (voir [addendum.md](addendum.md), §B). Ce PRD ne l'impose pas : le choix sera confirmé lors de l'architecture.

---

## 11. Questions ouvertes

1. **Hébergement et adresse en ligne :** quel hébergeur, et quel nom de domaine ? → à trancher lors de l'**architecture**.
2. **Sauvegardes :** la solution qui héberge la base de données fournit-elle les sauvegardes de NFR-7 ? Sinon, il faut prévoir un export programmé → **architecture** (voir [addendum.md](addendum.md), §B).
3. **Interlocuteurs du support :** dans le scénario Nova Services, qui assure le niveau 1 et le niveau 2 ? Pour le challenge, des rôles fictifs suffisent → à préciser lors de la rédaction de la documentation *Support* (NFR-9).
4. **Durée de conservation de 3 ans :** validée pour le challenge. Dans une vraie entreprise, elle serait à confirmer avec le référent RGPD.
5. **Consultation des logs :** dans l'espace interne (réservée à l'administrateur), ou dans l'outil de l'hébergeur (réservée au support de niveau 2) ? Le PRD suppose la seconde option → **architecture**.

*Aucune de ces questions ne bloque la suite : chacune a un responsable et un moment où elle sera tranchée.*

---

## 12. Index des hypothèses

*Toutes validées par Aurel le 8 novembre 2026. Quatre d'entre elles ont été converties en `[PRÉCISION]` ; elles sont listées dans le second tableau.*

| # | Hypothèse | Où |
|---|---|---|
| H-2 | Pas d'utilisateurs externes (prestataires, partenaires) en v1. | §2.3 |
| H-3 | Format de référence `NOVA-AAAA-NNNN`. | Glossaire, FR-3 |
| H-4 | Longueurs maximales des champs, et seul le format de l'email est vérifié. | FR-1 |
| H-5 | Anti-spam sans CAPTCHA : champ caché + 10 envois par heure au plus depuis une même adresse IP, sans limite pour un utilisateur interne connecté. | FR-6 |
| H-6 | Email de confirmation reçu en moins de 5 minutes. Son échec ne bloque pas le dépôt. | FR-7 |
| H-7 | Blocage de 15 minutes après 5 échecs de connexion. | FR-8 |
| H-8 | Session expirée après 8 heures d'inactivité. | FR-9 |
| H-9 | Liste découpée en pages de 25 demandes. | FR-11 |
| H-10 | Recherche insensible aux accents. | FR-12 |
| H-12 | Les commentaires internes ne peuvent être ni modifiés ni supprimés. | FR-20 |
| H-14 | Un compte désactivé perd l'accès à sa prochaine action. Les comptes ne sont jamais supprimés. | FR-22, RM-10 |
| H-15 | Impossible de supprimer une catégorie utilisée, ou de désactiver la dernière catégorie active. (L'interdiction de *supprimer* la dernière catégorie active est une `[PRÉCISION]` ajoutée lors de la validation UX.) | FR-26 |
| H-16 | Anonymisation : Should, déclenchée par l'administrateur. Automatique en Could. Les demandes non clôturées ne sont pas concernées. | FR-29 |
| H-17 | Bases de données distinctes pour le développement et la production. | NFR-2 |
| H-18 | Vérification de l'absence de secrets par un outil de détection. | NFR-3 |
| H-19 | Version affichée dans le pied de page de l'espace interne. | NFR-4 |
| H-20 | Retour à la version précédente en moins de 15 minutes. | NFR-5 |
| H-21 | Sauvegarde quotidienne, conservée 7 jours. Perte maximale de 24 heures. | NFR-7 |
| H-22 | Une erreur est retrouvable dans les logs en moins de 5 minutes. | NFR-6 |
| H-23 | Documentation de déploiement utilisable par un tiers sans aide. | NFR-10 |
| H-24 | Mots de passe de 12 caractères au moins. | NFR-11 |
| H-25 | Exigences d'accessibilité et de compatibilité des navigateurs. | NFR-12 |
| H-26 | Performance : moins de 2 secondes avec 5 000 demandes ; volume de quelques dizaines de demandes par semaine. | NFR-13 |
| H-27 | Règles métier couvertes par des tests automatisés, et note « Démarche IA » dans la documentation. | NFR-14 |
| H-28 | Une demande *En cours* est signalée « Sans activité » après 7 jours (Should). | FR-14 |
| H-30 | FR-25 (dernier administrateur) classé en Must, bien que ce soit un ajout. | FR-25 |
| H-31 | L'anonymisation efface aussi l'objet, la description et le texte des commentaires. | FR-29 |

**Hypothèses converties en `[PRÉCISION]`**

| # | Décision d'Aurel | Où |
|---|---|---|
| H-1 | Saisie interne des demandes reçues par téléphone ou par email, avec un canal, en Must. | FR-30, UJ-4 |
| H-11 | *Modifiée :* réouverture permise, retour à *Nouvelle* interdit, chaque changement tracé. | FR-16, RM-4 |
| H-13 | *Modifiée :* mot de passe temporaire défini par l'administrateur, changement obligatoire à la première connexion, aucun email en Must. | FR-21, FR-23 |
| H-29 | Informations générales modifiables par l'administrateur, en Must. | FR-31 |
