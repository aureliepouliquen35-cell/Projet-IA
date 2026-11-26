import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// « Modifier » de l'écran A1 (story 3.3 ; EXPERIENCE.md, A1 ; FR-22, FR-25,
// RM-9), rendu en HTML sans navigateur : le bouton de la ligne, la fenêtre
// (titre, Nom * prérempli, email en texte, Rôle *, « Annuler » et
// « Enregistrer »), les messages sous le champ, le refus du dernier
// administrateur, la panne, l'envoi en cours, le réducteur et l'envoi
// (verrou, fermeture, toast). La Server Function est simulée.

const modifierAction = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/modifier-compte", () => ({ actionModifierCompte: modifierAction }));
// Les autres actions de la ligne ne sont pas appelées ici.
vi.mock("@/server/actions/changer-etat-compte", () => ({ actionChangerEtatCompte: vi.fn() }));
vi.mock("@/server/actions/reinitialiser-mot-de-passe", () => ({ actionReinitialiserMotDePasse: vi.fn() }));

import {
  actionApresReponseModification,
  changerOuvertureModification,
  envoyerModification,
  ETAT_MODIFICATION_INITIAL,
  idChampModification,
  ModifierCompte,
  preparerEnvoiModification,
  reduireModification,
  valeursDuCompte,
  VueModifierCompte,
  type ActionModification,
  type EtatModification,
} from "@/components/interne/modifier-compte";
import { TableauComptes } from "@/components/interne/tableau-comptes";
import { Dialog } from "@/components/ui/dialog";
import { MESSAGES_COMPTE } from "@/shared/messages";
import { echec, succes } from "@/shared/reponse";

import { texteDe } from "../aides/formulaire-depot";

const LUCAS = {
  id: "7e2a9c41-3b5d-4f68-9a0c-2d4e6f8a1b3c",
  nom: "Lucas Bernard",
  email: "lucas.bernard@nova-services.example",
  role: "collaborateur" as const,
};
const MODIFIE = { ...LUCAS, actif: true, change: true };
const TITRE = "Modifier le compte de Lucas Bernard";
const PANNE = "Le compte n'a pas pu être modifié. Réessayez.";
const DERNIER_ADMINISTRATEUR = "Impossible : il doit rester au moins un administrateur actif.";
const ID_NOM = idChampModification(LUCAS.id, "nom");
const ID_ROLE = idChampModification(LUCAS.id, "role");

const ouvert = (etat: Partial<EtatModification> = {}): EtatModification => ({
  ...ETAT_MODIFICATION_INITIAL,
  valeurs: valeursDuCompte(LUCAS),
  ...etat,
});

/** Contenu de la fenêtre : `Dialog` ouvert fournit le contexte du titre (sans portail). */
const rendre = (etat: Partial<EtatModification> = {}, envoiEnCours = false) =>
  renderToStaticMarkup(
    <Dialog open>
      <VueModifierCompte compte={LUCAS} etat={ouvert(etat)} envoiEnCours={envoiEnCours} />
    </Dialog>,
  );

const controle = (html: string, balise: "input" | "select", id: string) =>
  html.match(new RegExp(`<${balise}[^>]*id="${id}"[^>]*>`))?.[0] ?? "";

const appliquer = (actions: ActionModification[], depart: EtatModification = ouvert()) =>
  actions.reduce(reduireModification, depart);

afterEach(() => {
  vi.restoreAllMocks();
  modifierAction.mockReset();
});

describe("bouton de la ligne", () => {
  it("« Modifier », secondaire, nom accessible avec le nom du compte ; fenêtre fermée d'avance", () => {
    const html = renderToStaticMarkup(<ModifierCompte compte={LUCAS} />);
    expect(html).toMatch(/^<button[^>]*data-slot="modifier-compte"[^>]*>/);
    expect(html).toContain('data-variant="secondaire"');
    expect(html).toContain(`aria-label="${TITRE}"`);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(texteDe(html)).toBe("Modifier");
    expect(html).not.toMatch(/<form|<input/);
  });

  it("en premier dans la colonne Actions, sur chaque ligne, compte actif ou désactivé ; les autres actions inchangées", () => {
    const html = renderToStaticMarkup(
      <TableauComptes
        comptes={[
          { ...LUCAS, actif: true },
          { id: "5d1e2f3a-4b5c-4d6e-8f70-819203a4b5c6", nom: "Sophie Martin", email: "s@exemple.fr", role: "administrateur", actif: false },
        ]}
      />,
    );
    const lignes = html.split('data-slot="ligne-compte"').slice(1);
    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) {
      const actions = [...ligne.matchAll(/<button[^>]*data-slot="([\w-]+)"/g)].map(([, slot]) => slot);
      expect(actions[0]).toBe("modifier-compte");
      expect(actions[1]).toBe("reinitialiser-mot-de-passe");
      expect(["desactiver", "reactiver"]).toContain(actions[2]);
    }
    expect(html).toContain('aria-label="Modifier le compte de Sophie Martin"');
  });
});

