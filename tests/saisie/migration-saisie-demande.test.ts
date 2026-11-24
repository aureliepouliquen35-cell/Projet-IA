import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CODES_REFUS_PREVUS_SAISIE } from "@/server/actions/refus-saisie";
import { CANAUX_SAISIE } from "@/shared/constantes";

// Migration « saisie interne » (story 2.3 ; FR-30, RM-1, RM-12, AD-2, AD-4,
// AD-7, AD-9, AD-16, AD-20). Ces tests lisent le texte SQL ; son effet réel
// se vérifie sur la base dev (`npx supabase migration list --remote`, puis
// une saisie à l'écran avec le compte de test, `tests/e2e/saisie-demande.spec.ts`).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_saisie_demande.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules. */
const SQL = BRUT.replace(/--.*$/gm, "").toLowerCase();

function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(new RegExp(`create function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`)) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const SIGNATURE_SAISIR = "public.saisir_demande(text, text, text, text, text, uuid, text, text, boolean, uuid)";
const SIGNATURE_LIRE = "public.lire_formulaire_saisie()";

const echapper = (texte: string) => texte.replace(/[().]/g, "\\$&");

/** Droits d'exécution : `authenticated` seul (AD-9). */
function droitsAuthenticatedSeul(signature: string) {
  for (const role of ["public", "anon", "service_role"]) {
    expect(SQL).toContain(`revoke execute on function ${signature} from ${role};`);
  }
  expect(SQL.match(new RegExp(`grant execute on function ${echapper(signature)} to (\\w+)`, "g"))).toEqual([
    `grant execute on function ${signature} to authenticated`,
  ]);
}

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle des filtres ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261124100000_saisie_demande.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf("20261124100000_saisie_demande.sql")).toBeGreaterThan(
      toutes.indexOf("20261122140000_filtres_demandes.sql"),
    );
    const envoi = readFileSync(join(DOSSIER, "20261119210000_numero_envoi.sql"), "utf8");
    expect(envoi).toContain("create function public.deposer_demande(");
    expect(envoi).toContain("'formulaire',");
  });

  it("ne crée ni table, ni colonne, ni règle ; n'ouvre aucune table en accès direct ; ne supprime rien", () => {
    expect(SQL).not.toMatch(/create table|alter table|truncate |create policy|create index|drop /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/grant select|grant insert|grant update|grant delete/);
    const fonctions = [...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1]);
    expect(fonctions).toEqual(["saisir_demande", "lire_formulaire_saisie"]);
  });
});

