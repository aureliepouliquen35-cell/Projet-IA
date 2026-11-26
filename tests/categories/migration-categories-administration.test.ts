import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LONGUEUR_MAXIMALE_CATEGORIE } from "@/shared/constantes";

// Migration « catégories de l'écran A2 » (story 4.1 ; FR-26, RM-7, AD-7,
// AD-9, AD-10, AD-16). Ces tests lisent le texte SQL ; son effet réel se
// vérifie sur la base dev (`npx supabase migration list --remote`, ajout et
// renommage à l'écran avec le compte administrateur ; refus d'un appel
// direct par le collaborateur dans `tests/e2e/administration.spec.ts`).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const NOM = "20261126150000_categories_administration.sql";
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_categories_administration.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules, fins de ligne Unix. */
const SQL = BRUT.replace(/\r\n/g, "\n").replace(/--.*$/gm, "").toLowerCase();

/** Paramètres, en-tête et corps d'une fonction de la migration. */
function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([^)]*)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.trim(), entete: entete.replace(/\s+/g, " ").trim(), corps };
}

const LISTER = fonction("lister_categories_administration");
const AJOUTER = fonction("ajouter_categorie");
const MODIFIER = fonction("modifier_categorie");

const SIGNATURES = [
  "public.lister_categories_administration()",
  "public.ajouter_categorie(text)",
  "public.modifier_categorie(uuid, text)",
];

/** Écritures d'un corps de fonction : « insert into categories »… */
const ecritures = (corps: string) =>
  [...corps.matchAll(/(insert into|update|delete from) public\.(\w+)/g)].map((m) => `${m[1]} ${m[2]}`);

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, après celle de la story 4.4 ; les anciennes ne parlent pas de ces fonctions", () => {
    expect(FICHIERS).toEqual([NOM]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf(NOM)).toBeGreaterThan(toutes.indexOf("20261126120000_supprimer_demande.sql"));
    for (const fichier of toutes.filter((f) => f < NOM)) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8"), fichier).not.toMatch(
        /lister_categories_administration|ajouter_categorie|modifier_categorie|categories_nom_longueur_check/,
      );
    }
  });

  it("trois fonctions ; `lister_categories` (filtre de I3) n'est pas touchée ; ni table, ni index, ni règle", () => {
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "lister_categories_administration",
      "ajouter_categorie",
      "modifier_categorie",
    ]);
    expect(SQL).not.toMatch(/function public\.lister_categories\(/);
    expect(SQL).not.toMatch(/create table|create (unique )?index|create policy|create trigger|truncate |drop /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
  });

  it("aucune écriture au journal (pas d'événement de journal pour les catégories)", () => {
    expect(SQL).not.toContain("journal");
  });
});

describe("longueur du nom (FR-26)", () => {
  it("une seule modification de table : la contrainte des 50 caractères, comptés comme l'écran", () => {
    expect(LONGUEUR_MAXIMALE_CATEGORIE).toBe(50);
    expect(SQL.match(/alter table/g)).toHaveLength(1);
    expect(SQL).toMatch(
      /alter table public\.categories\s+add constraint categories_nom_longueur_check\s+check \(char_length\(nom\) <= 50\);/,
    );
  });

  it("les cinq catégories de départ respectent la limite", () => {
    const depot = readFileSync(join(DOSSIER, "20261119180000_depot_demande.sql"), "utf8");
    const noms = [...depot.matchAll(/insert into public\.categories \(nom\) values \('((?:[^']|'')+)'\);/g)].map(
      ([, nom]) => nom.replace(/''/g, "'"),
    );
    expect(noms).toHaveLength(5);
    for (const nom of noms) expect(Array.from(nom).length).toBeLessThanOrEqual(LONGUEUR_MAXIMALE_CATEGORIE);
  });

  it("le nom unique parmi les actives, sans tenir compte des majuscules, est l'index existant (story 1.3)", () => {
    const depot = readFileSync(join(DOSSIER, "20261119180000_depot_demande.sql"), "utf8").toLowerCase();
    expect(depot).toMatch(
      /create unique index categories_nom_actif_unique\s+on public\.categories \(lower\(nom\)\)\s+where active;/,
    );
  });
});

describe("les trois fonctions (RM-7, AD-9)", () => {
  it.each([
    ["lister_categories_administration", LISTER],
    ["ajouter_categorie", AJOUTER],
    ["modifier_categorie", MODIFIER],
  ])("%s : security definer, chemin de recherche vide ; vérifie d'abord l'appelant (NV202)", (_, f) => {
    expect(f.entete).toMatch(/^returns jsonb language plpgsql (stable )?security definer set search_path = ''$/);
    expect(f.corps).toMatch(/\bbegin\s+perform public\.exiger_administrateur\(\);/);
    expect(f.corps).not.toMatch(/exiger_utilisateur_interne|jwt|user_metadata|app_metadata/);
  });

  it("exécutables par authenticated seul (la session de l'administrateur, jamais la clé secrète)", () => {
    for (const signature of SIGNATURES) {
      for (const role of ["public", "anon", "service_role"]) {
        expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
      }
    }
    expect(SQL.match(/grant execute on function [^;]+ to (\w+)/g)).toEqual(
      SIGNATURES.map((signature) => `grant execute on function ${signature} to authenticated`),
    );
  });
});

