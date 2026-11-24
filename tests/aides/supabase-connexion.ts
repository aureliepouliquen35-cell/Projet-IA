import { vi } from "vitest";

// Supabase simulé pour la connexion (story 1.6) : aucun compte n'est appelé.
//
// - Client secret (`@/server/supabase-secret`) : `connexion_bloquee`,
//   `enregistrer_tentative` et `ecrire_journal`. Les tentatives sont gardées
//   en mémoire et `connexion_bloquee` applique la même règle que la
//   migration (≥ 5 échecs de moins de 15 minutes, postérieurs à la dernière
//   réussite), avec une horloge réglable (`avancer`).
// - Client de session (`@/lib/supabase/server`) : `signInWithPassword`,
//   `signOut`, `getClaims`, `updateUser` et la lecture de `profils`.
// - Mot de passe temporaire (story 1.7) : `est_mot_de_passe_temporaire` et
//   `terminer_changement_mdp` appliquent les règles de la migration
//   (NV105, NV106, sans effet si le drapeau est déjà faux) sur une copie en
//   mémoire des empreintes (`temporaires` : identifiant → mot de passe).
// - Liste des demandes (story 1.8) : `compter_a_traiter` et `lister_demandes`
//   par le client de session (`rpc`), sur une copie en mémoire des demandes
//   (`demandes`). Elles appliquent les règles de la migration : refus
//   `NV201` sans profil actif au mot de passe choisi, « à traiter » =
//   Nouvelle ou Urgente non Traitée, taille ramenée entre 1 et 100, page
//   entre 1 et la dernière, tri date puis référence décroissantes.
//   Recherche (story 1.9, `p_q`) : nettoyée (bords, 150 caractères), sans
//   accents ni majuscules, cherchée telle quelle dans la référence, le nom,
//   l'email, l'entreprise et l'objet ; `total` = nombre de résultats.
//   Filtres (story 2.1, `p_statut`, `p_categorie`, `p_canal`) : combinés
//   entre eux et avec la recherche ; statut ou canal inconnu, catégorie
//   absente de `categories` : ignorés. Filtre « À traiter » (story 2.2,
//   `p_a_traiter`) : vrai seulement, même définition que le compteur.
// - Catégories du filtre (story 2.1) : `lister_categories` par le client de
//   session, sur une copie en mémoire (`categories`, les cinq de départ à
//   chaque `reinitialiser`) : même refus `NV201`, actives d'abord, puis
//   par `ordre`.
// - Détail d'une demande (story 1.10) : `lire_demande` par le client de
//   session, sur les mêmes demandes : même refus `NV201`, référence mise en
//   majuscules, `null` si inconnue, événements renvoyés dans l'ordre donné
//   par le test (la vraie fonction les trie) ; une demande sans
//   `evenements` a son seul « Demande créée » par le demandeur.
// - Changement de statut (story 1.11) : `changer_statut` par le client de
//   session, sur les mêmes demandes, avec les règles de la migration : refus
//   `NV201`, `NV301` (nouveau statut absent, inconnu ou *Nouvelle*),
//   `NV302` (statut vu inconnu) ; `introuvable`, `inchange`, `refuse`
//   (passage non permis depuis le statut réel, ou réouverture sans avoir vu
//   *Traitée*) ou `applique` (statut, date de clôture, événement au nom de la
//   personne connectée, à l'heure de l'horloge simulée) ; `modifiee_par`
//   = auteur et date du dernier événement `statut` si le statut réel n'est
//   pas celui vu. `lire_demande` renvoie ensuite la demande modifiée.
// - Saisie interne (story 2.3) : `saisir_demande` et
//   `lire_formulaire_saisie` par le client de session, avec les règles de
//   la migration : refus `NV201` ; numéro d'envoi absent (refus imprévu
//   `P0001`) ; même numéro d'envoi → la référence de la demande déjà créée,
//   avant toute vérification ; `NV401` (canal autre que `telephone` ou
//   `email`), `NV001` (case non cochée), `NV002` (catégorie inconnue ou
//   désactivée) ; sinon la demande *Nouvelle* / *Normale* (numéro suivant
//   de l'année 2026, à l'heure de l'horloge simulée) et son événement
//   `creation` au nom de la personne connectée. `lire_formulaire_saisie`
//   renvoie les catégories actives (par `ordre`) et `contactDonnees`.
// - Cookies de Next.js (`next/headers`) : `cookies`, avec les cookies reçus
//   (`cookiesRecus`) et posés (`cookiesPoses`). `SECRET_COOKIES` est fixé à
//   chaque `reinitialiser`.
//
// Utilisation, dans un test :
//   const simulation = await vi.hoisted(async () =>
//     (await import("../aides/supabase-connexion")).creerSimulationConnexion());
//   vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
//   vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
//   vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

