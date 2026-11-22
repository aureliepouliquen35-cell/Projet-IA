#!/usr/bin/env bash
# Sauvegarde de nuit de la base prod (story 1.13, AD-18, NFR-7).
#
# Lancé par .github/workflows/sauvegarde-nuit.yml, en deux temps :
#
#   sauvegarder.sh preparer <dossier>
#     contrôle les secrets, exporte la base (rôles, structure, données) avec
#     la Supabase CLI, vérifie que c'est bien la base de Nova, chiffre le tout
#     (gpg, AES256, mot de passe) puis vérifie que le fichier se déchiffre.
#     Seul le fichier chiffré est écrit dans <dossier> ; les exports en clair
#     restent dans un dossier temporaire effacé à la fin, même en cas d'échec.
#     Sorties : `nom` (nom de l'artefact) et `fichier` (chemin du .gpg).
#
#   sauvegarder.sh noter <fichier>
#     écrit `sauvegarde_reussie` dans journal_technique, par ecrire_journal.
#     À lancer seulement après la publication réussie de l'artefact.
#
# Variables d'environnement (secrets GitHub, jamais écrits dans le dépôt) :
#   SAUVEGARDE_URL_BASE_PROD  adresse « Session pooler » de la base prod
#   SAUVEGARDE_MOT_DE_PASSE   mot de passe de chiffrement (32 caractères au moins), pour « preparer » seulement
#
# Les journaux d'exécution de GitHub sont publics : rien ici n'affiche un
# secret. Ne jamais ajouter `set -x`, ni `--dry-run` ou `--debug` à la CLI
# (ils affichent le mot de passe de la base).

set -euo pipefail
umask 077

readonly LONGUEUR_MINIMALE_MOT_DE_PASSE=32
readonly AIDE="voir docs/deploiement.md, partie « Sauvegarde de nuit »"
readonly EXPORTS=(roles.sql structure.sql donnees.sql)

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

# Contrôle l'adresse de la base, sans jamais l'afficher.
controler_url() {
  local url="${SAUVEGARDE_URL_BASE_PROD:-}"

  [[ -n "$url" ]] ||
    arreter "Le secret SAUVEGARDE_URL_BASE_PROD est vide ou absent : créez-le dans Settings › Secrets and variables › Actions du dépôt ($AIDE)."

  # Aucun espace ni retour à la ligne nulle part. Le mot de passe de la base
  # va jusqu'au dernier « @ ».
  local motif='^postgres(ql)?://([^:/@[:space:]]+):([^[:space:]]*)@([^@:/?[:space:]]+):([0-9]+)(/[^?[:space:]]*)?(\?[^[:space:]]*)?$'
  if [[ ! "$url" =~ $motif ]]; then
    arreter "Le secret SAUVEGARDE_URL_BASE_PROD n'a pas la forme attendue (postgresql://utilisateur:mot-de-passe@hôte:5432/postgres) : copiez l'adresse « Session pooler » du projet prod ($AIDE)."
  fi
  local mot_de_passe_base="${BASH_REMATCH[3]}"
  local hote="${BASH_REMATCH[4]}"
  local port="${BASH_REMATCH[5]}"
  masquer "$mot_de_passe_base"

  if [[ -z "$mot_de_passe_base" || "$mot_de_passe_base" == *"YOUR-PASSWORD"* ]]; then
    arreter "L'adresse SAUVEGARDE_URL_BASE_PROD ne contient pas le mot de passe de la base : remplacez [YOUR-PASSWORD] par celui rangé dans votre gestionnaire de mots de passe ($AIDE)."
  fi
  # Seulement des caractères qui s'écrivent tels quels dans une adresse : le
  # masque des journaux couvre alors exactement le mot de passe.
  if [[ ! "$mot_de_passe_base" =~ ^[A-Za-z0-9._~-]+$ ]]; then
    arreter "Le mot de passe de la base, dans SAUVEGARDE_URL_BASE_PROD, contient des caractères spéciaux : dans Supabase, « Reset database password », choisissez un mot de passe fait seulement de lettres et de chiffres, rangez-le dans votre gestionnaire, puis mettez à jour le secret ($AIDE)."
  fi
  if [[ "$hote" =~ ^db\..+\.supabase\.co$ || "$port" != "5432" ]]; then
    arreter "L'adresse SAUVEGARDE_URL_BASE_PROD n'est pas celle du « Session pooler » : la connexion directe (db.….supabase.co) est injoignable depuis GitHub et le port 6543 ne convient pas. Utilisez l'adresse « Session pooler » (port 5432) du projet prod ($AIDE)."
  fi
}

