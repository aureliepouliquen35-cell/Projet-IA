# Rapport de validation — Architecture Nova Services

- **Document :** `architecture.md`
- **Date :** 2026-11-08
- **Relecture :** vérificateur automatique de bmad-architecture (0 problème) + grille de contrôle passée directement, sans sous-agents (demande d'Aurel)

## Verdict

L'architecture est solide et prête pour la suite après quelques retouches. Toutes les fonctions du PRD et tous les écrans de l'UX ont leur brique ; seule la performance (NFR-13) n'est rattachée à rien. La vérification a trouvé 10 points à corriger : 2 importants (la page de confirmation pourrait montrer la demande de quelqu'un d'autre ; la protection des fonctions de la base n'est pas fixée), 4 moyens et 4 mineurs. Aucun ne remet en cause les choix principaux.

## Contrôles

- Les points où deux parties pourraient se contredire sont fixés — **correct** : 2 trous : le passage d'informations d'une page à l'autre, et la protection des fonctions de la base.
- Chaque règle est vérifiable et évite vraiment son problème — **solide** : Les 19 règles disent quoi faire et où ; la plupart peuvent être testées.
- Ce qui est reporté ne crée pas de risque — **solide** : Les e-mails, Sentry et l'anonymisation automatique s'ajoutent sans toucher aux règles.
- Les outils et versions sont vérifiés — **solide** : Versions relevées sur npm et dans le dépôt ; offres gratuites vérifiées sur le web.
- L'existant du dépôt est respecté — **solide** : proxy.ts, clients Supabase et noms des clés sont repris tels quels.
- Le PRD et l'UX sont couverts — **correct** : Toutes les fonctions et tous les écrans ont leur brique, sauf la performance (NFR-13).
- L'exploitation est couverte (environnements, sauvegardes, mises en production) — **correct** : Un risque d'arrêt silencieux de la sauvegarde de nuit.

## Écrans et fonctions → briques

| Écrans (UX) | Brique | Exigences (PRD) |
|---|---|---|
| P1, P2 | B1 | FR-1 à FR-6 |
| I1, I2 | B2 | FR-8 à FR-10, FR-21, FR-23 |
| I3 + pastille du menu | B3 | FR-11 à FR-14 (+ NFR-13, à rattacher : V5) |
| I4 | B4 (+ B7 pour la zone admin) | FR-15 à FR-20, FR-28 |
| I5 | B5 | FR-30 |
| A1, A2, A3 | B6 | FR-21 à FR-27, FR-31 |
| A4 | B7 | FR-29 |
| S1, S2, S3 | B9 | FR-24, NFR-11, NFR-12 |
| — (tableau de bord Supabase) | B8, B10 | NFR-1 à NFR-10, NFR-14 |
| E1, E2 (e-mails) | Reporté (§10) | FR-7, FR-32 (Could) |
| « Mot de passe oublié » | Reporté (§10) | FR-23, partie Could |

## Problèmes à corriger

**V1 · élevée** — La page de confirmation pourrait montrer la demande d'un autre (§6, P2 · FR-4, RGPD)
Rien ne dit comment la page de confirmation retrouve la demande. Si la référence est dans l'adresse, quelqu'un pourrait taper NOVA-2026-0041 (les numéros se suivent) et voir l'objet et l'email d'une autre personne. Rien n'empêche non plus un double enregistrement si l'envoi part deux fois.
*Correction :* Nouvelle règle AD-20 : les informations passées d'une page à l'autre (confirmation, petit message après une redirection) voyagent dans un cookie serveur protégé, valable 30 minutes, jamais dans l'adresse. Chaque formulaire porte aussi un numéro d'envoi unique : la base ignore un second envoi qui porte le même numéro.

