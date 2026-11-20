import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cookie de dernière activité (AD-7, NFR-11 : expiration après 8 h
// d'inactivité). Heure signée (HMAC-SHA-256) : valide, trop ancienne, dans
// le futur, falsifiée, absente.

import {
  activiteValide,
  COOKIE_ACTIVITE,
  DUREE_INACTIVITE_MS,
  dureeInactiviteMs,
  optionsActivite,
  poserActivite,
  valeurActivite,
} from "@/server/garde/activite";

import { SECRET_COOKIES_ESSAI } from "../aides/supabase-connexion";

const MAINTENANT = Date.UTC(2026, 10, 20, 9, 0);
const MINUTE = 60 * 1000;
const HUIT_HEURES = 8 * 60 * MINUTE;

beforeEach(() => {
  vi.stubEnv("SECRET_COOKIES", SECRET_COOKIES_ESSAI);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("durée d'inactivité", () => {
  it("8 h", () => {
    expect(DUREE_INACTIVITE_MS).toBe(HUIT_HEURES);
    vi.stubEnv("NODE_ENV", "production");
    expect(dureeInactiviteMs()).toBe(HUIT_HEURES);
  });

  it("DUREE_INACTIVITE_MINUTES n'est jamais lue en production ni en test", () => {
    vi.stubEnv("DUREE_INACTIVITE_MINUTES", "2");
    vi.stubEnv("NODE_ENV", "production");
    expect(dureeInactiviteMs()).toBe(HUIT_HEURES);
    vi.stubEnv("NODE_ENV", "test");
    expect(dureeInactiviteMs()).toBe(HUIT_HEURES);
  });

  it("en développement, DUREE_INACTIVITE_MINUTES la raccourcit", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DUREE_INACTIVITE_MINUTES", "2");
    expect(dureeInactiviteMs()).toBe(2 * MINUTE);
    const valeur = valeurActivite(MAINTENANT);
    expect(activiteValide(valeur, MAINTENANT + 2 * MINUTE)).toBe(true);
    expect(activiteValide(valeur, MAINTENANT + 2 * MINUTE + 1)).toBe(false);
    expect(optionsActivite().maxAge).toBe(120);
  });

  it.each(["", "0", "-5", "1.5", "deux"])("en développement, « %s » est ignorée", (valeur) => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DUREE_INACTIVITE_MINUTES", valeur);
    expect(dureeInactiviteMs()).toBe(HUIT_HEURES);
  });
});

describe("activiteValide", () => {
  const valeur = () => valeurActivite(MAINTENANT);

  it("activité récente : valide", () => {
    expect(activiteValide(valeur(), MAINTENANT)).toBe(true);
    expect(activiteValide(valeur(), MAINTENANT + 7 * 60 * MINUTE)).toBe(true);
    expect(activiteValide(valeur(), MAINTENANT + HUIT_HEURES)).toBe(true);
  });

  it("plus de 8 h : expirée", () => {
    expect(activiteValide(valeur(), MAINTENANT + HUIT_HEURES + 1)).toBe(false);
    expect(activiteValide(valeur(), MAINTENANT + 3 * 24 * 60 * MINUTE)).toBe(false);
  });

  it("heure dans le futur : refusée (au-delà d'une minute d'écart d'horloge)", () => {
    expect(activiteValide(valeur(), MAINTENANT - 30 * 1000)).toBe(true);
    expect(activiteValide(valeur(), MAINTENANT - 2 * MINUTE)).toBe(false);
    expect(activiteValide(valeurActivite(MAINTENANT + 60 * MINUTE), MAINTENANT)).toBe(false);
  });

  it("absente ou vide : expirée", () => {
    expect(activiteValide(undefined, MAINTENANT)).toBe(false);
    expect(activiteValide("", MAINTENANT)).toBe(false);
  });

  it("heure modifiée (repoussée) : signature fausse", () => {
    const [version, , signature] = valeur().split(".");
    const plusTard = MAINTENANT + HUIT_HEURES;
    expect(activiteValide(`${version}.${plusTard}.${signature}`, plusTard)).toBe(false);
  });

  it.each([
    ["signature modifiée", (v: string) => v.slice(0, 20) + (v[20] === "A" ? "B" : "A") + v.slice(21)],
    ["signature absente", (v: string) => v.split(".").slice(0, 2).join(".")],
    ["autre version", (v: string) => v.replace(/^v1\./, "v2.")],
    ["heure illisible", (v: string) => v.replace(/\.\d+\./, ".abc.")],
    ["n'importe quoi", () => "bonjour"],
  ])("%s : refusée", (_, modifier) => {
    expect(activiteValide(modifier(valeur()), MAINTENANT)).toBe(false);
  });

  it("signée avec un autre secret : refusée", () => {
    const signee = valeur();
    vi.stubEnv("SECRET_COOKIES", "un-autre-secret-des-cookies-de-passage-9876543210");
    expect(activiteValide(signee, MAINTENANT)).toBe(false);
  });

  it("secret absent ou trop court : erreur de configuration", () => {
    const signee = valeur();
    vi.stubEnv("SECRET_COOKIES", "court");
    expect(() => activiteValide(signee, MAINTENANT)).toThrow(/SECRET_COOKIES/);
    expect(() => valeurActivite(MAINTENANT)).toThrow(/SECRET_COOKIES/);
  });

  it("ne contient que l'heure : rien de personnel", () => {
    expect(valeur()).toMatch(new RegExp(`^v1\\.${MAINTENANT}\\.[A-Za-z0-9_-]+$`));
  });
});

describe("poserActivite", () => {
  it("cookie nova_activite : httpOnly, lax, path /, maxAge de 8 h, secure hors développement", () => {
    vi.stubEnv("NODE_ENV", "production");
    const poses: [string, string, unknown][] = [];
    poserActivite({ set: (nom, valeur, options) => poses.push([nom, valeur, options]) }, MAINTENANT);
    expect(poses).toEqual([
      [
        COOKIE_ACTIVITE,
        valeurActivite(MAINTENANT),
        { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 8 * 60 * 60 },
      ],
    ]);
    expect(COOKIE_ACTIVITE).toBe("nova_activite");
  });

  it("en développement : pas secure", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(optionsActivite().secure).toBe(false);
  });
});
