import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// RM-6 : tout utilisateur interne voit toutes les demandes (FR-11), qu'elles
// lui soient attribuées ou non, quel que soit son rôle. Aucune lecture ne
// filtre selon la personne connectée : ni la fonction SQL (texte de la
// migration), ni le serveur (paramètres envoyés). Supabase est simulé.

const simulation = await vi.hoisted(async () =>
  (await import("../aides/supabase-connexion")).creerSimulationConnexion(),
);

vi.mock("@/server/supabase-secret", () => ({ creerClientSecret: simulation.creerClientSecret }));
vi.mock("@/lib/supabase/server", () => ({ createClient: simulation.createClient }));
vi.mock("next/headers", () => ({ cookies: simulation.cookies }));

import { compterATraiter, lireListeDemandes } from "@/server/lectures/demandes";

import { fabriquerDemandes, ID_KARIM } from "../aides/supabase-connexion";

const DOSSIER = join(process.cwd(), "supabase", "migrations");
/** Texte des migrations, sans les commentaires, en minuscules, de la plus ancienne à la plus récente. */
const MIGRATIONS = readdirSync(DOSSIER)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(DOSSIER, f), "utf8").replace(/--.*$/gm, "").toLowerCase());

/** Corps de la version en vigueur d'une fonction : celle de la dernière migration qui la crée. */
function corps(nom: string): string {
  const motif = new RegExp(`create function public\\.${nom}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`);
  const sql = MIGRATIONS.findLast((texte) => motif.test(texte)) ?? "";
  return sql.match(motif)?.[1] ?? "";
}

beforeEach(() => {
  simulation.reinitialiser();
  simulation.session.id = ID_KARIM;
});

describe("RM-6 : tout utilisateur interne voit toutes les demandes", () => {
  it.each(["lister_demandes", "compter_a_traiter"])(
    "%s ne filtre selon personne : la session sert seulement à vérifier l'appelant",
    (nom) => {
      const texte = corps(nom);
      expect(texte).not.toContain("auth.uid()");
      expect(texte).not.toMatch(/attribu|profil/);
      expect(texte).toContain("perform public.exiger_utilisateur_interne();");
    },
  );

  it("la version en vigueur de lister_demandes est celle du filtre « À traiter » (story 2.2), avec les filtres (2.1) et la recherche (1.9)", () => {
    expect(corps("lister_demandes")).toContain("v_q := public.normaliser_recherche(v_q);");
    expect(corps("lister_demandes")).toContain("v_statut := case when p_statut in");
    expect(corps("lister_demandes")).toContain("v_a_traiter boolean := coalesce(p_a_traiter, false);");
  });

  it("lister_categories ne filtre selon personne", () => {
    const texte = corps("lister_categories");
    expect(texte).toContain("perform public.exiger_utilisateur_interne();");
    expect(texte).not.toContain("auth.uid()");
    expect(texte).not.toMatch(/attribu|profil/);
  });

  it("la liste compte les demandes de la table, sans autre condition que les filtres et la recherche", () => {
    const condition =
      corps("lister_demandes").match(/select count\(\*\)::integer\s+into v_total\s+from public\.demandes d\s+where ([\s\S]*?);/)?.[1] ?? "";
    // Filtres de la story 2.1, « À traiter » (story 2.2), puis la recherche de la story 1.9.
    const [statut, categorie, canal, aTraiter, recherche = ""] = condition.split(/\s+and\s+/).map((partie) => partie.trim());
    expect([statut, categorie, canal, aTraiter]).toEqual([
      "(v_statut is null or d.statut = v_statut)",
      "(v_categorie is null or d.categorie_id = v_categorie)",
      "(v_canal is null or d.canal = v_canal)",
      "(not v_a_traiter or d.a_traiter)",
    ]);
    const lignes = recherche.replace(/^\(|\)$/g, "").split(/\s+or\s+/).map((ligne) => ligne.trim());
    expect(lignes[0]).toBe("v_q = ''");
    for (const ligne of lignes.slice(1)) {
      expect(ligne).toMatch(/^strpos\(public\.normaliser_recherche\(d\.(reference|nom|email|entreprise|objet)\), v_q\) > 0$/);
    }
    expect(lignes).toHaveLength(6);
  });

  it("le serveur n'envoie que la page, la taille, le texte cherché et les filtres, aucun identifiant de personne", async () => {
    await lireListeDemandes(1);
    await compterATraiter();
    expect(simulation.rpcSession.mock.calls).toEqual([
      ["lister_demandes", { p_page: 1, p_taille: 25 }],
      ["compter_a_traiter"],
    ]);
    await lireListeDemandes(1, "helene");
    expect(simulation.rpcSession).toHaveBeenLastCalledWith("lister_demandes", { p_page: 1, p_taille: 25, p_q: "helene" });
    await lireListeDemandes(1, "", { statut: "nouvelle", canal: "email" });
    expect(simulation.rpcSession).toHaveBeenLastCalledWith("lister_demandes", {
      p_page: 1,
      p_taille: 25,
      p_statut: "nouvelle",
      p_canal: "email",
    });
  });

  it.each(["collaborateur", "administrateur"])("un %s voit les 42 demandes", async (role) => {
    simulation.profils.get(ID_KARIM)!.role = role;
    simulation.demandes.push(...fabriquerDemandes(42, 5));
    const liste = await lireListeDemandes(1);
    expect(liste.ok && liste.donnees.total).toBe(42);
    await expect(compterATraiter()).resolves.toEqual({ ok: true, donnees: 5 });
  });
});
