import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STATUTS, TRANSITIONS_STATUT, transitionsDepuis } from "@/shared/constantes";

// Migration « changer le statut » (story 1.11 ; FR-16, FR-17, RM-4, AD-2,
// AD-3, AD-5, AD-7, AD-9, AD-16). Ces tests lisent le texte SQL ; son effet
// réel se vérifie sur la base dev (`npx supabase migration list --remote`,
// changements de statut à l'écran avec le compte de test, deux onglets pour
// le conflit).

const DOSSIER = join(process.cwd(), "supabase", "migrations");
const FICHIERS = readdirSync(DOSSIER).filter((fichier) => fichier.endsWith("_changer_statut.sql"));
const BRUT = FICHIERS.length === 1 ? readFileSync(join(DOSSIER, FICHIERS[0]), "utf8") : "";
/** Sans les commentaires, en minuscules, fins de ligne Unix. */
const SQL = BRUT.replace(/\r\n/g, "\n").replace(/--.*$/gm, "").toLowerCase();

/** Paramètres, en-tête et corps d'une fonction de la migration. */
function fonction(nom: string): { parametres: string; entete: string; corps: string } {
  const [, parametres = "", entete = "", corps = ""] =
    SQL.match(
      new RegExp(`create (?:or replace )?function public\\.${nom}\\(([\\s\\S]*?)\\)\\s*(returns[\\s\\S]*?)as \\$\\$([\\s\\S]*?)\\$\\$;`),
    ) ?? [];
  return { parametres: parametres.replace(/\s+/g, " ").trim(), entete: entete.replace(/\s+/g, " "), corps };
}

const CHANGER = fonction("changer_statut");
const TRANSITION = fonction("transition_statut_permise");
const LIRE = fonction("lire_demande");

const SIGNATURE_CHANGER = "public.changer_statut(text, text, text)";
const SIGNATURE_TRANSITION = "public.transition_statut_permise(text, text)";
const SIGNATURE_LIRE = "public.lire_demande(text)";

describe("fichier de migration (AD-16)", () => {
  it("est une nouvelle migration, postérieure à celle de la story 1.10 ; les anciennes sont intactes", () => {
    expect(FICHIERS).toEqual(["20261121200000_changer_statut.sql"]);
    const toutes = readdirSync(DOSSIER).filter((f) => f.endsWith(".sql")).sort();
    expect(toutes).toContain("20261121150000_detail_demande.sql");
    expect(toutes.indexOf("20261121200000_changer_statut.sql")).toBe(
      toutes.indexOf("20261121150000_detail_demande.sql") + 1,
    );
    // La 1.10 crée toujours sa version de lire_demande, et la 1.3 garde
    // l'auteur « demandeur » obligatoire à la création de la table.
    const detail = readFileSync(join(DOSSIER, "20261121150000_detail_demande.sql"), "utf8");
    expect(detail).toContain("create function public.lire_demande(p_reference text)");
    const depot = readFileSync(join(DOSSIER, "20261119180000_depot_demande.sql"), "utf8");
    expect(depot).toMatch(/auteur_libelle text not null/);
  });

  it("ne crée aucune table, n'ouvre aucune table et ne retire rien de l'historique (AD-3, AD-9)", () => {
    expect(SQL).not.toMatch(/create table|drop (table|function|index|trigger|policy)|truncate |create policy|delete /);
    expect(SQL).not.toMatch(/grant [a-z, ]+ on (table )?public\./);
    expect(SQL).not.toMatch(/update public\.evenements/);
    expect(SQL).not.toMatch(/drop constraint|drop column/);
  });

  it("trois fonctions : transition_statut_permise, changer_statut, et lire_demande remplacée", () => {
    const fonctions = [...SQL.matchAll(/create (or replace )?function public\.(\w+)/g)].map(([, remplace, nom]) =>
      remplace ? `${nom} (remplacée)` : nom,
    );
    expect(fonctions).toEqual(["transition_statut_permise", "changer_statut", "lire_demande (remplacée)"]);
  });
});

