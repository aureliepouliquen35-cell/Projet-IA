import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « modifier le nom ou le rôle d'un compte » (story 3.3 ; FR-22,
// FR-25, RM-9, AD-9, AD-10, AD-16). Ces tests lisent le texte SQL ; son
// effet réel se vérifie sur la base dev (`npx supabase migration list
// --remote`, écran A1 avec le compte administrateur et un compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const NOM = "20261126090000_modifier_compte.sql";
const BRUT = readFileSync(join(DOSSIER, NOM), "utf8");
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

/** Texte sur une seule ligne, espaces réduits. */
const aplati = (texte: string) => texte.replace(/\s+/g, " ").trim();

const [, PARAMETRES = "", ENTETE = "", CORPS = ""] =
  SQL.match(/create function public\.modifier_compte\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];
const TEXTE = aplati(CORPS);

const ANCIENNE = "public.modifier_compte(uuid, uuid, boolean)";
const SIGNATURE = "public.modifier_compte(uuid, uuid, boolean, text, text)";

/** Verrou commun aux stories 3.4 et 3.3 : toutes les lignes administrateur, triées par identifiant. */
const VERROU = "perform 1 from public.profils p where p.role = 'administrateur' order by p.id for update;";

const AUTEUR =
  "if not exists ( select 1 from public.profils p where p.id = p_auteur and p.actif and not p.doit_changer_mdp and p.role = 'administrateur' ) then raise exception 'compte non modifié : réservé aux administrateurs actifs.' using errcode = 'nv202'; end if;";

/** Règle du dernier administrateur actif (RM-9), pour la désactivation comme pour le rôle. */
const DERNIER_ADMINISTRATEUR =
  "if v_role = 'administrateur' and v_actif and not (v_nouveau_role = 'administrateur' and v_nouvel_actif) and not exists ( select 1 from public.profils p where p.role = 'administrateur' and p.actif and p.id <> p_compte ) then raise exception 'impossible : il doit rester au moins un administrateur actif.' using errcode = 'nv203'; end if;";

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, après celle de la story 3.4, qui est intacte", () => {
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes).toContain(NOM);
    expect(toutes.indexOf(NOM)).toBeGreaterThan(toutes.indexOf("20261125090000_desactiver_compte.sql"));
    const ancienne = readFileSync(join(DOSSIER, "20261125090000_desactiver_compte.sql"), "utf8");
    expect(ancienne).toMatch(/p_actif boolean\s*\)/);
    expect(ancienne).not.toMatch(/p_nom|p_role/);
  });

  it("supprime l'ancienne signature à trois paramètres, puis crée la nouvelle ; aucune autre fonction ni table", () => {
    expect(SQL).toContain(`drop function ${ANCIENNE};`);
    expect(SQL.indexOf(`drop function ${ANCIENNE};`)).toBeLessThan(SQL.indexOf("create function public.modifier_compte("));
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual(["modifier_compte"]);
    expect(SQL.match(/drop /g)).toHaveLength(1);
    expect(SQL).not.toMatch(/create table|alter table|create index|create policy|truncate |delete |insert /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    // `retablir_compte` (story 3.4) ne change pas.
    expect(SQL).not.toContain("retablir_compte");
  });

  it("n'écrit que nom, rôle, état et date de modification de profils ; jamais l'email (FR-22)", () => {
    const ecritures = [...SQL.matchAll(/update ([\w.]+)\s+set ([\s\S]*?) where/g)].map(([, table, colonnes]) => [
      table,
      aplati(colonnes),
    ]);
    expect(ecritures).toEqual([
      ["public.profils", "nom = v_nouveau_nom, role = v_nouveau_role, actif = v_nouvel_actif, date_modification = now()"],
    ]);
    expect(SQL).not.toMatch(/email\s*=|p_email/);
  });
});

