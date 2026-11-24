import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Écran I5 « Nouvelle demande » (story 2.3 ; FR-30, RM-12, AD-20,
// EXPERIENCE.md), rendu en HTML avec Supabase simulé : les champs de P1, le
// canal en premier (aucun choisi d'avance), la case et « Texte à lui
// lire », le résumé d'erreurs, la panne, l'envoi (numéro d'envoi gardé ou
// renouvelé, toast puis détail), la lecture du formulaire, le menu et le
// détail d'une demande saisie (historique, canal).

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const chemin = vi.hoisted(() => ({ valeur: "/demandes/nouvelle" as string | null }));

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => chemin.valeur,
  useRouter: () => ({ refresh: () => {}, replace: () => {}, push: () => {} }),
}));
vi.mock("next/cache", () => ({ refresh: () => {} }));

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import { ContenuSaisie, SqueletteSaisie } from "@/app/(interne)/demandes/nouvelle/contenu-saisie";
import {
  actionApresReponseSaisie,
  envoyerSaisie,
  ETAT_SAISIE_INITIAL,
  idCanal,
  reduireSaisie,
  VueFormulaireSaisie,
  type DependancesSaisie,
  type EtatSaisie,
} from "@/app/(interne)/demandes/nouvelle/formulaire-saisie";
import PageNouvelleDemande from "@/app/(interne)/demandes/nouvelle/page";
import PageDemandes from "@/app/(interne)/demandes/page";
import { EtatListeVide } from "@/components/interne/etat-liste";
import { HistoriqueDemande } from "@/components/interne/historique-demande";
import { estActif } from "@/components/interne/lien-menu";
import { MenuLateral } from "@/components/interne/menu-lateral";
import { actionSaisirDemande } from "@/server/actions/saisir-demande";
import { MESSAGES_DEPOT, MESSAGES_SAISIE } from "@/shared/messages";
import { estNumeroEnvoi } from "@/shared/numero-envoi";
import { echec } from "@/shared/reponse";
import { VALEURS_SAISIE_VIDES } from "@/shared/schemas/saisie";

import { CATEGORIES, CONTACT_DONNEES, NUMERO_ENVOI, rendreVue as rendreP1, texteDe } from "../aides/formulaire-depot";
import { CATEGORIES_DEPART, CONTACT_DONNEES_SIMULE, ID_KARIM, ID_PROBLEME_TECHNIQUE } from "../aides/supabase-connexion";

const rendre = (etat: Partial<EtatSaisie> = {}, envoiEnCours = false) =>
  renderToStaticMarkup(
    <VueFormulaireSaisie
      categories={CATEGORIES}
      contactDonnees={CONTACT_DONNEES}
      etat={{ ...ETAT_SAISIE_INITIAL, ...etat }}
      envoiEnCours={envoiEnCours}
    />,
  );

