import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MESSAGES_CATEGORIES } from "@/shared/messages";

// Migration « désactiver, réactiver ou supprimer une catégorie » (story
// 4.2 ; FR-26, RM-7, RM-11, AD-7, AD-9, AD-10, AD-16). Ces tests lisent le
// texte SQL ; son effet réel se vérifie sur la base dev (`npx supabase
// migration list --remote`, puis l'écran A2 avec le compte administrateur).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const NOM = "20261127090000_desactiver_supprimer_categorie.sql";
const BRUT = readFileSync(join(DOSSIER, NOM), "utf8");
/** Sans les commentaires, en minuscules, fins de ligne Unix. */
const SQL = BRUT.replace(/\r\n/g, "\n").replace(/--.*$/gm, "").toLowerCase();

/** Texte sur une seule ligne, espaces réduits. */
const aplati = (texte: string) => texte.replace(/\s+/g, " ").trim();

const [, PARAMETRES = "", ENTETE = "", CORPS = ""] =
  SQL.match(/create function public\.modifier_categorie\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];
const TEXTE = aplati(CORPS);

const [, ENTETE_LIRE = "", CORPS_LIRE = ""] =
  SQL.match(/create or replace function public\.lire_demande\(p_reference text\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];

const ANCIENNE = "public.modifier_categorie(uuid, text)";
const SIGNATURE = "public.modifier_categorie(uuid, text, boolean, boolean)";

/** Corps de `lire_demande` dans la migration de la story 1.11. */
function corpsLireDemande1_11(): string {
  const texte = readFileSync(join(DOSSIER, "20261121200000_changer_statut.sql"), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/--.*$/gm, "")
    .toLowerCase();
  return texte.match(/create or replace function public\.lire_demande\(p_reference text\)\s*returns[\s\S]*?as \$\$([\s\S]*?)\$\$;/)?.[1] ?? "";
}

/** Écritures du corps : « update categories »… */
const ecritures = (corps: string) =>
  [...corps.matchAll(/(insert into|update|delete from) public\.(\w+)/g)].map((m) => `${m[1]} ${m[2]}`);

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, après celle de la story 4.1, qui est intacte", () => {
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes).toContain(NOM);
    expect(toutes.indexOf(NOM)).toBeGreaterThan(toutes.indexOf("20261126150000_categories_administration.sql"));
    const ancienne = readFileSync(join(DOSSIER, "20261126150000_categories_administration.sql"), "utf8");
    expect(ancienne).toContain("create function public.modifier_categorie(p_categorie uuid, p_nom text)");
    expect(ancienne).not.toMatch(/p_active|p_supprimer|NV503|NV504/);
  });

  it("supprime l'ancienne signature, puis crée la nouvelle ; remplace lire_demande ; ni table, ni index, ni règle", () => {
    expect(SQL).toContain(`drop function ${ANCIENNE};`);
    expect(SQL.indexOf(`drop function ${ANCIENNE};`)).toBeLessThan(SQL.indexOf("create function public.modifier_categorie("));
    expect(SQL.match(/drop /g)).toHaveLength(1);
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "modifier_categorie",
      "lire_demande",
    ]);
    expect(SQL).not.toMatch(/create table|alter table|create (unique )?index|create policy|create trigger|truncate /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    // Le formulaire public, la saisie I5 et le filtre de I3 ne changent pas.
    expect(SQL).not.toMatch(/lister_categories|lire_formulaire_saisie|deposer_demande|saisir_demande/);
  });

  it("aucune écriture au journal (pas d'événement de journal pour les catégories)", () => {
    expect(SQL).not.toContain("journal");
  });
});

