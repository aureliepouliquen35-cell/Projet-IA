import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// P2 — Confirmation (EXPERIENCE.md), à `/confirmation` : matrice de la
// story 1.4 (envoi correct, actualisation, accès direct, téléphone absent).
// Le cookie de passage et les contacts de Nova sont simulés.

const simulation = vi.hoisted(() => {
  /** Ce que le cookie de confirmation contient (`null` : pas de cookie valable). */
  const etat: { confirmation: unknown; contacts: unknown } = { confirmation: null, contacts: null };
  class Redirection extends Error {
    constructor(public adresse: string) {
      super(`NEXT_REDIRECT ${adresse}`);
    }
  }
  return {
    etat,
    Redirection,
    lireConfirmation: vi.fn(async () => etat.confirmation),
    lireContactsNova: vi.fn(async () => etat.contacts),
    redirect: vi.fn((adresse: string) => {
      throw new Redirection(adresse);
    }),
  };
});

vi.mock("@/server/passage", () => ({ lireConfirmation: simulation.lireConfirmation }));
vi.mock("@/server/depot", () => ({ lireContactsNova: simulation.lireContactsNova }));
vi.mock("next/navigation", () => ({ redirect: simulation.redirect }));

import PageConfirmation, * as modulePage from "@/app/(public)/confirmation/page";

import { CONTACTS_NOVA, LIGNE_DEPOSEE, texteDe } from "../aides/formulaire-depot";

/** Rend la page comme Next.js : attend le composant serveur, puis son HTML. */
async function rendre(): Promise<string> {
  return renderToStaticMarkup(await PageConfirmation());
}

const phrase = (html: string) => texteDe(html).replace(/ \./g, ".");
const bloc = (html: string, slot: string) =>
  html.match(new RegExp(`<[a-z]+[^>]*data-slot="${slot}"[^>]*>[\\s\\S]*?</(?:p|dd|section)>`))?.[0] ?? "";

beforeEach(() => {
  simulation.etat.confirmation = { ...LIGNE_DEPOSEE };
  simulation.etat.contacts = { ...CONTACTS_NOVA };
});

afterEach(() => vi.clearAllMocks());

