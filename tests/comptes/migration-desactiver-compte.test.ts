import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « désactiver un compte » (story 3.4 ; FR-22, FR-25, RM-9, RM-10,
// AD-9, AD-10, AD-16). Ces tests lisent le texte SQL ; son effet réel se
// vérifie sur la base dev (`npx supabase migration list --remote`, écran A1
// avec le compte administrateur et un second navigateur connecté avec le
// compte à désactiver).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_desactiver_compte.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

/** Texte sur une seule ligne, espaces réduits. */
const aplati = (texte: string) => texte.replace(/\s+/g, " ").trim();

const SIGNATURE_MODIFIER = "public.modifier_compte(uuid, uuid, boolean)";
const SIGNATURE_RETABLIR = "public.retablir_compte(uuid, boolean)";

/** Verrou commun : toutes les lignes administrateur, triées par identifiant. */
const VERROU = "perform 1 from public.profils p where p.role = 'administrateur' order by p.id for update;";

/** Règle du dernier administrateur (RM-9). */
const DERNIER_ADMINISTRATEUR =
  "if not p_actif and v_role = 'administrateur' and not exists ( select 1 from public.profils p where p.role = 'administrateur' and p.actif and p.id <> p_compte ) then raise exception 'impossible : il doit rester au moins un administrateur actif.' using errcode = 'nv203'; end if;";

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle des comptes de l'administration (3.1) ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261125090000_desactiver_compte.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261125090000_desactiver_compte.sql")).toBeGreaterThan(
      toutes.indexOf("20261124160000_comptes_administration.sql"),
    );
    // Les fonctions de la story 3.1 restent écrites telles quelles.
    const administration = readFileSync(join(DOSSIER, "20261124160000_comptes_administration.sql"), "utf8");
    expect(administration).not.toMatch(/modifier_compte|retablir_compte/);
    expect(SQL).not.toMatch(/function public\.(exiger_administrateur|lister_comptes|creer_profil)/);
  });

  it("ne crée ni table, ni index, ni règle ; ne supprime rien ; n'ouvre aucune table ; n'écrit que profils.actif", () => {
    expect(SQL).not.toMatch(/create table|alter table|create index|create policy|truncate |drop |delete /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/insert /);
    const ecritures = [...SQL.matchAll(/update ([\w.]+)\s+set ([\s\S]*?) where/g)].map(([, table, colonnes]) => [
      table,
      aplati(colonnes),
    ]);
    expect(ecritures).toEqual([
      ["public.profils", "actif = p_actif, date_modification = now()"],
      ["public.profils", "actif = p_actif, date_modification = now()"],
    ]);
  });

  it("deux fonctions : modifier_compte, puis retablir_compte ; aucune autre n'est remplacée", () => {
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "modifier_compte",
      "retablir_compte",
    ]);
  });

  it("le nom d'un compte désactivé reste dans l'historique : lire_demande n'est pas touchée et ne regarde pas actif (AC 3)", () => {
    expect(SQL).not.toContain("lire_demande");
    const statut = readFileSync(join(DOSSIER, "20261121200000_changer_statut.sql"), "utf8").toLowerCase();
    const lecture = statut.slice(statut.indexOf("create or replace function public.lire_demande"));
    expect(lecture).toContain("left join public.profils p on p.id = e.auteur_id");
    expect(lecture.slice(0, lecture.indexOf("$$;", lecture.indexOf("as $$") + 5))).not.toMatch(/p\.actif/);
    expect(lecture).toMatch(/security definer/);
  });
});