describe("saisir_demande (AD-2, AD-4, AD-20)", () => {
  const { parametres, entete, corps } = fonction("saisir_demande");

  it("reçoit le canal, les champs de P1, la case et le numéro d'envoi ; renvoie la référence", () => {
    expect(parametres).toBe(
      "p_canal text, p_nom text, p_email text, p_telephone text, p_entreprise text, p_categorie_id uuid, " +
        "p_objet text, p_description text, p_personne_informee boolean, p_numero_envoi uuid",
    );
    expect(entete).toMatch(/^returns table \(reference text\)/);
  });

  it("security definer, chemin de recherche vide ; exécutable par authenticated seul (AD-9)", () => {
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    droitsAuthenticatedSeul(SIGNATURE_SAISIR);
  });

  it("vérifie l'appelant en premier et garde son identifiant (AD-7)", () => {
    expect(corps).toMatch(/^\s*declare[\s\S]*?begin\s+v_auteur := public\.exiger_utilisateur_interne\(\);/);
  });

  it("numéro d'envoi : absent refusé, verrouillé, puis rejoué avant toute vérification (AD-20)", () => {
    const absent = corps.indexOf("if p_numero_envoi is null then");
    const verrou = corps.indexOf("pg_catalog.pg_advisory_xact_lock(");
    const rejeu = corps.search(/select d\.reference\s+into reference\s+from public\.demandes d\s+where d\.numero_envoi = p_numero_envoi;\s+if found then\s+return next;\s+return;\s+end if;/);
    expect(absent).toBeGreaterThan(-1);
    expect(verrou).toBeGreaterThan(absent);
    expect(rejeu).toBeGreaterThan(verrou);
    expect(corps).toContain("pg_catalog.hashtextextended(p_numero_envoi::text, 0)");
    expect(corps.slice(0, rejeu)).not.toMatch(/insert into|update |delete /);
    expect(rejeu).toBeLessThan(corps.indexOf("errcode = 'nv401'"));
  });

  it("canal : Téléphone ou Email seulement, refus NV401 (Formulaire réservé au dépôt public)", () => {
    const liste = CANAUX_SAISIE.map((canal) => `'${canal}'`).join(", ");
    expect(corps).toMatch(
      new RegExp(`if p_canal is null or p_canal not in \\(${liste}\\) then\\s+raise exception '[^;]*'\\s+using errcode = 'nv401';\\s+end if;`),
    );
    expect(corps).not.toContain("'formulaire'");
  });

  it("refus NV001 (case, RM-12) et NV002 (catégorie inactive), avant toute écriture", () => {
    expect(corps).toMatch(
      /if p_personne_informee is not true then\s+raise exception '[^;]*'\s+using errcode = 'nv001';\s+end if;/,
    );
    expect(corps).toMatch(
      /if not exists \(\s+select 1\s+from public\.categories c\s+where c\.id = p_categorie_id\s+and c\.active\s+\) then\s+raise exception '[^;]*'\s+using errcode = 'nv002';/,
    );
    const premiereEcriture = corps.indexOf("insert into");
    for (const code of ["nv401", "nv001", "nv002"]) {
      expect(corps.indexOf(`errcode = '${code}'`)).toBeLessThan(premiereEcriture);
    }
  });

  it("les refus prévus sont exactement ceux que le serveur traduit (NV201 compris par exiger_utilisateur_interne)", () => {
    const codes = [...corps.matchAll(/errcode = '(\w+)'/g)].map(([, code]) => code.toUpperCase());
    expect(codes).toEqual(["NV401", "NV001", "NV002"]);
    expect([...CODES_REFUS_PREVUS_SAISIE].sort()).toEqual([...codes].sort());
  });

  it("référence par le compteur annuel verrouillé, au moins 4 chiffres (AD-4)", () => {
    expect(corps).toMatch(
      /insert into public\.compteurs_reference as c \(annee, dernier_numero\)\s+values \(v_annee, 1\)\s+on conflict \(annee\) do update\s+set dernier_numero = c\.dernier_numero \+ 1\s+returning c\.dernier_numero into v_numero;/,
    );
    expect(BRUT).toContain("v_reference := 'NOVA-' || v_annee::text || '-'");
    expect(corps).toContain("lpad(v_numero::text, greatest(4, length(v_numero::text)), '0')");
    expect(corps).toContain("extract(year from (v_maintenant at time zone 'europe/paris'))");
  });

  it("crée la demande avec le canal saisi, la case, le numéro d'envoi ; statut et priorité par défaut (RM-1)", () => {
    const insertion = corps.match(/insert into public\.demandes as d \(([\s\S]*?)\)\s+values \(([\s\S]*?)\)\s+returning/);
    expect(insertion).not.toBeNull();
    const colonnes = insertion![1].split(",").map((c) => c.trim());
    const valeurs = insertion![2].split(/,\s*\n/).map((v) => v.trim());
    expect(Object.fromEntries(colonnes.map((c, i) => [c, valeurs[i]]))).toEqual({
      reference: "v_reference",
      nom: "p_nom",
      email: "p_email",
      telephone: "nullif(btrim(p_telephone), '')",
      entreprise: "nullif(btrim(p_entreprise), '')",
      categorie_id: "p_categorie_id",
      objet: "p_objet",
      description: "p_description",
      canal: "p_canal",
      personne_informee: "true",
      numero_envoi: "p_numero_envoi",
      date_depot: "v_maintenant",
      date_derniere_activite: "v_maintenant",
    });
    expect(colonnes).not.toContain("statut");
    expect(colonnes).not.toContain("priorite");
  });

  it("écrit « Demande créée » au nom de l'appelant (auteur interne, sans libellé), à la même heure", () => {
    expect(corps).toMatch(
      /insert into public\.evenements \(demande_id, type, auteur_id, date_creation\)\s+values \(v_demande_id, 'creation', v_auteur, v_maintenant\);/,
    );
    expect(corps).not.toContain("auteur_libelle");
    expect(corps.match(/insert into/g)).toHaveLength(3);
  });
});

describe("lire_formulaire_saisie", () => {
  const { parametres, entete, corps } = fonction("lire_formulaire_saisie");

  it("sans paramètre, renvoie du jsonb ; stable, security definer, chemin vide ; authenticated seul", () => {
    expect(parametres).toBe("");
    expect(entete).toMatch(/returns jsonb/);
    expect(entete).toContain("stable");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    droitsAuthenticatedSeul(SIGNATURE_LIRE);
  });

  it("vérifie l'appelant d'abord ; lecture seule", () => {
    expect(corps.trim()).toMatch(/^declare[\s\S]*?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
    expect(corps).not.toMatch(/insert |update |delete /);
  });

  it("catégories actives seulement, dans l'ordre ; id et nom ; contact données", () => {
    expect(corps).toMatch(
      /jsonb_build_object\('id', c\.id, 'nom', c\.nom\)\s+order by c\.ordre\s+\),\s+'\[\]'::jsonb\s+\)\s+into v_categories\s+from public\.categories c\s+where c\.active;/,
    );
    expect(corps).toMatch(/select p\.contact_donnees\s+into v_contact\s+from public\.parametres p/);
    expect(corps).toMatch(/jsonb_build_object\(\s+'categories', v_categories,\s+'contact_donnees', v_contact\s+\)/);
  });
});
