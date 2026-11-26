import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Server Function « supprimer définitivement une demande » (story 4.4 ;
// FR-28, RM-5, RM-7, AD-2, AD-7, AD-12, AD-13), avec Supabase simulé :
// chaque ligne de la matrice de la story (suppression, recherche ensuite,
// déjà supprimée, collègue qui agit ensuite, collaborateur, rétrogradé,
// référence mal formée, panne), la garde et le journal.

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
import { actionSupprimerDemande } from "@/server/actions/supprimer-demande";
import { lireDemande } from "@/server/lectures/demande";
import { compterATraiter, lireListeDemandes } from "@/server/lectures/demandes";

import { fabriquerDemandes, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE, type DemandeSimulee } from "../aides/supabase-connexion";

/** La demande de Paul Rousseau (EXPERIENCE.md, Flux 5), *Nouvelle*. */
const PAUL: DemandeSimulee = {
  ...fabriquerDemandes(36)[0],
  nom: "Paul Rousseau",
  email: "paul.rousseau@exemple.fr",
  telephone: "06 12 34 56 78",
  entreprise: "Rousseau Conseil",
  objet: "Effacement de mes données",
  description: "Merci de supprimer mes informations personnelles.",
  statut: "nouvelle",
};
const REFERENCE = "NOVA-2026-0036";
/** Données du demandeur qui ne doivent jamais paraître au journal (AD-13). */
const DONNEES_PAUL = ["Paul", "Rousseau", "paul.rousseau", "06 12 34 56 78", "Effacement", "informations personnelles"];

const supprimer = (reference: unknown = REFERENCE) => actionSupprimerDemande({ reference });
const paul = () => simulation.demandes.find((d) => d.reference === REFERENCE);

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  // Sophie, administratrice, est connectée.
  simulation.session.id = ID_SOPHIE;
  simulation.demandes.push({ ...PAUL }, ...fabriquerDemandes(35, 3));
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("suppression (administrateur)", () => {
  it("supprimée : réponse, appel de supprimer_demande avec la session, aucun refresh()", async () => {
    await expect(supprimer()).resolves.toEqual({ ok: true, donnees: { reference: REFERENCE } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("supprimer_demande", { p_reference: REFERENCE });
    expect(simulation.appels("supprimer_demande")).toEqual([]);
    // Le navigateur revient à la liste et la recalcule : pas de S2 entre-temps.
    expect(refresh).not.toHaveBeenCalled();
    expect(paul()).toBeUndefined();
  });

  it("journal : demande_supprimee avec seulement la référence et l'identifiant de l'administrateur (AD-13)", async () => {
    await supprimer();
    expect(simulation.journal()).toEqual([
      { evenement: "demande_supprimee", details: { reference: REFERENCE, auteur: ID_SOPHIE } },
    ]);
    const niveau = simulation.appels("ecrire_journal")[0];
    expect(niveau).toMatchObject({ p_niveau: "info", p_evenement: "demande_supprimee", p_code_erreur: null });
    const journal = JSON.stringify(simulation.appels("ecrire_journal"));
    for (const donnee of DONNEES_PAUL) expect(journal).not.toContain(donnee);
  });

  it("référence en minuscules : envoyée en majuscules", async () => {
    await expect(supprimer("nova-2026-0036")).resolves.toEqual({ ok: true, donnees: { reference: REFERENCE } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("supprimer_demande", { p_reference: REFERENCE });
  });

  it("le détail n'existe plus ; la recherche sur son email : aucune demande ; le compteur ne la compte plus", async () => {
    await expect(lireListeDemandes(1, PAUL.email)).resolves.toMatchObject({ ok: true, donnees: { total: 1 } });
    const avant = await compterATraiter();
    await supprimer();
    await expect(lireDemande(REFERENCE)).resolves.toBeNull();
    await expect(lireListeDemandes(1, PAUL.email)).resolves.toMatchObject({ ok: true, donnees: { total: 0, demandes: [] } });
    const apres = await compterATraiter();
    expect(avant).toEqual({ ok: true, donnees: 4 });
    expect(apres).toEqual({ ok: true, donnees: 3 });
  });

  it("les autres demandes restent", async () => {
    await supprimer();
    expect(simulation.demandes).toHaveLength(35);
  });
});

describe("déjà supprimée (un autre administrateur est passé avant)", () => {
  it("INTROUVABLE, refresh() (la page recalculée affiche S2), rien au journal", async () => {
    await supprimer();
    refresh.mockClear();
    await expect(supprimer()).resolves.toEqual({
      ok: false,
      code: "INTROUVABLE",
      message: "Cette demande n'existe pas ou a été supprimée.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([
      { evenement: "demande_supprimee", details: { reference: REFERENCE, auteur: ID_SOPHIE } },
    ]);
  });

  it("référence bien formée mais inconnue : INTROUVABLE", async () => {
    await expect(supprimer("NOVA-2026-9999")).resolves.toMatchObject({ ok: false, code: "INTROUVABLE" });
    expect(simulation.demandes).toHaveLength(36);
  });
});

describe("collègue qui avait la demande ouverte", () => {
  it("il clique sur un bouton de statut : INTROUVABLE, sa page recalculée affiche S2", async () => {
    await supprimer();
    simulation.session.id = ID_KARIM;
    refresh.mockClear();
    await expect(actionChangerStatut({ reference: REFERENCE, statutVu: "nouvelle", nouveauStatut: "en_cours" })).resolves.toEqual({
      ok: false,
      code: "INTROUVABLE",
      message: "Cette demande n'existe pas ou a été supprimée.",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("collaborateur ou administrateur rétrogradé (RM-7)", () => {
  it("collaborateur qui appelle l'action : « Accès refusé. », refresh(), aucun appel à la base, rien d'effacé", async () => {
    simulation.session.id = ID_KARIM;
    await expect(supprimer()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(paul()).toBeDefined();
  });

  it("rétrogradé pendant que la fenêtre était ouverte : même refus, la zone disparaît au recalcul", async () => {
    simulation.profils.get(ID_SOPHIE)!.role = "collaborateur";
    await expect(supprimer()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(paul()).toBeDefined();
  });

  it("refus de la base (NV202, rétrogradé entre la garde et la base) : ACCES_REFUSE, refresh(), rien au journal", async () => {
    simulation.pannesRpc.supprimer_demande = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    await expect(supprimer()).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(simulation.journal()).toEqual([]);
    expect(paul()).toBeDefined();
  });

  it("règle simulée de supprimer_demande, appelée directement avec la session du collaborateur : NV202, rien d'effacé", async () => {
    simulation.session.id = ID_KARIM;
    const supabase = await simulation.createClient();
    const { data, error } = await supabase.rpc("supprimer_demande", { p_reference: REFERENCE }).abortSignal(AbortSignal.timeout(1000));
    expect(data).toBeNull();
    expect(error).toMatchObject({ code: "NV202" });
    expect(paul()).toBeDefined();
  });

  it("rôle « administrateur » écrit dans les métadonnées de la session : toujours refusé (rôle relu dans profils)", async () => {
    simulation.session.id = ID_KARIM;
    simulation.getClaims.mockResolvedValueOnce({
      data: { claims: { sub: ID_KARIM, user_metadata: { role: "administrateur" }, app_metadata: { role: "administrateur" } } },
      error: null,
    } as never);
    await expect(supprimer()).resolves.toMatchObject({ code: "ACCES_REFUSE" });
    expect(paul()).toBeDefined();
  });
});

describe("saisie refusée sans appel à la base (VALIDATION)", () => {
  it.each([
    ["mal formée", "abc"],
    ["trop longue", `NOVA-2026-${"0".repeat(200)}`],
    ["pas un texte", 42],
    ["nulle", null],
  ])("référence %s : toast d'erreur, aucun appel", async (_, reference) => {
    await expect(supprimer(reference)).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "La demande n'a pas pu être supprimée. Réessayez.",
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it.each([null, {}, "NOVA-2026-0036", ["NOVA-2026-0036"]])("saisie sans référence ou qui n'est pas un objet (%j) : VALIDATION", async (saisie) => {
    await expect(actionSupprimerDemande(saisie)).resolves.toMatchObject({ ok: false, code: "VALIDATION" });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

describe("garde (AD-7)", () => {
  it("sans session : renvoi vers la connexion, aucun appel", async () => {
    simulation.session.id = null;
    await expect(supprimer()).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("compte désactivé : renvoi vers la connexion, rien d'effacé", async () => {
    simulation.profils.get(ID_SOPHIE)!.actif = false;
    await expect(supprimer()).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(paul()).toBeDefined();
  });
});

describe("panne (AD-12, AD-13)", () => {
  it.each([
    ["base injoignable (refus)", { data: null, error: { code: "57P01", message: "connexion perdue : Paul Rousseau" } }],
    ["réponse inattendue", { data: { resultat: "applique", reference: REFERENCE }, error: null }],
    ["réponse vide", { data: null, error: null }],
  ])("%s : ERREUR_INTERNE avec code, journal sans donnée du demandeur, pas de refresh()", async (_, retour) => {
    simulation.pannesRpc.supprimer_demande = retour;
    const reponse = await supprimer();
    expect(reponse).toEqual({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Une erreur inattendue s'est produite.",
      codeSupport: expect.stringMatching(/^[0-9A-Z]{4,}$/),
    });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "action", action: "supprimer_demande" } },
    ]);
    const journal = JSON.stringify(simulation.appels("ecrire_journal"));
    for (const donnee of [...DONNEES_PAUL, "connexion perdue"]) expect(journal).not.toContain(donnee);
    expect(journal).toContain(reponse.ok ? "" : reponse.codeSupport!);
    expect(refresh).not.toHaveBeenCalled();
    expect(paul()).toBeDefined();
  });

  it("réseau coupé (la promesse échoue) : ERREUR_INTERNE", async () => {
    simulation.rpcSession.mockImplementationOnce(() => ({
      abortSignal: () => Promise.reject(new TypeError("fetch failed")),
    }));
    await expect(supprimer()).resolves.toMatchObject({ ok: false, code: "ERREUR_INTERNE" });
  });
});

describe("le code (AD-2, AD-13)", () => {
  const source = readFileSync(join(process.cwd(), "src", "server", "actions", "supprimer-demande.ts"), "utf8").replace(
    /\/\/.*$/gm,
    "",
  );

  it("passe par la fonction SQL avec la session : jamais de delete direct, jamais la clé secrète", () => {
    expect(source).toContain('.rpc("supprimer_demande", { p_reference: reference })');
    expect(source).toContain('from "@/lib/supabase/server"');
    expect(source).not.toMatch(/\.delete\(|\.from\(|supabase-secret|creerClientSecret|@\/server\/admin/);
  });

  it("journalise seulement la référence et l'auteur", () => {
    expect(source).toContain(
      'journaliser("info", "demande_supprimee", { reference: lu.data.reference, auteur: administrateur.id })',
    );
  });
});
