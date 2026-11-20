import { vi } from "vitest";

// Supabase simulé pour la connexion (story 1.6) : aucun compte n'est appelé.
//
// - Client secret (`@/server/supabase-secret`) : `connexion_bloquee`,
//   `enregistrer_tentative` et `ecrire_journal`. Les tentatives sont gardées
//   en mémoire et `connexion_bloquee` applique la même règle que la
//   migration (≥ 5 échecs de moins de 15 minutes, postérieurs à la dernière
//   réussite), avec une horloge réglable (`avancer`).
// - Client de session (`@/lib/supabase/server`) : `signInWithPassword`,
//   `signOut`, `getClaims` et la lecture de `profils`.
//
// Utilisation, dans un test :
//   const simulation = await vi.hoisted(async () =>
//     (await import("../aides/supabase-connexion")).creerSimulationConnexion());
//   vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
//   vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));

export type ErreurSimulee = { code?: string; message: string; status?: number } | null;
export type RetourRpc = { data: unknown; error: ErreurSimulee };

export const ID_KARIM = "0b6c3f4e-9a1d-4c2b-8e7f-1a2b3c4d5e6f";
export const EMAIL_KARIM = "karim.benali@nova-services.example";
export const MOT_DE_PASSE_KARIM = "Un mot de passe sûr 2026";

export type ProfilSimule = { id: string; nom: string; role: string; actif: boolean };

export const PROFIL_KARIM: ProfilSimule = {
  id: ID_KARIM,
  nom: "Karim Benali",
  role: "collaborateur",
  actif: true,
};

type Tentative = { email: string; date: number; reussite: boolean };

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
  const createClient = vi.fn(async () => ({
    auth: { signInWithPassword, signOut, getClaims },
    from,
  }));

  /** Remet la simulation à zéro, avec le compte actif de Karim. */
  function reinitialiser() {
    maintenant = Date.UTC(2026, 10, 20, 9, 0, 0);
    tentatives.length = 0;
    comptes.clear();
    profils.clear();
    session.id = null;
    for (const nom of Object.keys(pannesRpc)) delete pannesRpc[nom];
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
    creerClientSecret,
    createClient,
    signInWithPassword,
    signOut,
    getClaims,
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
