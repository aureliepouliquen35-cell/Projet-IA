#!/usr/bin/env bash
# Restauration d'une sauvegarde de nuit (story 5.1, AD-18, NFR-7).
#
# Lancé par .github/workflows/restauration.yml (« Restaurer une sauvegarde »).
# Mode d'emploi : docs/maintenance.md, partie « Restaurer une sauvegarde ».
#
# Dans l'ordre, et sans rien modifier tant qu'un contrôle échoue :
#   1. contrôle la cible (dev par défaut, ou prod avec la phrase de
#      confirmation), le mot de passe de chiffrement et les adresses ; pour
#      dev, l'adresse doit viser un autre projet que prod ;
#   2. vérifie que la base visée est joignable et a les migrations de Nova
#      (tables public.demandes et public.evenements) ;
#   3. télécharge l'artefact choisi (ou la plus récente sauvegarde non
#      expirée), le déchiffre dans un dossier temporaire effacé à la fin, même
#      en cas d'échec, et vérifie que c'est une sauvegarde de Nova ;
#   4. remplace les données de Nova (schémas public et auth) dans la base
#      visée, en une seule transaction : vide les tables de Nova présentes
#      dans la sauvegarde, recharge leurs lignes, puis
#      compare le nombre de demandes et de lignes d'historique avec la
#      sauvegarde. Au moindre écart ou erreur, tout est annulé.
#
# Seules les données sont restaurées : la structure vient des migrations
# (AD-16), que la base visée doit déjà avoir. roles.sql et structure.sql ne
# sont pas rechargés.
#
# Variables d'environnement :
#   RESTAURATION_CIBLE           dev (par défaut) ou prod
#   RESTAURATION_SAUVEGARDE      nom de l'artefact (vide : la plus récente)
#   RESTAURATION_CONFIRMATION    phrase exigée pour prod
#   RESTAURATION_URL_BASE_DEV    adresse « Session pooler » de la base dev (secret)
#   SAUVEGARDE_URL_BASE_PROD     adresse « Session pooler » de la base prod (secret)
#   SAUVEGARDE_MOT_DE_PASSE      mot de passe de chiffrement (secret)
#   GITHUB_REPOSITORY, GH_TOKEN  dépôt et jeton pour `gh` (fournis par la tâche)
#
# Les journaux d'exécution de GitHub sont publics : rien ici n'affiche un
# secret, l'identifiant d'un projet ni une donnée de demandeur (les messages
# de psql, qui peuvent citer une ligne de données, ne sont jamais affichés :
# seul le code d'erreur l'est). Ne jamais ajouter `set -x`, ni `--dry-run`
# ou `--debug`.

set -euo pipefail
umask 077

readonly LONGUEUR_MINIMALE_MOT_DE_PASSE=32
readonly AIDE="voir docs/maintenance.md, partie « Restaurer une sauvegarde »"
readonly EXPORTS=(roles.sql structure.sql donnees.sql)
readonly PHRASE_PRODUCTION="RESTAURER LA PRODUCTION"
readonly MOTIF_NOM='^sauvegarde-prod-[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{4}$'
# Code d'erreur propre à la restauration : comptes différents après chargement.
readonly CODE_COMPTES="NV001"

# Tables de la sauvegarde (telles qu'écrites dans donnees.sql) et nombre de
# lignes de chacune (nom sans guillemets, par exemple public.demandes).
TABLES=()
declare -A COMPTES=()

dans_github() {
  [[ "${GITHUB_ACTIONS:-}" == "true" ]]
}

arreter() {
  if dans_github; then
    echo "::error::$*" >&2
  else
    echo "Erreur : $*" >&2
  fi
  exit 1
}

informer() {
  echo "$*"
}

# Masque une valeur dans les journaux d'exécution de GitHub. Hors de GitHub,
# ne fait rien (la commande afficherait la valeur dans le terminal).
masquer() {
  if dans_github && [[ -n "$1" ]]; then
    echo "::add-mask::$1"
  fi
}

