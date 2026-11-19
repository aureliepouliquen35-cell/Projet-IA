import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cookie de passage entre deux pages (AD-20, `src/server/passage`) : chiffré
// et signé, lié à son nom, valable 30 minutes. Cookies de Next.js simulés.

const simulation = vi.hoisted(() => {
  const recus = new Map<string, string>();
  const poses = new Map<string, [string, Record<string, unknown>]>();
  const cookies = vi.fn(async () => ({
    get: (nom: string) => (recus.has(nom) ? { name: nom, value: recus.get(nom)! } : undefined),
    set: (nom: string, valeur: string, options: Record<string, unknown>) => {
      poses.set(nom, [valeur, options]);
    },
  }));
  return { recus, poses, cookies };
});

vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import {
  chiffrerPassage,
  COOKIE_CONFIRMATION,
  dechiffrerPassage,
  DUREE_PASSAGE_SECONDES,
  lireConfirmation,
  poserConfirmation,
  verifierSecretPassage,
} from "@/server/passage";

import { LIGNE_DEPOSEE } from "../aides/formulaire-depot";

const SECRET_ESSAI = "secret-d-essai-des-cookies-de-passage-0123456789";
const MAINTENANT = Date.UTC(2026, 10, 19, 9, 12);
const MINUTE = 60 * 1000;

beforeEach(() => {
  vi.stubEnv("SECRET_COOKIES", SECRET_ESSAI);
  simulation.recus.clear();
  simulation.poses.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/**
 * Change un caractère de la valeur, comme un navigateur trafiqué. (Pas le
 * dernier : en base64url, ses derniers bits peuvent ne rien coder.)
 */
function modifier(valeur: string, position: number): string {
  const caractere = valeur[position] === "A" ? "B" : "A";
  return valeur.slice(0, position) + caractere + valeur.slice(position + 1);
}

describe("chiffrement du passage", () => {
  it("aller-retour : le contenu revient intact", () => {
    const valeur = chiffrerPassage("nova_essai", { a: 1, b: "é" }, MAINTENANT);
    expect(dechiffrerPassage("nova_essai", valeur, MAINTENANT)).toEqual({ a: 1, b: "é" });
  });

  it("illisible : le contenu n'apparaît pas dans la valeur, et deux chiffrements diffèrent", () => {
    const premier = chiffrerPassage("nova_essai", LIGNE_DEPOSEE, MAINTENANT);
    const second = chiffrerPassage("nova_essai", LIGNE_DEPOSEE, MAINTENANT);
    expect(premier).not.toBe(second);
    const decode = Buffer.from(premier, "base64url").toString("latin1");
    for (const texte of [premier, decode]) {
      expect(texte).not.toMatch(/NOVA|claire|facturation/i);
    }
  });

  it("modifié (n'importe quel caractère) : refusé", () => {
    const valeur = chiffrerPassage("nova_essai", LIGNE_DEPOSEE, MAINTENANT);
    for (const position of [0, 10, 20, 30, valeur.length - 3]) {
      expect(dechiffrerPassage("nova_essai", modifier(valeur, position), MAINTENANT)).toBeNull();
    }
    expect(dechiffrerPassage("nova_essai", valeur.slice(0, -4), MAINTENANT)).toBeNull();
  });

  it("valeurs absentes ou sans rapport : refusées", () => {
    for (const valeur of [undefined, "", "abc", "x".repeat(200), "%%%"]) {
      expect(dechiffrerPassage("nova_essai", valeur, MAINTENANT)).toBeNull();
    }
  });

  it("expiré : valable 30 minutes, refusé au-delà, même si le navigateur l'a gardé", () => {
    expect(DUREE_PASSAGE_SECONDES).toBe(1800);
    const valeur = chiffrerPassage("nova_essai", LIGNE_DEPOSEE, MAINTENANT);
    expect(dechiffrerPassage("nova_essai", valeur, MAINTENANT + 29 * MINUTE)).toEqual(LIGNE_DEPOSEE);
    expect(dechiffrerPassage("nova_essai", valeur, MAINTENANT + 30 * MINUTE)).toBeNull();
    expect(dechiffrerPassage("nova_essai", valeur, MAINTENANT + 24 * 60 * MINUTE)).toBeNull();
  });

  it("chiffré pour un autre nom de cookie : refusé", () => {
    const valeur = chiffrerPassage("nova_message", LIGNE_DEPOSEE, MAINTENANT);
    expect(dechiffrerPassage("nova_message", valeur, MAINTENANT)).toEqual(LIGNE_DEPOSEE);
    expect(dechiffrerPassage(COOKIE_CONFIRMATION, valeur, MAINTENANT)).toBeNull();
  });

  it("chiffré avec un autre secret : refusé", () => {
    const valeur = chiffrerPassage("nova_essai", LIGNE_DEPOSEE, MAINTENANT);
    vi.stubEnv("SECRET_COOKIES", `${SECRET_ESSAI}-autre`);
    expect(dechiffrerPassage("nova_essai", valeur, MAINTENANT)).toBeNull();
  });

  it("secret absent ou trop court (moins de 32 caractères) : erreur, rien n'est écrit ni lu", () => {
    for (const secret of [undefined, "", "x".repeat(31)]) {
      if (secret === undefined) vi.stubEnv("SECRET_COOKIES", undefined);
      else vi.stubEnv("SECRET_COOKIES", secret);
      expect(() => verifierSecretPassage()).toThrow(/SECRET_COOKIES/);
      expect(() => chiffrerPassage("nova_essai", {}, MAINTENANT)).toThrow(/SECRET_COOKIES/);
      expect(() => dechiffrerPassage("nova_essai", "abc", MAINTENANT)).toThrow(/SECRET_COOKIES/);
    }
    vi.stubEnv("SECRET_COOKIES", "x".repeat(32));
    expect(() => verifierSecretPassage()).not.toThrow();
  });

  it("le message d'erreur ne contient pas le secret", () => {
    vi.stubEnv("SECRET_COOKIES", "secret-court");
    expect(() => verifierSecretPassage()).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("secret-court") }),
    );
  });
});

