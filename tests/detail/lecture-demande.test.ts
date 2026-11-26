import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lecture du détail I4 (story 1.10 ; FR-15, FR-17, AD-1, AD-7, AD-13), avec
// Supabase simulé : demande existante, référence en minuscules, inconnue ou
// mal formée (aucun appel à la base), sans session, panne levée sans donnée
// du demandeur, réponse inattendue.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { onRequestError } from "@/instrumentation";
import { lireDemande, lireReference } from "@/server/lectures/demande";

import { detailSimule, fabriquerDemandes, ID_KARIM, type DemandeSimulee } from "../aides/supabase-connexion";

/** La demande de Claire (EXPERIENCE.md, Flux 1). */
const CLAIRE: DemandeSimulee = {
  ...fabriquerDemandes(42)[0],
  nom: "Claire Martin",
  email: "claire.martin@cabinet-martin.fr",
  telephone: null,
  entreprise: "Cabinet Martin Expertise",
  objet: "Accès impossible à l'outil de facturation",
  description: "Depuis ce matin, l'outil affiche « session refusée ».\nJ'ai redémarré le poste.",
  statut: "nouvelle",
};

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  simulation.demandes.push(CLAIRE, ...fabriquerDemandes(41));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("lireReference", () => {
  it.each([
    ["NOVA-2026-0042", "NOVA-2026-0042"],
    ["nova-2026-0042", "NOVA-2026-0042"],
    [" Nova-2026-0042 ", "NOVA-2026-0042"],
    ["NOVA-2026-12345", "NOVA-2026-12345"],
    ["abc", null],
    ["", null],
    ["NOVA-26-0042", null],
    ["NOVA-2026-42", null],
    ["NOVA-2026-0042x", null],
    ["NOVA-2026-0042/../x", null],
  ])("%j → %j", (valeur, attendue) => {
    expect(lireReference(valeur)).toBe(attendue);
  });
});

