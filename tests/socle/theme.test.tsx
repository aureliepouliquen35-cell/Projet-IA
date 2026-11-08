import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compile } from "@tailwindcss/node";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";

import Accueil from "@/app/page";

// AD-19 : le thème compilé depuis globals.css fournit toutes les classes de la
// page, sans mode sombre selon le système ni couleur par défaut de Tailwind.

const fichierCss = join(process.cwd(), "src", "app", "globals.css");

function classesDeLaPage(): string[] {
  const html = renderToStaticMarkup(<Accueil />);
  const classes = new Set<string>();
  for (const [, valeur] of html.matchAll(/class="([^"]*)"/g)) {
    for (const nom of valeur.split(/\s+/)) if (nom) classes.add(nom);
  }
  return [...classes];
}

describe("thème compilé (globals.css)", () => {
  let css = "";

  beforeAll(async () => {
    const compilateur = await compile(readFileSync(fichierCss, "utf8"), {
      base: dirname(fichierCss),
      from: fichierCss,
      onDependency: () => {},
    });
    css = compilateur.build([...classesDeLaPage(), "dark:bg-primary"]);
  });

  it.each([
    "max-w-form",
    "px-gutter-mobile",
    "text-page-title",
    "h-control",
    "bg-primary",
    "text-label",
  ])("produit une règle pour la classe %s", (classe) => {
    expect(css).toMatch(new RegExp(`\\.${classe}\\s*\\{`));
  });

  it("n'active aucun mode sombre selon le réglage du système", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("ne contient aucune couleur par défaut de Tailwind", () => {
    expect(css).not.toMatch(/--color-(red|blue|zinc|neutral|slate|gray)-\d+/);
    expect(css).not.toContain("--color-red-500");
  });
});
