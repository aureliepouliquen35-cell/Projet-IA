import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// FR-12 : la recherche trouve une demande par sa référence, le nom, l'email
// ou l'entreprise du demandeur, ou son objet, sans tenir compte des
// majuscules ni des accents, quel que soit son statut ; « Aucune demande
// trouvée » sinon. Matrice de la story 1.9, avec Supabase simulé (la
// simulation applique les règles de la migration, dont le texte est vérifié
// plus bas et dans `tests/liste/migration-recherche-demandes.test.ts`).

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { lireListeDemandes } from "@/server/lectures/demandes";

import { fabriquerDemandes, ID_KARIM, type DemandeSimulee } from "../aides/supabase-connexion";

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIER = readdirSync(DOSSIER).find((f) => f.endsWith("_recherche_demandes.sql"))!;
const SQL = readFileSync(join(DOSSIER, FICHIER), "utf8").replace(/--.*$/gm, "").toLowerCase();

/** 41 demandes fictives, puis celle d'Hélène Dupuis (NOVA-2026-0042), Traitée. */
function remplir() {
  const autres = fabriquerDemandes(42).slice(1);
  const helene: DemandeSimulee = {
    ...fabriquerDemandes(42)[0],
    nom: "Hélène Dupuis",
    email: "helene.dupuis@boulangerie-dupuis.fr",
    entreprise: "Boulangerie Dupuis",
    objet: "Livraison du four à pain",
    statut: "traitee",
  };
  simulation.demandes.push(helene, ...autres);
}

/** Références trouvées et total, pour un texte cherché (page 1). */
async function chercher(q: string, page = 1) {
  const resultat = await lireListeDemandes(page, q);
  if (!resultat.ok) throw new Error("lecture en échec");
  return {
    total: resultat.donnees.total,
    page: resultat.donnees.page,
    recherche: resultat.donnees.recherche,
    references: resultat.donnees.demandes.map((d) => d.reference),
  };
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FR-12 : retrouver une demande par la recherche", () => {
  beforeEach(remplir);

  it.each(["NOVA-2026-0042", "nova-2026-0042", "  NOVA-2026-0042  "])(
    "référence « %s » : seule cette demande, total 1",
    async (q) => {
      await expect(chercher(q)).resolves.toMatchObject({ total: 1, references: ["NOVA-2026-0042"] });
    },
  );

  it.each(["helene", "HÉLÈNE", "Hélène", "hélene dupuis", "HELENE DUPUIS"])(
    "sans majuscules ni accents : « %s » trouve Hélène Dupuis",
    async (q) => {
      await expect(chercher(q)).resolves.toMatchObject({ references: ["NOVA-2026-0042"] });
    },
  );

  it.each([
    ["email", "dupuis@"],
    ["entreprise", "boulang"],
    ["objet", "FOUR A PAIN"],
  ])("par %s (« %s »), quel que soit le statut (ici Traitée)", async (_, q) => {
    await expect(chercher(q)).resolves.toMatchObject({ total: 1, references: ["NOVA-2026-0042"] });
  });

  it("une partie du texte trouve toutes les demandes qui le contiennent", async () => {
    // « entreprise 2 » : les entreprises 2, 20, 22, 24, 26 et 28.
    const { total, references } = await chercher("entreprise 2");
    expect(total).toBe(6);
    expect(references).toEqual(["NOVA-2026-0028", "NOVA-2026-0026", "NOVA-2026-0024", "NOVA-2026-0022", "NOVA-2026-0020", "NOVA-2026-0002"]);
  });

  it("un mot ne déborde pas d'un champ sur le suivant", async () => {
    // Nom « Hélène Dupuis » puis email « helene.dupuis@… » : « dupuis helene » ne correspond à rien.
    await expect(chercher("dupuis helene")).resolves.toMatchObject({ total: 0, references: [] });
  });

  it("rien ne correspond (« zzzz ») : aucune ligne, total 0", async () => {
    await expect(chercher("zzzz")).resolves.toEqual({ total: 0, page: 1, recherche: "zzzz", references: [] });
  });

  it.each(["", "   ", "\t"])("texte vide ou espaces (%j) : la liste complète, sans p_q", async (q) => {
    await expect(chercher(q)).resolves.toMatchObject({ total: 42, recherche: "" });
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", { p_page: 1, p_taille: 25 });
  });

  it.each(["%", "_", "'", "\\"])("« %s » est cherché tel quel, pas comme un joker", async (q) => {
    await expect(chercher(q)).resolves.toMatchObject({ total: 0 });
  });

  it("caractères spéciaux présents dans une demande : trouvés tels quels", async () => {
    simulation.demandes[1].objet = "Remise de 10 % sur l'offre_pro \\ test";
    for (const q of ["10 %", "l'offre", "offre_pro", "\\ test"]) {
      await expect(chercher(q)).resolves.toMatchObject({ total: 1, references: ["NOVA-2026-0041"] });
    }
  });

  it("texte de plus de 150 caractères : coupé à 150 avant d'être envoyé", async () => {
    await chercher(`helene${"x".repeat(300)}`);
    const [, parametres] = simulation.rpcSession.mock.calls.at(-1)!;
    expect(Array.from(String(parametres?.p_q))).toHaveLength(150);
  });

  it("plusieurs pages : 30 résultats, page 2 = lignes 26 à 30", async () => {
    simulation.demandes.length = 0;
    simulation.demandes.push(
      ...fabriquerDemandes(40).map((d, i) => (i < 30 ? { ...d, objet: `Essai ${d.reference}` } : d)),
    );
    const { total, page, references } = await chercher("essai", 2);
    expect({ total, page }).toEqual({ total: 30, page: 2 });
    expect(references).toEqual(["NOVA-2026-0015", "NOVA-2026-0014", "NOVA-2026-0013", "NOVA-2026-0012", "NOVA-2026-0011"]);
  });

  it("la référence, le nom, l'email, l'entreprise et l'objet sont cherchés dans la base, sans accents ni majuscules", () => {
    for (const champ of ["reference", "nom", "email", "entreprise", "objet"]) {
      expect(SQL).toContain(`strpos(public.normaliser_recherche(d.${champ}), v_q) > 0`);
    }
    expect(SQL).toContain("lower(extensions.unaccent(");
  });
});
