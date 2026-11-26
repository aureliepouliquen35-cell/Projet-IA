import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Écran A3 « Informations générales » et son lien du menu (story 4.3 ;
// EXPERIENCE.md, A3 ; DESIGN.md, Champ, Squelette ; FR-31, RM-7), rendus en
// HTML sans navigateur : la page, les trois champs remplis avec leurs
// aperçus, « Enregistrer » et « Enregistrement… », les messages sous les
// champs, le résumé d'erreurs, la panne, l'état d'erreur de lecture, le
// squelette, puis le réducteur et l'envoi (verrou, toast). Supabase est
// simulé ; la Server Function l'est pour les envois.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const chemin = vi.hoisted(() => ({ valeur: "/admin/informations" as string | null }));

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => chemin.valeur,
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/server/actions/modifier-parametres", () => ({ actionModifierParametres: vi.fn() }));

import { ContenuInformations } from "@/app/(interne)/admin/informations/contenu-informations";
import PageInformations, { metadata } from "@/app/(interne)/admin/informations/page";
import {
  actionApresReponseInformations,
  envoyerInformations,
  EtatInformationsErreur,
  etatInitialInformations,
  idChampInformations,
  listerErreursInformations,
  preparerEnvoiInformations,
  reduireInformations,
  SqueletteInformations,
  valeursDepuis,
  VueInformationsGenerales,
  type ActionInformations,
  type EtatInformations,
  type ValeursInformations,
} from "@/components/interne/informations-generales";
import { SectionAdministration } from "@/components/interne/section-administration";
import { ADRESSE_INFORMATIONS } from "@/shared/acces";
import { MESSAGES_PARAMETRES } from "@/shared/messages";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";
import {
  CONTACT_DONNEES_SIMULE,
  EMAIL_CONTACT_SIMULE,
  ID_KARIM,
  ID_SOPHIE,
  PROFIL_SOPHIE,
  TELEPHONE_SIMULE,
} from "../aides/supabase-connexion";

const S1 = "Accès refusé. Cette page est réservée aux administrateurs.";
const PANNE = "Les informations n'ont pas pu être enregistrées. Réessayez.";
const OBLIGATOIRE = "Ce champ est obligatoire";
const FORME = "L'email doit avoir la forme nom@exemple.fr";
const APERCU_CONFIRMATION = "Affiché sur l'écran de confirmation et dans le message d'erreur du formulaire.";
const APERCU_MENTION = "Affiché dans la mention sur les données personnelles du formulaire.";

const VALEURS: ValeursInformations = {
  telephone: TELEPHONE_SIMULE,
  emailContact: EMAIL_CONTACT_SIMULE,
  contactDonnees: CONTACT_DONNEES_SIMULE,
};
const NOUVELLES = { telephone: "02 98 00 11 22", emailContact: "accueil@nova-services.fr", contactDonnees: "dpo@nova-services.fr" };

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  chemin.valeur = ADRESSE_INFORMATIONS;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const rendreSection = async () => {
  const element = await SectionAdministration();
  return element ? renderToStaticMarkup(element) : "";
};

const rendreContenu = async () => renderToStaticMarkup(await ContenuInformations());

const rendreVue = (etat: Partial<EtatInformations> = {}, envoiEnCours = false) =>
  renderToStaticMarkup(
    <VueInformationsGenerales etat={{ ...etatInitialInformations(VALEURS), ...etat }} envoiEnCours={envoiEnCours} />,
  );

const champ = (html: string, id: string) => html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

/** Le bouton `data-slot` : sa balise ouvrante et son contenu. */
function bouton(html: string, slot: string): { balise: string; contenu: string } {
  const [, balise = "", contenu = ""] =
    html.match(new RegExp(`(<button [^>]*data-slot="${slot}"[^>]*>)([\\s\\S]*?)</button>`)) ?? [];
  return { balise, contenu };
}

const appliquer = (actions: ActionInformations[], depart: EtatInformations = etatInitialInformations(VALEURS)) =>
  actions.reduce(reduireInformations, depart);

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

describe("lien « Informations générales » de la section Administration", () => {
  it("adresse de l'écran A3 : /admin/informations", () => {
    expect(ADRESSE_INFORMATIONS).toBe("/admin/informations");
  });

  it("administrateur : « Informations générales » (icône Info) vers /admin/informations, après « Catégories »", async () => {
    const html = await rendreSection();
    expect(texteDe(html)).toBe("Administration Comptes Catégories Informations générales");
    expect(html).toMatch(
      /<a[^>]*href="\/admin\/informations"[^>]*>(?:(?!<\/a>).)*lucide-info(?:(?!<\/a>).)*Informations générales<\/span><\/a>/,
    );
    expect(html.indexOf('href="/admin/categories"')).toBeLessThan(html.indexOf('href="/admin/informations"'));
  });

  it("sur /admin/informations : « Informations générales » actif, les autres inactifs", async () => {
    const html = await rendreSection();
    const liens = [...html.matchAll(/<a [^>]*>/g)].map(([balise]) => balise);
    expect(liens.filter((balise) => balise.includes('aria-current="page"'))).toEqual([
      expect.stringContaining('href="/admin/informations"'),
    ]);
  });

  it("collaborateur : ni la section, ni « Informations générales »", async () => {
    simulation.session.id = ID_KARIM;
    expect(await rendreSection()).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Page et contenu
// ---------------------------------------------------------------------------

describe("écran A3 « Informations générales »", () => {
  it("titre, puis les trois champs remplis avec les valeurs en place, et « Enregistrer »", async () => {
    const html = await rendreContenu();
    expect(html).toMatch(/<h1[^>]*>Informations générales<\/h1>/);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('data-slot="informations-generales"'));
    expect(champ(html, idChampInformations("telephone"))).toContain(`value="${TELEPHONE_SIMULE}"`);
    expect(champ(html, idChampInformations("emailContact"))).toContain(`value="${EMAIL_CONTACT_SIMULE}"`);
    expect(champ(html, idChampInformations("contactDonnees"))).toContain(`value="${CONTACT_DONNEES_SIMULE}"`);
    const enregistrer = bouton(html, "enregistrer");
    expect(enregistrer.balise).toContain('type="submit"');
    expect(texteDe(enregistrer.contenu)).toBe("Enregistrer");
  });

  it("pas de téléphone en place : champ vide", async () => {
    simulation.contact.telephone = null;
    expect(champ(await rendreContenu(), idChampInformations("telephone"))).toContain('value=""');
  });

  it("lecture en panne : « Impossible de charger les informations. » et « Réessayer », sans formulaire", async () => {
    simulation.pannesRpc.lire_parametres_administration = { data: null, error: { code: "57P01", message: "x" } };
    const html = await rendreContenu();
    expect(html).toContain('data-slot="informations-erreur"');
    expect(texteDe(html)).toBe("Informations générales Impossible de charger les informations. Réessayer");
    expect(html).not.toContain('data-slot="informations-generales"');
    expect(renderToStaticMarkup(<EtatInformationsErreur />)).toMatch(/role="alert"/);
  });

  it("collaborateur : écran S1 seul, aucune information lue ni affichée", async () => {
    simulation.session.id = ID_KARIM;
    const html = await rendreContenu();
    expect(texteDe(html)).toBe(`${S1} Retour aux demandes`);
    expect(html).not.toMatch(/nova-services\.example|01 99 00 00 00|informations-generales/);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("refus de la base (rôle retiré entre-temps) : S1", async () => {
    simulation.pannesRpc.lire_parametres_administration = { data: null, error: { code: "NV202", message: "x" } };
    expect(texteDe(await rendreContenu())).toBe(`${S1} Retour aux demandes`);
  });

  it("squelette : titre, trois champs et bouton en gris, après 300 ms, annoncé « Chargement… »", () => {
    const html = renderToStaticMarkup(<SqueletteInformations />);
    expect(html).toMatch(/^<div data-slot="squelette" role="status" class="animate-apres-300ms /);
    expect(html).toContain('<span class="sr-only">Chargement…</span>');
    expect(html.match(/data-slot="champ-squelette"/g)).toHaveLength(3);
  });

  it("page : titre de l'onglet neutre, contenu sous <Suspense> avec le squelette, coque sans titre ni donnée", () => {
    expect(metadata.title).toBe("Administration — Nova Services");
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/admin/informations/page.tsx"), "utf8");
    expect(source).toMatch(/<Suspense fallback=\{<SqueletteInformations \/>\}>\s*<ContenuInformations \/>\s*<\/Suspense>/);
    const html = renderToStaticMarkup(<PageInformations />);
    expect(html).toContain('data-slot="squelette"');
    expect(html).not.toMatch(/<h1/);
  });

  it("contenu : attend une vraie requête (connection) puis vérifie le rôle avant toute lecture", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/admin/informations/contenu-informations.tsx"), "utf8");
    expect(source).toMatch(
      /await connection\(\);\s*if \(!\(await exigerAdministrateur\(\)\)\) return <EcranAccesRefuse \/>;\s*const lecture = await lireInformationsGenerales\(\);/,
    );
  });
});

// ---------------------------------------------------------------------------
// Formulaire
// ---------------------------------------------------------------------------

describe("formulaire (sans état)", () => {
  it("étiquettes de l'UX, astérisque sur les deux obligatoires, sans validation du navigateur", () => {
    const html = rendreVue();
    expect(html).toMatch(/^<form noValidate=""[^>]*data-slot="informations-generales"/);
    const etiquettes = [...html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].map(([, id, texte]) => [
      id,
      texteDe(texte),
    ]);
    expect(etiquettes).toEqual([
      [idChampInformations("telephone"), "Téléphone de contact"],
      [idChampInformations("emailContact"), "Email de contact *"],
      [idChampInformations("contactDonnees"), "Contact pour les données personnelles *"],
    ]);
    expect(champ(html, idChampInformations("telephone"))).not.toContain("required");
    expect(champ(html, idChampInformations("emailContact"))).toContain('required=""');
    expect(champ(html, idChampInformations("contactDonnees"))).toContain('required=""');
    expect(champ(html, idChampInformations("telephone"))).toContain('type="tel"');
    expect(champ(html, idChampInformations("emailContact"))).toContain('type="email"');
  });

  it("aperçu sous chaque champ, relié au champ : où l'information apparaît aux demandeurs", () => {
    const html = rendreVue();
    for (const [champId, apercu] of [
      ["telephone", APERCU_CONFIRMATION],
      ["emailContact", APERCU_CONFIRMATION],
      ["contactDonnees", APERCU_MENTION],
    ] as const) {
      const id = idChampInformations(champId);
      expect(html).toContain(`<span id="${id}-aide">${apercu.replace(/'/g, "&#x27;")}</span>`);
      expect(champ(html, id)).toContain(`aria-describedby="${id}-aide"`);
    }
  });

  it("« Enregistrer » actif (jamais grisé d'avance) ; pendant l'envoi, « Enregistrement… », désactivé, saisie figée", () => {
    expect(bouton(rendreVue(), "enregistrer").balise).not.toContain('disabled=""');
    const html = rendreVue({}, true);
    const enregistrer = bouton(html, "enregistrer");
    expect(enregistrer.balise).toContain('disabled=""');
    expect(texteDe(enregistrer.contenu)).toBe("Enregistrement…");
    expect(enregistrer.contenu).toContain("animate-spin");
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).toMatch(/<form[^>]*aria-busy="true"/);
  });

  it("erreurs : message sous chaque champ, relié au champ, saisie gardée ; résumé en haut avec un lien par champ", () => {
    const html = rendreVue({
      valeurs: { ...VALEURS, emailContact: "contact@nova", contactDonnees: "" },
      erreurs: { emailContact: FORME, contactDonnees: OBLIGATOIRE },
      resumeVisible: true,
    });
    const email = champ(html, idChampInformations("emailContact"));
    expect(email).toContain('aria-invalid="true"');
    expect(email).toContain('value="contact@nova"');
    expect(email).toContain(`${idChampInformations("emailContact")}-erreur`);
    expect(html).toContain(`id="${idChampInformations("emailContact")}-erreur"`);
    expect(texteDe(html)).toContain(FORME);
    expect(texteDe(html)).toContain(OBLIGATOIRE);
    expect(html).toContain('data-slot="resume-erreurs"');
    expect(texteDe(html)).toContain("2 champs sont à corriger");
    expect(html).toContain(`href="#${idChampInformations("emailContact")}"`);
    expect(html.indexOf('data-slot="resume-erreurs"')).toBeLessThan(html.indexOf("<fieldset"));
  });

  it("panne : encadré en haut, les trois saisies restent affichées", () => {
    const valeurs = { ...NOUVELLES };
    const html = rendreVue({ valeurs, panne: PANNE });
    expect(html).toContain('data-slot="panne-informations"');
    expect(texteDe(html)).toContain(PANNE);
    for (const [cle, valeur] of Object.entries(valeurs)) {
      expect(champ(html, idChampInformations(cle as keyof ValeursInformations))).toContain(`value="${valeur}"`);
    }
  });
});

describe("réducteur", () => {
  it("valeurs de départ : le téléphone absent devient un champ vide", () => {
    expect(valeursDepuis({ telephone: null, emailContact: "a@b.fr", contactDonnees: "c" })).toEqual({
      telephone: "",
      emailContact: "a@b.fr",
      contactDonnees: "c",
    });
  });

  it("sortie de l'email mal écrit : message tout de suite ; email vide : rien avant l'envoi", () => {
    const etat = appliquer([
      { type: "saisie", champ: "emailContact", valeur: "contact@nova" },
      { type: "sortie", champ: "emailContact" },
    ]);
    expect(etat.erreurs).toEqual({ emailContact: FORME });
    const vide = appliquer([
      { type: "saisie", champ: "emailContact", valeur: "" },
      { type: "sortie", champ: "emailContact" },
    ]);
    expect(vide.erreurs).toEqual({});
    expect(appliquer([{ type: "sortie", champ: "contactDonnees" }]).erreurs).toEqual({});
  });

  it("le message disparaît dès que le champ est corrigé ; le résumé part avec la dernière erreur", () => {
    const refuse = appliquer([{ type: "refus", champs: { emailContact: FORME, contactDonnees: OBLIGATOIRE } }]);
    expect(refuse.resumeVisible).toBe(true);
    const unCorrige = reduireInformations(refuse, { type: "saisie", champ: "emailContact", valeur: "accueil@nova.fr" });
    expect(unCorrige.erreurs).toEqual({ contactDonnees: OBLIGATOIRE });
    expect(unCorrige.resumeVisible).toBe(true);
    const tousCorriges = reduireInformations(unCorrige, { type: "saisie", champ: "contactDonnees", valeur: "dpo@nova.fr" });
    expect(tousCorriges.erreurs).toEqual({});
    expect(tousCorriges.resumeVisible).toBe(false);
  });

  it("refus et panne : la sélection va à l'encadré du haut, rien n'est effacé", () => {
    const saisie = appliquer([{ type: "saisie", champ: "telephone", valeur: "02 98 00 11 22" }]);
    const refuse = reduireInformations(saisie, { type: "refus", champs: { emailContact: FORME } });
    expect(refuse.appelsEncadre).toBe(1);
    expect(refuse.valeurs.telephone).toBe("02 98 00 11 22");
    const enPanne = reduireInformations(reduireInformations(refuse, { type: "envoi" }), { type: "panne", message: PANNE });
    expect(enPanne).toMatchObject({ panne: PANNE, resumeVisible: false, erreurs: {}, appelsEncadre: 2 });
    expect(enPanne.valeurs).toEqual({ ...VALEURS, telephone: "02 98 00 11 22" });
  });

  it("réussite : les valeurs nettoyées dans les champs, plus aucun message", () => {
    const enPanne = appliquer([{ type: "panne", message: PANNE }]);
    const reussi = reduireInformations(enPanne, { type: "reussite", valeurs: { ...NOUVELLES, telephone: "" } });
    expect(reussi).toMatchObject({ valeurs: { ...NOUVELLES, telephone: "" }, erreurs: {}, panne: null, resumeVisible: false });
  });

  it("résumé : erreurs dans l'ordre de l'écran, vers l'identifiant de chaque champ", () => {
    expect(listerErreursInformations({ contactDonnees: OBLIGATOIRE, emailContact: FORME })).toEqual([
      { champ: idChampInformations("emailContact"), message: FORME },
      { champ: idChampInformations("contactDonnees"), message: OBLIGATOIRE },
    ]);
  });
});

describe("envoi", () => {
  it("saisie refusée par le navigateur (schéma partagé) : rien n'est envoyé, verrou ouvert", () => {
    const verrou = { current: false };
    expect(preparerEnvoiInformations({ ...VALEURS, emailContact: "contact@nova" }, verrou)).toEqual({
      type: "refus",
      champs: { emailContact: FORME },
    });
    expect(preparerEnvoiInformations({ telephone: "", emailContact: "", contactDonnees: " " }, verrou)).toEqual({
      type: "refus",
      champs: { emailContact: OBLIGATOIRE, contactDonnees: OBLIGATOIRE },
    });
    expect(verrou.current).toBe(false);
  });

  it("téléphone vide accepté (facultatif)", () => {
    expect(preparerEnvoiInformations({ ...VALEURS, telephone: "" }, { current: false })).toEqual({ type: "envoi" });
  });

  it("double clic : un seul envoi", async () => {
    const verrou = { current: false };
    const enregistrer = vi.fn(async () => succes({ ...NOUVELLES }));
    const cliquer = () => {
      const debut = preparerEnvoiInformations(NOUVELLES, verrou);
      if (debut.type === "envoi") {
        void envoyerInformations({ valeurs: NOUVELLES, enregistrer, agir: () => {}, apresReussite: () => {}, envoiVerrouille: verrou });
      }
      return debut;
    };
    expect(cliquer()).toEqual({ type: "envoi" });
    expect(cliquer()).toEqual({ type: "ignore" });
    await vi.waitFor(() => expect(verrou.current).toBe(false));
    expect(enregistrer).toHaveBeenCalledExactlyOnceWith(NOUVELLES);
  });

  it("réussite : valeurs nettoyées (téléphone null : champ vide), toast de l'UX, verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerInformations({
      valeurs: { ...NOUVELLES, telephone: "  " },
      enregistrer: async () => succes({ ...NOUVELLES, telephone: null }),
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "reussite", valeurs: { ...NOUVELLES, telephone: "" } });
    expect(apresReussite).toHaveBeenCalledOnce();
    expect(verrou.current).toBe(false);
    expect(MESSAGES_PARAMETRES.misesAJour).toBe("Informations mises à jour. Elles sont visibles immédiatement.");
    const source = readFileSync(join(process.cwd(), "src/components/interne/informations-generales.tsx"), "utf8");
    expect(source).toContain("apresReussite: () => afficherSucces(textes.misesAJour)");
    expect(source).toContain("enregistrer: actionModifierParametres");
  });

  it("réponses : refus avec champs sous les champs ; accès refusé ; toute autre réponse : panne de l'UX", () => {
    expect(
      actionApresReponseInformations(echec("VALIDATION", "1 champ est à corriger", { champs: { emailContact: FORME } })),
    ).toEqual({ type: "refus", champs: { emailContact: FORME } });
    expect(actionApresReponseInformations(echec("ACCES_REFUSE", "Accès refusé."))).toEqual({
      type: "panne",
      message: "Accès refusé.",
    });
    for (const code of ["ERREUR_INTERNE", "VALIDATION", "INTROUVABLE", "CONFLIT"] as const) {
      expect(actionApresReponseInformations(echec(code, "message technique"))).toEqual({ type: "panne", message: PANNE });
    }
  });

  it("réseau coupé : panne, saisie gardée, verrou rouvert, pas de toast", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerInformations({
      valeurs: NOUVELLES,
      enregistrer: async () => {
        throw new TypeError("fetch failed");
      },
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "panne", message: PANNE });
    expect(apresReussite).not.toHaveBeenCalled();
    expect(verrou.current).toBe(false);
    const etat = appliquer([
      { type: "saisie", champ: "telephone", valeur: NOUVELLES.telephone },
      { type: "saisie", champ: "emailContact", valeur: NOUVELLES.emailContact },
      { type: "saisie", champ: "contactDonnees", valeur: NOUVELLES.contactDonnees },
      { type: "envoi" },
      agir.mock.calls[0][0],
    ]);
    expect(etat.valeurs).toEqual(NOUVELLES);
  });

  it("redirection du serveur (session terminée) : relancée, verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const redirection = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/connexion;307;" });
    await expect(
      envoyerInformations({
        valeurs: NOUVELLES,
        enregistrer: async () => {
          throw redirection;
        },
        agir,
        apresReussite: () => {},
        envoiVerrouille: verrou,
      }),
    ).rejects.toBe(redirection);
    expect(agir).not.toHaveBeenCalled();
    expect(verrou.current).toBe(false);
  });
});
