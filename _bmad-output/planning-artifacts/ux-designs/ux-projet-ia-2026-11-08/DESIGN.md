---
name: Nova Services — Gestion des demandes
description: Identité visuelle de l'application de gestion des demandes clients de Nova Services. Style sobre, rassurant et soigné, bleu profond relevé d'un accent violet améthyste, pensé pour Tailwind CSS 4 sans bibliothèque de composants imposée.
status: final
created: 2026-11-08
updated: 2026-11-08
sources:
  - ../../prds/prd-projet-ia-2026-11-08/prd.md
colors:
  # Marque
  primary: '#1E3A8A'
  primary-hover: '#1E40AF'
  primary-foreground: '#FFFFFF'
  primary-soft: '#EEF2FF'
  focus-ring: '#2563EB'
  # Accent (touche chic, jamais pour un statut)
  accent: '#6D28D9'
  accent-soft: '#F5F3FF'
  accent-light: '#C4B5FD'
  # Surfaces et texte
  background: '#FFFFFF'
  surface-muted: '#F8FAFC'
  surface-subtle: '#F1F5F9'
  border: '#E2E8F0'
  border-input: '#8792A2'
  text: '#0F172A'
  text-muted: '#475569'
  text-subtle: '#64748B'
  # Retours (succès, erreur)
  danger: '#B91C1C'
  danger-foreground: '#FFFFFF'
  danger-soft: '#FEE2E2'
  success: '#15803D'
  success-soft: '#DCFCE7'
  # Statuts et priorité (toujours accompagnés d'un libellé texte)
  status-nouvelle-bg: '#DBEAFE'
  status-nouvelle-fg: '#1E40AF'
  status-en-cours-bg: '#FEF3C7'
  status-en-cours-fg: '#92400E'
  status-traitee-bg: '#DCFCE7'
  status-traitee-fg: '#166534'
  urgent-bg: '#FEE2E2'
  urgent-fg: '#991B1B'
  inactive-bg: '#F1F5F9'
  inactive-fg: '#475569'
typography:
  page-title:
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.01em
  section-title:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.45'
  label:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  caption:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
  counter:
    fontFamily: 'Inter, system-ui, sans-serif'
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.1'
  reference:
    fontFamily: 'ui-monospace, "Cascadia Mono", "SF Mono", Consolas, monospace'
    fontSize: 14px
    fontWeight: '500'
    letterSpacing: 0.01em
rounded:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  full: 9999px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '10': 40px
  '12': 48px
  gutter-mobile: 16px
  gutter-desktop: 32px
  form-max-width: 560px
  content-max-width: 1200px
  sidebar-width: 240px
  control-height: 44px