describe("fenêtre : formulaire", () => {
  it("titre « Modifier le compte de Lucas Bernard », Nom * prérempli, Email en texte, Rôle * avec les deux rôles", () => {
    const html = rendre();
    expect(html).toMatch(new RegExp(`<h2[^>]*>${TITRE}</h2>`));
    expect(texteDe(html)).toBe(`${TITRE} Nom * Email ${LUCAS.email} Rôle * Collaborateur Administrateur Annuler Enregistrer`);

    expect(html).toMatch(new RegExp(`<label[^>]*for="${ID_NOM}"[^>]*>Nom<span aria-hidden="true" class="text-danger"> \\*</span></label>`));
    const nom = controle(html, "input", ID_NOM);
    expect(nom).toContain(`value="${LUCAS.nom}"`);
    expect(nom).toContain('required=""');

    expect(html).toMatch(new RegExp(`<label[^>]*for="${ID_ROLE}"[^>]*>Rôle<span aria-hidden="true" class="text-danger"> \\*</span></label>`));
    expect(controle(html, "select", ID_ROLE)).toContain('required=""');
    expect(html).toMatch(/<option[^>]*value="collaborateur"[^>]*selected=""[^>]*>Collaborateur<\/option>/);
    expect(html).toMatch(/<option[^>]*value="administrateur"[^>]*>Administrateur<\/option>/);
  });

  it("l'email est affiché mais ne peut pas être modifié : du texte, aucun champ", () => {
    const html = rendre();
    expect(html).toMatch(/<dl data-slot="email-compte"[^>]*><dt[^>]*>Email<\/dt><dd[^>]*>lucas\.bernard@nova-services\.example<\/dd><\/dl>/);
    expect(html.match(/<input/g)).toHaveLength(1);
    expect(html).not.toMatch(/<input[^>]*(type="email"|name="email")/);
    expect(html).not.toMatch(/<input[^>]*value="lucas\.bernard/);
  });

  it("rôle Administrateur prérempli pour un administrateur", () => {
    const html = renderToStaticMarkup(
      <Dialog open>
        <VueModifierCompte
          compte={{ ...LUCAS, role: "administrateur" }}
          etat={{ ...ETAT_MODIFICATION_INITIAL, valeurs: { nom: LUCAS.nom, role: "administrateur" } }}
        />
      </Dialog>,
    );
    expect(html).toMatch(/<option[^>]*value="administrateur"[^>]*selected=""[^>]*>Administrateur<\/option>/);
  });

  it("boutons : « Annuler » (secondaire) puis « Enregistrer » (principal, envoi)", () => {
    const html = rendre();
    const pied = html.match(/<div data-slot="dialog-footer"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    const boutons = [...pied.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)];
    expect(boutons.map(([, , texte]) => texte)).toEqual(["Annuler", "Enregistrer"]);
    expect(boutons[0][1]).toMatch(/data-variant="secondaire"/);
    expect(boutons[0][1]).toMatch(/type="button"/);
    expect(boutons[1][1]).toMatch(/data-variant="principal"/);
    expect(boutons[1][1]).toMatch(/type="submit"/);
    expect(html).toContain("noValidate");
  });

  it("identifiants des champs uniques par ligne", () => {
    expect(idChampModification("a", "nom")).not.toBe(idChampModification("b", "nom"));
    expect(idChampModification("a", "nom")).not.toBe(idChampModification("a", "role"));
  });
});

describe("fenêtre : erreur, refus, panne, envoi", () => {
  it("nom invalide : message de la création sous le champ, relié (aria-invalid, aria-describedby)", () => {
    const html = rendre({ valeurs: { nom: "", role: "collaborateur" }, erreurs: { nom: "Le nom est obligatoire" } });
    const nom = controle(html, "input", ID_NOM);
    expect(nom).toContain('aria-invalid="true"');
    expect(nom).toContain(`aria-describedby="${ID_NOM}-erreur"`);
    expect(html).toMatch(new RegExp(`<p id="${ID_NOM}-erreur"[^>]*>[\\s\\S]*?Le nom est obligatoire</p>`));
  });

  it("dernier administrateur : le message exact dans la fenêtre, saisie gardée", () => {
    const html = rendre({ valeurs: { nom: LUCAS.nom, role: "collaborateur" }, panne: DERNIER_ADMINISTRATEUR });
    expect(html).toContain('data-slot="panne-modification"');
    expect(html).toMatch(/role="alert"/);
    expect(texteDe(html)).toContain(DERNIER_ADMINISTRATEUR);
    expect(controle(html, "input", ID_NOM)).toContain(`value="${LUCAS.nom}"`);
  });

  it("panne : encadré « Le compte n'a pas pu être modifié. Réessayez. », saisie gardée", () => {
    const html = rendre({ valeurs: { nom: "Lucas B.", role: "administrateur" }, panne: PANNE });
    expect(texteDe(html)).toContain(PANNE);
    expect(MESSAGES_COMPTE.modificationImpossible).toBe(PANNE);
    expect(controle(html, "input", ID_NOM)).toContain('value="Lucas B."');
    expect(html).toMatch(/<option[^>]*value="administrateur"[^>]*selected=""/);
  });

  it("envoi en cours : saisie figée, « Annuler » et l'envoi désactivés, « Enregistrement… »", () => {
    const html = rendre({}, true);
    expect(html).toMatch(/<fieldset disabled=""/);
    const boutons = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
    const annuler = boutons.find(([, attributs]) => attributs.includes('data-slot="annuler"'))!;
    const envoi = boutons.find(([, attributs]) => attributs.includes('type="submit"'))!;
    expect(annuler[1]).toContain('disabled=""');
    expect(envoi[1]).toContain('disabled=""');
    expect(texteDe(envoi[2])).toBe("Enregistrement…");
    expect(html).toContain('aria-busy="true"');
  });

  it("fenêtre de 440 px au plus, pas de fermeture par un clic à côté, sélection sur le champ Nom à l'ouverture", () => {
    const dialogue = readFileSync(join(process.cwd(), "src/components/ui/dialog.tsx"), "utf8");
    expect(dialogue).toContain("max-w-[440px]");
    const source = readFileSync(join(process.cwd(), "src/components/interne/modifier-compte.tsx"), "utf8");
    expect(source).toMatch(/onInteractOutside=\{\(evenement\) => evenement\.preventDefault\(\)\}/);
    expect(source).toMatch(/onOpenAutoFocus=\{\(evenement\) => \{\s*evenement\.preventDefault\(\);\s*refNom\.current\?\.focus\(\);/);
    // Sélection du champ en erreur à chaque refus seulement : corriger le nom
    // ne déplace pas la sélection vers Rôle.
    expect(source).toMatch(/useEffect\(\(\) => \{\s*if \(etat\.appelsChamp > 0\) selectionnerChampEnErreur\(\);\s*\}, \[etat\.appelsChamp\]\);/);
  });
});

describe("réducteur", () => {
  it("ouverture : la saisie repart des valeurs du compte, sans message", () => {
    const sale = appliquer([{ type: "saisie", champ: "nom", valeur: "x" }, { type: "panne", message: PANNE }]);
    expect(reduireModification(sale, { type: "ouverture", valeurs: valeursDuCompte(LUCAS) })).toEqual(ouvert());
  });

  it("un message reste tant que le champ n'est pas corrigé, puis disparaît", () => {
    const refuse = appliquer([
      { type: "saisie", champ: "nom", valeur: "" },
      { type: "refus", champs: { nom: "Le nom est obligatoire" } },
    ]);
    expect(refuse).toMatchObject({ erreurs: { nom: "Le nom est obligatoire" }, appelsChamp: 1 });
    expect(appliquer([{ type: "saisie", champ: "nom", valeur: "a".repeat(101) }], refuse).erreurs.nom).toBe(
      "Le nom ne doit pas dépasser 100 caractères",
    );
    expect(appliquer([{ type: "saisie", champ: "nom", valeur: "Lucas" }], refuse).erreurs).toEqual({});
    // Avant tout refus, la saisie n'affiche rien.
    expect(appliquer([{ type: "saisie", champ: "nom", valeur: "" }]).erreurs).toEqual({});
  });

  it("changement de rôle gardé dans la saisie", () => {
    expect(appliquer([{ type: "saisie", champ: "role", valeur: "administrateur" }]).valeurs).toEqual({
      nom: LUCAS.nom,
      role: "administrateur",
    });
  });

  it("panne : encadré, saisie gardée ; un nouvel envoi l'efface", () => {
    const panne = appliquer([{ type: "saisie", champ: "nom", valeur: "Lucas B." }, { type: "panne", message: PANNE }]);
    expect(panne).toMatchObject({ panne: PANNE, valeurs: { nom: "Lucas B." }, appelsEncadre: 1 });
    expect(appliquer([{ type: "envoi" }], panne).panne).toBeNull();
  });

  it("réussite ou fermeture : messages oubliés, valeurs gardées pendant l'animation de fermeture", () => {
    const sale = appliquer([
      { type: "saisie", champ: "nom", valeur: "Lucas B." },
      { type: "refus", champs: { nom: "Le nom est obligatoire" } },
      { type: "panne", message: PANNE },
    ]);
    const attendu: EtatModification = { ...ETAT_MODIFICATION_INITIAL, valeurs: { nom: "Lucas B.", role: "collaborateur" } };
    expect(reduireModification(sale, { type: "reussite" })).toEqual(attendu);
    expect(reduireModification(sale, { type: "reinitialisation" })).toEqual(attendu);
    // L'ouverture suivante recharge les valeurs du compte.
    expect(reduireModification(attendu, { type: "ouverture", valeurs: valeursDuCompte(LUCAS) })).toEqual(ouvert());
  });
});

describe("réponse de la Server Function", () => {
  it("réussite (même sans rien changer) : fenêtre fermée et toast", () => {
    expect(actionApresReponseModification(succes(MODIFIE))).toEqual({ type: "reussite" });
    expect(actionApresReponseModification(succes({ ...MODIFIE, change: false }))).toEqual({ type: "reussite" });
  });

  it("VALIDATION sur le nom ou le rôle : messages sous les champs", () => {
    expect(
      actionApresReponseModification(
        echec("VALIDATION", "1 champ est à corriger", { champs: { nom: "Le nom est obligatoire" } }),
      ),
    ).toEqual({ type: "refus", champs: { nom: "Le nom est obligatoire" } });
    expect(
      actionApresReponseModification(echec("VALIDATION", "1 champ est à corriger", { champs: { role: MESSAGES_COMPTE.roleInconnu } })),
    ).toEqual({ type: "refus", champs: { role: MESSAGES_COMPTE.roleInconnu } });
  });

  it("CONFLIT : le message exact du dernier administrateur dans l'encadré", () => {
    expect(actionApresReponseModification(echec("CONFLIT", "autre texte"))).toEqual({
      type: "panne",
      message: DERNIER_ADMINISTRATEUR,
    });
  });

  it("ACCES_REFUSE : « Accès refusé. » dans l'encadré, pas le message de panne", () => {
    expect(actionApresReponseModification(echec("ACCES_REFUSE", "autre texte"))).toEqual({
      type: "panne",
      message: "Accès refusé.",
    });
  });

  it.each([
    echec("ERREUR_INTERNE", "message technique", { codeSupport: "ABC123" }),
    echec("INTROUVABLE", "Introuvable"),
    echec("VALIDATION", "1 champ est à corriger", { champs: { compteId: "Le compte demandé n'est pas valide." } }),
  ])("toute autre réponse : panne avec le message de l'UX (%j)", (reponse) => {
    expect(actionApresReponseModification(reponse)).toEqual({ type: "panne", message: PANNE });
  });
});

describe("envoi", () => {
  it("nom invalide : message sous le champ, rien n'est envoyé, verrou ouvert", () => {
    const verrou = { current: false };
    expect(preparerEnvoiModification({ nom: "  ", role: "collaborateur" }, verrou)).toEqual({
      type: "refus",
      champs: { nom: "Le nom est obligatoire" },
    });
    expect(preparerEnvoiModification({ nom: "a".repeat(101), role: "collaborateur" }, verrou)).toEqual({
      type: "refus",
      champs: { nom: "Le nom ne doit pas dépasser 100 caractères" },
    });
    expect(verrou.current).toBe(false);
  });

  it("double clic : un seul envoi", async () => {
    const verrou = { current: false };
    const modifier = vi.fn(async () => succes(MODIFIE));
    const valeurs = valeursDuCompte(LUCAS);
    const cliquer = () => {
      const debut = preparerEnvoiModification(valeurs, verrou);
      if (debut.type === "envoi") {
        void envoyerModification({
          compteId: LUCAS.id,
          valeurs,
          modifier,
          agir: () => {},
          apresReussite: () => {},
          envoiVerrouille: verrou,
        });
      }
      return debut;
    };
    expect(cliquer()).toEqual({ type: "envoi" });
    expect(cliquer()).toEqual({ type: "ignore" });
    await vi.waitFor(() => expect(verrou.current).toBe(false));
    expect(modifier).toHaveBeenCalledExactlyOnceWith({ compteId: LUCAS.id, nom: LUCAS.nom, role: "collaborateur" });
  });

  it("réussite : saisie oubliée, puis fermeture et toast ; verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerModification({
      compteId: LUCAS.id,
      valeurs: { nom: "Lucas Bernard-Petit", role: "administrateur" },
      modifier: async () => succes(MODIFIE),
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "reussite" });
    expect(apresReussite).toHaveBeenCalledTimes(1);
    expect(verrou.current).toBe(false);
  });

  it("dernier administrateur : message dans la fenêtre, qui reste ouverte (pas de toast)", async () => {
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerModification({
      compteId: LUCAS.id,
      valeurs: valeursDuCompte(LUCAS),
      modifier: async () => echec("CONFLIT", DERNIER_ADMINISTRATEUR),
      agir,
      apresReussite,
      envoiVerrouille: { current: true },
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "panne", message: DERNIER_ADMINISTRATEUR });
    expect(apresReussite).not.toHaveBeenCalled();
  });

  it("réseau coupé : panne, pas de toast, verrou rouvert", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const apresReussite = vi.fn();
    await envoyerModification({
      compteId: LUCAS.id,
      valeurs: valeursDuCompte(LUCAS),
      modifier: async () => {
        throw new TypeError("Failed to fetch");
      },
      agir,
      apresReussite,
      envoiVerrouille: verrou,
    });
    expect(agir).toHaveBeenCalledExactlyOnceWith({ type: "panne", message: PANNE });
    expect(apresReussite).not.toHaveBeenCalled();
    expect(verrou.current).toBe(false);
  });

  it("redirection du serveur (session terminée) : relancée, verrou rouvert, rien d'autre", async () => {
    const verrou = { current: true };
    const agir = vi.fn();
    const redirection = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/connexion;307;" });
    await expect(
      envoyerModification({
        compteId: LUCAS.id,
        valeurs: valeursDuCompte(LUCAS),
        modifier: async () => {
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

describe("ouverture et fermeture de la fenêtre", () => {
  const dependances = () => ({ agir: vi.fn(), setOuverte: vi.fn() });

  it("ouverture : la saisie repart du nom et du rôle actuels du compte", () => {
    const deps = dependances();
    changerOuvertureModification(true, { ...LUCAS, nom: "Lucas Bernard-Petit" }, { current: false }, deps);
    expect(deps.agir).toHaveBeenCalledExactlyOnceWith({
      type: "ouverture",
      valeurs: { nom: "Lucas Bernard-Petit", role: "collaborateur" },
    });
    expect(deps.setOuverte).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("fermeture hors envoi (Échap, « Annuler ») : saisie oubliée, puis fenêtre fermée", () => {
    const deps = dependances();
    changerOuvertureModification(false, LUCAS, { current: false }, deps);
    expect(deps.agir).toHaveBeenCalledExactlyOnceWith({ type: "reinitialisation" });
    expect(deps.setOuverte).toHaveBeenCalledExactlyOnceWith(false);
    expect(deps.agir.mock.invocationCallOrder[0]).toBeLessThan(deps.setOuverte.mock.invocationCallOrder[0]);
  });

  it("fermeture pendant l'envoi : ignorée", () => {
    const deps = dependances();
    changerOuvertureModification(false, LUCAS, { current: true }, deps);
    expect(deps.agir).not.toHaveBeenCalled();
    expect(deps.setOuverte).not.toHaveBeenCalled();
  });
});
