import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/se-connecter", () => ({ actionSeConnecter: vi.fn() }));

import {
  actionApresReponse,
  envoyerConnexion,
  ETAT_CONNEXION_INITIAL,
  FormulaireConnexion,
  reduireConnexion,
  VueFormulaireConnexion,
  type ActionConnexion,
  type EtatConnexion,
} from "@/app/connexion/formulaire-connexion";
import PageConnexion from "@/app/connexion/page";
import { MESSAGE_ERREUR_INATTENDUE } from "@/shared/messages";
import { echec, succes } from "@/shared/reponse";
import { validerConnexion } from "@/shared/schemas/connexion";

import { texteDe } from "../aides/formulaire-depot";

// I1 — Connexion (EXPERIENCE.md) : écran rendu sans navigateur, gestes joués
// par `reduireConnexion`. Matrice de la story 1.6 : mot de passe effacé et
// email gardé après un échec, bouton « Connexion… » désactivé pendant
// l'envoi, messages sous les champs.

const rendre = (etat: EtatConnexion = ETAT_CONNEXION_INITIAL, envoiEnCours = false) =>
  renderToStaticMarkup(<VueFormulaireConnexion etat={etat} envoiEnCours={envoiEnCours} />);

const controle = (html: string, id: string) =>
  html.match(new RegExp(`<input[^>]* id="${id}"[^>]*>`))?.[0] ?? "";

const jouer = (actions: ActionConnexion[], depart: EtatConnexion = ETAT_CONNEXION_INITIAL) =>
  actions.reduce(reduireConnexion, depart);

const saisie = (email: string, motDePasse: string): ActionConnexion[] => [
  { type: "saisie", champ: "email", valeur: email },
  { type: "saisie", champ: "motDePasse", valeur: motDePasse },
];

describe("affichage (formulaire vierge)", () => {
  const page = renderToStaticMarkup(<PageConnexion />);
  const html = rendre();

  it("titre, champs Email et Mot de passe, bouton « Se connecter »", () => {
    expect(texteDe(page)).toContain("Espace interne Nova Services");
    expect(page).toMatch(/<h1[^>]*>Espace interne Nova Services<\/h1>/);
    expect(html).toMatch(/<label[^>]* for="email"[^>]*>Email<\/label>/);
    expect(html).toMatch(/<label[^>]* for="motDePasse"[^>]*>Mot de passe<\/label>/);
    expect(texteDe(html)).toContain("Se connecter");
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Se connecter<\/button>/);
  });

  it("curseur dans le champ Email", () => {
    expect(controle(html, "email")).toMatch(/autofocus/i);
    expect(controle(html, "motDePasse")).not.toMatch(/autofocus/i);
  });

  it("mot de passe masqué, avec un bouton « Afficher »", () => {
    expect(controle(html, "motDePasse")).toContain('type="password"');
    expect(controle(html, "motDePasse")).toContain('autoComplete="current-password"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-controls="motDePasse"[^>]*>[\s\S]*?Afficher<\/button>/);
  });

  it("texte « Mot de passe oublié ? Contactez votre administrateur. », sans lien", () => {
    expect(texteDe(page)).toContain("Mot de passe oublié ? Contactez votre administrateur.");
    expect(page).not.toMatch(/<a[^>]*>[^<]*Mot de passe oublié/);
  });

  it("aucun message d'erreur", () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('data-slot="erreur-champ"');
  });

  it("le formulaire avec état s'affiche de la même façon", () => {
    expect(renderToStaticMarkup(<FormulaireConnexion />)).toBe(html);
  });
});

describe("« Afficher »", () => {
  it("montre le mot de passe en clair, puis le masque de nouveau", () => {
    const visible = jouer([{ type: "basculerAffichage" }]);
    const html = rendre(visible);
    expect(controle(html, "motDePasse")).toContain('type="text"');
    expect(texteDe(html)).toContain("Masquer");
    expect(controle(rendre(jouer([{ type: "basculerAffichage" }], visible)), "motDePasse")).toContain(
      'type="password"',
    );
  });
});

describe("saisie vide ou mal formée (vérifiée dans le navigateur)", () => {
  function envoyer(etat: EtatConnexion): EtatConnexion {
    const validation = validerConnexion(etat.valeurs);
    return validation.ok ? etat : reduireConnexion(etat, { type: "refus", champs: validation.champs });
  }

  it("champs vides : un message sous chaque champ et le résumé en haut", () => {
    const etat = envoyer(ETAT_CONNEXION_INITIAL);
    const html = rendre(etat);
    expect(html).toMatch(/id="email-erreur"[^>]*>[\s\S]*?L&#x27;email est obligatoire<\/p>/);
    expect(html).toMatch(/id="motDePasse-erreur"[^>]*>[\s\S]*?Le mot de passe est obligatoire<\/p>/);
    expect(controle(html, "email")).toContain('aria-invalid="true"');
    expect(texteDe(html)).toContain("2 champs sont à corriger");
    // La sélection part vers le résumé, pas vers le mot de passe.
    expect(etat.appelsResume).toBe(ETAT_CONNEXION_INITIAL.appelsResume + 1);
    expect(etat.appelsMotDePasse).toBe(ETAT_CONNEXION_INITIAL.appelsMotDePasse);
    expect(envoyer(etat).appelsResume).toBe(etat.appelsResume + 1);
  });

  it("email sans @ : message à la sortie du champ", () => {
    const etat = jouer([...saisie("karim", ""), { type: "sortie", champ: "email" }]);
    expect(etat.erreurs).toEqual({ email: "L'email doit avoir la forme nom@exemple.fr" });
  });

  it("rien n'est effacé, et le message disparaît dès que le champ est corrigé", () => {
    const refuse = envoyer(jouer(saisie("karim", "secret")));
    expect(refuse.valeurs).toEqual({ email: "karim", motDePasse: "secret" });
    const corrige = jouer([{ type: "saisie", champ: "email", valeur: "karim@nova.fr" }], refuse);
    expect(corrige.erreurs).toEqual({});
    expect(corrige.resumeVisible).toBe(false);
  });
});

describe("envoi", () => {
  it("bouton « Connexion… » désactivé et saisie figée pendant l'envoi", () => {
    const html = rendre(jouer(saisie("karim@nova.fr", "secret")), true);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>[\s\S]*?Connexion…<\/button>/);
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain('aria-busy="true"');
  });

  it("après une réussite, le formulaire reste figé jusqu'au changement de page", () => {
    const html = rendre(jouer([...saisie("karim@nova.fr", "secret"), { type: "reussite" }]));
    expect(texteDe(html)).toContain("Connexion…");
  });
});

