import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prerender } from "react-dom/static";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Message « session expirée » de la connexion I1 (FR-9, AD-20 : cookie de
// `src/server/passage`, jamais dans l'adresse) et toast « Mot de passe
// enregistré » (Sonner, habillé avec les tokens de DESIGN.md).

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
vi.mock("@/server/actions/se-connecter", () => ({ actionSeConnecter: vi.fn() }));

import { EncadreSessionExpiree, EncadreSessionTerminee, MessageConnexion } from "@/app/connexion/message-connexion";
import PageConnexion from "@/app/connexion/page";
import { DUREE_TOAST_MS, Toaster } from "@/components/ui/sonner";
import {
  chiffrerPassage,
  COOKIE_MESSAGE_CONNEXION,
  lireMessageConnexion,
  oublierMessageConnexion,
  poserSessionTerminee,
  valeurSessionExpiree,
  valeurSessionTerminee,
} from "@/server/passage";

import { texteDe } from "../aides/formulaire-depot";
import { SECRET_COOKIES_ESSAI } from "../aides/supabase-connexion";

const lire = (chemin: string) => readFileSync(join(process.cwd(), chemin), "utf8");

async function rendreEnEntier(element: React.ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

beforeEach(() => {
  vi.stubEnv("SECRET_COOKIES", SECRET_COOKIES_ESSAI);
  simulation.recus.clear();
  simulation.poses.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("cookie « session expirée » (AD-20)", () => {
  it("aller-retour : lu par la connexion", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionExpiree());
    await expect(lireMessageConnexion()).resolves.toBe("session_expiree");
  });

  it("absent : rien, même sans secret", async () => {
    vi.stubEnv("SECRET_COOKIES", "");
    await expect(lireMessageConnexion()).resolves.toBeNull();
  });

  it("modifié, d'un autre cookie ou d'un autre type : rien", async () => {
    const valeur = valeurSessionExpiree();
    for (const fausse of [
      valeur.slice(0, 10) + (valeur[10] === "A" ? "B" : "A") + valeur.slice(11),
      chiffrerPassage("nova_confirmation", { type: "message_connexion", message: "session_expiree" }),
      chiffrerPassage(COOKIE_MESSAGE_CONNEXION, { type: "message_connexion", message: "autre" }),
    ]) {
      simulation.recus.set(COOKIE_MESSAGE_CONNEXION, fausse);
      await expect(lireMessageConnexion()).resolves.toBeNull();
    }
  });

  it("plus de 30 minutes : rien", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionExpiree(Date.now() - 31 * 60 * 1000));
    await expect(lireMessageConnexion()).resolves.toBeNull();
  });

  it("chiffré : le message n'est pas lisible dans le cookie", () => {
    expect(Buffer.from(valeurSessionExpiree(), "base64url").toString("latin1")).not.toContain("session");
  });

  it("oublié après la connexion : effacé sous /connexion", async () => {
    await oublierMessageConnexion();
    expect(simulation.poses.get(COOKIE_MESSAGE_CONNEXION)).toEqual([
      "",
      expect.objectContaining({ path: "/connexion", maxAge: 0, httpOnly: true }),
    ]);
  });
});

describe("encadré de la connexion I1", () => {
  it("message présent : encadré d'information, icône « i », texte de l'UX", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionExpiree());
    const html = renderToStaticMarkup((await MessageConnexion())!);
    expect(html).toBe(renderToStaticMarkup(<EncadreSessionExpiree />));
    expect(html).toContain('data-variant="information"');
    expect(html).toContain('role="status"');
    expect(html).toContain("lucide-info");
    expect(texteDe(html)).toBe("Votre session a expiré. Reconnectez-vous pour continuer.");
  });

  it("sans message : rien", async () => {
    await expect(MessageConnexion()).resolves.toBeNull();
  });

  it("la page I1 l'affiche au-dessus du formulaire", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionExpiree());
    const page = await rendreEnEntier(<PageConnexion />);
    const encadre = page.indexOf('data-slot="session-expiree"');
    expect(encadre).toBeGreaterThan(0);
    expect(encadre).toBeLessThan(page.indexOf("<form"));
  });

  it("la page I1 sans message : aucun encadré", async () => {
    const page = await rendreEnEntier(<PageConnexion />);
    expect(page).not.toContain('data-slot="session-expiree"');
    expect(page).not.toContain('data-slot="session-terminee"');
    expect(page).toContain("<form");
  });
});

