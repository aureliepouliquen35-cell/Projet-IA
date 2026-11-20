import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lectures de l'écran I3 (story 1.8 ; FR-11, FR-14, AD-1, AD-5, AD-7,
// AD-12, AD-13), avec Supabase simulé : matrice de la story (accueil, page
// suivante, page impossible ou trop loin, une seule page, base vide, panne,
// appel sans profil actif), contrôle de la réponse, journal sans donnée de
// demandeur, réglage de développement `ESSAI_LISTE_DEMANDES`.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import {
  compterATraiter,
  lireListeDemandes,
  lirePage,
  PAGE_MAXIMALE,
} from "@/server/lectures/demandes";
import { ATTENTE_ESSAI_LENT_MS, modeEssaiListe } from "@/server/lectures/essai";
import { TAILLE_PAGE } from "@/shared/constantes";

import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

/** Lignes d'erreur écrites au journal technique, avec leur code. */
function erreursJournal() {
  return simulation.rpc.mock.calls
    .filter(([nom]) => nom === "ecrire_journal")
    .map(([, p]) => p as Record<string, unknown>);
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("lirePage (?page=)", () => {
  it.each([
    [undefined, 1],
    ["", 1],
    ["1", 1],
    ["2", 2],
    ["0", 1],
    ["abc", 1],
    ["-3", 1],
    ["2.5", 1],
    [" 2", 1],
    ["1e3", 1],
    [["3", "4"], 3],
  ] as const)("%j → page %d", (valeur, attendue) => {
    expect(lirePage(valeur as string | string[] | undefined)).toBe(attendue);
  });

  it("un nombre immense est ramené à PAGE_MAXIMALE (la base le ramène ensuite à la dernière page)", () => {
    expect(lirePage("99999999999999999999999")).toBe(PAGE_MAXIMALE);
  });
});

describe("lireListeDemandes", () => {
  it("accueil : 42 demandes, page 1 de 25 lignes, plus récentes d'abord", async () => {
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    const resultat = await lireListeDemandes(1);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.donnees).toMatchObject({ total: 42, page: 1, pages: 2 });
    expect(resultat.donnees.demandes).toHaveLength(TAILLE_PAGE);
    expect(resultat.donnees.demandes[0]).toEqual({
      id: "00000000-0000-4000-8000-000000000042",
      reference: "NOVA-2026-0042",
      dateDepot: "2026-11-08T07:47:00.000Z",
      nom: "Demandeur 42",
      objet: "Objet de la demande 42",
      categorie: "Problème technique",
      statut: "nouvelle",
    });
    const dates = resultat.donnees.demandes.map((d) => Date.parse(d.dateDepot));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(simulation.appels("lister_demandes")).toEqual([]);
    expect(simulation.rpcSession).toHaveBeenCalledWith("lister_demandes", { p_page: 1, p_taille: 25 });
  });

  it("page suivante : lignes 26 à 42", async () => {
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    const resultat = await lireListeDemandes(2);
    expect(resultat.ok && resultat.donnees.page).toBe(2);
    expect(resultat.ok && resultat.donnees.demandes.map((d) => d.reference)).toEqual(
      Array.from({ length: 17 }, (_, i) => `NOVA-2026-${String(17 - i).padStart(4, "0")}`),
    );
  });

  it("page trop loin (9 avec 2 pages) : la dernière", async () => {
    simulation.demandes.push(...fabriquerDemandes(42));
    const resultat = await lireListeDemandes(9);
    expect(resultat.ok && resultat.donnees).toMatchObject({ page: 2, pages: 2 });
  });

  it("une seule page : « Page 1 sur 1 »", async () => {
    simulation.demandes.push(...fabriquerDemandes(25));
    const resultat = await lireListeDemandes(1);
    expect(resultat.ok && resultat.donnees).toMatchObject({ total: 25, page: 1, pages: 1 });
  });

  it("base vide : total 0, page 1, aucune ligne", async () => {
    await expect(lireListeDemandes(3)).resolves.toEqual({
      ok: true,
      donnees: { total: 0, page: 1, pages: 1, demandes: [] },
    });
  });

  it("à même date, la référence la plus grande d'abord", async () => {
    const [a, b] = fabriquerDemandes(2);
    simulation.demandes.push({ ...b, date_depot: a.date_depot }, a);
    const resultat = await lireListeDemandes(1);
    expect(resultat.ok && resultat.donnees.demandes.map((d) => d.reference)).toEqual([
      "NOVA-2026-0002",
      "NOVA-2026-0001",
    ]);
  });
});

