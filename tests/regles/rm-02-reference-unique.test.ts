import { afterEach, describe, expect, it, vi } from "vitest";

// RM-2 : chaque demande a une référence unique qui ne change jamais.
// AD-4 : elle est calculée par la base, au format NOVA-AAAA-NNNN, à partir
// d'un compteur annuel verrouillé ; l'application ne la calcule jamais.
// AD-20 (story 1.4) : un second envoi du même numéro d'envoi ne crée pas de
// deuxième demande, donc pas de deuxième référence.

const simulation = vi.hoisted(() => {
  const ligne = { reference: "NOVA-2026-0042", objet: "Objet", email: "claire@exemple.fr" };
  const retour = { data: [ligne] as unknown, error: null };
  const rpc = vi.fn(() => ({ abortSignal: vi.fn(() => Promise.resolve(retour)) }));
  return { ligne, retour, rpc, creerClientSecret: vi.fn(() => ({ rpc })) };
});

vi.mock("@/server/supabase-secret", () => ({
  creerClientSecret: simulation.creerClientSecret,
}));

import { deposerDemande } from "@/server/depot";
import { FORME_REFERENCE } from "@/shared/constantes";
import { validerDepot } from "@/shared/schemas/depot";

import { NUMERO_ENVOI, SAISIE_DE_CLAIRE } from "../aides/formulaire-depot";
import {
  BRUT,
  BRUT_NUMERO_ENVOI,
  definitionColonne,
  fonctionDeposerDemande,
  fonctionDeposerDemandeEnvoi,
  SQL,
  SQL_NUMERO_ENVOI,
} from "../aides/migration-depot";

const donnees = (() => {
  const validation = validerDepot(SAISIE_DE_CLAIRE);
  if (!validation.ok) throw new Error("la saisie de Claire doit être correcte");
  return validation.donnees;
})();

afterEach(() => {
  vi.clearAllMocks();
  simulation.retour.data = [simulation.ligne];
});

/** Ce que la base renvoie pour une référence donnée. */
const ligneAvec = (reference: unknown) => [{ ...simulation.ligne, reference }];