components:
  logo:
    mark-background: '{colors.primary}'
    mark-star: '{colors.accent-light}'
    mark-size: 32px
    mark-radius: 9px
    wordmark: 'Nova (semi-gras, {colors.text}) + Services (normal, {colors.text-muted}), 17px'
  icon:
    style: 'Icônes au trait, coins arrondis (famille type Lucide)'
    stroke-width: 1.75px
    size-default: 18px
    size-small: 16px
    size-badge: 13px
    color: 'currentColor ; {colors.accent} pour les icônes de titres et l''élément actif du menu'
  shadow-soft:
    value: '0 1px 2px rgba(15,23,42,.04), 0 4px 14px rgba(15,23,42,.05)'
  button-primary:
    background: '{colors.primary}'
    background-hover: '{colors.primary-hover}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    height: '{spacing.control-height}'
    typography: '{typography.label}'
    shadow: '0 1px 2px rgba(30,58,138,.25), 0 6px 16px rgba(30,58,138,.18)'
  button-secondary:
    background: '{colors.background}'
    foreground: '{colors.text}'
    border: '1px solid {colors.border-input}'
    radius: '{rounded.md}'
    height: '{spacing.control-height}'
  button-ghost:
    background: 'transparent'
    foreground: '{colors.primary}'
    radius: '{rounded.md}'
  button-danger:
    background: '{colors.danger}'
    foreground: '{colors.danger-foreground}'
    radius: '{rounded.md}'
    height: '{spacing.control-height}'
  input:
    background: '{colors.background}'
    foreground: '{colors.text}'
    border: '1px solid {colors.border-input}'
    radius: '{rounded.sm}'
    height: '{spacing.control-height}'
    typography: '{typography.body}'
  input-error:
    border: '2px solid {colors.danger}'
    message-color: '{colors.danger}'
  focus-outline:
    outline: '2px solid {colors.focus-ring}'
    offset: 2px
  badge-status-nouvelle:
    background: '{colors.status-nouvelle-bg}'
    foreground: '{colors.status-nouvelle-fg}'
    radius: '{rounded.full}'
  badge-status-en-cours:
    background: '{colors.status-en-cours-bg}'
    foreground: '{colors.status-en-cours-fg}'
    radius: '{rounded.full}'
  badge-status-traitee:
    background: '{colors.status-traitee-bg}'
    foreground: '{colors.status-traitee-fg}'
    radius: '{rounded.full}'
  badge-urgent:
    background: '{colors.urgent-bg}'
    foreground: '{colors.urgent-fg}'
    radius: '{rounded.sm}'
  badge-inactive:
    background: '{colors.inactive-bg}'
    foreground: '{colors.inactive-fg}'
    radius: '{rounded.sm}'
  counter-card:
    background: '{colors.primary}'
    foreground: '{colors.primary-foreground}'
    radius: '{rounded.lg}'
    number-typography: '{typography.counter}'
  card:
    background: '{colors.background}'
    border: '1px solid {colors.border}'
    radius: '{rounded.lg}'
    padding: '{spacing.6}'
    shadow: '{components.shadow-soft.value}'
  table-row:
    border-bottom: '1px solid {colors.border}'
    background-hover: '{colors.surface-muted}'
    typography: '{typography.body-sm}'
  sidebar-item-active:
    background: '{colors.primary-soft}'
    foreground: '{colors.primary}'
    indicator: '3px à gauche, {colors.accent}'
    icon-color: '{colors.accent}'
    radius: '{rounded.md}'
  alert-error:
    background: '{colors.danger-soft}'
    foreground: '{colors.urgent-fg}'
    border-left: '4px solid {colors.danger}'
    radius: '{rounded.md}'
  alert-success:
    background: '{colors.success-soft}'
    foreground: '{colors.status-traitee-fg}'
    border-left: '4px solid {colors.success}'
    radius: '{rounded.md}'
  alert-info:
    background: '{colors.primary-soft}'
    foreground: '{colors.primary}'
    border-left: '4px solid {colors.primary}'
    radius: '{rounded.md}'
  toast:
    background: '{colors.text}'
    foreground: '{colors.background}'
    icon-success: '{colors.success}'
    radius: 12px
    shadow: '0 8px 20px rgba(15, 23, 42, 0.3)'
  filter-button:
    background: '{colors.background}'
    border: '1px solid {colors.border-input}'
    background-active: '{colors.primary-soft}'
    border-active: '{colors.primary}'
    foreground-active: '{colors.primary}'
    radius: '{rounded.md}'
    height: 36px
  checkbox:
    size: 22px
    border: '1px solid {colors.border-input}'
    background-checked: '{colors.primary}'
    radius: '{rounded.sm}'
  segmented-control:
    border: '1px solid {colors.border-input}'
    background-selected: '{colors.primary}'
    foreground-selected: '{colors.primary-foreground}'
    radius: '{rounded.md}'
    height: 40px
  skeleton:
    background: '{colors.border}'
    radius: '{rounded.sm}'
  icon-bubble:
    size: 44px
    background: '{colors.accent-soft}'
    foreground: '{colors.accent}'
    background-error: '{colors.danger-soft}'
    foreground-error: '{colors.danger}'
    radius: '{rounded.full}'
  dialog:
    background: '{colors.background}'
    radius: '{rounded.lg}'
    shadow: '0 10px 30px rgba(15, 23, 42, 0.18)'
---

# DESIGN.md — Nova Services

