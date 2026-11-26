import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Section « Administration » du menu, écran A1 « Comptes » et écran S1
// (story 3.1 ; EXPERIENCE.md, Information Architecture, A1, S1 ; DESIGN.md,
// Menu latéral, Badges ; FR-24, RM-7). Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);
const chemin = vi.hoisted(() => ({ valeur: "/admin/comptes" as string | null }));

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));
// `connection()` n'a de sens que pendant une vraie requête Next.js.
vi.mock("next/server", () => ({ connection: () => Promise.resolve() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => chemin.valeur,
  useRouter: () => ({ refresh: () => {} }),
}));

import { ContenuComptes } from "@/app/(interne)/admin/comptes/contenu-comptes";
import PageComptes, { metadata } from "@/app/(interne)/admin/comptes/page";
import { EcranAccesRefuse } from "@/components/ecran-acces-refuse";
import { SectionAdministration } from "@/components/interne/section-administration";
import { SuiviRole } from "@/components/interne/suivi-role";
import {
  EtatComptesErreur,
  LIGNES_SQUELETTE_COMPTES,
  SqueletteComptes,
  TableauComptes,
} from "@/components/interne/tableau-comptes";
import { ADRESSE_COMPTES } from "@/shared/acces";

import { texteDe } from "../aides/formulaire-depot";
import { EMAIL_KARIM, EMAIL_SOPHIE, ID_KARIM, ID_SOPHIE, PROFIL_SOPHIE } from "../aides/supabase-connexion";

const S1 = "Accès refusé. Cette page est réservée aux administrateurs.";

beforeEach(() => {
  simulation.reinitialiser();
  simulation.profils.set(ID_SOPHIE, { ...PROFIL_SOPHIE });
  simulation.session.id = ID_SOPHIE;
  chemin.valeur = ADRESSE_COMPTES;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const rendreSection = async () => {
  const element = await SectionAdministration();
  return element ? renderToStaticMarkup(element) : "";
};

const rendreContenu = async () => renderToStaticMarkup(await ContenuComptes());

describe("section « Administration » du menu", () => {
  it("adresse de l'écran A1 : /admin/comptes", () => {
    expect(ADRESSE_COMPTES).toBe("/admin/comptes");
  });

  it("administrateur : titre « Administration », puis « Comptes » (icône Users) vers /admin/comptes", async () => {
    const html = await rendreSection();
    expect(texteDe(html)).toBe("Administration Comptes Catégories");
    expect(html).toMatch(/<a[^>]*href="\/admin\/comptes"[^>]*>.*lucide-users.*Comptes<\/span><\/a>/);
    // Le titre nomme la liste pour les lecteurs d'écran.
    const id = html.match(/<p id="([^"]+)"[^>]*>Administration<\/p>/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<ul aria-labelledby="${id}"`);
  });

  it("« Comptes » puis « Catégories » (story 4.1) ; pas encore Informations générales ni Données personnelles (story 4.3, epic 6)", async () => {
    const html = await rendreSection();
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html.indexOf('href="/admin/comptes"')).toBeLessThan(html.indexOf('href="/admin/categories"'));
    expect(texteDe(html)).not.toMatch(/Informations générales|Données personnelles/);
  });

  it("sur /admin/comptes : « Comptes » actif (aria-current=\"page\")", async () => {
    const html = await rendreSection();
    expect(html).toMatch(/<a [^>]*href="\/admin\/comptes"[^>]*aria-current="page"|<a [^>]*aria-current="page"[^>]*href="\/admin\/comptes"/);
  });

  it("ailleurs (/demandes) : « Comptes » inactif", async () => {
    chemin.valeur = "/demandes";
    expect(await rendreSection()).not.toContain("aria-current");
  });

  it("collaborateur : rien, ni titre, ni lien (seulement le suivi du rôle, qui n'affiche rien)", async () => {
    simulation.session.id = ID_KARIM;
    expect(await rendreSection()).toBe("");
  });

  it("suivi du rôle rendu pour les deux rôles, avec le rôle relu dans profils (story 3.3)", async () => {
    type Element = { type: unknown; props: { role?: string; children?: Element[] } };
    const administrateur = (await SectionAdministration()) as unknown as Element;
    const suivi = administrateur.props.children![0];
    expect(suivi.type).toBe(SuiviRole);
    expect(suivi.props.role).toBe("administrateur");
    simulation.session.id = ID_KARIM;
    const collaborateur = (await SectionAdministration()) as unknown as Element;
    expect(collaborateur.type).toBe(SuiviRole);
    expect(collaborateur.props.role).toBe("collaborateur");
  });

  it("administrateur rétrogradé : la section disparaît au rendu suivant du menu (chargement complet ou rafraîchissement)", async () => {
    expect(await rendreSection()).not.toBe("");
    simulation.profils.get(ID_SOPHIE)!.role = "collaborateur";
    expect(await rendreSection()).toBe("");
  });

  it("placée dans le menu après « Nouvelle demande », sous <Suspense fallback={null}>, après connection()", () => {
    const menu = readFileSync(join(process.cwd(), "src/components/interne/menu-lateral.tsx"), "utf8");
    expect(menu).toMatch(/<Suspense fallback=\{null\}>\s*<SectionAdministration \/>\s*<\/Suspense>\s*<\/nav>/);
    expect(menu.indexOf("ADRESSE_NOUVELLE_DEMANDE} icone")).toBeLessThan(menu.indexOf("<SectionAdministration />"));
    const section = readFileSync(join(process.cwd(), "src/components/interne/section-administration.tsx"), "utf8");
    expect(section).toMatch(
      /await connection\(\);\s*const \{ role \} = await exigerUtilisateur\(\);\s*const suivi = <SuiviRole role=\{role\} \/>;\s*if \(role !== "administrateur"\) return suivi;/,
    );
  });
});