describe("colonnes et contraintes", () => {
  it("demandes.date_cloture : présente si et seulement si la demande est Traitée", () => {
    expect(SQL).toMatch(/alter table public\.demandes\s+add column date_cloture timestamptz;/);
    expect(SQL).toMatch(
      /add constraint demandes_date_cloture_check\s+check \(\(statut = 'traitee'\) = \(date_cloture is not null\)\);/,
    );
    // Les demandes déjà Traitée (aucune en principe) reçoivent une date
    // avant que la contrainte ne s'applique.
    expect(SQL.indexOf("set date_cloture = date_derniere_activite")).toBeGreaterThan(-1);
    expect(SQL.indexOf("set date_cloture = date_derniere_activite")).toBeLessThan(
      SQL.indexOf("demandes_date_cloture_check"),
    );
  });

  it("evenements.auteur_id : un profil, sans suppression en cascade (RM-10)", () => {
    expect(SQL).toMatch(
      /add column auteur_id uuid\s+constraint evenements_auteur_id_fkey\s+references public\.profils \(id\);/,
    );
    expect(SQL).not.toContain("cascade");
  });

  it("ancien et nouveau statut : les trois statuts seulement", () => {
    for (const colonne of ["ancien_statut", "nouveau_statut"]) {
      expect(SQL).toContain(
        `add column ${colonne} text\n    constraint evenements_${colonne}_check\n    check (${colonne} in ('nouvelle', 'en_cours', 'traitee'));`,
      );
    }
  });

  it("un seul auteur : utilisateur interne ou libellé", () => {
    expect(SQL).toMatch(/alter column auteur_libelle drop not null;/);
    expect(SQL).toMatch(/check \(num_nonnulls\(auteur_id, auteur_libelle\) = 1\)/);
  });

  it("un changement de statut va d'un statut à un autre, jamais vers Nouvelle (RM-4) ; les autres événements n'en ont pas", () => {
    const contrainte = SQL.match(/add constraint evenements_statut_check\s+check \(([\s\S]*?)\n    \);/)?.[1] ?? "";
    const texte = contrainte.replace(/\s+/g, " ").trim();
    expect(texte).toBe(
      "case when type = 'statut' then ancien_statut is not null and nouveau_statut is not null and ancien_statut <> nouveau_statut and nouveau_statut <> 'nouvelle' else ancien_statut is null and nouveau_statut is null end",
    );
  });
});

