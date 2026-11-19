import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// La lecture des catégories ne se termine jamais ici : la page reste sur sa
// coque statique, celle que `next build` prépare d'avance.
const simulation = vi.hoisted(() => ({
  lireFormulaireDepot: vi.fn(() => new Promise<never>(() => {})),
}));

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/server/depot", () => ({
  lireFormulaireDepot: simulation.lireFormulaireDepot,
}));
vi.mock("@/server/actions/deposer-demande", () => ({
  actionDeposerDemande: vi.fn(),
}));

import PageDepot, { metadata } from "@/app/(public)/page";

// Page d'accueil `/` : depuis la story 1.3, c'est le formulaire de dépôt P1
// (elle remplace l'accueil provisoire de la story 1.1). Ici : sa coque
// statique et l'habillage global (logo Nova, police Inter, bleu de DESIGN.md,
// page en français).

const racine = process.cwd();
const lire = (chemin: string) => readFileSync(join(racine, chemin), "utf8");

describe("page d'accueil : coque du formulaire de dépôt", () => {
  const html = renderToStaticMarkup(<PageDepot />);

  it("remplace l'accueil provisoire, à la même adresse", () => {
    expect(existsSync(join(racine, "src/app/page.tsx"))).toBe(false);
    expect(existsSync(join(racine, "src/app/(public)/page.tsx"))).toBe(true);
    expect(html).not.toContain("Bienvenue sur Nova Services");
    expect(html).not.toContain("Espace collaborateurs");
  });

  it("affiche le logo Nova Services, nommé pour les lecteurs d'écran", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Nova Services"');
  });

  it("affiche le titre et le sous-titre de P1, en français", () => {
    expect(html).toMatch(/<h1[^>]*>Déposer une demande<\/h1>/);
    expect(html).toContain("Nous vous répondons par email ou par téléphone.");
    expect(metadata.title).toBe("Déposer une demande — Nova Services");
  });

  it("ne met pas le formulaire dans la coque : un squelette sans animation, visible après 300 ms", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Envoyer ma demande");
    const squelette = html.match(/<div[^>]*data-slot="squelette"[^>]*>/)?.[0] ?? "";
    expect(squelette).toContain("animate-apres-300ms");
    // Annoncé par un vrai texte, invisible à l'écran (un `aria-label` seul
    // n'est pas lu par tous les lecteurs d'écran).
    expect(squelette).toContain('role="status"');
    expect(squelette).not.toContain("aria-label");
    expect(html).toMatch(
      /<div[^>]*data-slot="squelette"[^>]*><span class="sr-only">Chargement du formulaire…<\/span>/,
    );
    expect(html).not.toMatch(/animate-(pulse|spin|bounce)/);
  });

  it("ne garde aucune trace de la démonstration Next.js", () => {
    expect(html).not.toMatch(/next\.svg|vercel|Deploy Now|To get started/i);
  });
});

describe("habillage global", () => {
  it("déclare la page en français et charge Inter", () => {
    const layout = lire("src/app/layout.tsx");
    expect(layout).toContain('lang="fr"');
    expect(layout).toMatch(/Inter\(/);
    expect(layout).toContain('title: "Nova Services"');
  });

  it("déclare le bleu de DESIGN.md et Inter dans le thème, sans mode sombre", () => {
    const css = lire("src/app/globals.css");
    expect(css).toMatch(/--color-primary:\s*#1e3a8a;/i);
    expect(css).toMatch(/--font-sans:\s*var\(--font-inter\)/);
    expect(css).not.toContain("prefers-color-scheme");
  });
});