export type ErreurSimulee = { code?: string; message: string; status?: number } | null;
export type RetourRpc = { data: unknown; error: ErreurSimulee };

export const ID_KARIM = "0b6c3f4e-9a1d-4c2b-8e7f-1a2b3c4d5e6f";
export const EMAIL_KARIM = "karim.benali@nova-services.example";
export const MOT_DE_PASSE_KARIM = "Un mot de passe sûr 2026";

export type ProfilSimule = {
  id: string;
  nom: string;
  role: string;
  actif: boolean;
  doit_changer_mdp: boolean;
};

/** Secret des cookies signés, pour les tests. */
export const SECRET_COOKIES_ESSAI = "secret-d-essai-des-cookies-de-passage-0123456789";

export const PROFIL_KARIM: ProfilSimule = {
  id: ID_KARIM,
  nom: "Karim Benali",
  role: "collaborateur",
  actif: true,
  doit_changer_mdp: false,
};

type Tentative = { email: string; date: number; reussite: boolean };

/** Une demande, telle que la base la garde (colonnes lues par la liste). */
export type DemandeSimulee = {
  id: string;
  reference: string;
  /** ISO, comme `to_jsonb(timestamptz)`. */
  date_depot: string;
  nom: string;
  /** Cherché par la recherche (story 1.9), jamais renvoyé par la liste. */
  email: string;
  /** Cherchée par la recherche, jamais renvoyée par la liste ; facultative. */
  entreprise: string | null;
  objet: string;
  categorie: string;
  /**
   * Identifiant de la catégorie, lu par le filtre Catégorie (story 2.1). Par
   * défaut : celui de la catégorie en base qui porte le nom `categorie`.
   */
  categorie_id?: string;
  statut: "nouvelle" | "en_cours" | "traitee";
  priorite: "normale" | "urgente";
  /** Lus par le détail (story 1.10) seulement ; facultatifs ici. */
  telephone?: string | null;
  /** Par défaut : « Description : {objet}. » */
  description?: string;
  /** Par défaut : `formulaire`. */
  canal?: "formulaire" | "telephone" | "email";
  /** Par défaut : la création par le demandeur, à la date de dépôt. */
  evenements?: EvenementSimule[];
  /** Date de clôture (story 1.11) ; par défaut `null`. */
  date_cloture?: string | null;
  /** Numéro d'envoi (story 1.4, 2.3) ; par défaut `null`. */
  numero_envoi?: string | null;
};

/** Contact données de la migration 1.3 (valeur fictive), lu par `lire_formulaire_saisie`. */
export const CONTACT_DONNEES_SIMULE = "donnees@nova-services.example";

/**
 * Un événement de l'historique, tel que `lire_demande` le renvoie.
 * `auteur_nom`, `ancien_statut` et `nouveau_statut` valent `null` s'ils
 * ne sont pas donnés (création par le demandeur).
 */
export type EvenementSimule = {
  type: string;
  auteur: string | null;
  auteur_nom?: string | null;
  ancien_statut?: string | null;
  nouveau_statut?: string | null;
  date: string;
};

/** Événement complet, comme `lire_demande` (migration 1.11) le renvoie. */
const evenementComplet = (e: EvenementSimule) => ({
  type: e.type,
  auteur: e.auteur,
  auteur_nom: e.auteur_nom ?? null,
  ancien_statut: e.ancien_statut ?? null,
  nouveau_statut: e.nouveau_statut ?? null,
  date: e.date,
});