describe("écran A1 « Comptes »", () => {
  beforeEach(() => {
    simulation.comptes.set(EMAIL_SOPHIE, { motDePasse: "x", id: ID_SOPHIE });
    simulation.profils.get(ID_KARIM)!.actif = false;
  });

  it("titre « Comptes », vrai tableau Nom · Email · Rôle · État · Actions", async () => {
    const html = await rendreContenu();
    expect(html).toMatch(/<h1[^>]*>Comptes<\/h1>/);
    expect(html).toMatch(/<table data-slot="tableau-comptes"/);
    expect(html).toMatch(/<caption class="sr-only">[^<]+<\/caption>/);
    const entetes = [...html.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(([, texte]) => texte);
    expect(entetes).toEqual(["Nom", "Email", "Rôle", "État", "Actions"]);
  });

  it("tous les comptes, désactivés compris, triés par nom ; nom en en-tête de ligne", async () => {
    const html = await rendreContenu();
    const lignes = [...html.matchAll(/<tr data-slot="ligne-compte"[^>]*>([\s\S]*?)<\/tr>/g)].map(([, ligne]) => texteDe(ligne));
    expect(lignes).toEqual([
      `Karim Benali ${EMAIL_KARIM} Collaborateur Désactivé Modifier Réinitialiser le mot de passe Réactiver`,
      `Sophie Martin ${EMAIL_SOPHIE} Administrateur Actif Modifier Réinitialiser le mot de passe Désactiver`,
    ]);
    expect(html).toMatch(/<th scope="row"[^>]*>Karim Benali<\/th>/);
  });

  it("compte désactivé : badge gris « Désactivé », toujours écrit ; actif : « Actif » en texte", async () => {
    const html = await rendreContenu();
    const badge = html.match(/<span data-slot="badge-desactive" class="([^"]*)">([^<]*)<\/span>/);
    expect(badge?.[2]).toBe("Désactivé");
    expect(badge?.[1]).toContain("bg-inactive-bg");
    expect(badge?.[1]).toContain("text-inactive-fg");
    expect(badge?.[1]).toContain("h-6");
    expect(html.match(/data-slot="badge-desactive"/g)).toHaveLength(1);
    expect(html).toMatch(/<td[^>]*>Actif<\/td>/);
  });

  it("bouton « Créer un compte » à droite du titre (story 3.2) ; Actions : « Modifier » (3.3), « Réinitialiser le mot de passe » (3.5), puis « Désactiver » ou « Réactiver » (3.4)", async () => {
    const html = await rendreContenu();
    expect(html).toMatch(/<h1[^>]*>Comptes<\/h1><button[^>]*data-slot="bouton-creer-compte"[^>]*>[\s\S]*?Créer un compte<\/button>/);
    // « Créer un compte », puis trois boutons par ligne.
    expect(html.match(/<button/g)).toHaveLength(7);
    expect(html.match(/data-slot="modifier-compte"/g)).toHaveLength(2);
    expect(html.match(/data-slot="reinitialiser-mot-de-passe"/g)).toHaveLength(2);
    expect(html.match(/data-slot="desactiver"/g)).toHaveLength(1);
    expect(html.match(/data-slot="reactiver"/g)).toHaveLength(1);
    // « Modifier » en premier sur chaque ligne.
    for (const ligne of html.split('data-slot="ligne-compte"').slice(1)) {
      expect(ligne.indexOf('data-slot="modifier-compte"')).toBeGreaterThan(0);
      expect(ligne.indexOf('data-slot="modifier-compte"')).toBeLessThan(ligne.indexOf('data-slot="reinitialiser-mot-de-passe"'));
    }
  });

  it("ni mot de passe, ni empreinte", async () => {
    simulation.temporaires.set(ID_SOPHIE, "Mot de passe temporaire 2026");
    const html = await rendreContenu();
    expect(html).not.toMatch(/Mot de passe temporaire|\$2[aby]\$/);
  });

  it("panne de lecture : « Impossible de charger les comptes. » + « Réessayer », annoncée (role=alert)", async () => {
    simulation.pannesRpc.lister_comptes = { data: null, error: { code: "57P01", message: "panne" } };
    const html = await rendreContenu();
    expect(html).toMatch(/<h1[^>]*>Comptes<\/h1>/);
    expect(html).toMatch(/data-slot="comptes-erreur" role="alert"/);
    expect(texteDe(html)).toContain("Impossible de charger les comptes.");
    expect(html).toMatch(/<button[^>]*>.*Réessayer<\/button>/);
    expect(html).not.toContain("tableau-comptes");
    // Créer un compte ne dépend pas de la lecture : le bouton reste.
    expect(html).toContain('data-slot="bouton-creer-compte"');
  });

  it("état d'erreur seul : le même message et « Réessayer »", () => {
    expect(texteDe(renderToStaticMarkup(<EtatComptesErreur />))).toBe("Impossible de charger les comptes. Réessayer");
  });

  it("tableau rendu seul : une ligne par compte", () => {
    const html = renderToStaticMarkup(
      <TableauComptes
        comptes={[{ id: ID_SOPHIE, nom: "Sophie Martin", email: EMAIL_SOPHIE, role: "administrateur", actif: true }]}
      />,
    );
    expect(html.match(/data-slot="ligne-compte"/g)).toHaveLength(1);
  });

  it("squelette du tableau, visible après 300 ms, annoncé « Chargement… »", () => {
    const html = renderToStaticMarkup(<SqueletteComptes />);
    expect(html).toMatch(/^<div data-slot="squelette" role="status" class="animate-apres-300ms /);
    expect(html).toContain('<span class="sr-only">Chargement…</span>');
    expect(html.match(/data-slot="ligne-squelette"/g)).toHaveLength(LIGNES_SQUELETTE_COMPTES);
  });

  it("page : titre de l'onglet neutre (aussi au-dessus de S1), contenu sous <Suspense> avec le squelette, coque sans titre ni donnée", () => {
    expect(metadata.title).toBe("Administration — Nova Services");
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/admin/comptes/page.tsx"), "utf8");
    expect(source).toMatch(/<Suspense fallback=\{<SqueletteComptes \/>\}>\s*<ContenuComptes \/>\s*<\/Suspense>/);
    const html = renderToStaticMarkup(<PageComptes />);
    expect(html).toContain('data-slot="squelette"');
    expect(html).not.toMatch(/<h1/);
  });

  it("contenu : attend une vraie requête (connection) puis vérifie le rôle avant toute lecture", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(interne)/admin/comptes/contenu-comptes.tsx"), "utf8");
    expect(source).toMatch(
      /await connection\(\);\s*if \(!\(await exigerAdministrateur\(\)\)\) return <EcranAccesRefuse \/>;\s*const lecture = await lireComptes\(\);/,
    );
  });
});