describe("RM-2 — référence unique", () => {
  it("la base interdit deux demandes avec la même référence", () => {
    expect(definitionColonne("demandes", "reference")).toMatch(/^text not null constraint \w+ unique /);
  });

  it("la base n'accepte que la forme NOVA-AAAA-NNNN (au moins 4 chiffres)", () => {
    // Texte d'origine : « NOVA » est en majuscules.
    expect(BRUT).toContain("check (reference ~ '^NOVA-[0-9]{4}-[0-9]{4,}$')");
  });

  it("le numéro vient d'un compteur par année, verrouillé pendant la transaction", () => {
    expect(definitionColonne("compteurs_reference", "annee")).toMatch(
      /^integer not null constraint \w+ unique /,
    );
    const { corps } = fonctionDeposerDemande();
    // Une seule instruction crée la ligne de l'année ou l'augmente de 1 : la
    // ligne reste verrouillée jusqu'à la fin de la transaction, un second
    // dépôt simultané attend son tour.
    expect(corps).toMatch(
      /insert into public\.compteurs_reference as c \(annee, dernier_numero\)\s+values \(v_annee, 1\)\s+on conflict \(annee\) do update\s+set dernier_numero = c\.dernier_numero \+ 1\s+returning c\.dernier_numero into v_numero;/,
    );
    // Le numéro repart à 1 chaque année, comptée à l'heure de Paris.
    expect(corps).toContain("extract(year from (v_maintenant at time zone 'europe/paris'))");
  });

  it("le numéro est écrit sur 4 chiffres au moins, et jamais coupé au-delà de 9999", () => {
    expect(BRUT.replace(/\s+/g, " ")).toContain(
      "v_reference := 'NOVA-' || v_annee::text || '-' || lpad(v_numero::text, greatest(4, length(v_numero::text)), '0');",
    );
  });

  it("le compteur est pris après les refus, et avant d'écrire la demande", () => {
    const { corps } = fonctionDeposerDemande();
    const compteur = corps.indexOf("insert into public.compteurs_reference");
    expect(compteur).toBeGreaterThan(corps.indexOf("errcode = 'nv002'"));
    expect(corps.indexOf("insert into public.demandes")).toBeGreaterThan(compteur);
  });

  it("personne d'autre que les fonctions SQL ne touche au compteur", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke all on table public.compteurs_reference from ${role};`);
    }
    expect(SQL).not.toMatch(/grant [^;]*compteurs_reference/);
  });
});

describe("RM-2 — la référence ne change jamais", () => {
  it("un déclencheur refuse toute modification de la référence", () => {
    expect(SQL).toMatch(
      /create trigger \w+\s+before update of reference on public\.demandes\s+for each row\s+when \(old\.reference is distinct from new\.reference\)\s+execute function public\.refuser_changement_reference\(\);/,
    );
    const fonction = SQL.match(
      /create function public\.refuser_changement_reference\(\)\s+returns trigger[\s\S]*?as \$\$([\s\S]*?)\$\$;/,
    );
    expect(fonction?.[1]).toMatch(/begin\s+raise exception '[^;]*';\s+end;/);
  });

  it("aucun droit direct sur la table des demandes, pour personne", () => {
    for (const role of ["public", "anon", "authenticated", "service_role"]) {
      expect(SQL).toContain(`revoke all on table public.demandes from ${role};`);
    }
    expect(SQL).not.toMatch(/grant [^;]*public\.demandes/);
  });
});

describe("AD-4 — l'application ne calcule jamais la référence", () => {
  it("elle n'envoie aucune référence et renvoie telle quelle celle de la base", async () => {
    await expect(deposerDemande(donnees, NUMERO_ENVOI)).resolves.toEqual({ ok: true, ...simulation.ligne });
    const [, charge] = simulation.rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(JSON.stringify(charge)).not.toMatch(/NOVA|reference/i);
  });

  it("elle accepte un numéro de plus de 4 chiffres", async () => {
    simulation.retour.data = ligneAvec("NOVA-2026-10000");
    await expect(deposerDemande(donnees, NUMERO_ENVOI)).resolves.toMatchObject({ ok: true, reference: "NOVA-2026-10000" });
  });

  it("elle refuse une réponse qui n'a pas la forme d'une référence, plutôt que d'en inventer une", async () => {
    for (const reference of [null, undefined, "", "0042", "NOVA-2026-42", "nova-2026-0042", 42, ["NOVA-2026-0042"]]) {
      simulation.retour.data = ligneAvec(reference);
      await expect(deposerDemande(donnees, NUMERO_ENVOI)).rejects.toThrow(/référence/);
    }
    for (const data of [null, "NOVA-2026-0042", [], ["NOVA-2026-0042"], [...ligneAvec("NOVA-2026-0042"), ...ligneAvec("NOVA-2026-0043")]]) {
      simulation.retour.data = data;
      await expect(deposerDemande(donnees, NUMERO_ENVOI)).rejects.toThrow(/référence/);
    }
  });

  it("la forme attendue par l'application est celle que la base impose", () => {
    expect(FORME_REFERENCE.source).toBe("^NOVA-\\d{4}-\\d{4,}$");
    for (const reference of ["NOVA-2026-0001", "NOVA-2026-0042", "NOVA-2027-10000"]) {
      expect(FORME_REFERENCE.test(reference)).toBe(true);
    }
  });
});

describe("RM-2 et AD-20 — un second envoi ne crée pas de deuxième référence", () => {
  it("la fonction à numéro d'envoi calcule la référence exactement comme la précédente", () => {
    const { corps } = fonctionDeposerDemandeEnvoi();
    expect(corps).toMatch(
      /insert into public\.compteurs_reference as c \(annee, dernier_numero\)\s+values \(v_annee, 1\)\s+on conflict \(annee\) do update\s+set dernier_numero = c\.dernier_numero \+ 1\s+returning c\.dernier_numero into v_numero;/,
    );
    expect(corps).toContain("extract(year from (v_maintenant at time zone 'europe/paris'))");
    expect(BRUT_NUMERO_ENVOI.replace(/\s+/g, " ")).toContain(
      "v_reference := 'NOVA-' || v_annee::text || '-' || lpad(v_numero::text, greatest(4, length(v_numero::text)), '0');",
    );
  });

  it("un numéro d'envoi ne peut porter qu'une demande", () => {
    expect(SQL_NUMERO_ENVOI).toMatch(
      /alter table public\.demandes\s+add column numero_envoi uuid\s+constraint demandes_numero_envoi_unique unique;/,
    );
  });

  it("même numéro : la demande existante est renvoyée avant de prendre un numéro de référence", () => {
    const { corps } = fonctionDeposerDemandeEnvoi();
    const recherche = corps.indexOf("where d.numero_envoi = p_numero_envoi");
    const compteur = corps.indexOf("insert into public.compteurs_reference");
    expect(recherche).toBeGreaterThan(-1);
    expect(compteur).toBeGreaterThan(recherche);
    // Trouvée : elle est renvoyée et la fonction s'arrête là.
    expect(corps.slice(recherche, compteur)).toMatch(/if found then\s+return next;\s+return;\s+end if;/);
  });

  it("deux envois simultanés du même numéro passent l'un après l'autre (verrou par numéro)", () => {
    const { corps } = fonctionDeposerDemandeEnvoi();
    const verrou = corps.indexOf("pg_catalog.pg_advisory_xact_lock(");
    expect(verrou).toBeGreaterThan(-1);
    // Verrou de transaction, propre au numéro, pris avant la recherche.
    expect(corps).toMatch(/pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\(p_numero_envoi::text, 0\)\s*\);/);
    expect(verrou).toBeLessThan(corps.indexOf("where d.numero_envoi = p_numero_envoi"));
  });

  it("la demande créée garde son numéro d'envoi, et la fonction renvoie sa référence", () => {
    const { entete, corps } = fonctionDeposerDemandeEnvoi();
    expect(entete).toContain("returns table (reference text, objet text, email text)");
    expect(corps).toMatch(/returning d\.id, d\.reference, d\.objet, d\.email\s+into v_demande_id, reference, objet, email;/);
    const colonnes = corps.match(/insert into public\.demandes as d \(([\s\S]*?)\)/)?.[1].split(",").map((c) => c.trim());
    expect(colonnes).toContain("numero_envoi");
    expect(colonnes).toContain("reference");
  });

  it("l'ancienne fonction n'est pas modifiée, et rien ne touche plus à la référence", () => {
    expect(SQL_NUMERO_ENVOI).not.toMatch(/drop |create or replace|alter function|update public\.demandes/);
    expect(SQL).toContain("create trigger demandes_reference_immuable");
  });
});