/** Ce que `lire_demande` (migration 1.11) renvoie pour une demande. */
export function detailSimule(d: DemandeSimulee) {
  const evenements = d.evenements ?? [{ type: "creation", auteur: "demandeur", date: d.date_depot }];
  return {
    id: d.id,
    reference: d.reference,
    nom: d.nom,
    email: d.email,
    telephone: d.telephone ?? null,
    entreprise: d.entreprise,
    objet: d.objet,
    description: d.description ?? `Description : ${d.objet}.`,
    categorie: d.categorie,
    canal: d.canal ?? "formulaire",
    statut: d.statut,
    date_depot: d.date_depot,
    date_cloture: d.date_cloture ?? null,
    // Dans l'ordre donné : les tests le fixent eux-mêmes (la base trie).
    evenements: evenements.map(evenementComplet),
  };
}

/** Une catégorie, telle que la base la garde. */
export type CategorieSimulee = { id: string; nom: string; active: boolean; ordre: number };

/** Les cinq catégories de départ (migration 1.2), dans leur ordre. */
export const CATEGORIES_DEPART: readonly CategorieSimulee[] = [
  "Demande d'information",
  "Problème technique",
  "Demande de rendez-vous",
  "Question administrative",
  "Autre",
].map((nom, index) => ({
  id: `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  nom,
  active: true,
  ordre: index + 1,
}));

/** Identifiant de la catégorie de départ « Problème technique ». */
export const ID_PROBLEME_TECHNIQUE = CATEGORIES_DEPART[1].id;

/** `normaliser_recherche` de la migration 1.9 : sans accents, en minuscules. */
export function normaliserRecherche(texte: string): string {
  return texte.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Nettoyage de `p_q` par la migration 1.9 : espaces de bord retirés,
 * 150 caractères au plus, sans accents ni majuscules.
 */
function nettoyerRecherche(valeur: unknown): string {
  if (typeof valeur !== "string") return "";
  return normaliserRecherche(Array.from(valeur.trim()).slice(0, 150).join("").trimEnd());
}

/** Correspondance de la migration 1.9 : champ par champ, texte cherché tel quel. */
function correspond(d: DemandeSimulee, q: string): boolean {
  if (q === "") return true;
  return [d.reference, d.nom, d.email, d.entreprise, d.objet].some(
    (champ) => champ !== null && normaliserRecherche(champ).includes(q),
  );
}

/**
 * `total` demandes fictives, la plus récente en premier : la dernière
 * référence le 8 nov. 2026 à 8 h 47 (heure de Paris), puis une heure plus
 * tôt pour chacune. Les `nouvelles` plus récentes sont *Nouvelle*, les
 * suivantes *En cours* et *Traitée* en alternance.
 */
export function fabriquerDemandes(total: number, nouvelles = 0): DemandeSimulee[] {
  const debut = Date.UTC(2026, 10, 8, 7, 47);
  return Array.from({ length: total }, (_, index) => {
    const numero = total - index;
    return {
      id: `00000000-0000-4000-8000-${String(numero).padStart(12, "0")}`,
      reference: `NOVA-2026-${String(numero).padStart(4, "0")}`,
      date_depot: new Date(debut - index * 60 * 60 * 1000).toISOString().replace("Z", "+00:00"),
      nom: `Demandeur ${numero}`,
      email: `demandeur${numero}@exemple.fr`,
      entreprise: numero % 2 === 0 ? `Entreprise ${numero}` : null,
      objet: `Objet de la demande ${numero}`,
      categorie: "Problème technique",
      statut: index < nouvelles ? "nouvelle" : index % 2 === 0 ? "en_cours" : "traitee",
      priorite: "normale",
    };
  });
}

/** Passages permis de la migration 1.11 (`transition_statut_permise`). */
const PASSAGES_PERMIS = ["nouvelle>en_cours", "nouvelle>traitee", "en_cours>traitee", "traitee>en_cours"];

/** Définition « à traiter » de la migration (AD-5). */
const aTraiter = (d: DemandeSimulee) =>
  d.statut === "nouvelle" || (d.priorite === "urgente" && d.statut !== "traitee");

const QUINZE_MINUTES = 15 * 60 * 1000;
const VINGT_QUATRE_HEURES = 24 * 60 * 60 * 1000;

export function creerSimulationConnexion() {
  let maintenant = Date.UTC(2026, 10, 20, 9, 0, 0);
  const tentatives: Tentative[] = [];
  /** Comptes Auth : email → mot de passe et identifiant. */
  const comptes = new Map<string, { motDePasse: string; id: string }>();
  /** Profils lisibles avec la session (règle « sa propre ligne »). */
  const profils = new Map<string, ProfilSimule>();
  /** Session ouverte dans ce navigateur (cookies). */
  const session: { id: string | null } = { id: null };
  /** Remplace une fonction SQL par une panne, par nom. */
  const pannesRpc: Record<string, RetourRpc> = {};
  /** Mots de passe temporaires encore enregistrés : identifiant → mot de passe. */
  const temporaires = new Map<string, string>();
  /** Cookies reçus du navigateur et cookies posés par le serveur. */
  const cookiesRecus = new Map<string, string>();
  const cookiesPoses = new Map<string, { valeur: string; options: Record<string, unknown> }>();
  /** Demandes en base, lues par les fonctions de la liste. */
  const demandes: DemandeSimulee[] = [];
  /** Catégories en base, lues par `lister_categories` et le filtre Catégorie. */
  const categories: CategorieSimulee[] = [];
  /** Contact données des paramètres de Nova, lu par `lire_formulaire_saisie`. */
  const contact = { donnees: CONTACT_DONNEES_SIMULE };
  /** Identifiant de la catégorie d'une demande (`categorie_id`, sinon d'après son nom). */
  const categorieDe = (d: DemandeSimulee) =>
    d.categorie_id ?? categories.find((c) => c.nom === d.categorie)?.id ?? null;

  function bloquee(email: string): boolean {
    const derniereReussite = Math.max(
      -Infinity,
      ...tentatives.filter((t) => t.email === email && t.reussite).map((t) => t.date),
    );
    const echecs = tentatives.filter(
      (t) =>
        t.email === email &&
        !t.reussite &&
        t.date > maintenant - QUINZE_MINUTES &&
        t.date > derniereReussite,
    );
    return echecs.length >= 5;
  }

  const rpc = vi.fn((nom: string, parametres: Record<string, unknown> = {}) => ({
    abortSignal: async (signal: AbortSignal): Promise<RetourRpc> => {
      void signal;
      if (pannesRpc[nom]) return pannesRpc[nom];
      if (nom === "connexion_bloquee") {
        return { data: bloquee(String(parametres.p_email)), error: null };
      }
      if (nom === "enregistrer_tentative") {
        for (let i = tentatives.length - 1; i >= 0; i -= 1) {
          if (tentatives[i].date < maintenant - VINGT_QUATRE_HEURES) tentatives.splice(i, 1);
        }
        tentatives.push({
          email: String(parametres.p_email),
          date: maintenant,
          reussite: parametres.p_reussite === true,
        });
      }
      if (nom === "est_mot_de_passe_temporaire") {
        return { data: temporaires.get(String(parametres.p_id)) === parametres.p_mdp, error: null };
      }
      if (nom === "terminer_changement_mdp") {
        const id = String(parametres.p_id);
        const motDePasse = String(parametres.p_mdp ?? "");
        const profil = profils.get(id);
        if (!profil || profil.doit_changer_mdp !== true) return { data: null, error: null };
        if (Array.from(motDePasse).length < 12) {
          return { data: null, error: { code: "NV105", message: "trop court" } };
        }
        if (temporaires.get(id) === motDePasse) {
          return { data: null, error: { code: "NV106", message: "temporaire" } };
        }
        profil.doit_changer_mdp = false;
        temporaires.delete(id);
      }
      return { data: null, error: null };
    },
  }));
  const creerClientSecret = vi.fn(() => ({ rpc }));

  const signInWithPassword = vi.fn(
    async ({ email, password }: { email: string; password: string }) => {
      const compte = comptes.get(email);
      if (!compte || compte.motDePasse !== password) {
        return {
          data: { user: null, session: null },
          error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } as ErreurSimulee,
        };
      }
      session.id = compte.id;
      return { data: { user: { id: compte.id }, session: {} }, error: null as ErreurSimulee };
    },
  );
  const signOut = vi.fn(async (options?: { scope?: string }) => {
    void options;
    session.id = null;
    return { error: null as ErreurSimulee };
  });
  /** Changement du mot de passe du compte de la session (`same_password` s'il est identique). */
  const updateUser = vi.fn(async ({ password }: { password: string }) => {
    const compte = [...comptes.values()].find((c) => c.id === session.id);
    if (!compte) {
      return { data: { user: null }, error: { code: "session_not_found", message: "no session", status: 403 } as ErreurSimulee };
    }
    if (compte.motDePasse === password) {
      return { data: { user: null }, error: { code: "same_password", message: "same password", status: 422 } as ErreurSimulee };
    }
    compte.motDePasse = password;
    return { data: { user: { id: compte.id } }, error: null as ErreurSimulee };
  });
  const getClaims = vi.fn(async () =>
    session.id
      ? { data: { claims: { sub: session.id } }, error: null as unknown }
      : { data: null, error: null as unknown },
  );

  /** Lecture de `profils` : seulement la ligne de la session (RLS). */
  const lectureProfils = vi.fn(
    async (colonnes: string, id: string): Promise<{ data: unknown; error: ErreurSimulee }> => {
      void colonnes;
      if (pannesRpc.profils) return pannesRpc.profils;
      const profil = session.id === id ? profils.get(id) : undefined;
      return { data: profil ?? null, error: null };
    },
  );
  const from = vi.fn((table: string) => {
    if (table !== "profils") throw new Error(`Table inattendue : ${table}`);
    return {
      select: (colonnes: string) => ({
        eq: (colonne: string, id: string) => {
          void colonne;
          return {
            abortSignal: () => ({ maybeSingle: () => lectureProfils(colonnes, id) }),
          };
        },
      }),
    };
  });
  /** Faux (refus NV201) sauf pour le profil actif, au mot de passe choisi, de la session. */
  function utilisateurInterne(): boolean {
    const profil = session.id ? profils.get(session.id) : undefined;
    return profil?.actif === true && profil.doit_changer_mdp === false;
  }

  /** Fonctions SQL appelées avec la session (rôle `authenticated`). */
  const rpcSession = vi.fn((nom: string, parametres: Record<string, unknown> = {}) => ({
    abortSignal: async (signal: AbortSignal): Promise<RetourRpc> => {
      void signal;
      if (pannesRpc[nom]) return pannesRpc[nom];
      if (
        ![
          "compter_a_traiter",
          "lister_demandes",
          "lire_demande",
          "changer_statut",
          "lister_categories",
          "saisir_demande",
          "lire_formulaire_saisie",
        ].includes(nom)
      ) {
        return { data: null, error: { code: "PGRST202", message: `fonction inconnue : ${nom}` } };
      }
      if (!utilisateurInterne()) {
        return { data: null, error: { code: "NV201", message: "Accès refusé" } };
      }
      if (nom === "compter_a_traiter") return { data: demandes.filter(aTraiter).length, error: null };
      if (nom === "lire_demande") {
        const reference = String(parametres.p_reference ?? "").toUpperCase();
        const demande = demandes.find((d) => d.reference === reference);
        return { data: demande ? detailSimule(demande) : null, error: null };
      }
      if (nom === "changer_statut") return changerStatut(parametres);
      if (nom === "saisir_demande") return saisirDemande(parametres);
      if (nom === "lire_formulaire_saisie") {
        const actives = categories.filter((c) => c.active).sort((a, b) => a.ordre - b.ordre);
        return {
          data: {
            categories: actives.map(({ id, nom: nomCategorie }) => ({ id, nom: nomCategorie })),
            contact_donnees: contact.donnees,
          },
          error: null,
        };
      }
      if (nom === "lister_categories") {
        const triees = [...categories].sort((a, b) => Number(b.active) - Number(a.active) || a.ordre - b.ordre);
        return { data: triees.map(({ id, nom: nomCategorie, active }) => ({ id, nom: nomCategorie, active })), error: null };
      }

      const entier = (valeur: unknown, defaut: number) =>
        typeof valeur === "number" && Number.isInteger(valeur) ? valeur : defaut;
      const taille = Math.min(Math.max(entier(parametres.p_taille, 25), 1), 100);
      const q = nettoyerRecherche(parametres.p_q);
      // Filtres de la migration 2.1 : valeur inconnue ignorée.
      const statut = ["nouvelle", "en_cours", "traitee"].includes(String(parametres.p_statut)) ? parametres.p_statut : null;
      const canal = ["formulaire", "telephone", "email"].includes(String(parametres.p_canal)) ? parametres.p_canal : null;
      const categorie =
        typeof parametres.p_categorie === "string"
          ? (categories.find((c) => c.id === String(parametres.p_categorie).toLowerCase())?.id ?? null)
          : null;
      // Filtre « À traiter » de la migration 2.2 : vrai seulement ; même définition que le compteur.
      const seulementATraiter = parametres.p_a_traiter === true;
      const trouvees = demandes.filter(
        (d) =>
          (!seulementATraiter || aTraiter(d)) &&
          (statut === null || d.statut === statut) &&
          (canal === null || (d.canal ?? "formulaire") === canal) &&
          (categorie === null || categorieDe(d) === categorie) &&
          correspond(d, q),
      );
      const total = trouvees.length;
      const derniere = Math.max(1, Math.ceil(total / taille));
      const page = Math.min(Math.max(entier(parametres.p_page, 1), 1), derniere);
      const triees = [...trouvees].sort(
        (a, b) =>
          Date.parse(b.date_depot) - Date.parse(a.date_depot) ||
          (a.reference < b.reference ? 1 : a.reference > b.reference ? -1 : 0),
      );
      const lignes = triees
        .slice((page - 1) * taille, page * taille)
        .map(({ id, reference, date_depot, nom: nomDemandeur, objet, categorie, statut }) => ({
          id,
          reference,
          date_depot,
          nom: nomDemandeur,
          objet,
          categorie,
          statut,
        }));
      return { data: { total, page, demandes: lignes }, error: null };
    },
  }));

  /** `changer_statut` de la migration 1.11 (appelant déjà vérifié). */
  function changerStatut(parametres: Record<string, unknown>): RetourRpc {
    const vers = parametres.p_nouveau_statut;
    const vu = parametres.p_statut_vu;
    if (vers !== "en_cours" && vers !== "traitee") {
      return { data: null, error: { code: "NV301", message: "nouveau statut refusé" } };
    }
    if (vu !== "nouvelle" && vu !== "en_cours" && vu !== "traitee") {
      return { data: null, error: { code: "NV302", message: "statut vu refusé" } };
    }
    const reference = String(parametres.p_reference ?? "").toUpperCase();
    const demande = demandes.find((d) => d.reference === reference);
    if (!demande) return { data: { resultat: "introuvable", statut: null, modifiee_par: null }, error: null };

    const reel = demande.statut;
    let modifieePar: { nom: string; date: string } | null = null;
    if (reel !== vu) {
      const dernier = (demande.evenements ?? [])
        .filter((e) => e.type === "statut" && e.auteur_nom)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .at(-1);
      if (dernier) modifieePar = { nom: dernier.auteur_nom!, date: dernier.date };
    }
    const reponse = (resultat: string, statut: string) => ({
      data: { resultat, statut, modifiee_par: modifieePar },
      error: null,
    });
    if (reel === vers) return reponse("inchange", reel);
    if (!PASSAGES_PERMIS.includes(`${reel}>${vers}`) || (reel === "traitee" && vu !== "traitee")) {
      return reponse("refuse", reel);
    }

    const date = new Date(maintenant).toISOString().replace("Z", "+00:00");
    demande.evenements = [
      ...(demande.evenements ?? [{ type: "creation", auteur: "demandeur", date: demande.date_depot }]),
      {
        type: "statut",
        auteur: null,
        auteur_nom: profils.get(session.id!)!.nom,
        ancien_statut: reel,
        nouveau_statut: vers,
        date,
      },
    ];
    demande.statut = vers;
    demande.date_cloture = vers === "traitee" ? date : null;
    return reponse("applique", vers);
  }

  /** `saisir_demande` de la migration 2.3 (appelant déjà vérifié). */
  function saisirDemande(p: Record<string, unknown>): RetourRpc {
    if (typeof p.p_numero_envoi !== "string" || p.p_numero_envoi === "") {
      return { data: null, error: { code: "P0001", message: "numéro d'envoi absent" } };
    }
    const deja = demandes.find((d) => d.numero_envoi === p.p_numero_envoi);
    if (deja) return { data: [{ reference: deja.reference }], error: null };
    if (p.p_canal !== "telephone" && p.p_canal !== "email") {
      return { data: null, error: { code: "NV401", message: "canal refusé" } };
    }
    if (p.p_personne_informee !== true) {
      return { data: null, error: { code: "NV001", message: "case non cochée" } };
    }
    const categorie = categories.find((c) => c.id === p.p_categorie_id && c.active);
    if (!categorie) return { data: null, error: { code: "NV002", message: "catégorie refusée" } };

    // Numéro suivant de l'année 2026 (le vrai compteur est une table).
    const numeros = demandes
      .map((d) => /^NOVA-2026-(\d+)$/.exec(d.reference)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    const numero = Math.max(0, ...numeros) + 1;
    const reference = `NOVA-2026-${String(numero).padStart(4, "0")}`;
    const date = new Date(maintenant).toISOString().replace("Z", "+00:00");
    const texte = (valeur: unknown) => (typeof valeur === "string" && valeur.trim() !== "" ? valeur.trim() : null);
    demandes.push({
      id: `00000000-0000-4000-9000-${String(numero).padStart(12, "0")}`,
      reference,
      date_depot: date,
      nom: String(p.p_nom),
      email: String(p.p_email),
      telephone: texte(p.p_telephone),
      entreprise: texte(p.p_entreprise),
      objet: String(p.p_objet),
      description: String(p.p_description),
      categorie: categorie.nom,
      categorie_id: categorie.id,
      statut: "nouvelle",
      priorite: "normale",
      canal: p.p_canal as "telephone" | "email",
      numero_envoi: p.p_numero_envoi as string,
      evenements: [{ type: "creation", auteur: null, auteur_nom: profils.get(session.id!)!.nom, date }],
    });
    return { data: [{ reference }], error: null };
  }

  const createClient = vi.fn(async () => ({
    auth: { signInWithPassword, signOut, getClaims, updateUser },
    from,
    rpc: rpcSession,
  }));

  const cookies = vi.fn(async () => ({
    get: (nom: string) => (cookiesRecus.has(nom) ? { name: nom, value: cookiesRecus.get(nom)! } : undefined),
    set: (nom: string, valeur: string, options: Record<string, unknown> = {}) => {
      cookiesPoses.set(nom, { valeur, options });
    },
  }));

  /** Remet la simulation à zéro, avec le compte actif de Karim. */
  function reinitialiser() {
    maintenant = Date.UTC(2026, 10, 20, 9, 0, 0);
    tentatives.length = 0;
    comptes.clear();
    profils.clear();
    session.id = null;
    for (const nom of Object.keys(pannesRpc)) delete pannesRpc[nom];
    temporaires.clear();
    demandes.length = 0;
    categories.length = 0;
    categories.push(...CATEGORIES_DEPART.map((c) => ({ ...c })));
    contact.donnees = CONTACT_DONNEES_SIMULE;
    cookiesRecus.clear();
    cookiesPoses.clear();
    vi.stubEnv("SECRET_COOKIES", SECRET_COOKIES_ESSAI);
    comptes.set(EMAIL_KARIM, { motDePasse: MOT_DE_PASSE_KARIM, id: ID_KARIM });
    profils.set(ID_KARIM, { ...PROFIL_KARIM });
    vi.clearAllMocks();
  }

  /** Avance l'horloge de la base, en minutes. */
  function avancer(minutes: number) {
    maintenant += minutes * 60 * 1000;
  }

  /** Événements écrits au journal technique, avec leurs détails. */
  function journal(): { evenement: string; details: Record<string, unknown> }[] {
    return rpc.mock.calls
      .filter(([nom]) => nom === "ecrire_journal")
      .map(([, parametres]) => ({
        evenement: String(parametres?.p_evenement),
        details: (parametres?.p_details ?? {}) as Record<string, unknown>,
      }));
  }

  /** Appels d'une fonction SQL, avec leurs paramètres. */
  function appels(nom: string): Record<string, unknown>[] {
    return rpc.mock.calls.filter(([fonction]) => fonction === nom).map(([, p]) => p ?? {});
  }

  return {
    rpc,
    rpcSession,
    demandes,
    categories,
    contact,
    creerClientSecret,
    createClient,
    signInWithPassword,
    signOut,
    getClaims,
    updateUser,
    cookies,
    cookiesRecus,
    cookiesPoses,
    temporaires,
    from,
    lectureProfils,
    tentatives,
    comptes,
    profils,
    session,
    pannesRpc,
    reinitialiser,
    avancer,
    journal,
    appels,
  };
}
