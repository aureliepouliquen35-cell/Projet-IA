import { vi } from "vitest";

// Client Supabase simulé pour `src/server/admin` (story 1.5) : API
// d'administration d'Auth (`createUser`, `deleteUser`) et fonctions SQL
// (`creer_profil`, `modifier_parametres`, `ecrire_journal`). Aucun compte
// n'est créé.
//
// Utilisation, dans un test :
//   const simulation = await vi.hoisted(async () =>
//     (await import("../aides/supabase-admin")).creerSimulation());
//   vi.mock("@/server/supabase-secret", () => ({
//     creerClientSecret: simulation.creerClientSecret,
//   }));

export type ErreurSimulee = { code?: string; message: string; status?: number } | null;
export type RetourRpc = { data: unknown; error: ErreurSimulee };

export const ID_COMPTE = "0b6c3f4e-9a1d-4c2b-8e7f-1a2b3c4d5e6f";

export function creerSimulation() {
  const retoursRpc: Record<string, () => Promise<RetourRpc>> = {};
  const rpc = vi.fn((nom: string, parametres?: Record<string, unknown>) => {
    void parametres;
    return {
      abortSignal: (signal: AbortSignal) => {
        void signal;
        const retour = retoursRpc[nom];
        return retour ? retour() : Promise.resolve({ data: null, error: null });
      },
    };
  });
  const createUser = vi.fn(async (attributs: Record<string, unknown>) => {
    void attributs;
    return { data: { user: { id: ID_COMPTE } }, error: null as ErreurSimulee };
  });
  const deleteUser = vi.fn(async (id: string) => {
    void id;
    return { data: { user: null }, error: null as ErreurSimulee };
  });
  const creerClientSecret = vi.fn(() => ({ auth: { admin: { createUser, deleteUser } }, rpc }));

  /** Remet la simulation dans son état de réussite. */
  function reinitialiser() {
    for (const nom of Object.keys(retoursRpc)) delete retoursRpc[nom];
    createUser.mockReset();
    createUser.mockImplementation(async () => ({ data: { user: { id: ID_COMPTE } }, error: null }));
    deleteUser.mockReset();
    deleteUser.mockImplementation(async () => ({ data: { user: null }, error: null }));
    rpc.mockClear();
    creerClientSecret.mockReset();
    creerClientSecret.mockImplementation(() => ({ auth: { admin: { createUser, deleteUser } }, rpc }));
  }

  /** Appels d'une fonction SQL, avec leurs paramètres. */
  function appels(nom: string): Record<string, unknown>[] {
    return rpc.mock.calls
      .filter(([fonction]) => fonction === nom)
      .map(([, parametres]) => parametres ?? {});
  }

  return { retoursRpc, rpc, createUser, deleteUser, creerClientSecret, reinitialiser, appels };
}