describe("modifier_compte (FR-22, FR-25, RM-9, RM-10)", () => {
  const { parametres, entete, corps } = fonction("modifier_compte");
  const texte = aplati(corps);

  it("auteur, compte, état voulu ; renvoie jsonb ; security definer, chemin vide", () => {
    expect(parametres).toBe("p_auteur uuid, p_compte uuid, p_actif boolean");
    expect(entete).toContain("returns jsonb");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    expect(entete).not.toMatch(/stable|immutable/);
  });

  it("verrouille d'abord toutes les lignes administrateur, dans le même ordre, puis vérifie l'auteur (AD-10)", () => {
    expect(texte).toContain(VERROU);
    const auteur =
      "if not exists ( select 1 from public.profils p where p.id = p_auteur and p.actif and not p.doit_changer_mdp and p.role = 'administrateur' ) then raise exception 'compte non modifié : réservé aux administrateurs actifs.' using errcode = 'nv202'; end if;";
    expect(texte).toContain(auteur);
    expect(texte.indexOf(VERROU)).toBeLessThan(texte.indexOf(auteur));
    expect(corps).not.toMatch(/auth\.uid|jwt|user_metadata|app_metadata|raw_/);
  });

  it("compte introuvable : NV204 ; compte verrouillé", () => {
    expect(texte).toContain(
      "select p.nom, p.email, p.role, p.actif into v_nom, v_email, v_role, v_actif from public.profils p where p.id = p_compte for update;",
    );
    expect(texte).toContain("if not found then raise exception 'compte non modifié : compte introuvable.' using errcode = 'nv204'; end if;");
  });

  it("déjà dans l'état voulu : change faux, rien n'est écrit", () => {
    const deja =
      "if v_actif = p_actif then return jsonb_build_object('nom', v_nom, 'email', v_email, 'change', false); end if;";
    expect(texte).toContain(deja);
    expect(texte.indexOf(deja)).toBeLessThan(texte.indexOf("update public.profils"));
  });

  it("dernier administrateur actif, y compris soi-même : NV203 avec le message exact, avant toute écriture (RM-9)", () => {
    expect(texte).toContain(DERNIER_ADMINISTRATEUR);
    expect(texte.indexOf(DERNIER_ADMINISTRATEUR)).toBeLessThan(texte.indexOf("update public.profils"));
    // Le message de l'UX, mot pour mot (casse d'origine).
    expect(BRUT).toContain("'Impossible : il doit rester au moins un administrateur actif.'");
  });

  it("écrit seulement l'état du compte visé, puis renvoie nom, email et change vrai ; jamais de rôle ni de suppression", () => {
    expect(texte).toContain(
      "update public.profils set actif = p_actif, date_modification = now() where id = p_compte; return jsonb_build_object('nom', v_nom, 'email', v_email, 'change', true);",
    );
    expect(texte).not.toMatch(/set role|role =\s*p_/);
  });

  it("paramètre absent : refus (22004)", () => {
    expect(texte).toContain(
      "if p_auteur is null or p_compte is null or p_actif is null then raise exception 'compte non modifié : auteur, compte et état sont obligatoires.' using errcode = '22004'; end if;",
    );
  });

  it("exécutable par service_role seul (AD-9)", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_MODIFIER} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE_MODIFIER} to service_role;`);
    expect(SQL.match(/grant execute on function public\.modifier_compte/g)).toHaveLength(1);
  });
});

describe("retablir_compte (retour arrière quand Supabase Auth échoue)", () => {
  const { parametres, entete, corps } = fonction("retablir_compte");
  const texte = aplati(corps);

  it("compte et état ; ne renvoie rien ; security definer, chemin vide", () => {
    expect(parametres).toBe("p_compte uuid, p_actif boolean");
    expect(entete).toContain("returns void");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
  });

  it("même verrou, même règle du dernier administrateur (NV203), compte introuvable NV204", () => {
    expect(texte).toContain(VERROU);
    expect(texte).toContain(DERNIER_ADMINISTRATEUR);
    expect(texte).toContain("using errcode = 'nv204'");
    expect(texte.indexOf(DERNIER_ADMINISTRATEUR)).toBeLessThan(texte.indexOf("update public.profils"));
  });

  it("exécutable par service_role seul (AD-9)", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_RETABLIR} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE_RETABLIR} to service_role;`);
  });
});

describe("codes de refus", () => {
  it("NV203 et NV204 ne sont pris par aucune autre migration", () => {
    const autres = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f !== FICHIERS[0]);
    for (const fichier of autres) {
      const contenu = readFileSync(join(DOSSIER, fichier), "utf8").toLowerCase();
      expect(contenu, fichier).not.toContain("'nv203'");
      expect(contenu, fichier).not.toContain("'nv204'");
    }
  });
});