describe("écran S1 « Accès refusé »", () => {
  it("le message exact en titre, et « Retour aux demandes » vers /demandes", () => {
    const html = renderToStaticMarkup(<EcranAccesRefuse />);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${S1.replace(/\./g, "\\.")}</h1>`));
    expect(html).toMatch(/<a[^>]*href="\/demandes"[^>]*>.*Retour aux demandes<\/a>/);
    expect(texteDe(html)).toBe(`${S1} Retour aux demandes`);
  });

  it("pas de <main> (celui de la page), pas de logo (celui du menu)", () => {
    const html = renderToStaticMarkup(<EcranAccesRefuse />);
    expect(html).not.toMatch(/<main|aria-label="Nova Services"/);
  });

  it("collaborateur sur /admin/comptes : S1 seul, aucune donnée de compte, aucune lecture", async () => {
    simulation.session.id = ID_KARIM;
    const html = await rendreContenu();
    expect(texteDe(html)).toBe(`${S1} Retour aux demandes`);
    expect(html).not.toMatch(/Sophie|Karim|nova-services|tableau-comptes/);
    expect(simulation.rpcSession).not.toHaveBeenCalled();
  });

  it("refus de la base (rôle retiré entre la garde et la lecture) : S1", async () => {
    simulation.pannesRpc.lister_comptes = { data: null, error: { code: "NV202", message: "Accès refusé" } };
    expect(texteDe(await rendreContenu())).toBe(`${S1} Retour aux demandes`);
  });

  it("sans session : renvoi vers /connexion", async () => {
    simulation.session.id = null;
    await expect(ContenuComptes()).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;\w+;\/connexion;/),
    });
  });
});