const mention = (html: string) => html.match(/<p[^>]*data-slot="mention-donnees"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
/** Classes du paragraphe de la mention. */
const classesMention = (html: string) =>
  (html.match(/<p [^>]*data-slot="mention-donnees"[^>]*class="([^"]*)"/)?.[1] ?? "").split(" ");

/** Saisie complète de Karim (EXPERIENCE.md, Flux 4). */
const SAISIE = {
  ...VALEURS_SAISIE_VIDES,
  canal: "telephone" as const,
  nom: "Hélène Durand",
  email: "helene.durand@exemple.fr",
  categorieId: ID_PROBLEME_TECHNIQUE,
  objet: "Production à l'arrêt",
  description: "La machine de conditionnement ne démarre plus.",
  personneInformee: true,
};

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
  chemin.valeur = "/demandes/nouvelle";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("écran vierge (critère 1)", () => {
  const html = rendre();

  it("le canal d'abord : Téléphone et Email, boutons radio, aucun choisi d'avance", () => {
    const radios = [...html.matchAll(/<input type="radio"[^>]*>/g)].map(([balise]) => balise);
    expect(radios).toHaveLength(2);
    expect(radios.map((r) => r.match(/value="(\w+)"/)?.[1])).toEqual(["telephone", "email"]);
    for (const radio of radios) {
      expect(radio).not.toContain('checked=""');
      expect(radio).toContain('name="canal"');
    }
    expect(html).toMatch(/<legend[^>]*>Canal<span aria-hidden="true" class="text-danger"> \*<\/span><\/legend>/);
    expect(html.indexOf('name="canal"')).toBeLessThan(html.indexOf('name="nom"'));
    expect(html).not.toMatch(/value="formulaire"/);
    expect(idCanal("telephone")).toBe("canal");
  });

  it("puis les champs du formulaire public, dans leur ordre", () => {
    const noms = [...html.matchAll(/name="(\w+)"/g)].map(([, nom]) => nom);
    expect([...new Set(noms)]).toEqual([
      "canal",
      "nom",
      "email",
      "telephone",
      "entreprise",
      "categorieId",
      "objet",
      "description",
      "personneInformee",
    ]);
    expect(texteDe(html)).toContain("Choisissez une catégorie");
    for (const { nom } of CATEGORIES) expect(texteDe(html)).toContain(nom);
    expect(texteDe(html)).toContain("10 caractères minimum");
  });

  it("légendes « Demandeur » et « Demande », pas « Vos coordonnées »", () => {
    const legendes = [...html.matchAll(/<legend[^>]*>([\s\S]*?)<\/legend>/g)].map(([, l]) => texteDe(l));
    expect(legendes).toEqual(["Canal *", "Demandeur", "Demande"]);
    expect(texteDe(html)).not.toMatch(/Vos coordonnées|Votre demande|J'ai pris connaissance/);
  });

  it("la case de l'utilisateur interne, jamais cochée d'avance", () => {
    expect(texteDe(html)).toContain("La personne a été informée de l'usage de ses données. *");
    expect(html).toMatch(/<button[^>]*role="checkbox"[^>]*aria-checked="false"/);
  });

  it("« Texte à lui lire » replié : la mention de P1 est cachée", () => {
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="texte-a-lire"[^>]*>.*Texte à lui lire/);
    expect(classesMention(html)).toContain("hidden");
  });

  it("« Texte à lui lire » déplié : la mention de P1, mot pour mot", () => {
    const ouvert = rendre({ texteOuvert: true });
    expect(ouvert).toMatch(/aria-expanded="true"/);
    expect(classesMention(ouvert)).toContain("rounded-md");
    expect(classesMention(ouvert)).not.toContain("hidden");
    expect(mention(ouvert)).toContain('id="texte-a-lire"');
    expect(texteDe(mention(ouvert))).toBe(texteDe(mention(rendreP1())));
    expect(texteDe(mention(ouvert))).toContain("conservées 3 ans");
  });

  it("bouton principal « Enregistrer la demande », jamais grisé d'avance ; « Enregistrement… » pendant l'envoi", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Enregistrer la demande<\/button>/);
    expect(html).not.toMatch(/type="submit"[^>]*disabled=""/);
    const envoi = rendre({}, true);
    expect(texteDe(envoi)).toContain("Enregistrement…");
    expect(envoi).toMatch(/<fieldset disabled=""/);
    expect(envoi).toContain('aria-busy="true"');
  });
});

describe("sortie d'un champ : seul le format de l'email est vérifié", () => {
  const saisirEmail = (email: string) =>
    reduireSaisie(ETAT_SAISIE_INITIAL, { type: "saisie", champ: "email", valeur: email });

  it("email mal formé : message sous le champ, sans résumé en haut", () => {
    const etat = reduireSaisie(saisirEmail("helene@"), { type: "sortie", champ: "email" });
    expect(etat.erreurs).toEqual({ email: MESSAGES_DEPOT.emailForme });
    expect(etat.resumeVisible).toBe(false);
  });

  it("email vide ou correct : rien (le champ vide est vérifié à l'envoi)", () => {
    expect(reduireSaisie(ETAT_SAISIE_INITIAL, { type: "sortie", champ: "email" }).erreurs).toEqual({});
    expect(
      reduireSaisie(saisirEmail(" helene.durand@exemple.fr "), { type: "sortie", champ: "email" }).erreurs,
    ).toEqual({});
  });

  it("aucun autre champ n'est vérifié à sa sortie", () => {
    expect(reduireSaisie(ETAT_SAISIE_INITIAL, { type: "sortie", champ: "nom" }).erreurs).toEqual({});
  });
});