describe("modifier_compte (FR-22, FR-25, RM-9)", () => {
  it("auteur, compte, puis état, nom et rôle facultatifs (null : inchangé) ; jsonb ; security definer, chemin vide", () => {
    expect(aplati(PARAMETRES)).toBe(
      "p_auteur uuid, p_compte uuid, p_actif boolean default null, p_nom text default null, p_role text default null",
    );
    expect(ENTETE).toContain("returns jsonb");
    expect(ENTETE).toContain("security definer");
    expect(ENTETE).toContain("set search_path = ''");
    expect(ENTETE).not.toMatch(/stable|immutable/);
  });

  it("auteur ou compte absent, ou aucun changement demandé : 22004", () => {
    expect(TEXTE).toContain(
      "if p_auteur is null or p_compte is null or (p_actif is null and p_nom is null and p_role is null) then raise exception 'compte non modifié : auteur, compte et au moins un changement sont obligatoires.' using errcode = '22004'; end if;",
    );
  });

  it("même verrou que la story 3.4 (toutes les lignes administrateur, par identifiant), puis l'auteur revérifié (NV202) (AD-10)", () => {
    expect(TEXTE).toContain(VERROU);
    expect(TEXTE).toContain(AUTEUR);
    expect(TEXTE.indexOf(VERROU)).toBeLessThan(TEXTE.indexOf(AUTEUR));
    expect(CORPS).not.toMatch(/auth\.uid|jwt|user_metadata|app_metadata|raw_/);
  });

  it("compte verrouillé, introuvable : NV204", () => {
    expect(TEXTE).toContain(
      "select p.nom, p.email, p.role, p.actif into v_nom, v_email, v_role, v_actif from public.profils p where p.id = p_compte for update;",
    );
    expect(TEXTE).toContain("if not found then raise exception 'compte non modifié : compte introuvable.' using errcode = 'nv204'; end if;");
  });

  it("nouvelles valeurs : celles données, sinon celles en place ; nom nettoyé des espaces de bord, comme creer_profil", () => {
    expect(TEXTE).toContain("v_nouveau_nom := coalesce(btrim(p_nom), v_nom);");
    expect(TEXTE).toContain("v_nouveau_role := coalesce(p_role, v_role);");
    expect(TEXTE).toContain("v_nouvel_actif := coalesce(p_actif, v_actif);");
  });

  it("rien ne diffère : change faux, rien n'est écrit, avant la règle du dernier administrateur", () => {
    const rien =
      "if v_nouveau_nom = v_nom and v_nouveau_role = v_role and v_nouvel_actif = v_actif then return jsonb_build_object( 'nom', v_nom, 'email', v_email, 'role', v_role, 'actif', v_actif, 'change', false, 'ancien_role', v_role ); end if;";
    expect(TEXTE).toContain(rien);
    expect(TEXTE.indexOf(rien)).toBeLessThan(TEXTE.indexOf(DERNIER_ADMINISTRATEUR));
    expect(TEXTE.indexOf(rien)).toBeLessThan(TEXTE.indexOf("update public.profils"));
  });

  it("dernier administrateur actif, désactivé ou passé collaborateur, y compris soi-même : NV203 avec le message exact, avant toute écriture (RM-9)", () => {
    expect(TEXTE).toContain(DERNIER_ADMINISTRATEUR);
    expect(TEXTE.indexOf(DERNIER_ADMINISTRATEUR)).toBeLessThan(TEXTE.indexOf("update public.profils"));
    // Le message de l'UX, mot pour mot (casse d'origine).
    expect(BRUT).toContain("'Impossible : il doit rester au moins un administrateur actif.'");
    // Un compte déjà désactivé ne compte pas : seuls les administrateurs actifs.
    expect(DERNIER_ADMINISTRATEUR).toContain("v_role = 'administrateur' and v_actif");
  });

  it("nom ou rôle invalides : rien de vérifié ici, les contraintes de profils refusent l'écriture (23514)", () => {
    const comptes = readFileSync(join(DOSSIER, "20261120090000_comptes.sql"), "utf8");
    expect(comptes).toMatch(/constraint profils_nom_check\s+check \(btrim\(nom\) <> '' and char_length\(nom\) <= 100\)/);
    expect(comptes).toMatch(/constraint profils_role_check\s+check \(role in \('collaborateur', 'administrateur'\)\)/);
  });

  it("renvoie les valeurs en place après l'appel, change vrai et l'ancien rôle", () => {
    expect(TEXTE).toContain(
      "where id = p_compte; return jsonb_build_object( 'nom', v_nouveau_nom, 'email', v_email, 'role', v_nouveau_role, 'actif', v_nouvel_actif, 'change', true, 'ancien_role', v_role );",
    );
  });

  it("exécutable par service_role seul (AD-9)", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE} to service_role;`);
    expect(SQL.match(/grant execute on function/g)).toHaveLength(1);
  });
});

describe("codes de refus", () => {
  it("NV202, NV203, NV204 : mêmes sens que dans la fonction de la story 3.4 ; aucun nouveau code", () => {
    const codes = [...new Set([...SQL.matchAll(/errcode = '(\w+)'/g)].map((m) => m[1]))].sort();
    expect(codes).toEqual(["22004", "nv202", "nv203", "nv204"]);
  });
});