> **Ce document décrit à quoi ressemble l'application** : couleurs, police, espacements, formes et composants. Le comportement (ce qui se passe quand on clique, les messages, les états) est décrit dans [EXPERIENCE.md](EXPERIENCE.md).
>
> **En haut du fichier**, le bloc entre `---` contient des **tokens** : des valeurs nommées (par exemple `primary: '#1E3A8A'`) que le code réutilisera tel quel. Dans le texte, `{colors.primary}` veut dire « la valeur du token `primary` dans `colors` ».
>
> Maquettes de référence (**en cas de désaccord entre une maquette et ce document, ce document l'emporte**) :
> - [mockups/key-formulaire-depot.html](mockups/key-formulaire-depot.html) : logo, champs, erreurs, bouton principal, encadré de la référence (téléphone) ;
> - [mockups/key-liste-demandes.html](mockups/key-liste-demandes.html) : menu latéral, carte compteur, filtres, tableau, badges, squelette, états vides (ordinateur) ;
> - [mockups/key-detail-demande.html](mockups/key-detail-demande.html) : cartes, historique, panneau d'actions, toast, encadré d'information, fenêtre de confirmation (ordinateur).
>
> Les choix marqués `[HYPOTHÈSE]` ont tous été **confirmés par Aurel le 8 novembre 2026**. Ils sont regroupés à la fin.
>
> **État :** document validé le 8 novembre 2026 (rapport : [validation-report.md](validation-report.md)).

## Brand & Style

Nova Services remplace des fichiers éparpillés par **un outil unique et fiable**. Le style doit donc inspirer **confiance et calme** : *sobre et rassurant* (décision d'Aurel).

- **Côté demandeur** (Claire, sur son téléphone), l'écran doit dire « vous êtes au bon endroit, votre demande ne se perdra pas ». Peu d'éléments, beaucoup d'espace, une seule action par écran.
- **Côté interne** (Karim, Sophie, au bureau), l'écran doit dire « voici ce qui attend, rien n'est oublié ». L'information est claire et bien rangée, sans effet décoratif.

Le rendu se veut **soigné et un peu chic** (demande d'Aurel) : coins bien arrondis, ombres très douces, petites icônes au trait et une touche de violet. Il n'y a ni illustration, ni animation décorative. Les couleurs de statut servent à **signaler** (une action, un statut, une erreur). Seul l'accent violet a un rôle d'élégance, et il reste discret.

### Logo

Un logo simple, dessiné pour l'application (`{components.logo}`) :
- **le symbole** : un carré aux coins arrondis, bleu `{colors.primary}`, qui contient une **étoile à quatre branches** et un petit point en violet clair `{colors.accent-light}`. *Nova* désigne une étoile qui s'illumine : c'est l'idée d'une demande qui « apparaît » et qu'on ne perd pas de vue ;
- **le nom** : « **Nova** Services », avec « Nova » en semi-gras foncé et « Services » en gris ;
- il se place en haut du formulaire public et en haut du menu latéral, à 32 px. On ne le déforme pas, on ne change pas ses couleurs et on ne lui ajoute pas d'ombre.

Le dessin exact (format SVG) figure dans les maquettes.

## Colors

**Une couleur de marque, le bleu profond, relevée d'un accent violet améthyste.** Tout le reste est en blanc et en gris, sauf les couleurs qui ont un sens précis (statuts, erreur, succès).

### Accent violet améthyste

| Token | Valeur | Usage |
|---|---|---|
| `accent` | `#6D28D9` | Icônes des titres de blocs, icône et barre de 3 px de l'élément actif du menu, point du dernier événement de l'historique, bord gauche de l'encadré de la référence (confirmation). Contraste sur blanc : 7,10:1. |
| `accent-soft` | `#F5F3FF` | Fond de la mention sur les données personnelles, fond des pastilles d'icône dans les états vides. |
| `accent-light` | `#C4B5FD` | Étoile du logo, étoile décorative de la carte compteur, liseré des commentaires internes. |

**Pourquoi le violet ?** Les statuts occupent déjà le bleu vif, l'ambre, le vert, le rouge et le gris. Le violet est la seule grande famille de couleurs encore libre : il ne peut être confondu avec aucun d'eux. Un doré, par exemple, aurait ressemblé à *En cours*. `[HYPOTHÈSE sur la teinte]`

**Règles strictes :**
- l'accent **n'apparaît jamais** dans un badge, dans un élément en forme de pilule, ni sur une information de statut ou de priorité ;
- il n'est **jamais la couleur d'un bouton** : le bouton principal reste bleu ;
- au plus quelques touches par écran : c'est un rehaut, pas une deuxième couleur principale.

| Token | Valeur | Usage | À ne pas faire |
|---|---|---|---|
| `primary` | `#1E3A8A` | Bouton principal, liens, élément actif du menu, carte du compteur « à traiter ». | Ne pas l'utiliser en grand aplat décoratif. |
| `primary-hover` | `#1E40AF` | Survol du bouton principal. | — |
| `primary-soft` | `#EEF2FF` | Fond de l'élément actif du menu latéral, ligne sélectionnée. | — |
| `focus-ring` | `#2563EB` | Contour visible autour de l'élément sélectionné au clavier. | Ne jamais le supprimer. |
| `background` | `#FFFFFF` | Fond des cartes, du formulaire et des tableaux. | — |
| `surface-muted` | `#F8FAFC` | Fond général de l'espace interne, survol d'une ligne de tableau. | — |
| `border` | `#E2E8F0` | Séparateurs et bordures de cartes. | Pas pour les champs de saisie (trop pâle). |
| `border-input` | `#8792A2` | Bordure des champs de saisie et des boutons secondaires (contraste 3,15:1, suffisant pour repérer un champ). | — |
| `text` | `#0F172A` | Texte principal. | — |
| `text-muted` | `#475569` | Texte secondaire : dates, aides sous les champs, en-têtes de colonnes. | — |
| `danger` | `#B91C1C` | Messages d'erreur, bouton « Supprimer », bordure d'un champ en erreur. | Ne pas l'utiliser pour la priorité *Urgente* (qui a son badge). |
| `success` | `#15803D` | Confirmation d'une action réussie. | — |

### Couleurs des statuts et de la priorité `[HYPOTHÈSE]`

Chaque statut a une couleur, mais **le mot est toujours écrit** : la couleur aide l'œil, elle n'est jamais la seule information (exigence FR-19 et accessibilité).

| Badge | Fond | Texte | Contraste |
|---|---|---|---|
| **Nouvelle** | `{colors.status-nouvelle-bg}` bleu clair | `{colors.status-nouvelle-fg}` | 7,15:1 |
| **En cours** | `{colors.status-en-cours-bg}` ambre clair | `{colors.status-en-cours-fg}` | 6,37:1 |
| **Traitée** | `{colors.status-traitee-bg}` vert clair | `{colors.status-traitee-fg}` | 6,49:1 |
| **Urgente** (priorité, Should) | `{colors.urgent-bg}` rouge clair | `{colors.urgent-fg}` + icône « ! » | 6,80:1 |
| **Sans activité** (Should), **Désactivé(e)** | `{colors.inactive-bg}` gris | `{colors.inactive-fg}` | 6,92:1 |

Tous les textes respectent le niveau **WCAG AA** : un contraste d'au moins 4,5:1, c'est-à-dire que le texte est assez foncé par rapport à son fond pour être lu par une personne qui voit mal. Le bleu principal sur blanc atteint 10,36:1.

Pas de mode sombre en version 1. `[HYPOTHÈSE]`

## Typography

Une seule police, **Inter**, avec repli sur la police du système si elle ne charge pas. `[HYPOTHÈSE]` Les références (`NOVA-2026-0042`) sont écrites dans une police à **chasse fixe** (tous les caractères ont la même largeur), pour qu'on les lise et les dicte sans erreur.

| Rôle | Taille / graisse | Où |
|---|---|---|
| `page-title` | 24 px, semi-gras | Titre de chaque page (« Demandes », « Déposer une demande »). |
| `section-title` | 18 px, semi-gras | Titres de blocs (« Historique », « Vos coordonnées »). |
| `body` | 16 px | Texte courant, **champs du formulaire**. 16 px minimum dans les champs : en dessous, les iPhone zooment tout seuls sur la page. |
| `body-sm` | 14 px | Lignes du tableau des demandes, détails secondaires. |
| `label` | 14 px, moyen | Étiquettes des champs, texte des boutons. |
| `caption` | 13 px | Dates de l'historique, aides, compteur de caractères. |
| `counter` | 32 px, gras | Le chiffre du compteur « à traiter ». |
| `reference` | 14 px, chasse fixe | Références des demandes. Sur l'écran de confirmation, elle est agrandie à 28 px. |

Règles : pas de texte en majuscules continues, sauf les en-têtes de colonnes (`caption`, majuscules, couleur `{colors.text-muted}`). Pas d'italique pour transmettre une information.

## Layout & Spacing

Tous les espacements suivent une **échelle de 4 px** (4, 8, 12, 16, 24, 32…). Ainsi, les écrans restent réguliers sans calcul au cas par cas.

**Formulaire public (téléphone d'abord)** — décision d'Aurel :
- une seule colonne, marges latérales de `{spacing.gutter-mobile}` (16 px) ;
- sur grand écran, le formulaire reste centré et ne dépasse pas `{spacing.form-max-width}` (560 px) ;
- aucun défilement horizontal à 360 px de large (NFR-12).

**Espace interne (ordinateur d'abord)** — décision d'Aurel :
- menu latéral fixe à gauche, de `{spacing.sidebar-width}` (240 px) ; `[HYPOTHÈSE]`
- contenu limité à `{spacing.content-max-width}` (1 200 px), marges de `{spacing.gutter-desktop}` ;
- page de détail en deux colonnes : le contenu de la demande à gauche (environ 2/3) et le panneau d'actions à droite (environ 1/3) ; `[HYPOTHÈSE]`
- sur tablette (moins de 1 024 px), le menu se replie derrière un bouton « Menu » et le panneau d'actions passe sous le contenu.

**Hauteur des contrôles :** boutons et champs font `{spacing.control-height}` (44 px), la taille minimale confortable pour un doigt.

## Elevation & Depth

Trois niveaux de profondeur, tous très doux :
1. **Posé** : cartes, barre d'outils de la liste, tableau et panneau d'actions. Bordure fine `{colors.border}` + ombre douce `{components.shadow-soft.value}`. Le relief se devine, il ne se voit pas.
2. **En relief** : le bouton principal et la carte compteur ont une ombre légèrement bleutée. Elle attire l'œil vers l'action à faire.
3. **Au premier plan** : les fenêtres de confirmation et les toasts. Ombre portée nette et voile sombre derrière la fenêtre.

Un seul dégradé est permis : l'encadré de la référence sur l'écran de confirmation, du blanc vers `{colors.accent-soft}`. C'est le moment clé du parcours de Claire.

## Shapes

Des coins **bien arrondis** donnent un aspect doux et moderne, tout en restant sérieux :
- `{rounded.sm}` (6 px) : champs de saisie, badges *Urgente* et *Sans activité* ;
- `{rounded.md}` (10 px) : boutons, éléments du menu, messages d'alerte, filtres ;
- `{rounded.lg}` (14 px) : cartes, fenêtres de confirmation, carte du compteur, tableau ;
- `{rounded.xl}` (20 px) : grands conteneurs isolés (cadre d'une maquette, futur écran d'accueil éventuel) ;
- `{rounded.full}` (pilule) : **réservé aux badges de statut** et aux pastilles rondes d'icônes. Un statut se reconnaît ainsi à sa forme autant qu'à sa couleur.

## Components

Aspect visuel de chaque composant. Leur comportement est décrit dans [EXPERIENCE.md, Component Patterns](EXPERIENCE.md#component-patterns).

### Icônes

Petites icônes **au trait** (un simple contour, sans remplissage), aux extrémités arrondies, comme celles de la famille open source Lucide (`{components.icon}`). `[HYPOTHÈSE sur la famille]`
- **Tailles** : 18 px par défaut, 16 px dans les boutons et les liens, 13 px dans les badges.
- **Couleur** : celle du texte voisin, sauf pour les icônes de titres de blocs et l'élément actif du menu, qui sont en `{colors.accent}`.
- **Toujours accompagnées d'un mot** : une icône seule ne porte jamais l'information. Elle est ignorée par les lecteurs d'écran.
- **Correspondances** : Demandes = boîte de réception · Nouvelle demande = plus dans un carré · Recherche = loupe · Filtres = curseurs · Demandeur = personne · Demande = bulle · Informations = « i » · Historique = horloge · Commentaire interne = cadenas · Urgente = triangle « ! » · Sans activité = horloge · Erreur = cercle « ! » · Succès = coche · Supprimer = corbeille · Se déconnecter = porte et flèche · Envoyer = avion en papier · Téléphone, Email, Données personnelles = combiné, enveloppe, bouclier.
- Les flèches et les coches tapées au clavier (←, ✓, ▾) sont remplacées par ces icônes.

### Boutons

| Variante | Aspect | Usage |
|---|---|---|
| **Principal** (`button-primary`) | Fond `{colors.primary}`, texte blanc, 44 px de haut. | **Une seule fois par écran** : « Envoyer ma demande », « Se connecter », « Enregistrer ». |
| **Secondaire** (`button-secondary`) | Fond blanc, bordure `{colors.border-input}`, texte foncé. | Actions annexes : « Réinitialiser », « Annuler ». |
| **Discret** (`button-ghost`) | Texte bleu sans fond. | Liens d'action dans le texte : « Me l'attribuer », « Voir tout ». |
| **Danger** (`button-danger`) | Fond `{colors.danger}`, texte blanc. | Uniquement dans la fenêtre qui confirme une suppression. |

États : au survol, la couleur fonce légèrement. Au clavier, un contour `{components.focus-outline}` apparaît. Désactivé : opacité 50 % et curseur « interdit ». Pendant un envoi : le texte devient « Envoi en cours… », précédé d'un petit indicateur tournant.

### Champs de saisie

- L'étiquette est **toujours visible au-dessus du champ**, jamais seulement à l'intérieur (en gris pâle, elle disparaîtrait à la saisie).
- Un champ obligatoire porte un astérisque rouge `*`, et la phrase « Les champs marqués * sont obligatoires » figure en haut du formulaire.
- Une **aide** éventuelle s'affiche sous le champ, en `{typography.caption}` `{colors.text-muted}`.
- **En erreur** (`input-error`) : bordure rouge de 2 px, icône « ! » et message rouge sous le champ. Le contenu saisi reste en place.
- Pour la description, un **compteur de caractères** (« 124 / 5 000 ») s'affiche sous la zone de texte.

### Badges

Petits libellés colorés (statut, priorité, mention « Sans activité », compte désactivé). Voir le tableau des couleurs ci-dessus. Ils mesurent 24 px de haut, avec un texte en `{typography.caption}` semi-gras.

### Carte compteur « à traiter »

Le **compteur** est le premier élément que Karim voit en arrivant. C'est une carte cliquable en haut de la liste, sur fond `{colors.primary}`, avec le chiffre en `{typography.counter}` blanc et le libellé « à traiter ». C'est le seul grand aplat de couleur de l'espace interne. Une grande étoile du logo, en `{colors.accent-light}` très transparente (35 %), déborde dans le coin supérieur droit. Elle relie le compteur à l'identité de Nova sans gêner la lecture du chiffre.

### Tableau des demandes

- En-têtes de colonnes en `{typography.caption}` majuscules, couleur `{colors.text-muted}`.
- Lignes de 56 px de haut, séparées par `{colors.border}`, fond `{colors.surface-muted}` au survol.
- La référence est écrite en `{typography.reference}` et l'objet en semi-gras. Une demande *Urgente* porte son badge **devant** l'objet.

### Menu latéral

Fond blanc, bordure droite `{colors.border}`, logo en haut. Chaque élément a son icône. Élément actif : `{components.sidebar-item-active}`, c'est-à-dire un fond bleu très clair, une icône violette et une barre violette de 3 px à gauche. En bas du menu : le nom de la personne connectée, son rôle, le bouton « Se déconnecter » et le numéro de version (NFR-4).

### Historique

Une **frise verticale** : chaque événement est une ligne avec un point, l'action (« Statut : Nouvelle → En cours »), l'auteur en semi-gras et la date en `{typography.caption}`. Les commentaires internes s'affichent dans un encadré gris `{colors.surface-subtle}`, pour les distinguer des changements automatiques.

### Messages d'alerte

- `alert-error` : fond rouge clair, barre rouge à gauche. Pour une erreur qui concerne toute la page (« L'envoi a échoué, réessayez »).
- `alert-success` : fond vert clair, barre verte à gauche. Pour une confirmation courte (« Compte créé »).
- `alert-info` : fond bleu très clair, barre bleue à gauche, icône « i ». Pour une information neutre (« Votre session a expiré », « Cette demande a été modifiée par Lucas »).

### Toast

Petit message temporaire en bas à droite (`{components.toast}`) : fond foncé `{colors.text}`, texte blanc, coins de 12 px, ombre nette. Une pastille verte avec une coche pour un succès ; une pastille rouge avec « ! » pour une erreur.

### Petits contrôles

| Composant | Aspect |
|---|---|
| **Bouton de filtre** (`filter-button`) | 36 px de haut, bordure grise, libellé « Statut : **Tous** » et chevron. Actif : fond `{colors.primary-soft}`, bordure et texte bleus. Les filtres Should sont dessinés en pointillés dans les maquettes, uniquement pour les repérer. |
| **Case à cocher** (`checkbox`) | Carré de 22 px, coins de 6 px. Cochée : fond `{colors.primary}`, coche blanche. Toujours avec son libellé cliquable à droite. |
| **Liste déroulante** | Même aspect qu'un champ (`input`), avec un chevron à droite. |
| **Choix Normale / Urgente** (`segmented-control`) | Deux boutons accolés, 40 px de haut. Choix actif : fond `{colors.primary}`, texte blanc. |
| **Pagination** | Texte « Demandes 1 à 25 sur 42 · Page 1 sur 2 », puis deux boutons secondaires de 36 px « Précédente » et « Suivante », avec chevrons. Le bouton inutile est grisé. |
| **Fil d'Ariane** | En `{typography.caption}`, avec le lien « ← Demandes » en bleu, puis la référence en chasse fixe. |
| **Squelette de chargement** (`skeleton`) | Blocs `{colors.border}` aux coins de 6 px, à la forme du contenu attendu. Pas d'animation. |
| **Pastille d'icône** (`icon-bubble`) | Rond de 44 px. Violet clair et icône violette dans les états vides ; rouge clair et icône rouge pour une erreur ou une suppression. |

### Fenêtre de confirmation

Fenêtre centrée de 440 px de large au plus, avec un titre, un texte explicatif et deux boutons alignés à droite (« Annuler » secondaire, action principale ou danger).

## Do's and Don'ts

| À faire | À éviter |
|---|---|
| Un seul bouton principal bleu par écran. | Deux boutons bleus côte à côte : on ne sait plus lequel est le bon. |
| Toujours écrire le statut en toutes lettres dans son badge. | Un simple point de couleur pour indiquer un statut. |
| Étiquette visible au-dessus de chaque champ. | Un texte gris dans le champ qui sert d'étiquette. |
| Afficher les références en police à chasse fixe. | Couper une référence sur deux lignes. |
| Réserver le rouge aux erreurs, au danger et à la priorité *Urgente*. | Du rouge pour attirer l'œil sur autre chose. |
| Garder le contour bleu visible au clavier. | Supprimer le contour de sélection « parce que c'est plus joli ». |
| Des champs en 16 px minimum sur téléphone. | Des champs plus petits, qui font zoomer l'iPhone. |
| Utiliser le violet par petites touches (icônes, liserés, logo). | Mettre du violet dans un badge, un bouton ou un statut. |
| Une icône toujours accompagnée de son mot. | Une icône seule pour dire quelque chose d'important. |
| Garder des ombres à peine visibles. | Des ombres franches sur les cartes, qui alourdissent l'écran. |

---

## Hypothèses de ce document

Choix proposés par le rédacteur, **tous confirmés par Aurel le 8 novembre 2026**.

| # | Hypothèse | Pourquoi |
|---|---|---|
| D-H1 | Logo : carré bleu arrondi avec une étoile violette à quatre branches, suivi de « **Nova** Services ». | Aurel a demandé un logo simple, sans en fournir. L'étoile évoque le mot *nova*. |
| D-H8 | Accent violet améthyste `#6D28D9`. | La seule famille de couleurs qui ne ressemble à aucun statut. |
| D-H9 | Icônes au trait, de la famille type Lucide (open source). | Style moderne et fin, cohérent avec Inter. La bibliothèque exacte sera choisie à l'architecture. |
| D-H2 | Police Inter, avec repli sur la police du système. | Très lisible à l'écran, gratuite, sobre. |
| D-H3 | Couleurs des statuts : bleu, ambre, vert ; rouge pour *Urgente*. | Convention répandue (nouveau, en attente, terminé). |
| D-H4 | Pas de mode sombre en v1. | Non demandé par le PRD. |
| D-H5 | Menu latéral à gauche dans l'espace interne. | Place pour la section Administration sans encombrer le haut de l'écran. |
| D-H6 | Détail en deux colonnes (contenu et panneau d'actions). | Les actions restent visibles pendant la lecture. |
| D-H7 | Aucune bibliothèque de composants imposée ; tokens pensés pour Tailwind CSS 4, déjà installé. | Le choix technique final revient à l'architecture. |