describe("refus (critère 2) et panne", () => {
  it("case oubliée : « 1 champ est à corriger » en haut, le message sous la case, saisie intacte", () => {
    const etat = reduireSaisie(
      { ...ETAT_SAISIE_INITIAL, valeurs: { ...SAISIE, personneInformee: false } },
      { type: "refus", champs: { personneInformee: MESSAGES_SAISIE.caseObligatoire } },
    );
    expect(etat.valeurs).toEqual({ ...SAISIE, personneInformee: false });
    const html = rendre(etat);
    const resume = html.match(/<div[^>]*data-slot="resume-erreurs"[\s\S]*?<\/ul>/)?.[0] ?? "";
    expect(texteDe(resume)).toBe(
      "1 champ est à corriger Confirmez que la personne a été informée de l'usage de ses données",
    );
    expect(resume).toContain('href="#personneInformee"');
    expect(html).toMatch(
      /id="personneInformee-erreur"[^>]*>.*Confirmez que la personne a été informée de l&#x27;usage de ses données<\/p>/,
    );
    expect(html).toContain('value="Hélène Durand"');
    expect(html).toMatch(/<input type="radio"(?=[^>]*value="telephone")(?=[^>]*checked="")/);
  });

  it("canal oublié : « Le canal est obligatoire » sous le choix et dans le résumé, lien vers le premier bouton", () => {
    const html = rendre({ resumeVisible: true, erreurs: { canal: "Le canal est obligatoire" } });
    expect(html).toContain('href="#canal"');
    expect(html).toMatch(/id="canal-erreur"[^>]*>.*Le canal est obligatoire<\/p>/);
    expect(html).toMatch(/<input type="radio" id="canal"[^>]*aria-describedby="canal-erreur"/);
    expect(html).toMatch(/<label for="canal" class="[^"]*border-danger/);
  });

  it("le message disparaît dès que le champ est corrigé", () => {
    const refuse = reduireSaisie(ETAT_SAISIE_INITIAL, { type: "refus", champs: { canal: "Le canal est obligatoire" } });
    const corrige = reduireSaisie(refuse, { type: "saisie", champ: "canal", valeur: "email" });
    expect(corrige.erreurs).toEqual({});
    expect(corrige.resumeVisible).toBe(false);
  });

  it("panne : encadré court « Réessayez », saisie intacte", () => {
    const etat = reduireSaisie({ ...ETAT_SAISIE_INITIAL, valeurs: SAISIE }, { type: "panne" });
    const html = rendre(etat);
    expect(texteDe(html)).toContain("La demande n'a pas pu être enregistrée. Réessayez.");
    expect(html).toMatch(/data-slot="panne-saisie"/);
    expect(texteDe(html)).not.toMatch(/appelez-nous|01 99/);
    expect(etat.valeurs).toEqual(SAISIE);
  });

  it("réussite : la saisie reste affichée et figée (« Enregistrement… ») jusqu'au détail", () => {
    const etat = reduireSaisie(
      reduireSaisie({ ...ETAT_SAISIE_INITIAL, valeurs: SAISIE }, { type: "envoi" }),
      { type: "reussite", reference: "NOVA-2026-0043" },
    );
    expect(etat.redirection).toBe(true);
    expect(etat.valeurs).toEqual(SAISIE);

    // Même sans envoi en cours, le formulaire reste figé : aucun second envoi.
    const html = rendre(etat);
    const bouton = html.match(/<button[^>]*type="submit"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(bouton).toMatch(/<button[^>]* disabled=""/);
    expect(texteDe(bouton)).toBe("Enregistrement…");
    const blocs = html.match(/<fieldset[^>]*>/g) ?? [];
    expect(blocs).toHaveLength(3);
    for (const bloc of blocs) expect(bloc).toMatch(/ disabled=""/);
  });

  it("réponse → action : réussite, refus avec champs, sinon panne", () => {
    expect(actionApresReponseSaisie({ ok: true, donnees: { reference: "NOVA-2026-0043" } })).toEqual({
      type: "reussite",
      reference: "NOVA-2026-0043",
    });
    expect(actionApresReponseSaisie(echec("VALIDATION", "x", { champs: { canal: "y" } }))).toEqual({
      type: "refus",
      champs: { canal: "y" },
    });
    expect(actionApresReponseSaisie(echec("VALIDATION", "x"))).toEqual({ type: "panne" });
    expect(actionApresReponseSaisie(echec("ERREUR_INTERNE", "x"))).toEqual({ type: "panne" });
  });
});

