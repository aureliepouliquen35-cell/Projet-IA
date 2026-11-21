import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function « changer le statut » (story 1.11 ; FR-16, FR-17, AD-2,
// AD-5, AD-7, AD-12, AD-13), avec Supabase simulé : chaque ligne de la
// matrice de la story (passer En cours, marquer Traitée, rouvrir, collègue
// passé avant, même statut, retour à Nouvelle, demande supprimée, panne,
// collègue qui a clôturé), la garde et le journal.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionChangerStatut } from "@/server/actions/changer-statut";
import { lireDemande } from "@/server/lectures/demande";
import { compterATraiter } from "@/server/lectures/demandes";

import { fabriquerDemandes, ID_KARIM, type DemandeSimulee } from "../aides/supabase-connexion";

/** La demande de Claire (EXPERIENCE.md, Flux 1), *Nouvelle*. */
const CLAIRE: DemandeSimulee = {
  ...fabriquerDemandes(42)[0],
  nom: "Claire Martin",
  email: "claire.martin@cabinet-martin.fr",
  entreprise: "Cabinet Martin Expertise",
  objet: "Accès impossible à l'outil de facturation",
  statut: "nouvelle",
};
const REFERENCE = "NOVA-2026-0042";

/** Création par Claire, puis Lucas l'a passée *En cours* à 9 h 11 (heure de Paris). */
const PAR_LUCAS: DemandeSimulee = {
  ...CLAIRE,
  statut: "en_cours",
  evenements: [
    { type: "creation", auteur: "demandeur", date: "2026-11-08T07:47:00+00:00" },
    {
      type: "statut",
      auteur: null,
      auteur_nom: "Lucas Bernard",
      ancien_statut: "nouvelle",
      nouveau_statut: "en_cours",
      date: "2026-11-20T08:11:00+00:00",
    },
  ],
};

/** Lucas l'a clôturée à 9 h 11. */
const CLOTUREE_PAR_LUCAS: DemandeSimulee = {
  ...PAR_LUCAS,
  statut: "traitee",
  date_cloture: "2026-11-20T08:11:00+00:00",
  evenements: [
    PAR_LUCAS.evenements![0],
    { ...PAR_LUCAS.evenements![1], nouveau_statut: "traitee" },
  ],
};

const MODIFIEE_PAR_LUCAS = "Cette demande a été modifiée par Lucas Bernard à 9 h 11. L'affichage a été mis à jour.";

const changer = (statutVu: unknown, nouveauStatut: unknown, reference: unknown = REFERENCE) =>
  actionChangerStatut({ reference, statutVu, nouveauStatut });

/** La demande de Claire, telle que la base la garde. */
const claire = () => simulation.demandes.find((d) => d.reference === REFERENCE)!;

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  simulation.demandes.push({ ...CLAIRE }, ...fabriquerDemandes(41, 4));
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("passer En cours (Nouvelle → En cours)", () => {
  it("appliqué : réponse, appel de changer_statut, page recalculée", async () => {
    await expect(changer("nouvelle", "en_cours")).resolves.toEqual({
      ok: true,
      donnees: { statut: "en_cours", modifiee: null },
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("changer_statut", {
      p_reference: REFERENCE,
      p_statut_vu: "nouvelle",
      p_nouveau_statut: "en_cours",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("le détail relu : badge En cours, « Statut : Nouvelle → En cours » par Karim, à l'heure, pas de clôture", async () => {
    await changer("nouvelle", "en_cours");
    const demande = await lireDemande(REFERENCE);
    expect(demande?.statut).toBe("en_cours");
    expect(demande?.dateCloture).toBeNull();
    expect(demande?.evenements.at(-1)).toEqual({
      type: "statut",
      auteur: { interne: true, nom: "Karim Benali" },
      ancienStatut: "nouvelle",
      nouveauStatut: "en_cours",
      date: "2026-11-20T09:00:00.000Z",
    });
    expect(demande?.evenements).toHaveLength(2);
  });

  it("le compteur « à traiter » baisse de 1", async () => {
    const avant = await compterATraiter();
    await changer("nouvelle", "en_cours");
    const apres = await compterATraiter();
    expect(avant).toEqual({ ok: true, donnees: 5 });
    expect(apres).toEqual({ ok: true, donnees: 4 });
  });

  it("référence en minuscules : envoyée en majuscules", async () => {
    await changer("nouvelle", "en_cours", "nova-2026-0042");
    expect(simulation.rpcSession).toHaveBeenCalledWith("changer_statut", expect.objectContaining({ p_reference: REFERENCE }));
  });
});

describe("marquer Traitée", () => {
  it.each(["nouvelle", "en_cours"] as const)("depuis %s : Traitée, date de clôture posée", async (depuis) => {
    claire().statut = depuis;
    await expect(changer(depuis, "traitee")).resolves.toEqual({ ok: true, donnees: { statut: "traitee", modifiee: null } });
    const demande = await lireDemande(REFERENCE);
    expect(demande?.statut).toBe("traitee");
    expect(demande?.dateCloture).toBe("2026-11-20T09:00:00.000Z");
    expect(demande?.evenements.at(-1)).toMatchObject({ type: "statut", ancienStatut: depuis, nouveauStatut: "traitee" });
  });
});

describe("rouvrir (Traitée → En cours)", () => {
  it("confirmé (vu Traitée) : En cours, date de clôture effacée", async () => {
    simulation.demandes[0] = { ...CLOTUREE_PAR_LUCAS };
    await expect(changer("traitee", "en_cours")).resolves.toEqual({ ok: true, donnees: { statut: "en_cours", modifiee: null } });
    const demande = await lireDemande(REFERENCE);
    expect(demande?.statut).toBe("en_cours");
    expect(demande?.dateCloture).toBeNull();
    expect(demande?.evenements.at(-1)).toMatchObject({ ancienStatut: "traitee", nouveauStatut: "en_cours" });
  });
});

describe("un collègue est passé avant (FR-16, AD-5)", () => {
  it("passage encore permis (vu Nouvelle, réel En cours, « Marquer Traitée ») : appliqué depuis le statut réel, encadré", async () => {
    simulation.demandes[0] = { ...PAR_LUCAS };
    await expect(changer("nouvelle", "traitee")).resolves.toEqual({
      ok: true,
      donnees: { statut: "traitee", modifiee: MODIFIEE_PAR_LUCAS },
    });
    const demande = await lireDemande(REFERENCE);
    // L'historique montre les deux actions, chacune depuis le statut réel.
    expect(demande?.evenements.slice(1).map((e) => (e.type === "statut" ? [e.auteur, e.ancienStatut, e.nouveauStatut] : null))).toEqual([
      [{ interne: true, nom: "Lucas Bernard" }, "nouvelle", "en_cours"],
      [{ interne: true, nom: "Karim Benali" }, "en_cours", "traitee"],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("même statut (vu Nouvelle, réel En cours, « Passer En cours ») : CONFLIT, aucun événement, page recalculée", async () => {
    simulation.demandes[0] = { ...PAR_LUCAS };
    await expect(changer("nouvelle", "en_cours")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: MODIFIEE_PAR_LUCAS,
    });
    expect(claire().evenements).toHaveLength(2);
    expect(claire().statut).toBe("en_cours");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("collègue a clôturé, je demande En cours sans avoir vu Traitée : CONFLIT, rien n'est appliqué", async () => {
    simulation.demandes[0] = { ...CLOTUREE_PAR_LUCAS };
    await expect(changer("nouvelle", "en_cours")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: MODIFIEE_PAR_LUCAS,
    });
    expect(claire().statut).toBe("traitee");
    expect(claire().evenements).toHaveLength(2);
  });

  it("vue En cours, « Marquer Traitée », collègue l'a déjà clôturée : CONFLIT, aucun événement", async () => {
    simulation.demandes[0] = { ...CLOTUREE_PAR_LUCAS };
    await expect(changer("en_cours", "traitee")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: MODIFIEE_PAR_LUCAS,
    });
    expect(claire().statut).toBe("traitee");
    expect(claire().date_cloture).toBe("2026-11-20T08:11:00+00:00");
    expect(claire().evenements).toHaveLength(2);
  });

  it("vue Traitée, « Rouvrir », collègue l'a déjà rouverte : CONFLIT, aucun événement", async () => {
    simulation.demandes[0] = {
      ...CLAIRE,
      statut: "en_cours",
      date_cloture: null,
      evenements: [
        CLOTUREE_PAR_LUCAS.evenements![0],
        { ...CLOTUREE_PAR_LUCAS.evenements![1], date: "2026-11-20T08:00:00+00:00" },
        {
          type: "statut",
          auteur: null,
          auteur_nom: "Lucas Bernard",
          ancien_statut: "traitee",
          nouveau_statut: "en_cours",
          date: "2026-11-20T08:11:00+00:00",
        },
      ],
    };
    await expect(changer("traitee", "en_cours")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: MODIFIEE_PAR_LUCAS,
    });
    expect(claire().statut).toBe("en_cours");
    expect(claire().evenements).toHaveLength(3);
  });

  it("l'heure de l'encadré est celle de Paris, heure seule (été comme hiver)", async () => {
    simulation.demandes[0] = {
      ...PAR_LUCAS,
      evenements: [{ ...PAR_LUCAS.evenements![1], date: "2026-07-01T07:05:00+00:00" }],
    };
    const reponse = await changer("nouvelle", "en_cours");
    expect(reponse).toMatchObject({ message: "Cette demande a été modifiée par Lucas Bernard à 9 h 05. L'affichage a été mis à jour." });
  });

  it("statut réel différent sans auteur connu (cas imprévu) : encadré générique", async () => {
    simulation.demandes[0] = { ...CLAIRE, statut: "en_cours", evenements: undefined };
    await expect(changer("nouvelle", "en_cours")).resolves.toEqual({
      ok: false,
      code: "CONFLIT",
      message: "Cette demande a été modifiée entre-temps. L'affichage a été mis à jour.",
    });
  });
});

describe("retour à Nouvelle et saisies impossibles : VALIDATION, sans appel à la base (RM-4)", () => {
  it.each([
    ["retour à Nouvelle depuis En cours", { reference: REFERENCE, statutVu: "en_cours", nouveauStatut: "nouvelle" }],
    ["retour à Nouvelle depuis Traitée", { reference: REFERENCE, statutVu: "traitee", nouveauStatut: "nouvelle" }],
    ["statut inconnu", { reference: REFERENCE, statutVu: "nouvelle", nouveauStatut: "archivee" }],
    ["statut vu inconnu", { reference: REFERENCE, statutVu: "fermee", nouveauStatut: "en_cours" }],
    ["référence mal formée", { reference: "abc", statutVu: "nouvelle", nouveauStatut: "en_cours" }],
    ["référence absente", { statutVu: "nouvelle", nouveauStatut: "en_cours" }],
    ["saisie vide", null],
    ["saisie texte", "en_cours"],
  ])("%s", async (_, saisie) => {
    await expect(actionChangerStatut(saisie)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "Le statut n'a pas pu être modifié. Réessayez.",
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(claire().statut).toBe("nouvelle");
  });

  it.each(["NV301", "NV302"])("refus %s de la base (appel direct) : VALIDATION", async (code) => {
    simulation.pannesRpc.changer_statut = { data: null, error: { code, message: "refusé" } };
    await expect(changer("nouvelle", "en_cours")).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.journal()).toEqual([]);
  });

  it("la base refuse elle aussi le retour à Nouvelle (simulation de la migration)", async () => {
    const { data, error } = await (await simulation.createClient())
      .rpc("changer_statut", { p_reference: REFERENCE, p_statut_vu: "en_cours", p_nouveau_statut: "nouvelle" })
      .abortSignal(AbortSignal.timeout(1000));
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: "NV301" });
  });
});

describe("demande supprimée (référence inconnue)", () => {
  it("INTROUVABLE, page recalculée (elle affiche « demande introuvable »)", async () => {
    await expect(changer("nouvelle", "en_cours", "NOVA-2026-9999")).resolves.toEqual({
      ok: false,
      code: "INTROUVABLE",
      message: "Cette demande n'existe pas ou a été supprimée.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("garde (AD-7)", () => {
  it("sans session : renvoi vers la connexion, aucun appel", async () => {
    simulation.session.id = null;
    await expect(changer("nouvelle", "en_cours")).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("compte désactivé : renvoi vers la connexion, rien n'est changé", async () => {
    simulation.profils.get(ID_KARIM)!.actif = false;
    await expect(changer("nouvelle", "en_cours")).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(claire().statut).toBe("nouvelle");
  });
});

describe("panne (AD-12, AD-13)", () => {
  /** Données de la demande qui ne doivent jamais paraître au journal. */
  const DONNEES = ["Claire", "claire.martin", "Cabinet Martin", "facturation", "connexion perdue"];

  it.each([
    ["base injoignable (refus)", { data: null, error: { code: "57P01", message: "connexion perdue : Claire Martin" } }],
    ["réponse inattendue", { data: { resultat: "supprimee", statut: null, modifiee_par: null }, error: null }],
    ["statut absent", { data: { resultat: "applique", statut: null, modifiee_par: null }, error: null }],
  ])("%s : ERREUR_INTERNE avec code, journal sans donnée de la demande", async (_, retour) => {
    simulation.pannesRpc.changer_statut = retour;
    const reponse = await changer("nouvelle", "en_cours");
    expect(reponse).toEqual({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Une erreur inattendue s'est produite.",
      codeSupport: expect.stringMatching(/^[0-9A-Z]{4,}$/),
    });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "action", action: "changer_statut" } },
    ]);
    const journal = JSON.stringify(simulation.appels("ecrire_journal"));
    for (const donnee of DONNEES) expect(journal).not.toContain(donnee);
    expect(journal).toContain(reponse.ok ? "" : reponse.codeSupport!);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("réseau coupé (la promesse échoue) : ERREUR_INTERNE", async () => {
    simulation.rpcSession.mockImplementationOnce(() => ({
      abortSignal: () => Promise.reject(new TypeError("fetch failed")),
    }));
    await expect(changer("nouvelle", "en_cours")).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
  });
});