# Contrôle le mot de passe de chiffrement, sans jamais l'afficher.
controler_mot_de_passe() {
  local mot_de_passe="${SAUVEGARDE_MOT_DE_PASSE:-}"

  [[ -n "$mot_de_passe" ]] ||
    arreter "Le secret SAUVEGARDE_MOT_DE_PASSE est vide ou absent : créez-le dans Settings › Secrets and variables › Actions du dépôt ($AIDE)."
  if (( ${#mot_de_passe} < LONGUEUR_MINIMALE_MOT_DE_PASSE )); then
    arreter "Le secret SAUVEGARDE_MOT_DE_PASSE est trop court : il faut $LONGUEUR_MINIMALE_MOT_DE_PASSE caractères au moins ($AIDE)."
  fi
}

# gpg avec un dossier de clés jetable, sans mémoriser le mot de passe ; le
# mot de passe arrive par le descripteur 3, jamais en argument.
chiffrer() { # <entrée> <sortie>
  gpg --batch --yes --quiet --no-tty --no-symkey-cache --pinentry-mode loopback \
    --passphrase-fd 3 --symmetric --cipher-algo AES256 \
    --output "$2" "$1" 3< <(printf '%s' "$SAUVEGARDE_MOT_DE_PASSE")
}

dechiffrer() { # <entrée> <sortie>
  gpg --batch --yes --quiet --no-tty --no-symkey-cache --pinentry-mode loopback \
    --passphrase-fd 3 --decrypt \
    --output "$2" "$1" 3< <(printf '%s' "$SAUVEGARDE_MOT_DE_PASSE")
}

nettoyer() {
  if [[ -n "${TEMPORAIRE:-}" && -d "$TEMPORAIRE" ]]; then
    GNUPGHOME="$TEMPORAIRE/gnupg" gpgconf --kill gpg-agent >/dev/null 2>&1 || true
    rm -rf "$TEMPORAIRE"
  fi
}

preparer() {
  local dossier="${1:-}"
  [[ -n "$dossier" ]] || arreter "Indiquez le dossier de sortie : sauvegarder.sh preparer <dossier>."

  controler_url
  controler_mot_de_passe
  local url="$SAUVEGARDE_URL_BASE_PROD"

  local nom
  nom="sauvegarde-prod-$(TZ=Europe/Paris date +%Y-%m-%d-%H%M)"
  mkdir -p "$dossier"
  local fichier="$dossier/$nom.tar.gz.gpg"
  [[ ! -e "$fichier" ]] || arreter "Le fichier $fichier existe déjà."

  TEMPORAIRE="$(mktemp -d)"
  trap nettoyer EXIT
  mkdir -p "$TEMPORAIRE/exports" "$TEMPORAIRE/gnupg" "$TEMPORAIRE/verification"
  export GNUPGHOME="$TEMPORAIRE/gnupg"

  informer "Export des rôles…"
  supabase db dump --remote="$url" -f "$TEMPORAIRE/exports/roles.sql" --role-only ||
    arreter "L'export des rôles a échoué."
  informer "Export de la structure…"
  supabase db dump --remote="$url" -f "$TEMPORAIRE/exports/structure.sql" ||
    arreter "L'export de la structure a échoué."
  informer "Export des données…"
  supabase db dump --remote="$url" -f "$TEMPORAIRE/exports/donnees.sql" --data-only --use-copy ||
    arreter "L'export des données a échoué."

  local export_sql
  for export_sql in "${EXPORTS[@]}"; do
    [[ -s "$TEMPORAIRE/exports/$export_sql" ]] || arreter "L'export $export_sql est vide."
  done

  # Garde-fou : une base sans la table des demandes n'est pas celle de Nova.
  grep -Eq 'CREATE TABLE( IF NOT EXISTS)? "?public"?\."?demandes"?[ (]' "$TEMPORAIRE/exports/structure.sql" ||
    arreter "L'export ne contient pas la table public.demandes : ce n'est pas la base de Nova. Vérifiez que SAUVEGARDE_URL_BASE_PROD vise bien le projet prod ($AIDE)."

  informer "Chiffrement…"
  tar -czf "$TEMPORAIRE/$nom.tar.gz" -C "$TEMPORAIRE/exports" "${EXPORTS[@]}" ||
    arreter "La création de l'archive a échoué."
  chiffrer "$TEMPORAIRE/$nom.tar.gz" "$fichier" || {
    rm -f "$fichier"
    arreter "Le chiffrement a échoué."
  }

  # Déchiffrement d'essai : même contenu, et les trois exports présents.
  informer "Déchiffrement d'essai…"
  if ! dechiffrer "$fichier" "$TEMPORAIRE/verification/$nom.tar.gz" ||
    ! cmp -s "$TEMPORAIRE/$nom.tar.gz" "$TEMPORAIRE/verification/$nom.tar.gz" ||
    ! tar -tzf "$TEMPORAIRE/verification/$nom.tar.gz" >"$TEMPORAIRE/verification/contenu.txt"; then
    rm -f "$fichier"
    arreter "Le déchiffrement d'essai a échoué : le fichier chiffré est illisible, rien n'est publié."
  fi
  for export_sql in "${EXPORTS[@]}"; do
    grep -qxF "$export_sql" "$TEMPORAIRE/verification/contenu.txt" || {
      rm -f "$fichier"
      arreter "Le déchiffrement d'essai a échoué : $export_sql manque dans l'archive, rien n'est publié."
    }
  done

  nettoyer
  trap - EXIT

  informer "Fichier chiffré prêt : $(basename "$fichier") ($(wc -c <"$fichier" | tr -d ' ') octets)."
  local sorties="nom=$nom"$'\n'"fichier=$fichier"
  if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
    echo "$sorties" >>"$GITHUB_OUTPUT"
  else
    echo "$sorties"
  fi
}

noter() {
  local fichier="${1:-}"
  [[ -n "$fichier" ]] || arreter "Indiquez le fichier chiffré : sauvegarder.sh noter <fichier>."
  [[ "$fichier" == *.tar.gz.gpg && -s "$fichier" ]] ||
    arreter "Le fichier chiffré $fichier est introuvable ou vide."

  controler_url

  local nom_fichier taille execution
  nom_fichier="$(basename "$fichier")"
  taille="$(wc -c <"$fichier" | tr -d ' ')"
  execution="${GITHUB_RUN_NUMBER:-local}"

  # Aucune donnée de demandeur : nom du fichier, numéro d'exécution, taille.
  # Les valeurs passent par des variables psql (:'…'), jamais collées au SQL.
  PGCONNECT_TIMEOUT=30 psql "$SAUVEGARDE_URL_BASE_PROD" \
    --no-psqlrc --quiet --tuples-only --no-align \
    -v ON_ERROR_STOP=1 \
    -v fichier="$nom_fichier" \
    -v execution="$execution" \
    -v taille="$taille" \
    >/dev/null <<'SQL' ||
select public.ecrire_journal(
  'info',
  'sauvegarde_reussie',
  jsonb_build_object(
    'fichier', :'fichier',
    'execution', :'execution',
    'taille_octets', (:'taille')::bigint
  )
);
SQL
    arreter "L'écriture de « sauvegarde_reussie » dans le journal technique a échoué (le fichier chiffré est pourtant publié)."

  informer "Sauvegarde notée dans le journal technique : $nom_fichier."
}

case "${1:-}" in
  preparer) preparer "${2:-}" ;;
  noter) noter "${2:-}" ;;
  *) arreter "Usage : sauvegarder.sh preparer <dossier> | sauvegarder.sh noter <fichier>" ;;
esac
