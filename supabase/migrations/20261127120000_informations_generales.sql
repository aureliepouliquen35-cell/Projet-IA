-- Informations générales de l'écran A3, réservées aux administrateurs
-- (FR-31, RM-7, AD-2, AD-7, AD-9, AD-16)
--
-- Story 4.3. Fonction créée : `lire_parametres_administration`. Fonction
-- remplacée : `modifier_parametres` (story 1.5), ouverte aux
-- administrateurs.
--
-- Règles :
--   - réservées aux administrateurs (RM-7) : `lire_parametres_administration`
--     commence par `exiger_administrateur`, qui relit le rôle dans `profils`
--     (AD-7) et refuse tout autre appelant (NV202). La page A3, sa lecture et
--     la Server Function ont déjà fait le même contrôle : la base le refait ;
--   - `modifier_parametres` reste le seul chemin d'écriture dans `parametres`
--     (AD-2) : la table n'a aucune règle RLS d'écriture et aucun droit
--     direct. Elle a maintenant deux appelants :
--       * l'écran A3, avec la session de l'administrateur (rôle
--         `authenticated`, jamais la clé secrète, AD-9) : `auth.uid()` est
--         renseigné, et la fonction refait alors le contrôle administrateur
--         (NV202) avant tout le reste ;
--       * la procédure d'installation (`npm run parametres:installer`,
--         story 1.5), avec la clé secrète (`service_role`) : `auth.uid()`
--         est vide, et ce droit d'exécution reste la vérification de
--         l'appelant. `anon` n'a pas le droit d'exécuter la fonction : un
--         appel sans session ne peut donc pas passer pour l'installation ;
--   - mêmes vérifications qu'avant : email de contact mal formé (NV103),
--     ligne absente (NV104), téléphone vide enregistré `null`, contact
--     données vide refusé par les contraintes de la table (23514), absent
--     (`null`) par `not null` (23502). Le retour reste `void` ;
--   - rien n'est écrit au journal ici : `parametres_modifies` est écrit par
--     l'application (`journaliser()`), sans les valeurs saisies ;
--   - `security definer`, au chemin de recherche vide.
--
-- Le formulaire public P1 et la confirmation P2 relisent `parametres` à
-- chaque affichage : un changement y est visible aussitôt. Les anciennes
-- migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Fonction lire_parametres_administration (FR-31, écran A3)
-- ---------------------------------------------------------------------------

-- Les trois informations générales de l'unique ligne de `parametres`, pour
-- remplir les champs de l'écran A3.
--
-- Renvoie un objet jsonb :
--   { "telephone", "email_contact", "contact_donnees" }
-- `telephone` vaut `null` s'il n'est pas renseigné.
--
-- Refus prévus :
--   NV202 : appelant qui n'est pas un administrateur actif ;
--   NV104 : la ligne de `parametres` n'existe pas.
create function public.lire_parametres_administration()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parametres jsonb;
begin
  perform public.exiger_administrateur();

  select jsonb_build_object(
    'telephone', p.telephone,
    'email_contact', p.email_contact,
    'contact_donnees', p.contact_donnees
  )
  into v_parametres
  from public.parametres p
  limit 1;

  if v_parametres is null then
    raise exception 'Paramètres introuvables : la ligne des informations générales est absente.'
      using errcode = 'NV104';
  end if;

  return v_parametres;
end;
$$;

revoke execute on function public.lire_parametres_administration() from public;
revoke execute on function public.lire_parametres_administration() from anon;
revoke execute on function public.lire_parametres_administration() from service_role;
grant execute on function public.lire_parametres_administration() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fonction modifier_parametres (FR-31), ouverte aux administrateurs
-- ---------------------------------------------------------------------------

-- Remplace les informations générales de l'unique ligne de `parametres`
-- (téléphone facultatif, email de contact, contact pour les données
-- personnelles), espaces de bord retirés.
--
-- Refus prévus :
--   NV202 : appel avec une session (`auth.uid()` renseigné) d'une personne
--           qui n'est pas un administrateur actif ;
--   NV103 : email de contact mal formé ;
--   NV104 : la ligne de `parametres` n'existe pas.
-- Un contact données vide heurte la contrainte de la table (code 23514) ;
-- absent (`null`), il heurte `not null` (code 23502).
create or replace function public.modifier_parametres(
  p_telephone text,
  p_email_contact text,
  p_contact_donnees text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lignes integer;
begin
  -- Avec une session : l'écran A3, réservé aux administrateurs. Sans
  -- session : la clé secrète de l'installation (`anon` n'a pas le droit
  -- d'exécuter la fonction).
  if auth.uid() is not null then
    perform public.exiger_administrateur();
  end if;

  -- Même forme que `FORME_EMAIL` (src/shared/constantes.ts).
  if p_email_contact is null or btrim(p_email_contact) !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Paramètres refusés : email de contact mal formé.'
      using errcode = 'NV103';
  end if;

  update public.parametres
  set telephone = nullif(btrim(p_telephone), ''),
      email_contact = btrim(p_email_contact),
      contact_donnees = btrim(p_contact_donnees),
      date_modification = now()
  where true;

  get diagnostics v_lignes = row_count;
  if v_lignes <> 1 then
    raise exception 'Paramètres refusés : la ligne des informations générales est absente.'
      using errcode = 'NV104';
  end if;
end;
$$;

revoke execute on function public.modifier_parametres(text, text, text) from public;
revoke execute on function public.modifier_parametres(text, text, text) from anon;
grant execute on function public.modifier_parametres(text, text, text) to service_role;
grant execute on function public.modifier_parametres(text, text, text) to authenticated;
