import { beforeEach, describe, expect, it, vi } from "vitest";

// Coordonnées de Nova (FR-31) enregistrées par `installerParametres`
// (src/server/admin), avec un client Supabase simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-admin")).creerSimulation(),
);

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { installerParametres } from "@/server/admin";
import { MESSAGES_PARAMETRES } from "@/shared/messages";

const SAISIE = {
  telephone: " 01 23 45 67 89 ",
  emailContact: "contact@nova-essai.fr",
  contactDonnees: "donnees@nova-essai.fr",
};

beforeEach(() => {
  simulation.reinitialiser();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("coordonnées valides", () => {
  it("appelle modifier_parametres une fois, avec la saisie nettoyée", async () => {
    const reponse = await installerParametres(SAISIE);
    expect(simulation.appels("modifier_parametres")).toEqual([
      {
        p_telephone: "01 23 45 67 89",
        p_email_contact: "contact@nova-essai.fr",
        p_contact_donnees: "donnees@nova-essai.fr",
      },
    ]);
    expect(reponse).toEqual({
      ok: true,
      donnees: {
        telephone: "01 23 45 67 89",
        emailContact: "contact@nova-essai.fr",
        contactDonnees: "donnees@nova-essai.fr",
      },
    });
  });

  it("le téléphone est facultatif : absent ou vide, il est envoyé vide (null)", async () => {
    await installerParametres({ ...SAISIE, telephone: undefined });
    await installerParametres({ ...SAISIE, telephone: "  " });
    expect(simulation.appels("modifier_parametres").map((p) => p.p_telephone)).toEqual([null, null]);
  });

  it("écrit parametres_modifies au journal", async () => {
    await installerParametres(SAISIE);
    expect(simulation.appels("ecrire_journal")).toEqual([
      expect.objectContaining({
        p_niveau: "info",
        p_evenement: "parametres_modifies",
        p_details: { auteur: "installation" },
      }),
    ]);
  });
});

describe("saisie invalide : rien n'est modifié", () => {
  it.each([
    ["email de contact mal formé", { emailContact: "contact.nova" }, "emailContact", MESSAGES_PARAMETRES.emailForme],
    ["email de contact absent", { emailContact: undefined }, "emailContact", MESSAGES_PARAMETRES.champObligatoire],
    ["contact données vide", { contactDonnees: " " }, "contactDonnees", MESSAGES_PARAMETRES.champObligatoire],
    ["téléphone trop long", { telephone: "0".repeat(31) }, "telephone", MESSAGES_PARAMETRES.telephoneTropLong],
  ])("%s", async (_cas, changement, champ, message) => {
    const reponse = await installerParametres({ ...SAISIE, ...changement });
    expect(reponse).toMatchObject({ ok: false, code: "VALIDATION", champs: { [champ]: message } });
    expect(simulation.rpc).not.toHaveBeenCalled();
  });

  it("le message de l'email est celui de l'UX", () => {
    expect(MESSAGES_PARAMETRES.emailForme).toBe("L'email doit avoir la forme nom@exemple.fr");
  });

  it("refus NV103 de la base : même message, rien au journal", async () => {
    simulation.retoursRpc.modifier_parametres = async () => ({
      data: null,
      error: { code: "NV103", message: "email mal formé" },
    });
    const reponse = await installerParametres(SAISIE);
    expect(reponse).toMatchObject({
      ok: false,
      code: "VALIDATION",
      champs: { emailContact: MESSAGES_PARAMETRES.emailForme },
    });
    expect(simulation.appels("ecrire_journal")).toHaveLength(0);
  });
});

describe("base en panne", () => {
  it("répond par l'erreur technique d'A3, sans parametres_modifies", async () => {
    simulation.retoursRpc.modifier_parametres = () => Promise.reject(new Error("délai dépassé"));
    const reponse = await installerParametres(SAISIE);
    expect(reponse).toMatchObject({
      ok: false,
      code: "ERREUR_INTERNE",
      message: "Les informations n'ont pas pu être enregistrées. Réessayez.",
    });
    const evenements = simulation.appels("ecrire_journal").map((p) => p.p_evenement);
    expect(evenements).toEqual(["erreur_inattendue"]);
  });
});
