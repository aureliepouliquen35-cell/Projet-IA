import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « réinitialiser le mot de passe » (story 3.5 ; FR-23, AD-6,
// AD-9, AD-16). Ces tests lisent le texte SQL ; son effet réel se vérifie sur
// la base dev (`npx supabase migration list --remote`, écran A1 avec le
// compte administrateur et un compte de test).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const NOM = "20261125120000_reinitialiser_mot_de_passe.sql";
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_reinitialiser_mot_de_passe.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

/** Texte sur une seule ligne, espaces réduits. */
const aplati = (texte: string) => texte.replace(/\s+/g, " ").trim();

const [, PARAMETRES = "", ENTETE = "", CORPS = ""] =
  SQL.match(/create function public\.reinitialiser_mdp\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];
const TEXTE = aplati(CORPS);

const SIGNATURE = "public.reinitialiser_mdp(uuid, uuid, text)";

const AUTEUR =
  "if not exists ( select 1 from public.profils p where p.id = p_auteur and p.actif and not p.doit_changer_mdp and p.role = 'administrateur' ) then raise exception 'mot de passe non réinitialisé : réservé aux administrateurs actifs.' using errcode = 'nv202'; end if;";
const LONGUEUR =
  "if p_mdp_temporaire is null or char_length(p_mdp_temporaire) < 12 then raise exception 'mot de passe non réinitialisé : le mot de passe temporaire doit faire au moins 12 caractères.' using errcode = 'nv205'; end if;";
const VERROU = "select p.nom, p.email into v_nom, v_email from public.profils p where p.id = p_compte for update;";
const INTROUVABLE =
  "if not found then raise exception 'mot de passe non réinitialisé : compte introuvable.' using errcode = 'nv204'; end if;";
const DRAPEAU = "update public.profils set doit_changer_mdp = true, date_modification = now() where id = p_compte;";
const EMPREINTE =
  "insert into public.mdp_temporaires (profil_id, empreinte) values (p_compte, extensions.crypt(p_mdp_temporaire, extensions.gen_salt('bf'))) on conflict (profil_id) do update set empreinte = excluded.empreinte, date_creation = now();";

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle de la désactivation (3.4)", () => {
    expect(FICHIERS).toEqual([NOM]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf(NOM)).toBeGreaterThan(toutes.indexOf("20261125090000_desactiver_compte.sql"));
  });

  it("les anciennes migrations ne sont pas touchées : creer_profil et terminer_changement_mdp restent telles quelles", () => {
    const autres = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f !== NOM);
    for (const fichier of autres) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8"), fichier).not.toContain("reinitialiser_mdp");
    }
    expect(SQL).not.toMatch(/function public\.(creer_profil|terminer_changement_mdp|est_mot_de_passe_temporaire|modifier_compte)/);
  });

  it("une seule fonction : reinitialiser_mdp ; ni table, ni index, ni règle, ni suppression ; aucun droit sur une table", () => {
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "reinitialiser_mdp",
    ]);
    expect(SQL).not.toMatch(/create table|alter table|create index|create policy|truncate |drop |delete /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
  });
});

describe("reinitialiser_mdp (FR-23)", () => {
  it("auteur, compte, mot de passe temporaire ; renvoie jsonb ; security definer, chemin vide", () => {
    expect(aplati(PARAMETRES)).toBe("p_auteur uuid, p_compte uuid, p_mdp_temporaire text");
    expect(ENTETE).toContain("returns jsonb");
    expect(ENTETE).toContain("security definer");
    expect(ENTETE).toContain("set search_path = ''");
    expect(ENTETE).not.toMatch(/stable|immutable/);
  });

  it("paramètre absent : refus (22004)", () => {
    expect(TEXTE).toContain(
      "if p_auteur is null or p_compte is null then raise exception 'mot de passe non réinitialisé : auteur et compte sont obligatoires.' using errcode = '22004'; end if;",
    );
  });

  it("revérifie l'auteur (NV202) : administrateur actif au mot de passe choisi, relu dans profils, jamais dans la session", () => {
    expect(TEXTE).toContain(AUTEUR);
    expect(CORPS).not.toMatch(/auth\.uid|jwt|user_metadata|app_metadata|raw_/);
  });

  it("12 caractères au moins (NV205)", () => {
    expect(TEXTE).toContain(LONGUEUR);
  });

  it("compte verrouillé ; introuvable : NV204", () => {
    expect(TEXTE).toContain(VERROU);
    expect(TEXTE).toContain(INTROUVABLE);
  });

  it("toutes les vérifications avant la moindre écriture", () => {
    const premiereEcriture = TEXTE.indexOf(DRAPEAU);
    for (const verification of [AUTEUR, LONGUEUR, VERROU, INTROUVABLE]) {
      expect(TEXTE.indexOf(verification)).toBeGreaterThanOrEqual(0);
      expect(TEXTE.indexOf(verification)).toBeLessThan(premiereEcriture);
    }
  });

  it("« doit changer son mot de passe », sans jamais toucher à actif ni au rôle", () => {
    expect(TEXTE).toContain(DRAPEAU);
    const ecritures = [...SQL.matchAll(/update ([\w.]+)\s+set ([\s\S]*?) where/g)].map(([, table, colonnes]) => [
      table,
      aplati(colonnes),
    ]);
    expect(ecritures).toEqual([["public.profils", "doit_changer_mdp = true, date_modification = now()"]]);
    expect(SQL).not.toMatch(/set (actif|role)|actif =|role =\s*p_/);
  });

  it("empreinte bcrypt du nouveau temporaire, qui remplace l'ancienne ligne ; jamais le mot de passe en clair", () => {
    expect(TEXTE).toContain(EMPREINTE);
    expect(TEXTE.indexOf(DRAPEAU)).toBeLessThan(TEXTE.indexOf(EMPREINTE));
    // Le mot de passe n'est écrit nulle part ailleurs que dans `crypt`.
    const usages = TEXTE.match(/p_mdp_temporaire/g) ?? [];
    expect(usages).toHaveLength(3); // contrôle nul, longueur, crypt
    // Jamais dans le message d'un refus.
    for (const [message] of TEXTE.matchAll(/raise exception [^;]*;/g)) {
      expect(message).not.toContain("p_mdp_temporaire");
    }
  });

  it("renvoie seulement le nom et l'email du compte", () => {
    expect(TEXTE).toContain("return jsonb_build_object('nom', v_nom, 'email', v_email);");
    expect(TEXTE.match(/return /g)).toHaveLength(1);
  });

  it("exécutable par service_role seul (AD-9)", () => {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE} to service_role;`);
    expect(SQL.match(/grant execute/g)).toHaveLength(1);
  });
});

describe("codes de refus", () => {
  it("NV205 n'est pris par aucune autre migration", () => {
    const autres = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f !== NOM);
    for (const fichier of autres) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8").toLowerCase(), fichier).not.toContain("'nv205'");
    }
  });
});
