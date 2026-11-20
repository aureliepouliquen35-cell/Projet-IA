import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ADRESSE_ACCUEIL_INTERNE, ADRESSE_CONNEXION, estPageInterne, PREFIXES_INTERNES } from "@/shared/acces";
import { MESSAGES_CONNEXION } from "@/shared/messages";
import { erreurDuChampConnexion, validerConnexion } from "@/shared/schemas/connexion";

// Schéma de la connexion I1 (AD-11) et adresses de l'espace interne (AD-7).

describe("schéma de connexion", () => {
  it("email nettoyé et mis en minuscules, mot de passe intact (espaces comprises)", () => {
    expect(validerConnexion({ email: "  Karim@Nova.FR ", motDePasse: "  avec espaces  " })).toEqual({
      ok: true,
      donnees: { email: "karim@nova.fr", motDePasse: "  avec espaces  " },
    });
  });

  it("email obligatoire et bien formé", () => {
    expect(validerConnexion({ email: "   ", motDePasse: "x" })).toEqual({
      ok: false,
      champs: { email: "L'email est obligatoire" },
    });
    for (const email of ["karim", "karim@", "karim@nova", "ka rim@nova.fr"]) {
      expect(validerConnexion({ email, motDePasse: "x" })).toEqual({
        ok: false,
        champs: { email: "L'email doit avoir la forme nom@exemple.fr" },
      });
    }
  });

  it("email de plus de 100 caractères refusé (aucun compte ne peut l'avoir)", () => {
    const email = `${"a".repeat(95)}@nova.fr`;
    expect(validerConnexion({ email, motDePasse: "x" })).toEqual({
      ok: false,
      champs: { email: "L'email ne doit pas dépasser 100 caractères" },
    });
  });

  it("mot de passe obligatoire, sans autre règle (la longueur n'est vérifiée qu'à sa création)", () => {
    expect(validerConnexion({ email: "karim@nova.fr", motDePasse: "" })).toEqual({
      ok: false,
      champs: { motDePasse: "Le mot de passe est obligatoire" },
    });
    expect(validerConnexion({ email: "karim@nova.fr", motDePasse: "court" }).ok).toBe(true);
  });

  it("tout ce qui n'est pas un objet est lu comme un formulaire vierge", () => {
    for (const saisie of [null, undefined, "texte", 3, ["a"]]) {
      expect(validerConnexion(saisie)).toEqual({
        ok: false,
        champs: { email: "L'email est obligatoire", motDePasse: "Le mot de passe est obligatoire" },
      });
    }
  });

  it("erreurDuChampConnexion donne le message d'un seul champ", () => {
    const valeurs = { email: "karim", motDePasse: "" };
    expect(erreurDuChampConnexion("email", valeurs)).toBe("L'email doit avoir la forme nom@exemple.fr");
    expect(erreurDuChampConnexion("motDePasse", valeurs)).toBe("Le mot de passe est obligatoire");
    expect(erreurDuChampConnexion("email", { email: "karim@nova.fr", motDePasse: "" })).toBeUndefined();
  });
});

describe("textes d'I1 (EXPERIENCE.md)", () => {
  it("repris mot pour mot", () => {
    expect(MESSAGES_CONNEXION).toMatchObject({
      titre: "Espace interne Nova Services",
      seConnecter: "Se connecter",
      connexionEnCours: "Connexion…",
      afficher: "Afficher",
      motDePasseOublie: "Mot de passe oublié ? Contactez votre administrateur.",
      identifiantsIncorrects: "Identifiants incorrects",
      tropDeTentatives: "Trop de tentatives, réessayez plus tard",
    });
  });
});

describe("adresses de l'espace interne", () => {
  it("connexion et accueil", () => {
    expect(ADRESSE_CONNEXION).toBe("/connexion");
    expect(ADRESSE_ACCUEIL_INTERNE).toBe("/demandes");
    expect(PREFIXES_INTERNES).toEqual(["/demandes", "/admin"]);
  });

  it.each([
    "/demandes",
    "/demandes/",
    "/demandes/NOVA-2026-0001",
    "/admin",
    "/admin/comptes",
    "/Demandes",
    "/%64emandes",
  ])("%s est une page interne", (chemin) => {
    expect(estPageInterne(chemin)).toBe(true);
  });

  it("chaque dossier de src/app/(interne) est couvert par PREFIXES_INTERNES", () => {
    const dossiers = readdirSync(join(process.cwd(), "src", "app", "(interne)"), { withFileTypes: true })
      .filter((entree) => entree.isDirectory())
      .map((entree) => entree.name);
    expect(dossiers.length).toBeGreaterThan(0);
    for (const dossier of dossiers) {
      expect(estPageInterne(`/${dossier}`), dossier).toBe(true);
    }
  });

  it.each(["/", "/confirmation", "/connexion", "/inscription", "/demandesxyz", "/administration", "/essais", "/%E0"])(
    "%s n'est pas une page interne",
    (chemin) => {
      expect(estPageInterne(chemin)).toBe(false);
    },
  );
});
