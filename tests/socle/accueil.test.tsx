import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Accueil from "@/app/page";

// Story 1.1, matrice « Page d'accueil » : logo Nova, police Inter, bleu de
// DESIGN.md, boutons principal et secondaire, page en français.

const racine = process.cwd();
const lire = (chemin: string) => readFileSync(join(racine, chemin), "utf8");

describe("page d'accueil provisoire", () => {
  const html = renderToStaticMarkup(<Accueil />);

  it("affiche le logo Nova Services, nommé pour les lecteurs d'écran", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Nova Services"');
  });

  it("montre un bouton principal et un bouton secondaire, en français", () => {
    expect(html).toContain('data-variant="principal"');
    expect(html).toContain('data-variant="secondaire"');
    expect(html).toContain("Déposer une demande");
    expect(html).toContain("Espace collaborateurs");
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
