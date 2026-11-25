import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-10 : un compte n'est jamais supprimé, seulement désactivé ; un compte
// désactivé ne peut pas se connecter (FR-8, FR-22, AD-6, AD-7).
// - avec ses bons identifiants, il reçoit « Identifiants incorrects », comme
//   un email inconnu, et sa session est refermée aussitôt ;
// - une session encore ouverte ne donne accès à rien : la garde relit
//   `actif` dans `profils` à chaque requête ;
// - désactivé par un administrateur (story 3.4) : profil inactif et compte
//   bloqué dans Supabase Auth ; à sa prochaine action, la session est fermée
//   et la connexion affiche « Votre session a pris fin… » ; son nom reste
//   dans l'historique des demandes ; il peut être réactivé.
// Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

import { ContenuDemande } from "@/app/(interne)/demandes/[reference]/contenu-demande";
import { ContenuDemandes } from "@/app/(interne)/demandes/contenu-demandes";
import { actionChangerEtatCompte } from "@/server/actions/changer-etat-compte";
import { actionChangerStatut } from "@/server/actions/changer-statut";
import { actionSeConnecter } from "@/server/actions/se-connecter";
import { exigerUtilisateur, lireUtilisateur } from "@/server/garde";
import { COOKIE_MESSAGE_CONNEXION, dechiffrerPassage } from "@/server/passage";

import { texteDe } from "../aides/formulaire-depot";
import {
  EMAIL_KARIM,
  fabriquerDemandes,
  ID_KARIM,
  ID_SOPHIE,
  MOT_DE_PASSE_KARIM,
  PROFIL_SOPHIE,
} from "../aides/supabase-connexion";

/** `/demandes` ouverte sans paramètre dans l'adresse. */
const SANS_PARAMETRES = { searchParams: Promise.resolve({}) };

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.get(ID_KARIM)!.actif = false;
});

describe("RM-10 : un compte désactivé ne peut pas se connecter", () => {
  it("bons identifiants : « Identifiants incorrects », même réponse qu'un email inconnu", async () => {
    const desactive = await actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    const inconnu = await actionSeConnecter({ email: "personne@exemple.fr", motDePasse: "x" });
    expect(desactive).toEqual({ ok: false, code: "VALIDATION", message: "Identifiants incorrects" });
    expect(desactive).toEqual(inconnu);
  });

  it("aucune session ne reste ouverte", async () => {
    await actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM });
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
  });

  it("une session encore ouverte ne donne accès à aucune page interne", async () => {
    simulation.session.id = ID_KARIM;
    await expect(lireUtilisateur()).resolves.toBeNull();
    await expect(exigerUtilisateur()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });

  it.each([
    ["compte inactif, session encore ouverte", () => {
      simulation.session.id = ID_KARIM;
    }],
    ["sans session", () => {}],
  ])("/demandes (%s) : rien n'est affiché, renvoi vers /connexion", async (_, preparer) => {
    preparer();
    await expect(ContenuDemandes(SANS_PARAMETRES)).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });

  it("/demandes avec un compte actif : le contenu s'affiche", async () => {
    simulation.profils.get(ID_KARIM)!.actif = true;
    simulation.session.id = ID_KARIM;
    await expect(ContenuDemandes(SANS_PARAMETRES)).resolves.toBeTruthy();
  });

  it("réactivé, le même compte se connecte de nouveau", async () => {
    simulation.profils.get(ID_KARIM)!.actif = true;
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/demandes;/) });
  });
});