describe("compterATraiter (AD-5)", () => {
  it("5 Nouvelle sur 42 : 5", async () => {
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 5 });
  });

  it("base vide : 0", async () => {
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 0 });
  });

  it("le compte vient de la base (une Urgente En cours compte aussi, une Urgente Traitée non)", async () => {
    const [a, b, c] = fabriquerDemandes(3, 1);
    simulation.demandes.push(a, { ...b, statut: "en_cours", priorite: "urgente" }, {
      ...c,
      statut: "traitee",
      priorite: "urgente",
    });
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 2 });
  });
});

describe("garde (AD-7) : vérifiée avant toute lecture", () => {
  it.each([
    ["lireListeDemandes", () => lireListeDemandes(1)],
    ["compterATraiter", () => compterATraiter()],
  ])("%s sans session : renvoi vers /connexion, aucune fonction SQL appelée", async (_, lecture) => {
    simulation.session.id = null;
    await expect(lecture()).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it.each([
    ["lireListeDemandes", () => lireListeDemandes(1)],
    ["compterATraiter", () => compterATraiter()],
  ])("%s, mot de passe à changer : renvoi vers I2", async (_, lecture) => {
    simulation.profils.get(ID_KARIM)!.doit_changer_mdp = true;
    await expect(lecture()).rejects.toMatchObject(renvoiVers("/connexion/nouveau-mot-de-passe"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

describe("panne de lecture (AD-12, AD-13)", () => {
  it.each([
    ["lister_demandes", () => lireListeDemandes(1)],
    ["compter_a_traiter", () => compterATraiter()],
  ])("%s refusée : { ok: false }, erreur_inattendue journalisée avec un code", async (nom, lecture) => {
    simulation.demandes.push(...fabriquerDemandes(3, 1));
    simulation.pannesRpc[nom] = { data: null, error: { code: "57P01", message: "connexion perdue" } };
    await expect(lecture()).resolves.toEqual({ ok: false });
    const lignes = erreursJournal();
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({
      p_niveau: "erreur",
      p_evenement: "erreur_inattendue",
      p_details: { type: "lecture", lecture: nom },
      p_code_erreur: expect.stringMatching(/^[0-9A-Z]{1,7}$/),
    });
  });

  it("refus NV201 de la base (profil désactivé entre la garde et la lecture) : { ok: false }", async () => {
    simulation.pannesRpc.lister_demandes = { data: null, error: { code: "NV201", message: "Accès refusé" } };
    await expect(lireListeDemandes(1)).resolves.toEqual({ ok: false });
    expect(erreursJournal()).toHaveLength(1);
  });

  it("base injoignable (la promesse échoue) : { ok: false }", async () => {
    simulation.rpcSession.mockImplementationOnce(() => ({
      abortSignal: async () => {
        throw new TypeError("fetch failed");
      },
    }));
    await expect(lireListeDemandes(1)).resolves.toEqual({ ok: false });
  });

  it.each([
    ["réponse vide", null],
    ["statut inconnu", { total: 1, page: 1, demandes: [{ ...ligne(), statut: "archivee" }] }],
    ["référence mal formée", { total: 1, page: 1, demandes: [{ ...ligne(), reference: "ABC" }] }],
    ["date illisible", { total: 1, page: 1, demandes: [{ ...ligne(), date_depot: "hier" }] }],
    ["page au-delà du total", { total: 1, page: 2, demandes: [] }],
    ["plus de lignes que le total", { total: 0, page: 1, demandes: [ligne()] }],
    ["plus de 25 lignes", { total: 30, page: 1, demandes: Array.from({ length: 26 }, ligne) }],
  ])("réponse inattendue (%s) : { ok: false }, sans aucune valeur lue dans le message", async (_, data) => {
    simulation.pannesRpc.lister_demandes = { data, error: null };
    await expect(lireListeDemandes(1)).resolves.toEqual({ ok: false });
    expect(erreursJournal()).toHaveLength(1);
    const messages = vi.mocked(console.error).mock.calls.map((appel) => String(appel[1]));
    expect(messages.join("\n")).not.toContain("Demandeur secret");
  });

  it("compteur négatif ou non entier : { ok: false }", async () => {
    simulation.pannesRpc.compter_a_traiter = { data: -1, error: null };
    await expect(compterATraiter()).resolves.toEqual({ ok: false });
    simulation.pannesRpc.compter_a_traiter = { data: "5", error: null };
    await expect(compterATraiter()).resolves.toEqual({ ok: false });
  });

  it("le journal ne reçoit aucune donnée de demandeur", async () => {
    simulation.pannesRpc.lister_demandes = {
      data: { total: 1, page: 1, demandes: [{ ...ligne(), statut: "inconnu" }] },
      error: null,
    };
    await lireListeDemandes(1);
    expect(JSON.stringify(erreursJournal())).not.toContain("Demandeur secret");
  });
});

/** Une ligne bien formée, dont le nom ne doit jamais sortir dans un message. */
function ligne() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    reference: "NOVA-2026-0001",
    date_depot: "2026-11-08T07:47:00+00:00",
    nom: "Demandeur secret",
    objet: "Objet secret",
    categorie: "Autre",
    statut: "nouvelle",
  };
}

describe("ESSAI_LISTE_DEMANDES (développement seulement)", () => {
  it.each(["production", "test"])("sans effet quand NODE_ENV vaut %s", async (env) => {
    vi.stubEnv("NODE_ENV", env);
    vi.stubEnv("ESSAI_LISTE_DEMANDES", "erreur");
    expect(modeEssaiListe()).toBeNull();
    simulation.demandes.push(...fabriquerDemandes(3, 2));
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 2 });
  });

  it("valeur inconnue : sans effet", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ESSAI_LISTE_DEMANDES", "plein");
    expect(modeEssaiListe()).toBeNull();
  });

  it("vide : total 0 et compteur 0, sans lire la base", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ESSAI_LISTE_DEMANDES", "vide");
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    await expect(lireListeDemandes(1)).resolves.toEqual({
      ok: true,
      donnees: { total: 0, page: 1, pages: 1, demandes: [] },
    });
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 0 });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("erreur : panne simulée, journalisée comme une vraie", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ESSAI_LISTE_DEMANDES", "erreur");
    await expect(lireListeDemandes(1)).resolves.toEqual({ ok: false });
    await expect(compterATraiter()).resolves.toEqual({ ok: false });
    expect(erreursJournal().map((l) => l.p_evenement)).toEqual(["erreur_inattendue", "erreur_inattendue"]);
  });

  it("lent : 2 s d'attente, puis la vraie lecture", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ESSAI_LISTE_DEMANDES", "lent");
    vi.useFakeTimers();
    simulation.demandes.push(...fabriquerDemandes(3, 1));
    let fini = false;
    const lecture = compterATraiter().then((r) => {
      fini = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(ATTENTE_ESSAI_LENT_MS - 1);
    expect(fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(lecture).resolves.toEqual({ ok: true, donnees: 1 });
    expect(ATTENTE_ESSAI_LENT_MS).toBe(2000);
  });
});
