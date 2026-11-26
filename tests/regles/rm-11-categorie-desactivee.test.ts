import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-11 : une catégorie désactivée disparaît du formulaire. Les demandes qui
// l'utilisent la gardent, avec la mention « (désactivée) » sur le détail
// I4, et le filtre de la liste I3 la propose encore (story 4.2, critère 1).
// Supabase est simulé ; le formulaire public P1 (lu avec la clé secrète)
// est vérifié sur le texte de sa lecture.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
}));

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import { actionChangerEtatCategorie } from "@/server/actions/changer-etat-categorie";
import { lireDemande } from "@/server/lectures/demande";
import { lireCategoriesFiltre } from "@/server/lectures/demandes";
import { lireFormulaireSaisie } from "@/server/lectures/saisie";

import { texteDe } from "../aides/formulaire-depot";
import { CATEGORIES_DEPART, fabriquerDemandes, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const AUTRE = CATEGORIES_DEPART[4];
const [DEMANDE] = fabriquerDemandes(1);

beforeEach(async () => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.demandes.push({ ...DEMANDE, categorie: "Autre" });
  // Sophie désactive « Autre », utilisée par une demande.
  simulation.session.id = ID_SOPHIE;
  await expect(actionChangerEtatCategorie({ categorieId: AUTRE.id, active: false })).resolves.toMatchObject({ ok: true });
  // Karim, collaborateur, travaille ensuite.
  simulation.session.id = ID_KARIM;
});

describe("RM-11 : une catégorie désactivée", () => {
  it("disparaît de la saisie I5", async () => {
    const formulaire = await lireFormulaireSaisie();
    expect(formulaire.categories.map((c) => c.nom)).toEqual(CATEGORIES_DEPART.slice(0, 4).map((c) => c.nom));
  });

  it("disparaît du formulaire public P1 : sa lecture ne garde que les catégories actives", () => {
    const source = readFileSync(join(process.cwd(), "src", "server", "depot", "index.ts"), "utf8");
    expect(source).toMatch(/\.from\("categories"\)\s*\.select\("id, nom"\)\s*\.eq\("active", true\)/);
  });

  it("reste sur la demande, avec la mention « (désactivée) » sur le détail I4", async () => {
    await expect(lireDemande(DEMANDE.reference)).resolves.toMatchObject({ categorie: "Autre", categorieActive: false });
    const html = renderToStaticMarkup(
      await ContenuDemande({ params: Promise.resolve({ reference: DEMANDE.reference }), searchParams: Promise.resolve({}) }),
    );
    expect(texteDe(html)).toContain("Catégorie Autre (désactivée)");
  });

  it("reste proposée par le filtre Catégorie de I3, après les actives", async () => {
    const filtre = await lireCategoriesFiltre();
    expect(filtre.ok && filtre.donnees.at(-1)).toMatchObject({ id: AUTRE.id, nom: "Autre", active: false });
  });

  it("réactivée : elle revient dans la saisie, et la mention disparaît", async () => {
    simulation.session.id = ID_SOPHIE;
    await actionChangerEtatCategorie({ categorieId: AUTRE.id, active: true });
    simulation.session.id = ID_KARIM;
    expect((await lireFormulaireSaisie()).categories.map((c) => c.nom)).toContain("Autre");
    await expect(lireDemande(DEMANDE.reference)).resolves.toMatchObject({ categorieActive: true });
  });
});