describe("transition_statut_permise (AD-5) : mêmes passages que TRANSITIONS_STATUT", () => {
  /** Les couples écrits dans la fonction. */
  const PASSAGES = [...TRANSITION.corps.matchAll(/\('(\w+)', '(\w+)'\)/g)].map(([, de, vers]) => `${de}>${vers}`);

  it("la fonction liste exactement les passages de la constante", () => {
    const constante = STATUTS.flatMap((de) => TRANSITIONS_STATUT[de].map((vers) => `${de}>${vers}`));
    expect([...PASSAGES].sort()).toEqual([...constante].sort());
    expect(PASSAGES).toHaveLength(4);
  });

  it.each(STATUTS.flatMap((de) => STATUTS.map((vers) => [de, vers] as const)))(
    "%s → %s : même réponse des deux côtés",
    (de, vers) => {
      expect(PASSAGES.includes(`${de}>${vers}`)).toBe(transitionsDepuis(de).includes(vers));
    },
  );

  it("jamais de passage vers Nouvelle, ni d'un statut vers lui-même", () => {
    for (const passage of PASSAGES) {
      const [de, vers] = passage.split(">");
      expect(vers).not.toBe("nouvelle");
      expect(vers).not.toBe(de);
    }
  });

  it("deux statuts, booléen, valeur absente : faux ; chemin vide ; exécutable par personne", () => {
    expect(TRANSITION.parametres).toBe("p_de text, p_vers text");
    expect(TRANSITION.entete).toMatch(/returns boolean language sql immutable set search_path = ''/);
    expect(TRANSITION.corps).toMatch(/select coalesce\(\(p_de, p_vers\) in \(/);
    expect(TRANSITION.corps).toMatch(/\), false\);\s*$/);
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_TRANSITION} from ${role};`);
    }
    expect(SQL).not.toMatch(new RegExp(`grant execute on function ${SIGNATURE_TRANSITION.replace(/[().]/g, "\\$&")}`));
  });
});

describe("changer_statut (FR-16, AD-2, AD-5)", () => {
  const { corps } = CHANGER;

  it("reçoit la référence, le statut vu et le statut demandé ; renvoie du jsonb", () => {
    expect(CHANGER.parametres).toBe("p_reference text, p_statut_vu text, p_nouveau_statut text");
    expect(CHANGER.entete).toMatch(/^returns jsonb language plpgsql security definer set search_path = '' $/);
  });

  it("vérifie l'appelant en premier et garde son identifiant comme auteur (AD-7)", () => {
    expect(corps).toMatch(/^\s*declare[\s\S]*?begin\s+v_auteur := public\.exiger_utilisateur_interne\(\);/);
  });

  it("exécutable par authenticated seul (AD-9)", () => {
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_CHANGER} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE_CHANGER} to authenticated;`);
  });

  it("refuse un retour à Nouvelle et tout statut inconnu, avant toute lecture (RM-4)", () => {
    expect(corps).toMatch(
      /if p_nouveau_statut is null or p_nouveau_statut not in \('en_cours', 'traitee'\) then\s+raise exception [^;]*?using errcode = 'nv301';/,
    );
    expect(corps).toMatch(
      /if p_statut_vu is null or p_statut_vu not in \('nouvelle', 'en_cours', 'traitee'\) then\s+raise exception [^;]*?using errcode = 'nv302';/,
    );
    expect(corps.indexOf("nv301")).toBeLessThan(corps.indexOf("from public.demandes"));
  });

  it("verrouille la demande (for update), cherchée par sa référence en majuscules", () => {
    expect(corps).toMatch(
      /select d\.id, d\.statut\s+into v_demande_id, v_statut\s+from public\.demandes d\s+where d\.reference = upper\(p_reference\)\s+for update;/,
    );
  });

  it("référence inconnue : introuvable, rien n'est écrit", () => {
    expect(corps).toMatch(
      /if v_demande_id is null then\s+return jsonb_build_object\('resultat', 'introuvable', 'statut', null, 'modifiee_par', null\);/,
    );
  });

  it("statut réel différent de celui vu : auteur (nom du profil, sans filtre sur actif) et date du dernier changement de statut", () => {
    const bloc = corps.match(/if v_statut <> p_statut_vu then([\s\S]*?)end if;/)?.[1] ?? "";
    expect(bloc).toMatch(/select jsonb_build_object\('nom', p\.nom, 'date', e\.date_creation\)\s+into v_modifiee_par/);
    expect(bloc).toMatch(/join public\.profils p on p\.id = e\.auteur_id/);
    expect(bloc).toMatch(/where e\.demande_id = v_demande_id\s+and e\.type = 'statut'/);
    expect(bloc).toMatch(/order by e\.date_creation desc, e\.id desc\s+limit 1;/);
    expect(bloc).not.toContain("actif");
  });

  it("statut déjà en place : inchange, rien n'est écrit (FR-16)", () => {
    expect(corps).toMatch(
      /if v_statut = p_nouveau_statut then\s+return jsonb_build_object\('resultat', 'inchange', 'statut', v_statut, 'modifiee_par', v_modifiee_par\);/,
    );
  });

  it("passage refusé depuis le statut réel, ou réouverture sans avoir vu Traitée : refuse", () => {
    expect(corps).toMatch(
      /if not public\.transition_statut_permise\(v_statut, p_nouveau_statut\)\s+or \(v_statut = 'traitee' and p_statut_vu <> 'traitee'\) then\s+return jsonb_build_object\('resultat', 'refuse', 'statut', v_statut, 'modifiee_par', v_modifiee_par\);/,
    );
  });

  it("l'ordre des décisions : introuvable, puis inchange, puis refuse, puis l'écriture", () => {
    const positions = ["'introuvable'", "'inchange'", "'refuse'", "update public.demandes", "insert into public.evenements", "'applique'"].map(
      (texte) => corps.indexOf(texte),
    );
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("applique : statut, date de clôture posée (Traitée) ou effacée, dernière activité, à la même heure", () => {
    expect(corps).toMatch(
      /update public\.demandes\s+set statut = p_nouveau_statut,\s+date_cloture = case when p_nouveau_statut = 'traitee' then v_maintenant end,\s+date_derniere_activite = v_maintenant\s+where id = v_demande_id;/,
    );
    expect(corps).toMatch(/v_maintenant timestamptz := now\(\);/);
  });

  it("applique : un événement « statut » au nom de l'appelant, avec le statut réel comme ancien statut (AD-5)", () => {
    const insertion = corps.match(/insert into public\.evenements \(([\s\S]*?)\)\s+values \(([\s\S]*?)\);/) ?? [];
    const colonnes = insertion[1]?.split(",").map((c) => c.trim());
    const valeurs = insertion[2]?.split(",").map((v) => v.trim());
    expect(colonnes).toEqual(["demande_id", "type", "auteur_id", "ancien_statut", "nouveau_statut", "date_creation"]);
    expect(valeurs).toEqual(["v_demande_id", "'statut'", "v_auteur", "v_statut", "p_nouveau_statut", "v_maintenant"]);
    expect(corps.match(/insert into/g)).toHaveLength(1);
    expect(corps.match(/update /g)).toHaveLength(1);
  });

  it("renvoie le résultat, le statut réel et qui l'a modifié", () => {
    expect(corps).toMatch(
      /return jsonb_build_object\('resultat', 'applique', 'statut', p_nouveau_statut, 'modifiee_par', v_modifiee_par\);\s*end;\s*$/,
    );
  });
});

