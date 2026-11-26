import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Lecture de l'écran A3 et Server Function « Enregistrer » des informations
// générales (story 4.3 ; FR-31, RM-7, AD-7, AD-9, AD-11, AD-12, AD-13), avec
// Supabase simulé : chaque ligne de la matrice de la story (enregistrer,
// téléphone vidé, email mal écrit, champ obligatoire vide, trop long,
// collaborateur, panne, ligne absente), la garde et le journal.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `refresh()` n'a de sens que pendant une vraie Server Function de Next.js.
vi.mock("next/cache", () => ({ refresh }));

import { actionModifierParametres } from "@/server/actions/modifier-parametres";
import { lireInformationsGenerales } from "@/server/lectures/parametres";

import {
  CONTACT_DONNEES_SIMULE,
  EMAIL_CONTACT_SIMULE,
  EMAIL_SOPHIE,
  ID_KARIM,
  ID_SOPHIE,
  PROFIL_SOPHIE,
  TELEPHONE_SIMULE,
  type RetourRpc,
} from "../aides/supabase-connexion";

const PANNE = "Les informations n'ont pas pu être enregistrées. Réessayez.";
const OBLIGATOIRE = "Ce champ est obligatoire";
const FORME = "L'email doit avoir la forme nom@exemple.fr";

const VALIDES = {
  telephone: " 02 98 00 11 22 ",
  emailContact: " accueil@nova-services.fr ",
  contactDonnees: " dpo@nova-services.fr ",
};
const NETTOYEES = { telephone: "02 98 00 11 22", emailContact: "accueil@nova-services.fr", contactDonnees: "dpo@nova-services.fr" };
const DEPART = { telephone: TELEPHONE_SIMULE, email: EMAIL_CONTACT_SIMULE, donnees: CONTACT_DONNEES_SIMULE };

const enregistrer = (saisie: unknown) => actionModifierParametres(saisie);
const enBase = () => ({ ...simulation.contact });

const renvoiVers = (chemin: string) => ({
  digest: expect.stringMatching(new RegExp(`^NEXT_REDIRECT;\\w+;${chemin.replace(/\//g, "\\/")};`)),
});

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  // Sophie, administratrice, est connectée.
  simulation.session.id = ID_SOPHIE;
  refresh.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Lecture de A3
// ---------------------------------------------------------------------------

describe("lecture de l'écran A3", () => {
  it("les trois informations en place, par la fonction SQL et la session", async () => {
    await expect(lireInformationsGenerales()).resolves.toEqual({
      ok: true,
      donnees: { telephone: TELEPHONE_SIMULE, emailContact: EMAIL_CONTACT_SIMULE, contactDonnees: CONTACT_DONNEES_SIMULE },
    });
    expect(simulation.rpcSession).toHaveBeenCalledWith("lire_parametres_administration");
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
  });

  it("pas de téléphone : null", async () => {
    simulation.contact.telephone = null;
    const lecture = await lireInformationsGenerales();
    expect(lecture.ok && lecture.donnees.telephone).toBeNull();
  });

  it("collaborateur : accesRefuse, sans appel à la base", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireInformationsGenerales()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("refus NV202 de la base (rôle retiré entre-temps) : accesRefuse, rien au journal", async () => {
    simulation.pannesRpc.lire_parametres_administration = { data: null, error: { code: "NV202", message: "x" } };
    await expect(lireInformationsGenerales()).resolves.toEqual({ ok: false, accesRefuse: true });
    expect(simulation.journal()).toEqual([]);
  });

  it.each([
    ["base injoignable", { data: null, error: { code: "57P01", message: "connexion perdue" } }],
    ["ligne absente (NV104)", { data: null, error: { code: "NV104", message: "ligne absente" } }],
    ["réponse inattendue", { data: { telephone: null, email_contact: "contact@nova.fr" }, error: null }],
    ["réponse vide", { data: null, error: null }],
  ])("%s : { ok: false }, journalisée avec un code court", async (_, retour) => {
    simulation.pannesRpc.lire_parametres_administration = retour as RetourRpc;
    await expect(lireInformationsGenerales()).resolves.toEqual({ ok: false });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "lecture", lecture: "lire_parametres_administration" } },
    ]);
  });

  it("sans session : renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(lireInformationsGenerales()).rejects.toMatchObject(renvoiVers("/connexion"));
  });
});

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------

