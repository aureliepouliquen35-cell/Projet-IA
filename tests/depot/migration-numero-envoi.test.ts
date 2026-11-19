import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CODES_REFUS_PREVUS } from "@/server/depot";

import {
  BRUT,
  BRUT_NUMERO_ENVOI,
  DOSSIER_MIGRATIONS,
  FICHIERS_DEPOT,
  FICHIERS_NUMERO_ENVOI,
  fonctionDeposerDemande,
  fonctionDeposerDemandeEnvoi,
  SIGNATURE_DEPOSER_DEMANDE,
  SIGNATURE_DEPOSER_DEMANDE_ENVOI,
  SQL,
  SQL_NUMERO_ENVOI,
} from "../aides/migration-depot";

// Story 1.4 : la migration « numéro d'envoi » (AD-2, AD-9, AD-16, AD-20).
// Ces tests lisent le texte SQL ; le comportement réel a été essayé sur dev
// dans une transaction annulée (voir le compte rendu de la story).

describe("migration numéro d'envoi", () => {
  it("existe une seule fois, après la migration du dépôt, sans toucher à celle-ci (AD-16)", () => {
    expect(FICHIERS_NUMERO_ENVOI).toEqual(["20261119210000_numero_envoi.sql"]);
    expect(FICHIERS_NUMERO_ENVOI[0] > FICHIERS_DEPOT[0]).toBe(true);
    // Nommée selon la convention de la Supabase CLI.
    expect(readdirSync(DOSSIER_MIGRATIONS)).toContain(FICHIERS_NUMERO_ENVOI[0]);
    expect(FICHIERS_NUMERO_ENVOI[0]).toMatch(/^\d{14}_[a-z_]+\.sql$/);
    // L'ancienne fonction reste en place, avec ses droits.
    expect(SQL).toContain(`grant execute on function ${SIGNATURE_DEPOSER_DEMANDE} to service_role;`);
    expect(SQL_NUMERO_ENVOI).not.toMatch(/\bdrop\b|create or replace|alter function/);
  });

  it("ajoute la colonne numero_envoi : UUID unique, vide pour les demandes existantes", () => {
    expect(SQL_NUMERO_ENVOI).toMatch(
      /alter table public\.demandes\s+add column numero_envoi uuid\s+constraint demandes_numero_envoi_unique unique;/,
    );
    // Facultative : ni « not null », ni valeur par défaut.
    const colonne = SQL_NUMERO_ENVOI.match(/add column numero_envoi ([^;]*);/)?.[1] ?? "";
    expect(colonne).not.toMatch(/not null|default/);
  });

  it("ne crée aucune table et ne donne aucun droit sur les tables", () => {
    expect(SQL_NUMERO_ENVOI).not.toMatch(/create table|create policy|grant [^;]* on table/);
    const droits = [...SQL_NUMERO_ENVOI.matchAll(/^grant [^;]*;/gm)].map(([droit]) => droit);
    expect(droits).toEqual([`grant execute on function ${SIGNATURE_DEPOSER_DEMANDE_ENVOI} to service_role;`]);
  });
});

