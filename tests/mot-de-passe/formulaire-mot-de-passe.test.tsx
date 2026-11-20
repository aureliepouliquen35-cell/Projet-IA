import { prerender } from "react-dom/static";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// I2 — Choisir un nouveau mot de passe (EXPERIENCE.md) : écran rendu sans
// navigateur, gestes joués par `reduireMotDePasse`. Matrice de la story 1.7 :
// champs vidés après toute erreur, messages de l'UX sous les champs,
// « Enregistrement… » pendant l'envoi, curseur dans le premier champ, toast
// puis « Demandes » à la réussite.

const garde = vi.hoisted(() => ({ exigerChangementMotDePasse: vi.fn(async () => ({ id: "x" })) }));

vi.mock("@/server/actions/choisir-mot-de-passe", () => ({ actionChoisirMotDePasse: vi.fn() }));
vi.mock("@/server/actions/se-deconnecter", () => ({ actionSeDeconnecter: vi.fn() }));
vi.mock("@/server/garde", () => garde);
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import {
  actionApresReponse,
  envoyerMotDePasse,
  ETAT_MOT_DE_PASSE_INITIAL,
  FormulaireMotDePasse,
  reduireMotDePasse,
  VueFormulaireMotDePasse,
  type ActionMotDePasse,
  type EtatMotDePasse,
} from "@/app/connexion/nouveau-mot-de-passe/formulaire-mot-de-passe";
import PageNouveauMotDePasse from "@/app/connexion/nouveau-mot-de-passe/page";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";

const rendre = (etat: EtatMotDePasse = ETAT_MOT_DE_PASSE_INITIAL, envoiEnCours = false) =>
  renderToStaticMarkup(<VueFormulaireMotDePasse etat={etat} envoiEnCours={envoiEnCours} />);