# Contrôle une adresse « Session pooler », sans jamais l'afficher. Écrit son
# utilisateur (postgres.<identifiant du projet>) dans UTILISATEUR.
controler_url() { # <nom du secret> <projet : dev ou prod>
  local secret="$1" projet="$2"
  local url="${!secret:-}"

  [[ -n "$url" ]] ||
    arreter "Le secret $secret est vide ou absent : créez-le dans Settings › Secrets and variables › Actions du dépôt ($AIDE)."

  # Aucun espace ni retour à la ligne nulle part. Le mot de passe de la base
  # va jusqu'au dernier « @ ».
  local motif='^postgres(ql)?://([^:/@[:space:]]+):([^[:space:]]*)@([^@:/?[:space:]]+):([0-9]+)(/[^?[:space:]]*)?(\?[^[:space:]]*)?$'
  if [[ ! "$url" =~ $motif ]]; then
    arreter "Le secret $secret n'a pas la forme attendue (postgresql://utilisateur:mot-de-passe@hôte:5432/postgres) : copiez l'adresse « Session pooler » du projet $projet ($AIDE)."
  fi
  local utilisateur="${BASH_REMATCH[2]}"
  local mot_de_passe_base="${BASH_REMATCH[3]}"
  local hote="${BASH_REMATCH[4]}"
  local port="${BASH_REMATCH[5]}"
  masquer "$mot_de_passe_base"

  # Supabase écrit [YOUR-DATABASE-PASSWORD] (ou [YOUR-PASSWORD] selon la version).
  if [[ -z "$mot_de_passe_base" || "$mot_de_passe_base" == *"YOUR-"*"PASSWORD"* ]]; then
    arreter "L'adresse $secret ne contient pas le mot de passe de la base : remplacez [YOUR-DATABASE-PASSWORD], crochets compris, par le mot de passe de la base $projet rangé dans votre gestionnaire de mots de passe ($AIDE)."
  fi
  if [[ "$mot_de_passe_base" == *"["* || "$mot_de_passe_base" == *"]"* ]]; then
    arreter "Le mot de passe de la base, dans $secret, est encore entouré de crochets [ ] : ils font partie de ce qu'il faut remplacer. Gardez seulement le mot de passe, entre « : » et « @ » ($AIDE)."
  fi
  # Seulement des caractères qui s'écrivent tels quels dans une adresse : le
  # masque des journaux couvre alors exactement le mot de passe.
  if [[ ! "$mot_de_passe_base" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    arreter "Le mot de passe de la base, dans $secret, contient des caractères spéciaux : dans le projet $projet, « Reset database password », choisissez un mot de passe fait seulement de lettres et de chiffres, rangez-le dans votre gestionnaire, puis mettez à jour le secret ($AIDE)."
  fi
  # L'utilisateur du « Session pooler » porte l'identifiant du projet : c'est
  # lui qui permet de distinguer dev de prod.
  if [[ "$hote" =~ ^db\..+\.supabase\.co$ || "$port" != "5432" || ! "$utilisateur" =~ ^postgres\.[A-Za-z0-9]+$ ]]; then
    arreter "L'adresse $secret n'est pas celle du « Session pooler » : la connexion directe (db.….supabase.co) est injoignable depuis GitHub et le port 6543 ne convient pas. Utilisez l'adresse « Session pooler » (port 5432, utilisateur postgres.<identifiant du projet>) du projet $projet ($AIDE)."
  fi

  UTILISATEUR="$utilisateur"
}

# Contrôle le mot de passe de chiffrement, sans jamais l'afficher.
controler_mot_de_passe() {
  local mot_de_passe="${SAUVEGARDE_MOT_DE_PASSE:-}"

  [[ -n "$mot_de_passe" ]] ||
    arreter "Le secret SAUVEGARDE_MOT_DE_PASSE est vide ou absent : créez-le dans Settings › Secrets and variables › Actions du dépôt, depuis l'entrée « Nova – chiffrement des sauvegardes » de votre gestionnaire de mots de passe ($AIDE)."
  if (( ${#mot_de_passe} < LONGUEUR_MINIMALE_MOT_DE_PASSE )); then
    arreter "Le secret SAUVEGARDE_MOT_DE_PASSE est trop court ($LONGUEUR_MINIMALE_MOT_DE_PASSE caractères au moins) : ce n'est pas le mot de passe de chiffrement. Recopiez-le depuis votre gestionnaire de mots de passe ($AIDE)."
  fi
}

# gpg avec un dossier de clés jetable, sans mémoriser le mot de passe ; le
# mot de passe arrive par le descripteur 3, jamais en argument. gpg sort en 0
# aussi sur un message OpenPGP non chiffré (gpg --store) : on exige donc que
# son état annonce un vrai déchiffrement réussi.
dechiffrer() { # <entrée> <sortie> <fichier d'état>
  gpg --batch --yes --quiet --no-tty --no-symkey-cache --pinentry-mode loopback \
    --passphrase-fd 3 --status-fd 1 --decrypt \
    --output "$2" "$1" 3< <(printf '%s' "$SAUVEGARDE_MOT_DE_PASSE") >"$3" &&
    grep -q '^\[GNUPG:\] BEGIN_DECRYPTION' "$3" &&
    grep -q '^\[GNUPG:\] DECRYPTION_OKAY' "$3"
}

nettoyer() {
  if [[ -n "${TEMPORAIRE:-}" && -d "$TEMPORAIRE" ]]; then
    GNUPGHOME="$TEMPORAIRE/gnupg" gpgconf --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf "$TEMPORAIRE"
  fi
}

# Durée depuis le début du script, en minutes et secondes.
duree() {
  printf '%d min %02d s' $((SECONDS / 60)) $((SECONDS % 60))
}

# Vérifie que la base visée répond et qu'elle a les migrations de Nova. Les
# messages de psql ne sont pas affichés (ils citent l'utilisateur, donc
# l'identifiant du projet) : on n'en tire que la cause.
controler_base() { # <adresse> <cible> <nom du secret>
  local url="$1" cible="$2" secret="$3"
  local reponse
  if ! reponse="$(PGCONNECT_TIMEOUT=30 psql "$url" \
    --no-psqlrc --quiet --tuples-only --no-align \
    -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
    2>"$TEMPORAIRE/erreurs.txt" <<'SQL'
select to_regclass('public.demandes') is not null
   and to_regclass('public.evenements') is not null;
SQL
  )"; then
    if grep -q "password authentication failed" "$TEMPORAIRE/erreurs.txt"; then
      arreter "La base $cible refuse le mot de passe contenu dans $secret : recopiez le mot de passe de la base $cible depuis votre gestionnaire, puis mettez à jour le secret ($AIDE). Rien n'a été modifié."
    fi
    if grep -qi "tenant or user not found" "$TEMPORAIRE/erreurs.txt"; then
      arreter "Le projet de l'adresse $secret est inconnu de Supabase : recopiez l'adresse « Session pooler » du projet $cible ($AIDE). Rien n'a été modifié."
    fi
    arreter "La base $cible est injoignable : vérifiez dans Supabase que le projet $cible n'est pas en pause (sinon « Restore project »), puis relancez ($AIDE). Rien n'a été modifié."
  fi
  [[ "$reponse" == "t" ]] ||
    arreter "La base $cible n'a pas les tables de Nova (public.demandes, public.evenements) : appliquez d'abord les migrations (docs/deploiement.md, partie « Installation », étape 3), puis relancez. Rien n'a été modifié."
}

# Choisit l'artefact : celui demandé, ou le plus récent non expiré. Écrit son
# nom dans NOM et le numéro de l'exécution qui l'a produit dans EXECUTION.
choisir_sauvegarde() { # <nom demandé, ou vide>
  local demande="$1"
  local liste valides
  # Une ligne par artefact : nom, expiré (true/false), exécution, branche,
  # dépôt du commit, dépôt de la tâche (séparés par des tabulations).
  liste="$(gh api --paginate "repos/$GITHUB_REPOSITORY/actions/artifacts?per_page=100" \
    --jq '.artifacts[] | select(.name | startswith("sauvegarde-prod-")) | [.name, (.expired | tostring), (.workflow_run.id | tostring), (.workflow_run.head_branch // ""), (.workflow_run.head_repository_id | tostring), (.workflow_run.repository_id | tostring)] | @tsv')" ||
    arreter "La liste des sauvegardes n'a pas pu être lue sur GitHub : relancez ; si cela se reproduit, vérifiez que la tâche a le droit « actions: read » ($AIDE). Rien n'a été modifié."

  # Le dépôt est public : n'importe quelle tâche (une autre branche, une
  # demande de fusion venue d'une copie du dépôt) peut publier un artefact de
  # ce nom. Seuls comptent ceux d'une exécution sur main, dans ce dépôt.
  valides="$(awk -F '\t' '
    $4 == "main" && $5 == $6 && $6 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ &&
    $1 ~ /^sauvegarde-prod-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]-[0-9][0-9][0-9][0-9]$/ { print $1 "\t" $2 "\t" $3 }
  ' <<<"$liste")"

  if [[ -n "$demande" ]]; then
    awk -F '\t' -v nom="$demande" '$1 == nom { trouve = 1 } END { exit !trouve }' <<<"$valides" ||
      arreter "La sauvegarde $demande est introuvable : recopiez le nom d'un artefact de la tâche « Sauvegarde de nuit » (partie Artifacts d'une exécution), ou laissez le champ vide pour la plus récente ($AIDE). Rien n'a été modifié."
    EXECUTION="$(awk -F '\t' -v nom="$demande" '$1 == nom && $2 == "false" { print $3; exit }' <<<"$valides")"
    [[ -n "$EXECUTION" ]] ||
      arreter "La sauvegarde $demande a expiré (une sauvegarde est gardée 7 jours) : choisissez-en une plus récente, ou laissez le champ vide pour la plus récente ($AIDE). Rien n'a été modifié."
    NOM="$demande"
  else
    # Les noms portent la date et l'heure : le plus grand est le plus récent.
    local choix
    choix="$(awk -F '\t' '
      $2 == "false" && $1 > dernier { dernier = $1; execution = $3 }
      END { if (dernier != "") print dernier "\t" execution }
    ' <<<"$valides")"
    NOM="${choix%%$'\t'*}"
    EXECUTION="${choix#*$'\t'}"
    [[ -n "$choix" ]] ||
      arreter "Aucune sauvegarde disponible : aucune sauvegarde de nuit des 7 derniers jours n'a été trouvée. Vérifiez la tâche « Sauvegarde de nuit » dans l'onglet Actions ($AIDE). Rien n'a été modifié."
  fi
}

# Lit donnees.sql et prépare le chargement :
#   - donnees-chargees.sql : l'export sans les lignes \restrict/\unrestrict
#     (refusées par un psql ancien), réduit aux données de Nova : les schémas
#     public (demandes, historique, réglages, journal…) et auth (comptes de
#     connexion), tables et séquences. Tout le reste est laissé tel quel dans
#     la base visée : l'export de la CLI contient aussi les schémas gérés par
#     Supabase (storage, cron, net, supabase_functions…), que Nova n'utilise
#     pas et que le rôle postgres n'a pas le droit de vider (code 42501).
#     L'historique des migrations du service des comptes (auth.schema_migrations)
#     est exclu aussi : sa version peut différer entre dev et prod ;
#   - tables.txt : chaque table chargée et son nombre de lignes.
# Lecture avec un état (dans ou hors d'un bloc COPY, fin sur la ligne « \. ») :
# une ligne de données qui commence par « COPY » n'est pas prise pour une table.
lire_donnees() {
  awk -v donnees="$TEMPORAIRE/donnees-chargees.sql" -v liste="$TEMPORAIRE/tables.txt" '
    # Une table ou une séquence de Nova (nom sans guillemets).
    function de_nova(nom) {
      return (nom ~ /^(public|auth)\.[^.]+$/ && nom != "auth.schema_migrations")
    }
    dans {
      if ($0 == "\\.") {
        dans = 0
        if (garder) print table "\t" lignes > liste
      } else {
        lignes++
      }
      if (garder) print > donnees
      next
    }
    /^\\(un)?restrict [A-Za-z0-9]+$/ { next }
    /^COPY [^ ]+ .*FROM stdin;$/ {
      dans = 1; lignes = 0; table = $2
      nom = table; gsub(/"/, "", nom)
      garder = de_nova(nom)
      if (garder) print > donnees
      next
    }
    # Remise à jour d une séquence : seulement celles de Nova.
    /^SELECT pg_catalog\.setval\(/ {
      sequence = $0
      sub("^SELECT pg_catalog[.]setval[(]\047", "", sequence)
      sub("\047.*$", "", sequence)
      gsub(/"/, "", sequence)
      if (de_nova(sequence)) print > donnees
      next
    }
    { print > donnees }
    END {
      printf "" > liste
      printf "" > donnees
      if (dans) exit 3
    }
  ' "$TEMPORAIRE/exports/donnees.sql" ||
    arreter "L'export donnees.sql de la sauvegarde $NOM est incomplet (bloc de données non terminé) : choisissez une autre sauvegarde ($AIDE). Rien n'a été modifié."
}

# Écrit le SQL de la restauration : vider, charger, compter.
preparer_restauration() {
  local identifiant='("[^"]+"|[a-z_][a-z0-9_$]*)'
  local table lignes nom

  while IFS=$'\t' read -r table lignes; do
    [[ "$table" =~ ^$identifiant\.$identifiant$ && "$lignes" =~ ^[0-9]+$ ]] ||
      arreter "L'export donnees.sql de la sauvegarde $NOM est illisible : choisissez une autre sauvegarde ($AIDE). Rien n'a été modifié."
    TABLES+=("$table")
    nom="${table//\"/}"
    COMPTES["$nom"]="$lignes"
  done <"$TEMPORAIRE/tables.txt"

  [[ -n "${COMPTES[public.demandes]:-}" && -n "${COMPTES[public.evenements]:-}" ]] ||
    arreter "La sauvegarde $NOM ne contient pas les données de public.demandes et public.evenements : ce n'est pas une sauvegarde de Nova ($AIDE). Rien n'a été modifié."

  {
    # Clés étrangères et déclencheurs suspendus pendant le chargement ; une
    # règle d'accès (RLS) qui filtrerait une ligne provoque une erreur au
    # lieu d'un effacement partiel.
    echo "set session_replication_role = replica;"
    echo "set row_security = off;"
    # DELETE plutôt que TRUNCATE : droits du rôle postgres sur auth.* chez Supabase.
    for table in "${TABLES[@]}"; do
      echo "delete from $table;"
    done
    cat "$TEMPORAIRE/donnees-chargees.sql"
    echo
    cat <<SQL
do \$\$
begin
  if (select count(*) from public.demandes) <> ${COMPTES[public.demandes]}
     or (select count(*) from public.evenements) <> ${COMPTES[public.evenements]} then
    raise exception using errcode = '$CODE_COMPTES', message = 'comptes différents après la restauration';
  end if;
end
\$\$;
SQL
  } >"$TEMPORAIRE/restauration.sql"
}

# Décrit l'instruction de restauration.sql à la ligne donnée, d'après le SQL
# que le script a lui-même écrit : jamais le texte de la ligne ni un message
# de psql, seulement des noms de table, de séquence ou de réglage.
etape() { # <numéro de ligne>
  awk -v cible="$1" '
    function nom(texte) { gsub(/"/, "", texte); return texte }
    function fin(libelle) { print libelle; trouve = 1; exit }
    dans {
      if (NR == cible) fin("chargement de la table " table)
      if ($0 == "\\.") dans = 0
      next
    }
    /^COPY [^ ]+ .*FROM stdin;$/ {
      dans = 1; table = nom($2)
      if (NR == cible) fin("chargement de la table " table)
      next
    }
    /^do \$\$$/ { controle = 1 }
    NR == cible {
      if (controle) fin("contrôle du nombre de demandes et de lignes d historique")
      if ($0 ~ /^delete from [^ ]+;$/) { t = $3; sub(/;$/, "", t); fin("vidage de la table " nom(t)) }
      if ($0 ~ /^SELECT pg_catalog\.setval\(/) {
        s = $0; sub("^SELECT pg_catalog[.]setval[(]\047", "", s); sub("\047.*$", "", s)
        fin("remise à jour de la séquence " nom(s))
      }
      if (match($0, /^[Ss][Ee][Tt] [a-z_]+/)) fin("réglage " substr($0, 5, RLENGTH - 4))
      fin("instruction n° " NR " de la restauration")
    }
    END { if (!trouve) print "instruction n° " cible " de la restauration" }
  ' "$TEMPORAIRE/restauration.sql" | sed "s/d historique/d'historique/"
}

# Charge le tout en une seule transaction. En cas d'erreur, psql s'arrête et
# la transaction est annulée : la base visée reste comme avant.
charger() { # <adresse> <cible>
  local url="$1" cible="$2"
  local demandes="${COMPTES[public.demandes]}" evenements="${COMPTES[public.evenements]}"

  informer "Restauration de $NOM sur la base $cible (${#TABLES[@]} tables, une seule transaction)…"
  if PGCONNECT_TIMEOUT=30 psql "$url" \
    --no-psqlrc --quiet --single-transaction \
    -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never \
    -f "$TEMPORAIRE/restauration.sql" \
    >/dev/null 2>"$TEMPORAIRE/erreurs.txt"; then
    return 0
  fi

  # Avec VERBOSITY=sqlstate, psql n'écrit que « ERROR:  <code> » : on garde
  # seulement le code, jamais le reste (qui pourrait citer une ligne).
  # psql préfixe l'erreur par « psql:<fichier>:<ligne>: » : la ligne donne
  # l'étape en cause.
  local erreur code ligne lieu=""
  erreur="$(grep -oE ':[0-9]+: ERROR: +[0-9A-Z]{5}$' "$TEMPORAIRE/erreurs.txt" | head -n 1 || true)"
  if [[ -z "$erreur" ]]; then
    erreur="$(grep -oE 'ERROR: +[0-9A-Z]{5}$' "$TEMPORAIRE/erreurs.txt" | head -n 1 || true)"
  fi
  code="$(grep -oE '[0-9A-Z]{5}$' <<<"$erreur" || true)"
  ligne="$(grep -oE '^:[0-9]+:' <<<"$erreur" | tr -d ':' || true)"
  [[ -z "$ligne" ]] || lieu=", à l'étape « $(etape "$ligne") »"
  local annulee="la restauration est annulée, la base $cible est inchangée"
  case "$code" in
    "$CODE_COMPTES")
      arreter "Après le chargement, la base $cible ne compte pas $demandes demandes et $evenements lignes d'historique comme la sauvegarde : $annulee. Notez l'heure et le numéro de l'exécution pour le support ($AIDE)." ;;
    42P01 | 42703)
      arreter "Une table ou une colonne de la sauvegarde manque dans la base $cible (code $code$lieu) : $annulee. Appliquez d'abord les migrations (docs/deploiement.md, partie « Installation », étape 3), puis relancez." ;;
    42501)
      arreter "Droits insuffisants sur la base $cible (code $code$lieu) : $annulee. L'adresse n'est pas en cause (la connexion a réussi) : notez cette étape, l'heure et le numéro de l'exécution pour le support ($AIDE)." ;;
    "")
      arreter "La restauration s'est interrompue (connexion perdue ?) : $annulee. Relancez ; si cela se reproduit, notez l'heure et le numéro de l'exécution pour le support ($AIDE)." ;;
    *)
      arreter "La restauration a échoué (code d'erreur PostgreSQL $code$lieu) : $annulee. Notez ce code, cette étape, l'heure et le numéro de l'exécution pour le support ($AIDE)." ;;
  esac
}

restaurer() {
  local cible="${RESTAURATION_CIBLE:-dev}"
  [[ "$cible" == "dev" || "$cible" == "prod" ]] ||
    arreter "La cible doit être dev ou prod ($AIDE)."

  # Prod : phrase de confirmation exigée avant tout le reste.
  if [[ "$cible" == "prod" && "${RESTAURATION_CONFIRMATION:-}" != "$PHRASE_PRODUCTION" ]]; then
    arreter "Restaurer la production remplace toutes ses données par celles de la sauvegarde. Pour confirmer, relancez en recopiant exactement « $PHRASE_PRODUCTION » dans le champ de confirmation ($AIDE). Rien n'a été modifié."
  fi

  controler_mot_de_passe
  controler_url SAUVEGARDE_URL_BASE_PROD prod
  local utilisateur_prod="$UTILISATEUR"
  local url secret
  if [[ "$cible" == "dev" ]]; then
    controler_url RESTAURATION_URL_BASE_DEV dev
    # Même identifiant de projet : la « dev » serait la prod.
    [[ "${UTILISATEUR,,}" != "${utilisateur_prod,,}" ]] ||
      arreter "Le secret RESTAURATION_URL_BASE_DEV vise le même projet que SAUVEGARDE_URL_BASE_PROD : copiez l'adresse « Session pooler » du projet dev ($AIDE). Rien n'a été modifié."
    url="$RESTAURATION_URL_BASE_DEV"
    secret="RESTAURATION_URL_BASE_DEV"
  else
    url="$SAUVEGARDE_URL_BASE_PROD"
    secret="SAUVEGARDE_URL_BASE_PROD"
  fi

  # Nom de l'artefact, espaces autour retirés.
  local demande="${RESTAURATION_SAUVEGARDE:-}"
  demande="${demande#"${demande%%[![:space:]]*}"}"
  demande="${demande%"${demande##*[![:space:]]}"}"
  if [[ -n "$demande" && ! "$demande" =~ $MOTIF_NOM ]]; then
    arreter "Le nom de sauvegarde n'a pas la forme attendue (sauvegarde-prod-AAAA-MM-JJ-HHMM) : recopiez le nom de l'artefact, ou laissez le champ vide pour la plus récente ($AIDE). Rien n'a été modifié."
  fi
  # Prod : jamais « la plus récente », qui peut être la copie de l'état abîmé
  # prise juste avant (docs/maintenance.md, étape 7).
  if [[ "$cible" == "prod" && -z "$demande" ]]; then
    arreter "Pour restaurer la production, indiquez le nom de la sauvegarde voulue (sauvegarde-prod-AAAA-MM-JJ-HHMM) : la plus récente peut être la copie de l'état abîmé. Reprenez le nom dans la partie Artifacts de la dernière exécution réussie de « Sauvegarde de nuit » avant le problème ($AIDE). Rien n'a été modifié."
  fi
  [[ -n "${GITHUB_REPOSITORY:-}" ]] ||
    arreter "GITHUB_REPOSITORY est vide : lancez la restauration par la tâche « Restaurer une sauvegarde » de GitHub Actions ($AIDE)."

  TEMPORAIRE="$(mktemp -d)"
  trap nettoyer EXIT
  mkdir -p "$TEMPORAIRE/artefact" "$TEMPORAIRE/exports" "$TEMPORAIRE/gnupg"
  export GNUPGHOME="$TEMPORAIRE/gnupg"

  informer "Contrôle de la base $cible…"
  controler_base "$url" "$cible" "$secret"

  choisir_sauvegarde "$demande"
  informer "Téléchargement de $NOM…"
  gh run download "$EXECUTION" --repo "$GITHUB_REPOSITORY" --name "$NOM" --dir "$TEMPORAIRE/artefact" >/dev/null ||
    arreter "Le téléchargement de la sauvegarde $NOM a échoué : relancez ; si cela se reproduit, choisissez une autre sauvegarde ($AIDE). Rien n'a été modifié."

  local chiffres=()
  local fichier
  # gh extrait l'artefact dans le dossier, ou dans un sous-dossier à son nom.
  for fichier in "$TEMPORAIRE"/artefact/*.tar.gz.gpg "$TEMPORAIRE"/artefact/*/*.tar.gz.gpg; do
    [[ -f "$fichier" ]] && chiffres+=("$fichier")
  done
  (( ${#chiffres[@]} == 1 )) ||
    arreter "L'artefact $NOM ne contient pas un fichier .tar.gz.gpg, et un seul : ce n'est pas une sauvegarde de Nova ($AIDE). Rien n'a été modifié."

  informer "Déchiffrement…"
  dechiffrer "${chiffres[0]}" "$TEMPORAIRE/sauvegarde.tar.gz" "$TEMPORAIRE/etat-gpg.txt" 2>/dev/null ||
    arreter "Le déchiffrement de $NOM a échoué : mot de passe de chiffrement faux ou fichier abîmé. Recopiez SAUVEGARDE_MOT_DE_PASSE depuis l'entrée « Nova – chiffrement des sauvegardes » de votre gestionnaire, ou choisissez une autre sauvegarde ($AIDE). Rien n'a été modifié."

  # Une sauvegarde de Nova : les trois exports, et la table des demandes.
  local pas_nova="ce n'est pas une sauvegarde de Nova ($AIDE). Rien n'a été modifié."
  tar -tzf "$TEMPORAIRE/sauvegarde.tar.gz" >"$TEMPORAIRE/contenu.txt" 2>/dev/null ||
    arreter "Le fichier déchiffré de $NOM n'est pas une archive lisible : $pas_nova"
  local export_sql
  for export_sql in "${EXPORTS[@]}"; do
    grep -qxF "$export_sql" "$TEMPORAIRE/contenu.txt" ||
      arreter "L'archive $NOM ne contient pas $export_sql : $pas_nova"
  done
  tar -xzf "$TEMPORAIRE/sauvegarde.tar.gz" -C "$TEMPORAIRE/exports" "${EXPORTS[@]}" ||
    arreter "L'archive $NOM n'a pas pu être ouverte : $pas_nova"
  rm -f "$TEMPORAIRE/sauvegarde.tar.gz"
  grep -Eq 'CREATE TABLE( IF NOT EXISTS)? "?public"?\."?demandes"?[ (]' "$TEMPORAIRE/exports/structure.sql" ||
    arreter "L'archive $NOM ne contient pas la table public.demandes : $pas_nova"

  lire_donnees
  preparer_restauration
  charger "$url" "$cible"

  informer "Restauration réussie sur la base $cible : ${COMPTES[public.demandes]} demandes et ${COMPTES[public.evenements]} lignes d'historique restaurées, depuis $NOM."
  informer "Durée : $(duree)."
}

restaurer