describe("message « session terminée » (compte désactivé pendant la session, FR-22, story 3.4)", () => {
  it("aller-retour : lu par la connexion", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionTerminee());
    await expect(lireMessageConnexion()).resolves.toBe("session_terminee");
  });

  it("posé par une Server Function : sous /connexion, 30 minutes, httpOnly, chiffré", async () => {
    await poserSessionTerminee();
    const [valeur, options] = simulation.poses.get(COOKIE_MESSAGE_CONNEXION)!;
    expect(options).toMatchObject({ path: "/connexion", maxAge: 30 * 60, httpOnly: true, sameSite: "lax" });
    expect(Buffer.from(valeur, "base64url").toString("latin1")).not.toContain("session");
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeur);
    await expect(lireMessageConnexion()).resolves.toBe("session_terminee");
  });

  it("encadré neutre d'information, même style, texte exact de l'UX (sans dire pourquoi)", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionTerminee());
    const html = renderToStaticMarkup((await MessageConnexion())!);
    expect(html).toBe(renderToStaticMarkup(<EncadreSessionTerminee />));
    expect(html).toContain('data-slot="session-terminee"');
    expect(html).toContain('data-variant="information"');
    expect(html).toContain('role="status"');
    expect(html).toContain("lucide-info");
    expect(texteDe(html)).toBe("Votre session a pris fin. Contactez votre administrateur si besoin.");
    expect(texteDe(html)).not.toMatch(/désactiv/i);
  });

  it("la page I1 l'affiche au-dessus du formulaire, sans l'encadré « session expirée »", async () => {
    simulation.recus.set(COOKIE_MESSAGE_CONNEXION, valeurSessionTerminee());
    const page = await rendreEnEntier(<PageConnexion />);
    const encadre = page.indexOf('data-slot="session-terminee"');
    expect(encadre).toBeGreaterThan(0);
    expect(encadre).toBeLessThan(page.indexOf("<form"));
    expect(page).not.toContain('data-slot="session-expiree"');
  });
});

describe("toast (Sonner)", () => {
  it("dans le layout racine, une seule fois", () => {
    const layout = lire("src/app/layout.tsx");
    expect(layout).toContain('import { Toaster } from "@/components/ui/sonner";');
    expect(layout.match(/<Toaster \/>/g)).toHaveLength(1);
  });

  it("en bas à droite, 5 s, annoncé (zone de notifications)", () => {
    expect(DUREE_TOAST_MS).toBe(5000);
    const html = renderToStaticMarkup(<Toaster />);
    expect(html).toMatch(/<section[^>]*aria-label="Notifications/);
    expect(html).toContain('aria-live="polite"');
    const source = lire("src/components/ui/sonner.tsx");
    expect(source).toContain('position="bottom-right"');
    expect(source).toContain("duration={DUREE_TOAST_MS}");
  });

  it("habillé avec les tokens de DESIGN.md : fond foncé, texte blanc, pastille verte, ombre du toast", () => {
    const source = lire("src/components/ui/sonner.tsx");
    expect(source).toMatch(/bg-text\b/);
    expect(source).toMatch(/text-background\b/);
    expect(source).toMatch(/rounded-\[12px\]/);
    expect(source).toMatch(/shadow-toast\b/);
    expect(source).toMatch(/bg-success\b/);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("I2 affiche « Mot de passe enregistré » puis passe à « Demandes » sans rechargement", () => {
    const source = lire("src/app/connexion/nouveau-mot-de-passe/formulaire-mot-de-passe.tsx");
    expect(source).toContain("toast.success(MESSAGES_MOT_DE_PASSE.enregistre);");
    expect(source).toContain("router.replace(ADRESSE_ACCUEIL_INTERNE);");
    expect(source.indexOf("toast.success(")).toBeLessThan(source.indexOf("router.replace("));
  });
});