describe("lire_demande remplacée (FR-15, FR-17)", () => {
  it("même signature, mêmes droits que la 1.10 (AD-7, AD-9)", () => {
    expect(LIRE.parametres).toBe("p_reference text");
    expect(LIRE.entete).toContain("returns jsonb");
    expect(LIRE.entete).toContain("stable");
    expect(LIRE.entete).toContain("security definer");
    expect(LIRE.entete).toContain("set search_path = ''");
    expect(LIRE.corps.trim()).toMatch(/^declare[\s\S]*?begin\s+perform public\.exiger_utilisateur_interne\(\);/);
    expect(LIRE.corps).not.toMatch(/insert |update |delete /);
    for (const role of ["public", "anon", "service_role"]) {
      expect(SQL).toContain(`revoke execute on function ${SIGNATURE_LIRE} from ${role};`);
    }
    expect(SQL).toContain(`grant execute on function ${SIGNATURE_LIRE} to authenticated;`);
  });

  it("renvoie la date de clôture et, pour chaque événement, l'auteur interne et les statuts", () => {
    const cles = [...LIRE.corps.matchAll(/'(\w+)', [a-z]\.\w+/g)].map(([, cle]) => cle);
    expect(cles).toEqual([
      "id",
      "reference",
      "nom",
      "email",
      "telephone",
      "entreprise",
      "objet",
      "description",
      "categorie",
      "canal",
      "statut",
      "date_depot",
      "date_cloture",
      "type",
      "auteur",
      "auteur_nom",
      "ancien_statut",
      "nouveau_statut",
      "date",
    ]);
    expect(LIRE.corps).toContain("'date_cloture', d.date_cloture");
    expect(LIRE.corps).toContain("'auteur_nom', p.nom");
  });

  it("nom de l'auteur lu dans profils, même désactivé ; historique trié comme en 1.10", () => {
    expect(LIRE.corps).toMatch(
      /order by e\.date_creation, e\.id\s*\)\s*from public\.evenements e\s+left join public\.profils p on p\.id = e\.auteur_id\s+where e\.demande_id = d\.id/,
    );
    expect(LIRE.corps).not.toContain("actif");
    expect(LIRE.corps).toContain("where d.reference = upper(p_reference);");
  });
});
