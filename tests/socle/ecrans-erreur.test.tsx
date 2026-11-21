import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/demandes/essai" }));
vi.mock("next/font/google", () => ({ Inter: () => ({ variable: "police-inter", className: "" }) }));

import ErreurInattendue from "@/app/error";
import ErreurGlobale from "@/app/global-error";
import PageIntrouvable from "@/app/not-found";
import { EcranErreurInattendue } from "@/components/ecran-erreur";

// UX-DR19 : écrans S2 et S3 d'EXPERIENCE.md, textes exacts, sans détail
// technique.

const date = new Date("2026-11-08T08:14:00Z");

describe("S2 — page introuvable", () => {
  const html = renderToStaticMarkup(<PageIntrouvable />);

  it("affiche le message d'EXPERIENCE.md et « Déposer une demande » en bouton principal", () => {
    expect(html).toContain("Cette page n&#x27;existe pas ou a été supprimée.");
    const lien = html.match(/<a [^>]*>(?:(?!<\/a>).)*Déposer une demande<\/a>/)?.[0] ?? "";
    expect(lien).toContain('href="/"');
    expect(lien).toContain('data-variant="principal"');
    expect(html).toContain('aria-label="Nova Services"');
  });

  it("n'a pas de pastille d'icône (décision d'Aurel, 21 nov. 2026)", () => {
    expect(html).not.toContain("bg-accent-nova-soft");
    expect(html).not.toContain("file-question");
  });

  it("n'a pas de lien « Retour aux demandes » (story 1.8)", () => {
    expect(html).not.toContain("Retour aux demandes");
  });
});

describe("S3 — erreur inattendue", () => {
  const html = renderToStaticMarkup(
    <EcranErreurInattendue code="7F3A" date={date} page="/essais/erreur" onReessayer={() => {}} />,
  );

  it("affiche le message, « Réessayer » en bouton principal et « Déposer une demande »", () => {
    expect(html).toContain("Une erreur inattendue s&#x27;est produite.");
    expect(html).toMatch(/<button[^>]*data-variant="principal"[^>]*>.*Réessayer<\/button>/);
    expect(html).toMatch(/<a[^>]*data-variant="secondaire"[^>]*>.*Déposer une demande<\/a>/);
    expect(html.match(/data-variant="principal"/g)).toHaveLength(1);
  });

  it("affiche la ligne à recopier pour le support : code, heure de Paris, page", () => {
    expect(html).toContain("Code : 7F3A · 8 nov. 2026, 9 h 14 · /essais/erreur");
  });

  it("s'affiche sans code pour une erreur du navigateur", () => {
    const sansCode = renderToStaticMarkup(
      <EcranErreurInattendue date={date} page="/" onReessayer={() => {}} />,
    );
    expect(sansCode).toContain("8 nov. 2026, 9 h 14 · /");
    expect(sansCode).not.toContain("Code :");
  });
});

describe("écrans d'erreur de Next.js (error.tsx, global-error.tsx)", () => {
  // Même empreinte que dans instrumentation.test.ts : même code que le journal.
  const erreur = () => Object.assign(new Error(), { digest: "1234567890" });

  it("error.tsx affiche S3 avec le code de l'empreinte et la page courante", () => {
    const html = renderToStaticMarkup(<ErreurInattendue error={erreur()} retry={() => {}} />);
    expect(html).toContain("Une erreur inattendue s&#x27;est produite.");
    expect(html).toMatch(/Code : KF12OI · [^<]* · \/demandes\/essai/);
  });

  it("global-error.tsx fournit son propre document en français et affiche le même S3", () => {
    const html = renderToStaticMarkup(<ErreurGlobale error={erreur()} retry={() => {}} />);
    expect(html).toMatch(/<html lang="fr"/);
    expect(html).toContain("<body");
    expect(html).toMatch(/Code : KF12OI · [^<]* · \/demandes\/essai/);
  });
});