**V2 · élevée** — La protection des fonctions de la base n'est pas fixée (AD-2, AD-9 · NFR-11)
Toutes les écritures passent par des fonctions de la base, mais la règle ne dit pas qui a le droit de les lancer. Une fonction oubliée pourrait être appelée par n'importe qui avec la clé publique.
*Correction :* Ajouter à AD-9 : chaque fonction vérifie d'abord qui l'appelle ; par défaut, personne n'a le droit de la lancer, puis on donne ce droit soit aux utilisateurs connectés (fonctions internes), soit au seul serveur (dépôt, connexion, journal, comptes). Chaque fonction est aussi protégée contre une attaque connue de Postgres (réglage du chemin de recherche).

**V3 · moyenne** — Les erreurs pendant l'affichage d'une page ne sont pas enregistrées (AD-12 · NFR-6)
Seules les erreurs des actions (boutons, formulaires) arrivent au journal. Une page qui plante en s'affichant ne laisse aucune trace.
*Correction :* Ajouter à AD-12 : le point d'entrée prévu par Next.js pour les erreurs serveur (instrumentation.ts) écrit aussi dans le journal. L'écran S3 affiche le code d'erreur fourni par Next.js.

**V4 · moyenne** — La sauvegarde de nuit peut s'arrêter sans prévenir (AD-18 · NFR-7)
GitHub met en pause les tâches planifiées d'un dépôt public après 60 jours sans activité, sans prévenir (vérifié dans sa documentation). Par ailleurs, si le mot de passe de chiffrement n'existe que dans GitHub, les sauvegardes deviennent illisibles si on perd l'accès au compte.
*Correction :* Ajouter à AD-18 : chaque sauvegarde réussie est écrite dans le journal ; la documentation Maintenance demande de vérifier chaque mois que la dernière date de moins de 24 h, et de réactiver la tâche si besoin. Le mot de passe de chiffrement est aussi gardé hors de GitHub (gestionnaire de mots de passe).

**V5 · moyenne** — La performance (NFR-13) n'a pas de brique (§4 · NFR-13)
NFR-13 demande moins de 2 secondes avec 5 000 demandes, mais aucune brique ne la porte.
*Correction :* La rattacher à B3. Règle : une seule fonction de lecture paginée (déjà prévue), des index sur la date de dépôt, le statut, la catégorie et le texte de recherche, et un test sur dev avec 5 000 demandes générées.

**V6 · moyenne** — La liste des types d'événements d'historique n'est pas fermée (§5, §7 · FR-17)
Deux stories pourraient écrire « statut » et « changement_statut » pour la même chose.
*Correction :* Liste fermée dans les conventions : creation, statut, attribution, priorite, commentaire, anonymisation.

**V7 · faible** — Les valeurs des filtres dans l'adresse ne sont pas précisées (§7)
On ne sait pas si le filtre catégorie contient un nom ou un identifiant.
*Correction :* Identifiants pour catégorie et attribution ; attribution accepte aussi « moi » et « aucune ».

**V8 · faible** — L'origine de l'adresse IP n'est pas précisée (AD-14 · FR-6)
Deux façons de la lire donneraient des limites différentes.
*Correction :* Utiliser l'en-tête transmis par Vercel (x-forwarded-for, première valeur).

**V9 · faible** — Le PRD dit encore ouvertes 3 questions tranchées ici (PRD §11)
Hébergement et domaine (Q1), sauvegardes (Q2), consultation des journaux (Q5) sont décidés dans l'architecture.
*Correction :* Mettre à jour le §11 du PRD avec un renvoi vers l'architecture, comme pour la règle de la dernière catégorie.

**V10 · faible** — Le schéma des environnements parle de prévisualisations jamais utilisées (§8)
Les commits se font directement sur main : les prévisualisations Vercel d'autres branches n'existeront pas.
*Correction :* Préciser « non utilisées pour l'instant ».

## Ce que ces choix imposent pour la suite