describe("deposer_demande à 9 paramètres (AD-2, AD-9, AD-20)", () => {
  const { parametres, entete, corps } = fonctionDeposerDemandeEnvoi();

  it("reçoit les 8 paramètres de la précédente, plus le numéro d'envoi (UUID)", () => {
    expect(parametres).toEqual([...fonctionDeposerDemande().parametres, "p_numero_envoi"]);
    expect(SQL_NUMERO_ENVOI).toMatch(/p_numero_envoi uuid\s*\)/);
  });

  it("renvoie la référence, l'objet et l'email", () => {
    expect(entete).toContain("returns table (reference text, objet text, email text)");
  });

  it("est protégée : security definer, search_path vide, exécution par service_role seul", () => {
    expect(entete).toContain("language plpgsql");
    expect(entete).toContain("security definer");
    expect(entete).toContain("set search_path = ''");
    for (const role of ["public", "anon", "authenticated"]) {
      expect(SQL_NUMERO_ENVOI).toContain(`revoke execute on function ${SIGNATURE_DEPOSER_DEMANDE_ENVOI} from ${role};`);
    }
    expect(SQL_NUMERO_ENVOI).toContain(`grant execute on function ${SIGNATURE_DEPOSER_DEMANDE_ENVOI} to service_role;`);
  });

  it("désigne chaque objet avec son schéma (chemin de recherche vide)", () => {
    const objets = [...corps.matchAll(/\b(?:from|into|join)\s+([a-z_.]+)/g)]
      .map(([, nom]) => nom)
      .filter((nom) => !nom.startsWith("v_") && !["reference"].includes(nom));
    expect(objets.length).toBeGreaterThanOrEqual(5);
    for (const objet of objets) expect(objet).toMatch(/^public\./);
    // Fonctions du système, elles aussi désignées avec leur schéma.
    expect(corps).toContain("pg_catalog.pg_advisory_xact_lock(");
    expect(corps).toContain("pg_catalog.hashtextextended(");
  });

  it("refuse un numéro d'envoi absent, avant tout le reste (refus imprévu, sans code)", () => {
    expect(corps).toMatch(/^\s*declare[\s\S]*?begin\s+if p_numero_envoi is null then\s+raise exception '[^;]*';\s+end if;/);
  });

  it("ordre : verrou du numéro, recherche de la demande existante, refus prévus, puis écritures", () => {
    const etapes = [
      corps.indexOf("pg_advisory_xact_lock"),
      corps.indexOf("where d.numero_envoi = p_numero_envoi"),
      corps.indexOf("errcode = 'nv001'"),
      corps.indexOf("errcode = 'nv002'"),
      corps.indexOf("insert into public.compteurs_reference"),
      corps.indexOf("insert into public.demandes"),
      corps.indexOf("insert into public.evenements"),
    ];
    for (const etape of etapes) expect(etape).toBeGreaterThan(-1);
    expect([...etapes].sort((a, b) => a - b)).toEqual(etapes);
  });

  it("garde les mêmes refus prévus que le serveur traduit (NV001, NV002)", () => {
    const [, brut = ""] =
      BRUT_NUMERO_ENVOI.match(/create function public\.deposer_demande\([\s\S]*?as \$\$([\s\S]*?)\$\$;/) ?? [];
    const codes = [...brut.matchAll(/errcode\s*=\s*'([^']*)'/gi)].map(([, code]) => code);
    expect([...codes].sort()).toEqual([...CODES_REFUS_PREVUS].sort());
  });

  it("crée la demande comme la précédente, en plus avec son numéro d'envoi", () => {
    const colonnes = corps
      .match(/insert into public\.demandes as d \(([\s\S]*?)\)\s+values/)?.[1]
      .split(",")
      .map((c) => c.trim());
    expect(colonnes).toEqual([
      "reference",
      "nom",
      "email",
      "telephone",
      "entreprise",
      "categorie_id",
      "objet",
      "description",
      "canal",
      "personne_informee",
      "numero_envoi",
      "date_depot",
      "date_derniere_activite",
    ]);
    const valeurs = corps.match(/insert into public\.demandes as d \([\s\S]*?\)\s+values \(([\s\S]*?)\)\s+returning/)?.[1] ?? "";
    expect(valeurs).toContain("'formulaire'");
    expect(valeurs).toContain("nullif(btrim(p_telephone), '')");
    expect(valeurs).toContain("p_numero_envoi");
    expect(corps).toMatch(
      /insert into public\.evenements \(demande_id, type, auteur_libelle, date_creation\)\s+values \(v_demande_id, 'creation', 'demandeur', v_maintenant\);/,
    );
    // Trois écritures seulement, et jamais de modification ni de suppression.
    expect(corps.match(/insert into/g)).toHaveLength(3);
    expect(corps).not.toMatch(/\bupdate public\.|\bdelete\b|\btruncate\b/);
  });

  it("renvoie la demande existante telle quelle, sans rien écrire", () => {
    const recherche = corps.match(
      /select d\.reference, d\.objet, d\.email\s+into reference, objet, email\s+from public\.demandes d\s+where d\.numero_envoi = p_numero_envoi;\s+if found then\s+return next;\s+return;\s+end if;/,
    );
    expect(recherche).not.toBeNull();
  });

  it("ne lit dans la demande existante que la référence, l'objet et l'email", () => {
    const lectures = [...corps.matchAll(/select ([^;]*?)\s+(?:into|from)/g)].map(([, colonnes]) => colonnes.trim());
    expect(lectures).toEqual(["d.reference, d.objet, d.email", "1"]);
  });

  it("la migration précédente n'a pas de numéro d'envoi : ce texte vient bien de la nouvelle", () => {
    expect(BRUT).not.toContain("numero_envoi");
  });
});