describe("modifier_categorie : droits (RM-7, AD-9)", () => {
  it("security definer, chemin de recherche vide, pas en lecture seule ; vérifie d'abord l'appelant (NV202)", () => {
    expect(aplati(ENTETE)).toBe("returns jsonb language plpgsql security definer set search_path = ''");
    expect(CORPS).toMatch(/\bbegin\s+perform public\.exiger_administrateur\(\);/);
    expect(CORPS).not.toMatch(/exiger_utilisateur_interne|jwt|user_metadata|app_metadata/);
  });

  it("exécutable par authenticated seul (la session de l'administrateur, jamais la clé secrète)", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE} from ${role};`);
    }
    expect(SQL.match(/grant execute on function [^;]+ to (\w+)/g)).toEqual([
      `grant execute on function ${SIGNATURE} to authenticated`,
      "grant execute on function public.lire_demande(text) to authenticated",
    ]);
  });
});

describe("modifier_categorie : paramètres et opérations (FR-26)", () => {
  it("la catégorie, puis trois opérations facultatives : nom, état, suppression", () => {
    expect(aplati(PARAMETRES)).toBe(
      "p_categorie uuid, p_nom text default null, p_active boolean default null, p_supprimer boolean default false",
    );
  });

  it("une seule opération par appel, sinon 22004", () => {
    expect(TEXTE).toContain(
      "if p_categorie is null or (p_nom is not null)::integer + (p_active is not null)::integer + v_supprimer::integer <> 1 then",
    );
    expect(TEXTE).toContain("v_supprimer boolean := coalesce(p_supprimer, false);");
  });

  it("écritures : le nom, l'état, la suppression, toutes dans categories", () => {
    expect(ecritures(CORPS)).toEqual(["update categories", "update categories", "delete from categories"]);
    expect(TEXTE).toContain("update public.categories set nom = v_nom where id = p_categorie;");
    expect(TEXTE).toContain("update public.categories set active = p_active where id = p_categorie;");
    expect(TEXTE).toContain("delete from public.categories where id = p_categorie;");
  });

  it("renvoie { id, nom, active, change, supprimee } ; rien d'écrit si rien ne change", () => {
    const retours = [...TEXTE.matchAll(/return jsonb_build_object\(([^;]*)\);/g)].map(([, champs]) => champs.trim());
    expect(retours).toEqual([
      "'id', p_categorie, 'nom', v_ancien_nom, 'active', v_active, 'change', false, 'supprimee', false",
      "'id', p_categorie, 'nom', v_nom, 'active', v_active, 'change', true, 'supprimee', false",
      "'id', p_categorie, 'nom', v_ancien_nom, 'active', v_active, 'change', false, 'supprimee', false",
      "'id', p_categorie, 'nom', v_ancien_nom, 'active', p_active, 'change', true, 'supprimee', false",
      "'id', p_categorie, 'nom', v_ancien_nom, 'active', v_active, 'change', true, 'supprimee', true",
    ]);
    // Déjà dans l'état voulu : retour avant l'écriture de l'état.
    expect(TEXTE.indexOf("if p_active = v_active then")).toBeLessThan(TEXTE.indexOf("set active = p_active"));
    expect(TEXTE.indexOf("if v_nom = v_ancien_nom then")).toBeLessThan(TEXTE.indexOf("set nom = v_nom"));
  });
});

describe("modifier_categorie : verrous et dernière catégorie active (AD-10)", () => {
  const VERROU_ACTIVES =
    "if p_active = false or v_supprimer then perform 1 from public.categories c where c.active order by c.id for update; end if;";
  const VERROU_CATEGORIE =
    "select c.nom, c.active into v_ancien_nom, v_active from public.categories c where c.id = p_categorie for update;";

  it("désactiver ou supprimer : toutes les actives verrouillées, dans un ordre fixe, avant la catégorie visée", () => {
    expect(TEXTE).toContain(VERROU_ACTIVES);
    expect(TEXTE).toContain(VERROU_CATEGORIE);
    expect(TEXTE.indexOf(VERROU_ACTIVES)).toBeGreaterThan(TEXTE.indexOf("perform public.exiger_administrateur()"));
    expect(TEXTE.indexOf(VERROU_ACTIVES)).toBeLessThan(TEXTE.indexOf(VERROU_CATEGORIE));
  });

  it("introuvable : NV502, avant toute écriture", () => {
    const introuvable = TEXTE.search(/if not found then raise exception '[^']+' using errcode = 'nv502';/);
    expect(introuvable).toBeGreaterThan(TEXTE.indexOf(VERROU_CATEGORIE));
    expect(introuvable).toBeLessThan(TEXTE.indexOf("update public.categories"));
  });

  it("désactivation : refus NV503 avec le message exact s'il ne resterait aucune active, avant l'écriture", () => {
    const message = MESSAGES_CATEGORIES.derniereActive.toLowerCase();
    const refus = `if not p_active and ( select count(*) from public.categories c where c.active ) <= 1 then raise exception '${message}' using errcode = 'nv503'; end if;`;
    expect(TEXTE).toContain(refus);
    expect(TEXTE.indexOf(refus)).toBeLessThan(TEXTE.indexOf("set active = p_active"));
  });

  it("suppression : refus NV503 pour la dernière active (une désactivée ne compte pas), avant la vérification des demandes", () => {
    const message = MESSAGES_CATEGORIES.derniereActive.toLowerCase();
    const refus = `if v_active and ( select count(*) from public.categories c where c.active ) <= 1 then raise exception '${message}' using errcode = 'nv503'; end if;`;
    expect(TEXTE).toContain(refus);
    expect(TEXTE.indexOf(refus)).toBeLessThan(TEXTE.indexOf("from public.demandes d"));
  });
});

describe("modifier_categorie : suppression d'une catégorie utilisée (NV504)", () => {
  const message = MESSAGES_CATEGORIES.categorieUtilisee.toLowerCase();

  it("vérifiée avant le delete, la ligne verrouillée ; message exact", () => {
    const verification = `if exists ( select 1 from public.demandes d where d.categorie_id = p_categorie ) then raise exception '${message}' using errcode = 'nv504'; end if;`;
    expect(TEXTE).toContain(verification);
    expect(TEXTE.indexOf(verification)).toBeLessThan(TEXTE.indexOf("delete from public.categories"));
  });

  it("dernière barrière : la clé étrangère pendant le delete donne aussi NV504", () => {
    expect(TEXTE).toContain(
      `begin delete from public.categories where id = p_categorie; exception when foreign_key_violation then raise exception '${message}' using errcode = 'nv504'; end;`,
    );
    const depot = readFileSync(join(DOSSIER, "20261119180000_depot_demande.sql"), "utf8").toLowerCase();
    expect(depot).toMatch(/constraint demandes_categorie_id_fkey\s+references public\.categories \(id\),/);
  });
});

describe("modifier_categorie : nom unique parmi les actives (NV501)", () => {
  it("renommage et réactivation : l'index categories_nom_actif_unique donne NV501", () => {
    const motif =
      /when unique_violation then get stacked diagnostics v_contrainte = constraint_name; if v_contrainte = 'categories_nom_actif_unique' then raise exception 'une catégorie active porte déjà ce nom\.' using errcode = 'nv501'; end if; raise;/g;
    expect(TEXTE.match(motif)).toHaveLength(2);
  });
});

describe("codes de refus", () => {
  it("NV503 et NV504 sont nouveaux : aucune migration plus ancienne ne les utilise", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f < NOM)) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8").toLowerCase(), fichier).not.toMatch(/'nv50[34]'/);
    }
    expect([...new Set(SQL.match(/errcode = '(\w+)'/g))].sort()).toEqual([
      "errcode = '22004'",
      "errcode = 'nv501'",
      "errcode = 'nv502'",
      "errcode = 'nv503'",
      "errcode = 'nv504'",
    ]);
  });
});

describe("lire_demande, élargie (RM-11)", () => {
  it("comme celle de la story 1.11, avec en plus categorie_active", () => {
    expect(aplati(ENTETE_LIRE)).toBe("returns jsonb language plpgsql stable security definer set search_path = ''");
    expect(CORPS_LIRE.replace("    'categorie_active', c.active,\n", "")).toBe(corpsLireDemande1_11());
    expect(CORPS_LIRE).toMatch(/'categorie', c\.nom,\s*'categorie_active', c\.active,/);
  });

  it("droits recopiés : authenticated seul", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function public.lire_demande(text) from ${role};`);
    }
  });
});