describe("RM-10 : désactivé par un administrateur (story 3.4)", () => {
  /** Message posé pour la connexion, déchiffré (ou `null`). */
  const messageConnexion = () => {
    const cookie = simulation.cookiesPoses.get(COOKIE_MESSAGE_CONNEXION);
    return cookie ? dechiffrerPassage(COOKIE_MESSAGE_CONNEXION, cookie.valeur) : null;
  };

  /** Sophie, administratrice, désactive Karim ; puis la session de Karim reprend la main. */
  async function desactiverKarim() {
    simulation.session.id = ID_SOPHIE;
    await expect(actionChangerEtatCompte({ compteId: ID_KARIM, actif: false })).resolves.toMatchObject({ ok: true });
    simulation.cookiesPoses.clear();
  }

  beforeEach(() => {
    simulation.profils.get(ID_KARIM)!.actif = true;
    simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("le compte n'est pas supprimé : profil inactif, bloqué dans Supabase Auth", async () => {
    await desactiverKarim();
    expect(simulation.profils.get(ID_KARIM)).toMatchObject({ id: ID_KARIM, nom: "Karim Benali", actif: false });
    expect(simulation.bannis.has(ID_KARIM)).toBe(true);
    expect(simulation.journal().map((l) => l.evenement)).toContain("compte_desactive");
  });

  it("connexion avec ses bons identifiants : « Identifiants incorrects »", async () => {
    await desactiverKarim();
    simulation.session.id = null;
    await expect(actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM })).resolves.toEqual({
      ok: false,
      code: "VALIDATION",
      message: "Identifiants incorrects",
    });
    expect(simulation.session.id).toBeNull();
  });

  it("session encore ouverte, prochaine action : session fermée, connexion avec « Votre session a pris fin… »", async () => {
    simulation.demandes.push({ ...fabriquerDemandes(1)[0], statut: "nouvelle" });
    await desactiverKarim();
    simulation.session.id = ID_KARIM;
    await expect(
      actionChangerStatut({ reference: "NOVA-2026-0001", statutVu: "nouvelle", nouveauStatut: "en_cours" }),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/) });
    expect(simulation.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(simulation.session.id).toBeNull();
    expect(messageConnexion()).toEqual({ type: "message_connexion", message: "session_terminee" });
    // Rien n'a été écrit.
    expect(simulation.demandes[0].statut).toBe("nouvelle");
  });

  it("session encore ouverte, page interne : renvoi vers la connexion, même fin de session", async () => {
    await desactiverKarim();
    simulation.session.id = ID_KARIM;
    await expect(exigerUtilisateur()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
    expect(simulation.session.id).toBeNull();
    expect(messageConnexion()).toMatchObject({ message: "session_terminee" });
  });

  it("une personne sans session ou sans profil ne reçoit pas ce message", async () => {
    simulation.session.id = null;
    await expect(exigerUtilisateur()).rejects.toMatchObject({ digest: expect.stringMatching(/\/connexion;/) });
    expect(messageConnexion()).toBeNull();
    expect(simulation.signOut).not.toHaveBeenCalled();
  });

  it("son nom reste dans l'historique des demandes qu'il a traitées (AC 3)", async () => {
    const [demande] = fabriquerDemandes(1);
    simulation.demandes.push({
      ...demande,
      statut: "en_cours",
      evenements: [
        { type: "creation", auteur: "demandeur", date: demande.date_depot },
        {
          type: "statut",
          auteur: null,
          auteur_nom: "Karim Benali",
          ancien_statut: "nouvelle",
          nouveau_statut: "en_cours",
          date: "2026-11-08T09:00:00+00:00",
        },
      ],
    });
    await desactiverKarim();
    simulation.session.id = ID_SOPHIE;
    const html = renderToStaticMarkup(
      await ContenuDemande({ params: Promise.resolve({ reference: demande.reference }), searchParams: Promise.resolve({}) }),
    );
    expect(texteDe(html)).toContain("Karim Benali");

    // La vraie fonction lit le nom dans profils sans regarder `actif`, et la
    // story 3.4 ne la change pas.
    const dossier = join(process.cwd(), "supabase", "migrations");
    const statut = readFileSync(join(dossier, "20261121200000_changer_statut.sql"), "utf8");
    const lecture = statut.slice(statut.indexOf("create or replace function public.lire_demande"));
    const corps = lecture.slice(0, lecture.indexOf("$$;", lecture.indexOf("as $$") + 5));
    expect(corps).toContain("left join public.profils p on p.id = e.auteur_id");
    expect(corps).not.toMatch(/actif/);
    expect(readFileSync(join(dossier, "20261125090000_desactiver_compte.sql"), "utf8")).not.toMatch(
      /function public\.lire_demande/,
    );
  });

  it("réactivé : débloqué dans Auth, il se connecte de nouveau", async () => {
    await desactiverKarim();
    await expect(actionChangerEtatCompte({ compteId: ID_KARIM, actif: true })).resolves.toMatchObject({ ok: true });
    expect(simulation.bannis.has(ID_KARIM)).toBe(false);
    simulation.session.id = null;
    await expect(
      actionSeConnecter({ email: EMAIL_KARIM, motDePasse: MOT_DE_PASSE_KARIM }),
    ).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/demandes;/) });
  });
});