describe("envoi (AD-20)", () => {
  function dependances(saisir: DependancesSaisie["saisir"]) {
    const actions: unknown[] = [];
    const apresReussite = vi.fn();
    const d: DependancesSaisie = {
      valeurs: SAISIE,
      saisir,
      agir: (action) => actions.push(action),
      apresReussite,
      enTransition: (miseAJour) => miseAJour(),
      numeroEnvoi: { current: NUMERO_ENVOI },
      envoiVerrouille: { current: true },
      tirer: () => "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    };
    return { d, actions, apresReussite };
  }

  it("réussite : toast puis détail (apresReussite avec la référence), nouveau numéro, formulaire vierge", async () => {
    const { d, actions, apresReussite } = dependances(async () => ({ ok: true, donnees: { reference: "NOVA-2026-0043" } }));
    await envoyerSaisie(d);
    expect(actions).toEqual([{ type: "reussite", reference: "NOVA-2026-0043" }, { type: "reinitialisation" }]);
    expect(apresReussite).toHaveBeenCalledWith("NOVA-2026-0043");
    expect(d.numeroEnvoi.current).toBe("7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d");
    expect(d.envoiVerrouille.current).toBe(false);
  });

  it("refus : même numéro d'envoi, verrou ouvert, pas de détail", async () => {
    const { d, actions, apresReussite } = dependances(async () =>
      echec("VALIDATION", "1 champ est à corriger", { champs: { personneInformee: "x" } }),
    );
    await envoyerSaisie(d);
    expect(actions).toEqual([{ type: "refus", champs: { personneInformee: "x" } }]);
    expect(d.numeroEnvoi.current).toBe(NUMERO_ENVOI);
    expect(d.envoiVerrouille.current).toBe(false);
    expect(apresReussite).not.toHaveBeenCalled();
  });

  it("panne (appel qui lève) : encadré, même numéro d'envoi pour le nouvel essai", async () => {
    const { d, actions } = dependances(async () => {
      throw new Error("réseau coupé");
    });
    await envoyerSaisie(d);
    expect(actions).toEqual([{ type: "panne" }]);
    expect(d.numeroEnvoi.current).toBe(NUMERO_ENVOI);
  });

  it("numéro tiré si l'envoi précède l'affichage", async () => {
    const saisir = vi.fn<DependancesSaisie["saisir"]>(async () => echec("ERREUR_INTERNE", "x"));
    const { d } = dependances(saisir);
    d.numeroEnvoi.current = null;
    d.tirer = undefined;
    await envoyerSaisie(d);
    const numero = saisir.mock.calls[0][1];
    expect(estNumeroEnvoi(numero)).toBe(true);
    expect(d.numeroEnvoi.current).toBe(numero);
  });

  it("double envoi après une panne : la Server Function renvoie la demande déjà créée", async () => {
    await actionSaisirDemande(SAISIE, NUMERO_ENVOI);
    const nombre = simulation.demandes.length;
    await expect(actionSaisirDemande(SAISIE, NUMERO_ENVOI)).resolves.toEqual({
      ok: true,
      donnees: { reference: "NOVA-2026-0001" },
    });
    expect(simulation.demandes).toHaveLength(nombre);
  });

  it("le formulaire tire son numéro à l'affichage, passe par envoyerSaisie ; toast puis router.push vers le détail", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/demandes/nouvelle/formulaire-saisie.tsx"), "utf8");
    expect(source).toMatch(/useEffect\(\(\) => \{\s+numeroEnvoi\.current \?\?= nouveauNumeroEnvoi\(\);\s+\}, \[\]\);/);
    expect(source).toMatch(
      /saisir: actionSaisirDemande,[\s\S]*?apresReussite: \(reference\) => \{\s+afficherSucces\(messageDemandeCreee\(reference\)\);\s+router\.push\(adresseDetail\(reference\)\);/,
    );
    // Rien de la saisie dans l'adresse ; pas de redirection par le serveur.
    expect(source).not.toMatch(/searchParams|\?numero|redirect\(/);
  });

  it("toast « Demande NOVA-2026-0043 créée »", async () => {
    const { messageDemandeCreee } = await import("@/shared/messages");
    expect(messageDemandeCreee("NOVA-2026-0043")).toBe("Demande NOVA-2026-0043 créée");
  });
});

describe("lecture du formulaire et page", () => {
  it("catégories actives seulement, dans l'ordre ; contact données de la base", async () => {
    simulation.categories[2].active = false;
    const html = renderToStaticMarkup(await ContenuSaisie());
    const options = [...html.matchAll(/<option[^>]*value="([^"]+)"/g)].map(([, id]) => id);
    expect(options).toEqual(CATEGORIES_DEPART.filter((_, i) => i !== 2).map((c) => c.id));
    expect(html).toContain(`mailto:${CONTACT_DONNEES_SIMULE}`);
    expect(simulation.rpcSession).toHaveBeenCalledWith("lire_formulaire_saisie");
    expect(simulation.creerClientSecret).not.toHaveBeenCalled();
  });

  it("lecture impossible : l'erreur remonte (écran S3), sans donnée dans le message", async () => {
    simulation.pannesRpc.lire_formulaire_saisie = { data: null, error: { code: "57P01", message: "x" } };
    await expect(ContenuSaisie()).rejects.toThrow("La fonction lire_formulaire_saisie a échoué (code 57P01).");
  });

  it("sans session : renvoi vers /connexion, rien n'est lu", async () => {
    simulation.session.id = null;
    await expect(ContenuSaisie()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("page : titre dans la coque, une colonne de 560 px, contenu sous <Suspense> et son squelette", () => {
    const html = renderToStaticMarkup(PageNouvelleDemande() as ReactElement);
    expect(html).toMatch(/<h1[^>]*>Nouvelle demande<\/h1>/);
    expect(html).toContain("max-w-form");
    expect(html).toContain('data-slot="squelette"');
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/demandes/nouvelle/page.tsx"), "utf8");
    expect(source).toMatch(/<Suspense fallback=\{<SqueletteSaisie \/>\}>\s*<ContenuSaisie \/>/);
    const squelette = renderToStaticMarkup(<SqueletteSaisie />);
    expect(squelette).toContain("animate-apres-300ms");
    expect(squelette).toContain("Chargement du formulaire…");
  });
});

describe("accès à l'écran : menu, liste, état vide", () => {
  it("menu : « Nouvelle demande » vers /demandes/nouvelle, actif ici ; « Demandes » ne l'est pas", () => {
    const html = renderToStaticMarkup(<MenuLateral />);
    const liens = [...html.matchAll(/<a [^>]*data-slot="lien-menu"[^>]*>[\s\S]*?<\/a>/g)].map(([a]) => a);
    expect(liens.map((a) => texteDe(a).replace(/\d+ à traiter/, "").trim())).toEqual(["Demandes", "Nouvelle demande"]);
    expect(liens[1]).toContain('href="/demandes/nouvelle"');
    expect(liens[1]).toContain('aria-current="page"');
    expect(liens[0]).not.toContain("aria-current");
  });

  it("menu sur la liste ou un détail : « Demandes » actif, « Nouvelle demande » non", () => {
    for (const valeur of ["/demandes", "/demandes/NOVA-2026-0042"]) {
      chemin.valeur = valeur;
      const html = renderToStaticMarkup(<MenuLateral />);
      const liens = [...html.matchAll(/<a [^>]*data-slot="lien-menu"[^>]*>/g)].map(([a]) => a);
      expect(liens[0]).toContain('aria-current="page"');
      expect(liens[1]).not.toContain("aria-current");
    }
  });

  it.each([
    ["/demandes/nouvelle", false],
    ["/demandes/nouvelle/x", false],
    ["/demandes/nouvelles", true],
    ["/demandes/NOVA-2026-0042", true],
  ] as const)("estActif(%s, /demandes, [/demandes/nouvelle]) : %s", (valeur, attendu) => {
    expect(estActif(valeur, "/demandes", ["/demandes/nouvelle"])).toBe(attendu);
  });

  it("liste : bouton principal « Nouvelle demande » à côté du titre", () => {
    const html = renderToStaticMarkup(
      PageDemandes({ searchParams: Promise.resolve({}), params: Promise.resolve({}) } as never) as ReactElement,
    );
    const [, lien = "", libelle = ""] = html.match(/<h1[^>]*>Demandes<\/h1>(<a [^>]*>)([\s\S]*?)<\/a>/) ?? [];
    expect(lien).toContain('href="/demandes/nouvelle"');
    expect(lien).toContain('data-variant="principal"');
    expect(texteDe(libelle)).toBe("Nouvelle demande");
    // Un seul bouton principal sur l'écran.
    expect(html.match(/data-variant="principal"/g)).toHaveLength(1);
  });

  it("état vide : bouton secondaire « Saisir une demande reçue par téléphone »", () => {
    const html = renderToStaticMarkup(<EtatListeVide />);
    const [, lien = "", libelle = ""] = html.match(/(<a [^>]*>)([\s\S]*?)<\/a>/) ?? [];
    expect(lien).toContain('href="/demandes/nouvelle"');
    expect(lien).toContain('data-variant="secondaire"');
    expect(libelle).toBe("Saisir une demande reçue par téléphone");
  });
});

describe("détail d'une demande saisie (critère 3)", () => {
  const CREATION_KARIM = {
    type: "creation" as const,
    auteur: { interne: true as const, nom: "Karim Benali" },
    date: "2026-11-24T09:12:00.000Z",
  };

  it("historique : « Demande créée (canal : Téléphone) » puis « Karim Benali · 24 nov. 2026, 10 h 12 »", () => {
    const html = renderToStaticMarkup(<HistoriqueDemande evenements={[CREATION_KARIM]} canal="telephone" />);
    expect(texteDe(html)).toBe("Demande créée (canal : Téléphone) Karim Benali · 24 nov. 2026, 10 h 12");
  });

  it("canal Email : « (canal : Email) »", () => {
    const html = renderToStaticMarkup(<HistoriqueDemande evenements={[CREATION_KARIM]} canal="email" />);
    expect(texteDe(html)).toMatch(/^Demande créée \(canal : Email\) Karim Benali/);
  });

  it("demande du formulaire public : inchangée, « Demande créée » · « Demandeur »", () => {
    const html = renderToStaticMarkup(
      <HistoriqueDemande
        evenements={[{ type: "creation", auteur: { interne: false, libelle: "demandeur" }, date: CREATION_KARIM.date }]}
        canal="formulaire"
      />,
    );
    expect(texteDe(html)).toBe("Demande créée Demandeur · 24 nov. 2026, 10 h 12");
  });

  it("de bout en bout : saisie, puis le détail montre le canal Téléphone et l'historique au nom de Karim", async () => {
    const reponse = await actionSaisirDemande(SAISIE, NUMERO_ENVOI);
    expect(reponse.ok).toBe(true);
    const html = renderToStaticMarkup(
      await ContenuDemande({ params: Promise.resolve({ reference: "NOVA-2026-0001" }), searchParams: Promise.resolve({}) }),
    );
    expect(texteDe(html)).toContain("Canal Téléphone");
    expect(texteDe(html)).toContain("Demande créée (canal : Téléphone) Karim Benali · 20 nov. 2026, 10 h 00");
  });
});
