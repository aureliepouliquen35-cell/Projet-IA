import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Migration « supprimer une demande » (story 4.4 ; FR-28, RM-5, RM-7, AD-2,
// AD-3, AD-7, AD-9, AD-16). Ces tests lisent le texte SQL ; son effet réel
// se vérifie sur la base dev (`npx supabase migration list --remote`,
// suppression d'une demande d'essai à l'écran avec le compte
// administrateur ; refus d'un appel direct par le collaborateur dans
// `tests/e2e/administration.spec.ts`).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const NOM = "20261126120000_supprimer_demande.sql";
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_supprimer_demande.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules, fins de ligne Unix. */
const SQL = BRUT.replace(/\r\n/g, "\n").replace(/--.*$/gm, "").toLowerCase();

const [, PARAMETRES = "", ENTETE = "", CORPS = ""] =
  SQL.match(/create function public\.supprimer_demande\(([\s\S]*?)\)\s*(returns[\s\S]*?)as \$\$([\s\S]*?)\$\$;/) ?? [];

const SIGNATURE = "public.supprimer_demande(text)";

/** Position d'un morceau du corps (-1 s'il manque). */
const position = (morceau: string | RegExp) =>
  typeof morceau === "string" ? CORPS.indexOf(morceau) : CORPS.search(morceau);

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle de la story 3.3 ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual([NOM]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes.indexOf(NOM)).toBeGreaterThan(toutes.indexOf("20261126090000_modifier_compte.sql"));
    for (const fichier of toutes.filter((f) => f < NOM)) {
      expect(readFileSync(join(DOSSIER, fichier), "utf8"), fichier).not.toContain("supprimer_demande");
    }
  });

  it("une seule fonction ; ni table, ni index (celui de evenements.demande_id existe déjà), ni règle, ni table ouverte", () => {
    expect([...SQL.matchAll(/create (?:or replace )?function public\.(\w+)/g)].map((m) => m[1])).toEqual([
      "supprimer_demande",
    ]);
    expect(SQL).not.toMatch(/create table|alter table|create (unique )?index|create policy|create trigger|truncate |drop /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    const detail = readFileSync(join(DOSSIER, "20261121150000_detail_demande.sql"), "utf8");
    expect(detail).toMatch(/create index evenements_demande_id_date_creation\s+on public\.evenements \(demande_id, date_creation/);
  });

  it("aucun nouveau code de refus (NV) ; pas d'écriture au journal ici", () => {
    expect(SQL).not.toMatch(/errcode/);
    expect(SQL).not.toContain("journal");
  });
});

describe("supprimer_demande (FR-28, AD-2)", () => {
  it("par la référence, renvoie du jsonb ; security definer, chemin de recherche vide ; pas en lecture seule", () => {
    expect(PARAMETRES.trim()).toBe("p_reference text");
    expect(ENTETE).toMatch(/returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
    expect(ENTETE).not.toMatch(/stable|immutable/);
  });

  it("vérifie d'abord l'appelant (administrateur actif, NV202), avant toute lecture", () => {
    expect(CORPS).toMatch(/^\s*declare[\s\S]*?\bbegin\s+perform public\.exiger_administrateur\(\);/);
    expect(CORPS).not.toMatch(/exiger_utilisateur_interne|jwt|user_metadata|app_metadata/);
  });

  it("référence mise en majuscules", () => {
    expect(CORPS).toContain("v_reference text := upper(p_reference);");
    expect(CORPS).toContain("where d.reference = v_reference");
  });

  it("verrouille la demande, puis efface ses événements, puis la demande (AD-3)", () => {
    const verrou = position(/from public\.demandes d\s+where d\.reference = v_reference\s+for update;/);
    const evenements = position(/delete from public\.evenements e\s+where e\.demande_id = v_demande_id;/);
    const demande = position(/delete from public\.demandes d\s+where d\.id = v_demande_id;/);
    expect(verrou).toBeGreaterThan(position("perform public.exiger_administrateur()"));
    expect(evenements).toBeGreaterThan(verrou);
    expect(demande).toBeGreaterThan(evenements);
    // Rien d'autre n'est écrit.
    expect([...CORPS.matchAll(/(insert into|update|delete from) public\.(\w+)/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      "delete from evenements",
      "delete from demandes",
    ]);
  });

  it("introuvable : rien n'est effacé ; sinon « supprimee » ; la référence est renvoyée", () => {
    const introuvable = position("if v_demande_id is null then");
    expect(introuvable).toBeGreaterThan(-1);
    expect(introuvable).toBeLessThan(position("delete from public.evenements"));
    expect(CORPS).toContain("return jsonb_build_object('resultat', 'introuvable', 'reference', v_reference);");
    expect(CORPS).toContain("return jsonb_build_object('resultat', 'supprimee', 'reference', v_reference);");
  });

  it("exécutable par authenticated seul (la session de l'administrateur, jamais la clé secrète)", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE} from ${role};`);
    }
    expect(SQL.match(/grant execute on function [^;]+ to (\w+)/g)).toEqual([
      `grant execute on function ${SIGNATURE} to authenticated`,
    ]);
  });
});

describe("l'historique n'est effacé nulle part ailleurs (RM-5, AD-3)", () => {
  it("aucune autre migration ne supprime ni ne vide les événements ou les demandes", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith(".sql") && f !== NOM)) {
      const sql = readFileSync(join(DOSSIER, fichier), "utf8").replace(/--.*$/gm, "").toLowerCase();
      expect(sql, fichier).not.toMatch(/delete from public\.(evenements|demandes)|truncate[^;]*public\.(evenements|demandes)/);
    }
  });
});
