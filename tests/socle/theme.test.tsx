import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compile } from "@tailwindcss/node";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("@/server/depot", () => ({
  lireFormulaireDepot: () => new Promise<never>(() => {}),
}));
vi.mock("@/server/actions/deposer-demande", () => ({
  actionDeposerDemande: vi.fn(),
}));

import { ReussiteDepot } from "@/app/(public)/formulaire-depot";
import PageDepot from "@/app/(public)/page";
import { MESSAGES_DEPOT } from "@/shared/messages";

import { etatAvec, rendreVue, SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";

// AD-19 : le thème compilé depuis globals.css fournit toutes les classes de la
// page d'accueil (le formulaire de dépôt, dans tous ses états), sans mode
// sombre selon le système ni couleur par défaut de Tailwind.

const fichierCss = join(process.cwd(), "src", "app", "globals.css");

function classesDeLaPage(): string[] {
  const html = [
    // Coque de la page et squelette de chargement.
    renderToStaticMarkup(<PageDepot />),
    // Formulaire vierge, puis en erreur de saisie avec un compteur dépassé.
    rendreVue(),
    rendreVue(
      etatAvec({
        valeurs: { ...SAISIE_DE_CLAIRE, email: "", objet: "x".repeat(151), personneInformee: false },
        erreurs: {
          email: MESSAGES_DEPOT.emailObligatoire,
          categorieId: MESSAGES_DEPOT.categorieObligatoire,
          objet: MESSAGES_DEPOT.objetTropLong,
          description: MESSAGES_DEPOT.descriptionTropCourte,
          personneInformee: MESSAGES_DEPOT.caseObligatoire,
        },
        resumeVisible: true,
      }),
    ),
    // Envoi en cours, panne, réussite.
    rendreVue(etatAvec({ valeurs: SAISIE_DE_CLAIRE }), { envoiEnCours: true }),
    rendreVue(etatAvec({ erreurEnvoi: "Une erreur inattendue s'est produite." })),
    renderToStaticMarkup(<ReussiteDepot reference="NOVA-2026-0001" />),
  ].join("\n");

  const classes = new Set<string>();
  for (const [, valeur] of html.matchAll(/class="([^"]*)"/g)) {
    for (const nom of valeur.split(/\s+/)) {
      // Les guillemets simples d'une classe sont échappés dans le HTML.
      if (nom) classes.add(nom.replace(/&#x27;/g, "'").replace(/&amp;/g, "&"));
    }
  }
  return [...classes];
}

/** Écrit une classe comme elle apparaît dans un sélecteur CSS. */
const enSelecteur = (classe: string) =>
  `.${classe.replace(/[^a-zA-Z0-9_-]/g, (caractere) => `\\${caractere}`)}`;

describe("thème compilé (globals.css)", () => {
  let css = "";
  let classes: string[] = [];

  beforeAll(async () => {
    const compilateur = await compile(readFileSync(fichierCss, "utf8"), {
      base: dirname(fichierCss),
      from: fichierCss,
      onDependency: () => {},
    });
    classes = classesDeLaPage();
    css = compilateur.build([...classes, "dark:bg-primary"]);
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

  it("produit une règle pour chaque classe du formulaire de dépôt", () => {
    // Une classe sans règle serait une faute de frappe ou un token absent du
    // thème : l'élément s'afficherait sans son habillage.
    const sansRegle = classes.filter(
      (classe) =>
        // Icônes de lucide-react : classes de nom, sans règle attendue.
        !/^lucide(-|$)/.test(classe) && !css.includes(enSelecteur(classe)),
    );
    expect(sansRegle).toEqual([]);
  });

  it("habille le formulaire avec les tokens de DESIGN.md", () => {
    // Champs : 44 px de haut, bordure des champs, coins de 6 px, texte de 16 px.
    for (const classe of ["h-control", "border-border-input", "rounded-sm", "text-body"]) {
      expect(classes).toContain(classe);
    }
    // Erreur : bordure rouge de 2 px ; mention : fond violet très clair ;
    // case de 22 px ; squelette différé de 300 ms.
    expect(css).toMatch(/\.aria-invalid\\:border-danger\b/);
    expect(css).toMatch(/\.bg-accent-nova-soft\s*\{/);
    expect(css).toMatch(/\.size-5\\\.5\s*\{/);
    expect(css).toMatch(/\.animate-apres-300ms\s*\{[^}]*animation:/);
    expect(css).toMatch(/@keyframes apparition/);
  });

  it("n'active aucun mode sombre selon le réglage du système", () => {
    expect(css).not.toContain("prefers-color-scheme");
  });

  it("ne contient aucune couleur par défaut de Tailwind", () => {
    expect(css).not.toMatch(/--color-(red|blue|zinc|neutral|slate|gray)-\d+/);
    expect(css).not.toContain("--color-red-500");
  });
});