describe("enregistrer (administrateur)", () => {
  it("trois valeurs valides : nettoyées, enregistrées par la session ; réponse, journal, refresh()", async () => {
    const reponse = await enregistrer(VALIDES);
    expect(reponse).toEqual({ ok: true, donnees: NETTOYEES });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_parametres", {
      p_telephone: NETTOYEES.telephone,
      p_email_contact: NETTOYEES.emailContact,
      p_contact_donnees: NETTOYEES.contactDonnees,
    });
    // Jamais la clé secrète pour écrire : seulement pour le journal.
    expect(simulation.appels("modifier_parametres")).toEqual([]);
    expect(enBase()).toEqual({ telephone: NETTOYEES.telephone, email: NETTOYEES.emailContact, donnees: NETTOYEES.contactDonnees });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("journal : parametres_modifies, avec l'email de l'administrateur comme auteur, sans les valeurs saisies", async () => {
    await enregistrer(VALIDES);
    expect(simulation.journal()).toEqual([{ evenement: "parametres_modifies", details: { auteur: EMAIL_SOPHIE } }]);
    const ecriture = simulation.appels("ecrire_journal")[0];
    expect(ecriture).toMatchObject({ p_niveau: "info", p_code_erreur: null });
    const texte = JSON.stringify(ecriture);
    for (const valeur of Object.values(NETTOYEES)) expect(texte).not.toContain(valeur);
  });

  it("A3 relit aussitôt les nouvelles valeurs", async () => {
    await enregistrer(VALIDES);
    await expect(lireInformationsGenerales()).resolves.toEqual({ ok: true, donnees: NETTOYEES });
  });

  it.each([
    ["vide", ""],
    ["fait d'espaces", "   "],
    ["absent", undefined],
    ["null", null],
  ])("téléphone %s : enregistré null (P1 et P2 montrent alors l'email)", async (_, telephone) => {
    const reponse = await enregistrer({ ...VALIDES, telephone });
    expect(reponse).toEqual({ ok: true, donnees: { ...NETTOYEES, telephone: null } });
    expect(simulation.rpcSession).toHaveBeenCalledWith("modifier_parametres", expect.objectContaining({ p_telephone: null }));
    expect(enBase().telephone).toBeNull();
  });
});