- **Une partie des règles s'écrit dans le langage de la base (SQL), pas seulement en TypeScript.** C'est le prix de la fiabilité : l'historique et les règles tiennent même si deux personnes cliquent en même temps. Il faudra relire ce code avec soin, et les tests deviennent indispensables.
- **Chaque changement de la base passe par un fichier de migration**, appliqué d'abord sur dev, puis sur prod. On ne touche jamais la production à la main.
- **Chaque nouvelle action suit le même moule** : vérifier qui agit, vérifier la saisie, appeler la fonction de la base, renvoyer une réponse au format commun. C'est un peu plus long à écrire, mais toutes les actions se ressemblent.
- **Deux projets Supabase à tenir alignés** (dev et prod), et des clés secrètes à ranger dans Vercel et GitHub, jamais dans le code.
- **Le dépôt est public :** tout ce qui y est déposé est lisible par tous, pour toujours (l'historique Git garde même ce qui est supprimé).
- **Un peu d'entretien régulier :** vérifier chaque mois que la sauvegarde tourne, tester une restauration avant le rendu, relancer le projet dev s'il s'est mis en pause.

## Ce qui coûtera de l'argent, et quand

| Situation | Coût | Pourquoi |
|---|---|---|
| Aujourd'hui | 0 € | Tout tient dans les offres gratuites, pour 10 utilisateurs et quelques dizaines de demandes par semaine. |
| Si Nova Services utilisait vraiment l'application dans son activité | environ 20 € par mois | L'offre gratuite de Vercel est réservée à un usage non commercial : il faudrait passer à Vercel Pro. |
| Si on voulait des e-mails (confirmation, alertes) ou une adresse à son nom | environ 10 à 15 € par an | Un nom de domaine. Les services d'envoi d'e-mails ont des offres gratuites suffisantes pour ce volume. |
| Si on voulait des sauvegardes gérées par Supabase, sans pause, ou plus de 500 Mo | environ 25 € par mois | L'offre Pro de Supabase. Au volume prévu, 500 Mo ne seraient pas atteints avant de nombreuses années. |
| Si le dépôt devenait privé | 0 € au début | GitHub garde un quota gratuit de tâches automatiques, largement suffisant pour une sauvegarde de quelques minutes par nuit. |

## Ce qui serait difficile à changer plus tard

| Difficulté | Choix | Pourquoi |
|---|---|---|
| Difficile | Supabase pour la base et les comptes | La base elle-même est un Postgres standard, facile à déplacer, mais les comptes et les règles d'accès propres à Supabase seraient à refaire. |
| Difficile | Les règles métier rangées dans la base | Les déplacer plus tard dans l'application obligerait à réécrire le cœur du traitement des demandes. |
| Difficile | Le format des références NOVA-AAAA-NNNN | Dès qu'une référence est donnée à un client, on ne peut plus en changer le format. |
| Difficile | Next.js | C'est la charpente de toute l'application : en changer revient à tout réécrire. |
| Moyen | Les noms des tables et des valeurs (statuts, rôles) | Après la mise en production, chaque renommage demande une migration prudente des données existantes. |
| Moyen | L'adresse en .vercel.app | Facile techniquement, mais si l'adresse a été communiquée aux clients, il faudra les prévenir. Mieux vaut choisir le nom du projet Vercel dès le départ. |
| Facile | shadcn/ui, le journal en table, l'absence de domaine | Les composants sont copiés dans le projet, Sentry peut s'ajouter au journal, un domaine se branche en quelques minutes. |
| Facile | Vercel | Next.js peut tourner chez d'autres hébergeurs ; on perdrait seulement le déploiement automatique et le retour arrière en un clic. |

## Hypothèses non confirmées (11)

- A-H1 : Composants shadcn/ui
- A-H2 : Données et serveurs en Europe (Paris ou Francfort)
- A-H3 : Node.js 24
- A-H4 : Tests sur le projet dev, sans installer Docker
- A-H5 : Expiration après 8 h gérée par l'application
- A-H6 : Empreinte du mot de passe temporaire gardée jusqu'au changement
- A-H7 : Empreintes d'IP et tentatives de connexion effacées après 24 h
- A-H8 : La sauvegarde de nuit suffit à éviter la pause du projet prod
- A-H9 : Version affichée = version de package.json
- A-H10 : gitleaks pour détecter les secrets
- A-H11 : On garde TypeScript 5.9

A-H12 (commits directement sur main) est déjà ta consigne : elle n'est pas à confirmer.