describe("cookie de confirmation (P2)", () => {
  it("aller-retour : ce qui est posé à l'envoi est relu par la page", async () => {
    await poserConfirmation(LIGNE_DEPOSEE);
    const [valeur, options] = simulation.poses.get(COOKIE_CONFIRMATION) ?? [];
    expect(options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/confirmation",
      maxAge: 1800,
    });

    simulation.recus.set(COOKIE_CONFIRMATION, valeur!);
    await expect(lireConfirmation()).resolves.toEqual(LIGNE_DEPOSEE);
  });

  it("relu autant de fois qu'on veut pendant 30 minutes (actualisation de la page)", async () => {
    vi.useFakeTimers({ now: MAINTENANT, toFake: ["Date"] });
    await poserConfirmation(LIGNE_DEPOSEE);
    simulation.recus.set(COOKIE_CONFIRMATION, simulation.poses.get(COOKIE_CONFIRMATION)![0]);

    await expect(lireConfirmation()).resolves.toEqual(LIGNE_DEPOSEE);
    vi.setSystemTime(MAINTENANT + 29 * MINUTE);
    await expect(lireConfirmation()).resolves.toEqual(LIGNE_DEPOSEE);
    vi.setSystemTime(MAINTENANT + 31 * MINUTE);
    await expect(lireConfirmation()).resolves.toBeNull();
  });

  it("sans cookie : rien", async () => {
    await expect(lireConfirmation()).resolves.toBeNull();
  });

  it("cookie modifié : rien", async () => {
    await poserConfirmation(LIGNE_DEPOSEE);
    const [valeur] = simulation.poses.get(COOKIE_CONFIRMATION)!;
    simulation.recus.set(COOKIE_CONFIRMATION, modifier(valeur, 25));
    await expect(lireConfirmation()).resolves.toBeNull();
  });

  it("cookie d'un autre type (même nom, autre contenu) : rien", async () => {
    for (const contenu of [
      { type: "message", reference: "NOVA-2026-0001", objet: "o", email: "e@x.fr" },
      { type: "confirmation", reference: "0001", objet: "o", email: "e@x.fr" },
      { type: "confirmation", reference: "NOVA-2026-0001", objet: "", email: "e@x.fr" },
      { type: "confirmation", reference: "NOVA-2026-0001" },
      "NOVA-2026-0001",
      null,
    ]) {
      simulation.recus.set(COOKIE_CONFIRMATION, chiffrerPassage(COOKIE_CONFIRMATION, contenu));
      await expect(lireConfirmation()).resolves.toBeNull();
    }
  });

  it("cookie d'un autre nom recopié sous le nom de la confirmation : rien", async () => {
    simulation.recus.set(
      COOKIE_CONFIRMATION,
      chiffrerPassage("nova_message", { type: "confirmation", ...LIGNE_DEPOSEE }),
    );
    await expect(lireConfirmation()).resolves.toBeNull();
  });

  it("ne renvoie que la référence, l'objet et l'email", async () => {
    simulation.recus.set(
      COOKIE_CONFIRMATION,
      chiffrerPassage(COOKIE_CONFIRMATION, { type: "confirmation", ...LIGNE_DEPOSEE, nom: "Claire Martin" }),
    );
    await expect(lireConfirmation()).resolves.toEqual(LIGNE_DEPOSEE);
  });
});