describe("saisie refusée : VALIDATION, rien n'est écrit", () => {
  it.each([
    ["email mal écrit", { emailContact: "contact@nova" }, { emailContact: FORME }],
    ["email sans @", { emailContact: "contact.nova.fr" }, { emailContact: FORME }],
    ["email vide", { emailContact: "  " }, { emailContact: OBLIGATOIRE }],
    ["contact données vide", { contactDonnees: "" }, { contactDonnees: OBLIGATOIRE }],
    ["les deux obligatoires vides", { emailContact: "", contactDonnees: "" }, { emailContact: OBLIGATOIRE, contactDonnees: OBLIGATOIRE }],
    ["téléphone trop long", { telephone: "0".repeat(31) }, { telephone: "Le téléphone ne doit pas dépasser 30 caractères" }],
    ["email trop long", { emailContact: `${"a".repeat(95)}@nova.fr` }, { emailContact: "L'email ne doit pas dépasser 100 caractères" }],
    [
      "contact données trop long",
      { contactDonnees: "d".repeat(201) },
      { contactDonnees: "Le contact pour les données personnelles ne doit pas dépasser 200 caractères" },
    ],
  ])("%s : message sous le champ, aucun appel à la base", async (_, modifs, champs) => {
    const reponse = await enregistrer({ ...VALIDES, ...modifs });
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION", champs });
    expect(reponse.ok === false && reponse.champs).toEqual(champs);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(enBase()).toEqual(DEPART);
    expect(simulation.journal()).toEqual([]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([["rien", undefined], ["un texte", "texte"], ["un tableau", []]])(
    "saisie qui n'est pas un objet (%s) : lue comme un formulaire vierge",
    async (_, saisie) => {
      await expect(enregistrer(saisie)).resolves.toMatchObject({
        code: "VALIDATION",
        champs: { emailContact: OBLIGATOIRE, contactDonnees: OBLIGATOIRE },
      });
    },
  );

  it("la base refuse l'email (NV103, schéma contourné) : même message sous le champ, rien au journal", async () => {
    simulation.pannesRpc.modifier_parametres = { data: null, error: { code: "NV103", message: "email" } };
    const reponse = await enregistrer(VALIDES);
    expect(reponse).toEqual({ ok: false, code: "VALIDATION", message: "1 champ est à corriger", champs: { emailContact: FORME } });
    expect(simulation.journal()).toEqual([]);
  });
});

describe("accès refusé (RM-7)", () => {
  it("collaborateur qui appelle la Server Function : ACCES_REFUSE, rien n'est lu ni écrit, page recalculée", async () => {
    simulation.session.id = ID_KARIM;
    await expect(enregistrer(VALIDES)).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
    expect(enBase()).toEqual(DEPART);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("rétrogradé entre la garde et la base (NV202) : ACCES_REFUSE, rien au journal, page recalculée", async () => {
    simulation.pannesRpc.modifier_parametres = { data: null, error: { code: "NV202", message: "refus" } };
    await expect(enregistrer(VALIDES)).resolves.toEqual({ ok: false, code: "ACCES_REFUSE", message: "Accès refusé." });
    expect(simulation.journal()).toEqual([]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("sans session : renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(enregistrer(VALIDES)).rejects.toMatchObject(renvoiVers("/connexion"));
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });
});

describe("panne : ERREUR_INTERNE, message de l'écran, journalisée avec un code court", () => {
  it.each([
    ["base injoignable", { data: null, error: { code: "57P01", message: "connexion perdue" } }],
    ["ligne absente (NV104)", { data: null, error: { code: "NV104", message: "ligne absente" } }],
    ["contrainte de la table (23514)", { data: null, error: { code: "23514", message: "contrainte" } }],
  ])("%s", async (_, retour) => {
    simulation.pannesRpc.modifier_parametres = retour as RetourRpc;
    const reponse = await enregistrer(VALIDES);
    expect(reponse).toEqual({ ok: false, code: "ERREUR_INTERNE", message: PANNE, codeSupport: expect.any(String) });
    expect(simulation.journal()).toEqual([
      { evenement: "erreur_inattendue", details: { type: "action", action: "modifier_parametres" } },
    ]);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("code (AD-1, AD-9, AD-11)", () => {
  const source = readFileSync(join(process.cwd(), "src/server/actions/modifier-parametres.ts"), "utf8");

  it("même schéma que l'installation et l'écran (schemaParametres), session de l'administrateur, jamais la clé secrète", () => {
    expect(source).toContain('from "@/shared/schemas/parametres"');
    expect(source).toContain("validerParametres(saisie)");
    expect(source).toContain('from "@/lib/supabase/server"');
    expect(source).not.toMatch(/supabase-secret|clientSecret|creerClientSecret/);
    expect(source).not.toMatch(/\.from\(/);
  });

  it("journal par journaliser(), avec l'email de l'administrateur seulement", () => {
    expect(source).toContain('journaliser("info", "parametres_modifies", { auteur: administrateur.email })');
  });
});