describe("lireDemande", () => {
  it("demande existante : tous les champs, dates en ISO, historique", async () => {
    await expect(lireDemande("NOVA-2026-0042")).resolves.toEqual({
      id: "00000000-0000-4000-8000-000000000042",
      reference: "NOVA-2026-0042",
      nom: "Claire Martin",
      email: "claire.martin@cabinet-martin.fr",
      telephone: null,
      entreprise: "Cabinet Martin Expertise",
      objet: "Accès impossible à l'outil de facturation",
      description: "Depuis ce matin, l'outil affiche « session refusée ».\nJ'ai redémarré le poste.",
      categorie: "Problème technique",
      categorieActive: true,
      canal: "formulaire",
      statut: "nouvelle",
      dateDepot: "2026-11-08T07:47:00.000Z",
      dateCloture: null,
      evenements: [
        { type: "creation", auteur: { interne: false, libelle: "demandeur" }, date: "2026-11-08T07:47:00.000Z" },
      ],
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("lire_demande", { p_reference: "NOVA-2026-0042" });
  });

  it("référence en minuscules : même demande, envoyée en majuscules à la base", async () => {
    const demande = await lireDemande("nova-2026-0042");
    expect(demande?.reference).toBe("NOVA-2026-0042");
    expect(simulation.rpcSession).toHaveBeenCalledWith("lire_demande", { p_reference: "NOVA-2026-0042" });
  });

  it("référence inconnue : null", async () => {
    await expect(lireDemande("NOVA-2026-9999")).resolves.toBeNull();
    expect(simulation.rpcSession).toHaveBeenCalledTimes(1);
  });

  it.each(["abc", "NOVA-2026", "<script>"])("référence mal formée (%j) : null, aucun appel à la base", async (valeur) => {
    await expect(lireDemande(valeur)).resolves.toBeNull();
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("garde l'ordre reçu de la base (du plus ancien au plus récent)", async () => {
    simulation.demandes[0] = {
      ...CLAIRE,
      evenements: [
        { type: "creation", auteur: "demandeur", date: "2026-11-08T07:47:00+00:00" },
        { type: "creation", auteur: "systeme", date: "2026-11-08T09:00:00+00:00" },
        { type: "creation", auteur: "demandeur", date: "2026-11-08T09:00:00+00:00" },
      ],
    };
    const demande = await lireDemande("NOVA-2026-0042");
    expect(demande?.evenements).toEqual([
      { type: "creation", auteur: { interne: false, libelle: "demandeur" }, date: "2026-11-08T07:47:00.000Z" },
      { type: "creation", auteur: { interne: false, libelle: "systeme" }, date: "2026-11-08T09:00:00.000Z" },
      { type: "creation", auteur: { interne: false, libelle: "demandeur" }, date: "2026-11-08T09:00:00.000Z" },
    ]);
  });

  it("téléphone et entreprise renseignés", async () => {
    simulation.demandes[0] = { ...CLAIRE, telephone: "06 12 34 56 78", entreprise: null, canal: "telephone" };
    const demande = await lireDemande("NOVA-2026-0042");
    expect(demande).toMatchObject({ telephone: "06 12 34 56 78", entreprise: null, canal: "telephone" });
  });
});

describe("garde (AD-7) : vérifiée avant toute lecture", () => {
  it("sans session : renvoi vers /connexion, aucune fonction SQL appelée", async () => {
    simulation.session.id = null;
    await expect(lireDemande("NOVA-2026-0042")).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("mot de passe à changer : renvoi vers I2", async () => {
    simulation.profils.get(ID_KARIM)!.doit_changer_mdp = true;
    await expect(lireDemande("NOVA-2026-0042")).rejects.toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

describe("panne (AD-12, AD-13) : levée, sans donnée du demandeur", () => {
  /** Données de Claire qui ne doivent paraître ni dans l'erreur, ni au journal. */
  const DONNEES = ["Claire", "claire.martin", "Cabinet Martin", "facturation", "session refusée"];

  async function erreurDe(lecture: Promise<unknown>): Promise<Error> {
    const erreur = await lecture.then(
      () => null,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(Error);
    return erreur as Error;
  }

  /** Un événement complet de `lire_demande` (migration 1.11), à modifier. */
  const evenement = (champs: Record<string, unknown>) => ({
    type: "creation",
    auteur: "demandeur",
    auteur_nom: null,
    ancien_statut: null,
    nouveau_statut: null,
    date: "2026-11-08T07:47:00Z",
    ...champs,
  });
  const avecEvenement = (champs: Record<string, unknown>) => ({
    data: { ...detailSimule(CLAIRE), evenements: [evenement(champs)] },
    error: null,
  });
  const INATTENDUE = /^Réponse inattendue de lire_demande/;

  it.each([
    ["refus de la base", { data: null, error: { code: "57P01", message: "connexion perdue : Claire Martin" } }, /lire_demande/],
    ["refus NV201 (profil désactivé entre la garde et la lecture)", { data: null, error: { code: "NV201", message: "Accès refusé" } }, /lire_demande/],
    ["réponse inattendue", { data: { ...detailSimule(CLAIRE), statut: "archivee" }, error: null }, INATTENDUE],
    ["événement inconnu", avecEvenement({ type: "suppression" }), INATTENDUE],
    ["autre demande renvoyée", { data: { ...detailSimule(CLAIRE), reference: "NOVA-2026-0041" }, error: null }, INATTENDUE],
    ["événement sans auteur", avecEvenement({ auteur: null, auteur_nom: null }), INATTENDUE],
    ["événement à deux auteurs", avecEvenement({ auteur: "demandeur", auteur_nom: "Karim Benali" }), INATTENDUE],
    [
      "changement de statut sans ancien statut",
      avecEvenement({ type: "statut", auteur: null, auteur_nom: "Karim Benali", ancien_statut: null, nouveau_statut: "en_cours" }),
      INATTENDUE,
    ],
    ["création avec des statuts", avecEvenement({ ancien_statut: "nouvelle", nouveau_statut: "en_cours" }), INATTENDUE],
    // Story 4.2 : `categorie_active` est obligatoire (migration 4.2).
    ["sans categorie_active", { data: { ...detailSimule(CLAIRE), categorie_active: undefined }, error: null }, INATTENDUE],
    ["categorie_active qui n'est pas un booléen", { data: { ...detailSimule(CLAIRE), categorie_active: "non" }, error: null }, INATTENDUE],
  ])("%s : erreur levée, message sans donnée du demandeur", async (_, retour, message) => {
    simulation.pannesRpc.lire_demande = retour;
    const erreur = await erreurDe(lireDemande("NOVA-2026-0042"));
    for (const donnee of DONNEES) expect(erreur.message).not.toContain(donnee);
    expect(erreur.message).toMatch(message);
  });

  it("réponse inattendue : le message ne cite que les champs en cause", async () => {
    simulation.pannesRpc.lire_demande = {
      data: { ...detailSimule(CLAIRE), statut: "archivee", email: 42 },
      error: null,
    };
    const erreur = await erreurDe(lireDemande("NOVA-2026-0042"));
    expect(erreur.message).toBe("Réponse inattendue de lire_demande (email, statut).");
  });

  it("base injoignable (la promesse échoue) : l'erreur remonte (écran S3)", async () => {
    simulation.rpcSession.mockImplementationOnce(() => ({
      abortSignal: () => Promise.reject(new TypeError("fetch failed")),
    }));
    await expect(lireDemande("NOVA-2026-0042")).rejects.toThrow("fetch failed");
  });

  it("journal : seulement la page (avec la référence) et le code, jamais le message ni les paramètres", async () => {
    simulation.pannesRpc.lire_demande = {
      data: null,
      error: { code: "57P01", message: "connexion perdue" },
    };
    const erreur = Object.assign(await erreurDe(lireDemande("NOVA-2026-0042")), { digest: "1234567" });
    await onRequestError(
      erreur,
      { path: "/demandes/NOVA-2026-0042?q=claire.martin%40cabinet-martin.fr&page=2", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/demandes/[reference]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined },
    );
    expect(simulation.journal()).toEqual([
      {
        evenement: "erreur_inattendue",
        details: { page: "/demandes/NOVA-2026-0042", route: "/demandes/[reference]", type: "render" },
      },
    ]);
    const ligne = JSON.stringify(simulation.rpc.mock.calls);
    for (const donnee of [...DONNEES, "claire", "connexion perdue", "page=2"]) expect(ligne).not.toContain(donnee);
    expect(simulation.appels("ecrire_journal")[0]).toMatchObject({ p_code_erreur: "QGLJ" });
  });
});