const controle = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]* id="${id}"[^>]*>`))?.[0] ?? "";

const jouer = (actions: ActionMotDePasse[], depart: EtatMotDePasse = ETAT_MOT_DE_PASSE_INITIAL) =>
  actions.reduce(reduireMotDePasse, depart);

const saisie = (motDePasse: string, confirmation: string): ActionMotDePasse[] => [
  { type: "saisie", champ: "motDePasse", valeur: motDePasse },
  { type: "saisie", champ: "confirmation", valeur: confirmation },
];

const NOUVEAU = "Mon nouveau mot de passe 2026";

async function rendreEnEntier(element: React.ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

beforeEach(() => {
  garde.exigerChangementMotDePasse.mockClear();
});

describe("affichage (formulaire vierge)", () => {
  const html = rendre();

  it("texte, champs « Nouveau mot de passe » et « Confirmer », règle visible, bouton", () => {
    expect(html).toMatch(/<label[^>]* for="motDePasse"[^>]*>Nouveau mot de passe<\/label>/);
    expect(html).toMatch(/<label[^>]* for="confirmation"[^>]*>Confirmer<\/label>/);
    expect(html).toMatch(/<span id="motDePasse-aide">12 caractères minimum<\/span>/);
    expect(controle(html, "motDePasse")).toContain('aria-describedby="motDePasse-aide"');
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Enregistrer et continuer<\/button>/);
  });

  it("deux champs vierges, masqués, curseur dans le premier", () => {
    for (const id of ["motDePasse", "confirmation"]) {
      expect(controle(html, id)).toContain('type="password"');
      expect(controle(html, id)).toContain('autoComplete="new-password"');
      expect(controle(html, id)).toContain('value=""');
    }
    expect(controle(html, "motDePasse")).toMatch(/autofocus/i);
    expect(controle(html, "confirmation")).not.toMatch(/autofocus/i);
  });

  it("aucun message d'erreur", () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('data-slot="erreur-champ"');
  });

  it("le formulaire avec état s'affiche de la même façon", () => {
    expect(renderToStaticMarkup(<FormulaireMotDePasse />)).toBe(html);
  });
});

describe("page I2", () => {
  it("logo, « Se déconnecter » en haut à droite, texte de l'UX, sans nom ni menu", async () => {
    const page = await rendreEnEntier(<PageNouveauMotDePasse />);
    const texte = texteDe(page);
    expect(page).toMatch(/<header[\s\S]*Se déconnecter[\s\S]*<\/header>/);
    expect(page).toMatch(/<h1[^>]*>Choisir un nouveau mot de passe<\/h1>/);
    expect(texte).toContain("Pour sécuriser votre compte, choisissez votre propre mot de passe.");
    expect(page).not.toContain('data-slot="nom-utilisateur"');
    expect(page).not.toMatch(/<nav/);
  });

  it("le formulaire n'est affiché qu'après la garde d'I2", async () => {
    const page = await rendreEnEntier(<PageNouveauMotDePasse />);
    expect(garde.exigerChangementMotDePasse).toHaveBeenCalledTimes(1);
    expect(page).toContain("Enregistrer et continuer");
  });

  it("garde qui renvoie ailleurs : aucun formulaire", async () => {
    garde.exigerChangementMotDePasse.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    const page = await rendreEnEntier(<PageNouveauMotDePasse />).catch(() => "");
    expect(page).not.toContain('id="motDePasse"');
  });
});

describe("saisie et envoi refusé", () => {
  it("trop court : message sous le 1er champ, résumé, champs vidés", () => {
    const etat = jouer([...saisie("court", "court"), { type: "refus", champs: { motDePasse: "12 caractères minimum" } }]);
    expect(etat.valeurs).toEqual({ motDePasse: "", confirmation: "" });
    expect(etat.appelsResume).toBe(1);
    const html = rendre(etat);
    expect(html).toContain('data-slot="resume-erreurs"');
    expect(html).toMatch(/id="motDePasse-erreur"[^>]*>[\s\S]*?12 caractères minimum<\/p>/);
    expect(controle(html, "motDePasse")).toContain('aria-invalid="true"');
    expect(controle(html, "motDePasse")).toContain('value=""');
    expect(controle(html, "confirmation")).toContain('value=""');
  });

  it("différents : message sous « Confirmer »", () => {
    const etat = jouer([
      ...saisie(NOUVEAU, "autre"),
      { type: "refus", champs: { confirmation: "Les deux mots de passe ne sont pas identiques" } },
    ]);
    const html = rendre(etat);
    expect(html).toMatch(/id="confirmation-erreur"[^>]*>[\s\S]*?Les deux mots de passe ne sont pas identiques<\/p>/);
    expect(etat.valeurs).toEqual({ motDePasse: "", confirmation: "" });
  });

  it("confirmation en erreur : corriger le 1er champ pour qu'ils soient identiques retire son message et le résumé", () => {
    const refuse = jouer([
      { type: "refus", champs: { confirmation: "Les deux mots de passe ne sont pas identiques" } },
      { type: "saisie", champ: "confirmation", valeur: NOUVEAU },
    ]);
    expect(refuse.erreurs.confirmation).toBe("Les deux mots de passe ne sont pas identiques");
    const encore = reduireMotDePasse(refuse, { type: "saisie", champ: "motDePasse", valeur: "autre chose 2026" });
    expect(encore.erreurs.confirmation).toBe("Les deux mots de passe ne sont pas identiques");
    const corrige = reduireMotDePasse(refuse, { type: "saisie", champ: "motDePasse", valeur: NOUVEAU });
    expect(corrige.erreurs.confirmation).toBeUndefined();
    expect(corrige.resumeVisible).toBe(false);
    expect(rendre(corrige)).not.toContain('data-slot="resume-erreurs"');
  });

  it("confirmation sans erreur : le 1er champ n'en fait pas apparaître", () => {
    const etat = jouer(saisie("un mot de passe 2026", "autre"));
    expect(etat.erreurs).toEqual({});
  });

  it("le message disparaît dès que le champ est corrigé", () => {
    const refuse = jouer([{ type: "refus", champs: { motDePasse: "12 caractères minimum" } }]);
    const encore = reduireMotDePasse(refuse, { type: "saisie", champ: "motDePasse", valeur: "court" });
    expect(encore.erreurs.motDePasse).toBe("12 caractères minimum");
    const corrige = reduireMotDePasse(refuse, { type: "saisie", champ: "motDePasse", valeur: NOUVEAU });
    expect(corrige.erreurs.motDePasse).toBeUndefined();
    expect(corrige.resumeVisible).toBe(false);
  });
});

describe("réponse de la Server Function", () => {
  it("temporaire réutilisé : message sous le 1er champ, champs vidés", () => {
    const suite = actionApresReponse(
      echec("VALIDATION", "1 champ est à corriger", {
        champs: { motDePasse: "Choisissez un mot de passe différent du mot de passe temporaire" },
      }),
    );
    expect(suite).toEqual({
      type: "refus",
      champs: { motDePasse: "Choisissez un mot de passe différent du mot de passe temporaire" },
    });
    const etat = jouer([...saisie(NOUVEAU, NOUVEAU), suite]);
    expect(etat.valeurs).toEqual({ motDePasse: "", confirmation: "" });
    expect(texteDe(rendre(etat))).toContain("Choisissez un mot de passe différent du mot de passe temporaire");
  });

  it.each([
    echec("ERREUR_INTERNE", "Une erreur inattendue s'est produite.", { codeSupport: "ABC1234" }),
    echec("VALIDATION", "1 champ est à corriger"),
    echec("ACCES_REFUSE", "refus"),
  ])("panne ou réponse inattendue : message de l'UX en haut, champs vidés, sélection au 1er champ", (reponse) => {
    const suite = actionApresReponse(reponse);
    expect(suite).toEqual({
      type: "echec",
      message: "Votre mot de passe n'a pas pu être enregistré. Réessayez.",
    });
    const etat = jouer([...saisie(NOUVEAU, NOUVEAU), { type: "envoi" }, suite]);
    expect(etat.valeurs).toEqual({ motDePasse: "", confirmation: "" });
    expect(etat.appelsPremierChamp).toBe(1);
    const html = rendre(etat);
    expect(html).toMatch(/role="alert"[\s\S]*Votre mot de passe n&#x27;a pas pu être enregistré. Réessayez./);
    expect(html).not.toContain("ABC1234");
  });

  it("réussite : formulaire figé, « Enregistrement… »", () => {
    expect(actionApresReponse(succes(null))).toEqual({ type: "reussite" });
    const etat = jouer([...saisie(NOUVEAU, NOUVEAU), { type: "envoi" }, { type: "reussite" }]);
    const html = rendre(etat);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[\s\S]*Enregistrement…<\/button>/);
  });

  it("aucune réponse (le serveur a changé de page) : figé, sans toast", () => {
    expect(actionApresReponse(undefined)).toEqual({ type: "renvoi" });
    expect(jouer([{ type: "renvoi" }]).redirection).toBe(true);
  });

  it("pendant l'envoi : bouton « Enregistrement… » désactivé, champs désactivés", () => {
    const html = rendre(jouer(saisie(NOUVEAU, NOUVEAU)), true);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[\s\S]*Enregistrement…<\/button>/);
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain('aria-busy="true"');
  });
});

describe("envoyerMotDePasse", () => {
  const valeurs = { motDePasse: NOUVEAU, confirmation: NOUVEAU };

  it("réussite : toast et passage à « Demandes », verrou gardé fermé", async () => {
    const agir = vi.fn();
    const apresReussite = vi.fn();
    const envoiVerrouille = { current: true };
    await envoyerMotDePasse({ valeurs, choisir: async () => succes(null), agir, apresReussite, envoiVerrouille });
    expect(agir).toHaveBeenCalledWith({ type: "reussite" });
    expect(apresReussite).toHaveBeenCalledTimes(1);
    expect(envoiVerrouille.current).toBe(true);
  });

  it("erreur : verrou rouvert, pas de toast", async () => {
    const apresReussite = vi.fn();
    const envoiVerrouille = { current: true };
    await envoyerMotDePasse({
      valeurs,
      choisir: async () => echec("ERREUR_INTERNE", "x"),
      agir: vi.fn(),
      apresReussite,
      envoiVerrouille,
    });
    expect(apresReussite).not.toHaveBeenCalled();
    expect(envoiVerrouille.current).toBe(false);
  });

  it("réseau coupé : même message qu'une panne", async () => {
    const agir = vi.fn();
    await envoyerMotDePasse({
      valeurs,
      choisir: async () => {
        throw new Error("Failed to fetch");
      },
      agir,
      apresReussite: vi.fn(),
      envoiVerrouille: { current: true },
    });
    expect(agir).toHaveBeenCalledWith({
      type: "echec",
      message: "Votre mot de passe n'a pas pu être enregistré. Réessayez.",
    });
  });

  it("renvoi par le serveur : verrou gardé fermé, pas de toast", async () => {
    const apresReussite = vi.fn();
    const envoiVerrouille = { current: true };
    await envoyerMotDePasse({ valeurs, choisir: async () => undefined, agir: vi.fn(), apresReussite, envoiVerrouille });
    expect(apresReussite).not.toHaveBeenCalled();
    expect(envoiVerrouille.current).toBe(true);
  });
});
