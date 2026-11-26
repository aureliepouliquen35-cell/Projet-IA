import { ROLES, type Role } from "@/shared/constantes";

// Adresses de l'espace interne et de la connexion (AD-7). Une seule
// définition : le proxy (`src/lib/supabase/proxy.ts`), la garde
// (`src/server/garde`), la connexion et la déconnexion les lisent ici.

/** Écran I1 : toute page interne ouverte sans session y renvoie (FR-10). */
export const ADRESSE_CONNEXION = "/connexion";

/**
 * Écran I2 : imposé tant que le mot de passe temporaire n'a pas été remplacé
 * (`profils.doit_changer_mdp`, FR-21).
 */
export const ADRESSE_NOUVEAU_MOT_DE_PASSE = "/connexion/nouveau-mot-de-passe";

/** Page d'arrivée après la connexion : « Demandes » (I3). */
export const ADRESSE_ACCUEIL_INTERNE = "/demandes";

/** Écran I5 « Nouvelle demande » (saisie interne, FR-30). */
export const ADRESSE_NOUVELLE_DEMANDE = "/demandes/nouvelle";

/**
 * Écran A1 « Comptes » (story 3.1), réservé aux administrateurs (FR-24,
 * RM-7). `/admin` seul n'est pas une page : S2, comme toute adresse inconnue.
 */
export const ADRESSE_COMPTES = "/admin/comptes";

/**
 * Débuts d'adresse des pages internes. Seules ces pages demandent une
 * session : les pages publiques (`/`, `/confirmation`) et les adresses
 * inconnues (S2, comme `/inscription`) n'en ont pas besoin.
 */
export const PREFIXES_INTERNES = ["/demandes", "/admin"] as const;

/**
 * Adresse lue sans tenir compte des majuscules, ni des caractères écrits en
 * `%xx` (`/%64emandes`). Une adresse mal formée est lue telle quelle.
 */
function normaliser(chemin: string): string {
  let decode = chemin;
  try {
    decode = decodeURIComponent(chemin);
  } catch {
    // Adresse mal formée : lue telle quelle.
  }
  return decode.toLowerCase();
}

/** Vrai si `chemin` est `adresse`, seule ou suivie de `/…`. */
export const commencePar = (chemin: string, adresse: string) =>
  chemin === adresse || chemin.startsWith(`${adresse}/`);

/**
 * Vrai si l'adresse est celle d'une page interne : un des préfixes, seul ou
 * suivi de `/…` (`/demandes`, `/demandes/NOVA-2026-0001`), jamais un simple
 * début de mot (`/demandesxyz`). Sans tenir compte des majuscules, ni des
 * caractères écrits en `%xx` (`/%64emandes`), ni d'une barre finale.
 */
export function estPageInterne(chemin: string): boolean {
  const normalise = normaliser(chemin);
  return PREFIXES_INTERNES.some((prefixe) => commencePar(normalise, prefixe));
}

/** Vrai si l'adresse est celle de l'écran I2 (même lecture qu'`estPageInterne`). */
export function estPageNouveauMotDePasse(chemin: string): boolean {
  return commencePar(normaliser(chemin), ADRESSE_NOUVEAU_MOT_DE_PASSE);
}

/**
 * Vrai si la page demande une session : les pages internes et l'écran I2.
 * Le proxy y applique l'expiration, le renvoi vers I2 et l'interdiction de
 * mise en cache.
 */
export function estPageProtegee(chemin: string): boolean {
  return estPageInterne(chemin) || estPageNouveauMotDePasse(chemin);
}

// ---------------------------------------------------------------------------
// Suivi du rôle dans le menu (story 3.3 ; FR-22)
// ---------------------------------------------------------------------------

/**
 * Cookie lisible par la page, posé par le proxy à chaque page protégée
 * ouverte : le rôle relu dans `profils` pour cette page (`collaborateur` ou
 * `administrateur`, rien de secret). Le menu latéral, qui n'est pas rendu de
 * nouveau à chaque navigation, le compare au rôle avec lequel il a été
 * rendu et se recharge s'ils diffèrent (`SuiviRole`).
 *
 * Simple signal d'affichage : jamais lu par le serveur, jamais une
 * protection. La page, la garde (`exigerAdministrateur()`) et la base
 * vérifient elles-mêmes le rôle.
 */
export const COOKIE_ROLE = "nova_role";

/**
 * Le rôle écrit dans le cookie `nova_role` de `document.cookie`, ou `null`
 * s'il est absent ou n'est pas un rôle connu.
 */
export function lireCookieRole(cookies: string): Role | null {
  for (const morceau of cookies.split(";")) {
    const egal = morceau.indexOf("=");
    if (egal === -1 || morceau.slice(0, egal).trim() !== COOKIE_ROLE) continue;
    return roleDuCookie(morceau.slice(egal + 1));
  }
  return null;
}

/** Le rôle d'une valeur du cookie `nova_role`, ou `null` si ce n'est pas un rôle connu. */
export function roleDuCookie(valeur: string | undefined): Role | null {
  const texte = valeur?.trim() ?? "";
  return (ROLES as readonly string[]).includes(texte) ? (texte as Role) : null;
}

/**
 * Vrai si le menu doit être rechargé : le cookie donne un rôle, différent de
 * celui avec lequel le menu a été rendu. Sans cookie lisible, rien ne change.
 */
export function roleAChange(roleDuCookie: Role | null, roleDuMenu: Role): boolean {
  return roleDuCookie !== null && roleDuCookie !== roleDuMenu;
}