describe("lister_categories_administration (écran A2)", () => {
  it("sans paramètre, en lecture seule ; ne lit que categories et demandes, sans rien écrire", () => {
    expect(LISTER.parametres).toBe("");
    expect(LISTER.entete).toContain("stable");
    expect([...LISTER.corps.matchAll(/from public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual([
      "categories",
      "demandes",
    ]);
    expect(ecritures(LISTER.corps)).toEqual([]);
  });

  it("renvoie id, nom, active et le nombre de demandes de chaque catégorie, dans l'ordre d'affichage", () => {
    expect(LISTER.corps).toMatch(/'id', c\.id,\s*'nom', c\.nom,\s*'active', c\.active,\s*'nombre_demandes', \(/);
    expect(LISTER.corps).toMatch(/select count\(\*\)\s+from public\.demandes d\s+where d\.categorie_id = c\.id/);
    expect(LISTER.corps).toMatch(/order by c\.ordre\s*\)/);
    expect(LISTER.corps).toContain("'[]'::jsonb");
  });
});

describe("ajouter_categorie (FR-26)", () => {
  it("par le nom, aux espaces de bord retirés ; pas en lecture seule", () => {
    expect(AJOUTER.parametres).toBe("p_nom text");
    expect(AJOUTER.entete).not.toMatch(/stable|immutable/);
    expect(AJOUTER.corps).toContain("v_nom text := btrim(p_nom);");
  });

  it("une seule écriture : l'insertion du nom (active par défaut, en dernière position par l'identité ordre)", () => {
    expect(ecritures(AJOUTER.corps)).toEqual(["insert into categories"]);
    expect(AJOUTER.corps).toMatch(/insert into public\.categories \(nom\)\s+values \(v_nom\)\s+returning id into v_id;/);
  });

  it("nom déjà pris parmi les actives (index categories_nom_actif_unique) : NV501, même en cas d'appels simultanés", () => {
    expect(AJOUTER.corps).toMatch(
      /when unique_violation then\s+get stacked diagnostics v_contrainte = constraint_name;\s+if v_contrainte = 'categories_nom_actif_unique' then\s+raise exception '[^']+'\s+using errcode = 'nv501';\s+end if;\s+raise;/,
    );
  });

  it("renvoie { id, nom }", () => {
    expect(AJOUTER.corps).toContain("return jsonb_build_object('id', v_id, 'nom', v_nom);");
  });
});

describe("modifier_categorie (FR-26)", () => {
  it("par la catégorie et le nouveau nom, aux espaces de bord retirés ; pas en lecture seule", () => {
    expect(MODIFIER.parametres).toBe("p_categorie uuid, p_nom text");
    expect(MODIFIER.entete).not.toMatch(/stable|immutable/);
    expect(MODIFIER.corps).toContain("v_nom text := btrim(p_nom);");
  });

  it("verrouille la catégorie ; introuvable : NV502, avant toute écriture", () => {
    const verrou = MODIFIER.corps.search(/from public\.categories c\s+where c\.id = p_categorie\s+for update;/);
    const introuvable = MODIFIER.corps.search(/if not found then\s+raise exception '[^']+'\s+using errcode = 'nv502';/);
    const ecriture = MODIFIER.corps.indexOf("update public.categories");
    expect(verrou).toBeGreaterThan(MODIFIER.corps.indexOf("perform public.exiger_administrateur()"));
    expect(introuvable).toBeGreaterThan(verrou);
    expect(ecriture).toBeGreaterThan(introuvable);
  });

  it("même nom : rien n'est écrit, change faux", () => {
    const inchange = MODIFIER.corps.indexOf("if v_nom = v_ancien_nom then");
    expect(inchange).toBeGreaterThan(-1);
    expect(inchange).toBeLessThan(MODIFIER.corps.indexOf("update public.categories"));
    expect(MODIFIER.corps).toContain(
      "return jsonb_build_object('id', p_categorie, 'nom', v_ancien_nom, 'change', false);",
    );
  });

  it("une seule écriture : le nom ; nom déjà pris : NV501 ; renvoie { id, nom, change }", () => {
    expect(ecritures(MODIFIER.corps)).toEqual(["update categories"]);
    expect(MODIFIER.corps).toMatch(/update public\.categories\s+set nom = v_nom\s+where id = p_categorie;/);
    expect(MODIFIER.corps).toMatch(
      /if v_contrainte = 'categories_nom_actif_unique' then\s+raise exception '[^']+'\s+using errcode = 'nv501';/,
    );
    expect(MODIFIER.corps).toContain("return jsonb_build_object('id', p_categorie, 'nom', v_nom, 'change', true);");
  });
});

describe("codes de refus", () => {
  it("NV501 et NV502 sont nouveaux : aucune migration plus ancienne ne les utilise", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f < NOM)) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8").toLowerCase(), fichier).not.toMatch(/'nv50[12]'/);
    }
    expect([...new Set(SQL.match(/errcode = '(\w+)'/g))].sort()).toEqual([
      "errcode = '22004'",
      "errcode = 'nv501'",
      "errcode = 'nv502'",
    ]);
  });
});