describe("envoi correct : l'écran P2", () => {
  it("titre exact de FR-4 (sans point final), avec l'icône de validation verte", async () => {
    const html = await rendre();
    expect(html).toMatch(/<h1[^>]*>Votre demande a bien été enregistrée<\/h1>/);
    expect(html).toMatch(/<span class="[^"]*bg-success-soft[^"]*text-success[^"]*"><svg[^>]*lucide-circle-check[^>]*aria-hidden="true"/);
    expect(modulePage.metadata.title).toBe("Demande enregistrée — Nova Services");
  });

  it("« Votre référence », puis la référence en grand, en chasse fixe, sur une seule ligne", async () => {
    const html = await rendre();
    const encadre = html.match(/<section[^>]*data-slot="encadre-reference"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(phrase(encadre)).toBe(
      "Votre référence NOVA-2026-0001 Notez-la : elle vous sera demandée si nous vous rappelons.",
    );
    expect(encadre).toMatch(
      /<p data-slot="reference" class="[^"]*font-mono[^"]*text-reference-confirmation[^"]*whitespace-nowrap[^"]*">NOVA-2026-0001<\/p>/,
    );
    // Encadré du moment clé : bord gauche violet et dégradé (DESIGN.md).
    expect(encadre).toMatch(/class="[^"]*border-l-accent-nova[^"]*bg-linear-to-b[^"]*from-background[^"]*to-accent-nova-soft/);
    expect(encadre).toContain('aria-labelledby="reference-etiquette"');
  });

  it("rappelle l'objet et l'email saisi : « Nous vous répondrons à … »", async () => {
    const html = await rendre();
    expect(texteDe(html)).toContain("Objet Accès impossible à l'outil de facturation");
    expect(phrase(bloc(html, "reponse-a"))).toBe("Nous vous répondrons à claire.martin@cabinet-martin.fr");
  });

  it("bloc contact : « Une question urgente ? {téléphone} — {email de contact} », en liens", async () => {
    const contact = bloc(await rendre(), "contact");
    expect(phrase(contact)).toBe("Une question urgente ? 01 99 00 00 00 — contact@nova-services.example");
    expect(contact).toContain('href="tel:0199000000"');
    expect(contact).toContain('href="mailto:contact@nova-services.example"');
  });

  it("lien discret « Déposer une autre demande » vers le formulaire, et aucun bouton principal", async () => {
    const html = await rendre();
    const lien = html.match(/<a[^>]*href="\/"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(texteDe(lien)).toBe("Déposer une autre demande");
    expect(lien).toContain("text-primary");
    expect(lien).not.toMatch(/\bbg-primary(?!-)/);
    expect(html).not.toContain('data-variant="principal"');
  });

  it("affiche le logo, et ne montre rien d'autre de la demande (ni nom, ni description)", async () => {
    const html = await rendre();
    expect(html).toContain('aria-label="Nova Services"');
    expect(html).not.toMatch(/Claire Martin|session refusée|Cabinet Martin/);
  });

  it("n'utilise que des icônes lucide-react ignorées par les lecteurs d'écran, et aucune couleur en dur", async () => {
    const html = await rendre();
    for (const icone of html.match(/<svg[^>]*>/g) ?? []) {
      expect(icone).toContain('aria-hidden="true"');
    }
    expect(html).not.toMatch(/#[0-9a-f]{6}\b|rgba?\(/i);
  });

  it("à 360 px : une colonne avec marges de 16 px, textes longs coupés plutôt que de déborder", async () => {
    simulation.etat.confirmation = {
      ...LIGNE_DEPOSEE,
      objet: "o".repeat(150),
      email: `${"a".repeat(80)}@exemple.fr`,
    };
    const html = await rendre();
    expect(html).toMatch(/<main class="[^"]*max-w-form[^"]*px-gutter-mobile/);
    expect(html).toMatch(/<dd data-slot="objet" class="[^"]*wrap-anywhere/);
    expect(bloc(html, "reponse-a")).toContain("wrap-anywhere");
  });
});

describe("actualisation", () => {
  it("même cookie, même écran, même référence ; rien n'est créé (la page n'écrit rien)", async () => {
    const premiere = await rendre();
    const seconde = await rendre();
    expect(seconde).toBe(premiere);
    expect(simulation.lireConfirmation).toHaveBeenCalledTimes(2);
  });

  it("la page n'appelle aucune action ni fonction d'écriture", () => {
    const sources = ["page.tsx", "vue-confirmation.tsx"].map((fichier) =>
      readFileSync(join(process.cwd(), "src", "app", "(public)", "confirmation", fichier), "utf8"),
    );
    for (const source of sources) {
      expect(source).not.toMatch(/server\/actions|deposerDemande|\.rpc\(|cookies\(\)\.set|"use client"/);
    }
  });

  it("relit les contacts de Nova à chaque affichage (FR-31)", async () => {
    await rendre();
    simulation.etat.contacts = { telephone: "01 99 00 00 01", emailContact: "accueil@nova-services.example" };
    const html = await rendre();
    expect(simulation.lireContactsNova).toHaveBeenCalledTimes(2);
    expect(phrase(bloc(html, "contact"))).toBe("Une question urgente ? 01 99 00 00 01 — accueil@nova-services.example");
  });
});

describe("accès direct", () => {
  it("sans cookie valable (absent, expiré, modifié, d'un autre type) : renvoi vers le formulaire", async () => {
    // `lireConfirmation` renvoie `null` dans tous ces cas (tests de src/server/passage).
    simulation.etat.confirmation = null;
    await expect(rendre()).rejects.toMatchObject({ adresse: "/" });
    expect(simulation.redirect).toHaveBeenCalledWith("/");
  });

  it("ne lit rien d'autre et n'affiche rien d'une demande", async () => {
    simulation.etat.confirmation = null;
    await expect(PageConfirmation()).rejects.toBeInstanceOf(simulation.Redirection);
    expect(simulation.lireContactsNova).not.toHaveBeenCalled();
  });

  it("l'adresse ne contient rien de la demande : P2 est toujours /confirmation", () => {
    const formulaire = readFileSync(join(process.cwd(), "src", "app", "(public)", "formulaire-depot.tsx"), "utf8");
    expect(formulaire).toMatch(/export const ADRESSE_CONFIRMATION = "\/confirmation";/);
    expect(formulaire).toMatch(/naviguer\(ADRESSE_CONFIRMATION\)/);
    expect(formulaire).not.toMatch(/\/confirmation\?|\/confirmation\/\$\{|searchParams/);
  });

  it("la page attend le cookie avant d'afficher quoi que ce soit (aucune coque sous Suspense)", () => {
    expect(modulePage.instant).toBe(false);
  });

  it("base injoignable pour les contacts : l'erreur remonte (écran S3)", async () => {
    simulation.lireContactsNova.mockRejectedValueOnce(new Error("Lecture des contacts impossible (code inconnu)."));
    await expect(rendre()).rejects.toThrow(/contacts/);
  });
});

describe("téléphone absent", () => {
  it("le bloc contact ne montre que l'email de contact", async () => {
    simulation.etat.contacts = { telephone: null, emailContact: "contact@nova-services.example" };
    const contact = bloc(await rendre(), "contact");
    expect(phrase(contact)).toBe("Une question urgente ? contact@nova-services.example");
    expect(contact).not.toContain("tel:");
    expect(contact).not.toContain("—");
  });
});