describe("échec de la connexion", () => {
  const rempli = jouer(saisie("karim@nova.fr", "mauvais"));

  it.each([
    [echec("VALIDATION", "Identifiants incorrects"), "Identifiants incorrects"],
    [echec("TROP_DE_TENTATIVES", "…"), "Trop de tentatives, réessayez plus tard"],
  ])("%o : message de l'UX, mot de passe effacé, email gardé", (reponse, message) => {
    const etat = reduireConnexion(rempli, actionApresReponse(reponse));
    expect(etat.valeurs).toEqual({ email: "karim@nova.fr", motDePasse: "" });
    expect(etat.message).toBe(message);
    const html = rendre(etat);
    expect(html).toMatch(new RegExp(`role="alert"[\\s\\S]*?${message}`));
    expect(controle(html, "motDePasse")).toContain('value=""');
    expect(controle(html, "email")).toContain('value="karim@nova.fr"');
    // La sélection revient au mot de passe, pas au résumé.
    expect(etat.appelsMotDePasse).toBe(rempli.appelsMotDePasse + 1);
    expect(etat.appelsResume).toBe(rempli.appelsResume);
    expect(reduireConnexion(etat, actionApresReponse(reponse)).appelsMotDePasse).toBe(
      etat.appelsMotDePasse + 1,
    );
  });

  it("le message affiché est celui de l'UX, jamais celui de la réponse", () => {
    const etat = reduireConnexion(rempli, actionApresReponse(echec("VALIDATION", "Texte technique")));
    expect(etat.message).toBe("Identifiants incorrects");
  });

  it("panne : « Une erreur inattendue s'est produite. », rien d'effacé", () => {
    const etat = reduireConnexion(rempli, actionApresReponse(echec("ERREUR_INTERNE", "x")));
    expect(etat.message).toBe(MESSAGE_ERREUR_INATTENDUE);
    expect(etat.valeurs).toEqual({ email: "karim@nova.fr", motDePasse: "mauvais" });
  });

  it("le message disparaît au nouvel envoi", () => {
    const etat = reduireConnexion(rempli, actionApresReponse(echec("VALIDATION", "Identifiants incorrects")));
    expect(reduireConnexion(etat, { type: "envoi" }).message).toBeNull();
  });

  it("erreurs de champ renvoyées par le serveur : sous les champs", () => {
    expect(
      actionApresReponse(echec("VALIDATION", "1 champ est à corriger", { champs: { email: "L'email est obligatoire" } })),
    ).toEqual({ type: "refus", champs: { email: "L'email est obligatoire" } });
  });

  it("aucune réponse (renvoi de Next.js) ou réussite : formulaire figé", () => {
    expect(actionApresReponse(undefined)).toEqual({ type: "reussite" });
    expect(actionApresReponse(succes(null))).toEqual({ type: "reussite" });
  });
});

describe("envoyerConnexion", () => {
  const valeurs = { email: "karim@nova.fr", motDePasse: "mauvais" };

  it("échec : action « echec », verrou rouvert", async () => {
    const agir = vi.fn();
    const envoiVerrouille = { current: true };
    await envoyerConnexion({
      valeurs,
      seConnecter: async () => echec("VALIDATION", "Identifiants incorrects"),
      agir,
      envoiVerrouille,
    });
    expect(agir).toHaveBeenCalledWith({
      type: "echec",
      message: "Identifiants incorrects",
      effacerMotDePasse: true,
    });
    expect(envoiVerrouille.current).toBe(false);
  });

  it("serveur injoignable (exception) : panne, verrou rouvert", async () => {
    const agir = vi.fn();
    const envoiVerrouille = { current: true };
    await envoyerConnexion({
      valeurs,
      seConnecter: async () => {
        throw new Error("réseau coupé");
      },
      agir,
      envoiVerrouille,
    });
    expect(agir).toHaveBeenCalledWith({
      type: "echec",
      message: MESSAGE_ERREUR_INATTENDUE,
      effacerMotDePasse: false,
    });
    expect(envoiVerrouille.current).toBe(false);
  });

  it("réussite : verrou gardé fermé jusqu'au changement de page", async () => {
    const agir = vi.fn();
    const envoiVerrouille = { current: true };
    const seConnecter = vi.fn(async () => undefined);
    await envoyerConnexion({ valeurs, seConnecter, agir, envoiVerrouille });
    expect(seConnecter).toHaveBeenCalledWith(valeurs);
    expect(agir).toHaveBeenCalledWith({ type: "reussite" });
    expect(envoiVerrouille.current).toBe(true);
  });
});
