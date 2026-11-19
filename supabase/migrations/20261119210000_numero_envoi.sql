-- Numéro d'envoi : aucun double envoi (AD-2, AD-9, AD-16, AD-20)
--
-- Story 1.4. Le formulaire public tire au hasard un numéro d'envoi (UUID)
-- quand il s'affiche, et l'envoie avec la demande. Si la réponse se perd
-- (réseau coupé après l'enregistrement) et que la personne renvoie, le même
-- numéro revient : la base renvoie alors la demande déjà créée, au lieu d'en
-- créer une deuxième.
--
-- Cette migration :
--   1. ajoute la colonne `demandes.numero_envoi`, unique. Elle reste vide
--      pour les demandes déjà enregistrées (et pour celles créées par
--      l'ancienne fonction) : plusieurs valeurs vides ne se heurtent pas ;
--   2. crée une nouvelle `deposer_demande`, à 9 paramètres, qui reçoit ce
--      numéro et renvoie la référence, l'objet et l'email de la demande
--      (l'écran de confirmation P2 les affiche).
--
-- L'ancienne `deposer_demande` à 8 paramètres reste en place (AD-16 : on
-- n'efface pas une fonction dans la migration qui la remplace). Elle sera
-- retirée plus tard (voir deferred-work.md).

-- ---------------------------------------------------------------------------
-- 1. Colonne numero_envoi
-- ---------------------------------------------------------------------------

alter table public.demandes
  add column numero_envoi uuid
    constraint demandes_numero_envoi_unique unique;

comment on column public.demandes.numero_envoi is
  'Numéro d''envoi tiré par le formulaire (AD-20). Un second envoi avec le même numéro renvoie la demande déjà créée. Vide pour les demandes antérieures à la story 1.4.';

-- ---------------------------------------------------------------------------
-- 2. Fonction deposer_demande à 9 paramètres (AD-2, AD-4, AD-20)
-- ---------------------------------------------------------------------------

-- Seul chemin de création d'une demande déposée sur le formulaire public,
-- comme la précédente : `security definer`, chemin de recherche vide, et
-- seul `service_role` (la clé secrète, côté serveur) peut la lancer.
--
-- Dans une seule transaction, elle :
--   1. refuse un numéro d'envoi absent (refus imprévu : le serveur le
--      vérifie avant d'appeler) ;
--   2. verrouille ce numéro jusqu'à la fin de la transaction : deux envois
--      simultanés du même numéro passent l'un après l'autre ;
--   3. si une demande porte déjà ce numéro, la renvoie telle quelle, avant
--      toute vérification : rien n'est créé, aucun numéro de référence
--      n'est consommé ;
--   4. sinon, fait exactement ce que faisait la fonction précédente : refus
--      prévus NV001 / NV002, numéro suivant de l'année, demande, événement
--      « Demande créée » — en enregistrant en plus le numéro d'envoi.
--
-- Elle renvoie une ligne : la référence, l'objet et l'email de la demande.
--
-- Refus prévus, que le serveur traduit en erreur de saisie :
--   NV001 : case d'information non cochée ;
--   NV002 : catégorie inconnue ou désactivée.
create function public.deposer_demande(
  p_nom text,
  p_email text,
  p_telephone text,
  p_entreprise text,
  p_categorie_id uuid,
  p_objet text,
  p_description text,
  p_personne_informee boolean,
  p_numero_envoi uuid
)
returns table (reference text, objet text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maintenant timestamptz := now();
  v_annee integer := extract(year from (v_maintenant at time zone 'Europe/Paris'))::integer;
  v_numero integer;
  v_reference text;
  v_demande_id uuid;
begin
  if p_numero_envoi is null then
    raise exception 'Demande refusée : numéro d''envoi absent.';
  end if;

  -- Verrou propre à ce numéro, libéré à la fin de la transaction. Le second
  -- de deux envois simultanés attend ici, puis trouve la demande du premier.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_numero_envoi::text, 0)
  );

  -- Même numéro d'envoi : la demande existe déjà, on la renvoie.
  select d.reference, d.objet, d.email
    into reference, objet, email
    from public.demandes d
    where d.numero_envoi = p_numero_envoi;
  if found then
    return next;
    return;
  end if;

  if p_personne_informee is not true then
    raise exception 'Demande refusée : la case d''information sur les données n''est pas cochée (RM-12).'
      using errcode = 'NV001';
  end if;

  if not exists (
    select 1
    from public.categories c
    where c.id = p_categorie_id
      and c.active
  ) then
    raise exception 'Demande refusée : catégorie inconnue ou désactivée.'
      using errcode = 'NV002';
  end if;

  insert into public.compteurs_reference as c (annee, dernier_numero)
  values (v_annee, 1)
  on conflict (annee) do update
    set dernier_numero = c.dernier_numero + 1
  returning c.dernier_numero into v_numero;

  -- Au moins 4 chiffres : 0001, 0042, puis 10000 sans rien couper.
  v_reference := 'NOVA-' || v_annee::text || '-'
    || lpad(v_numero::text, greatest(4, length(v_numero::text)), '0');

  insert into public.demandes as d (
    reference,
    nom,
    email,
    telephone,
    entreprise,
    categorie_id,
    objet,
    description,
    canal,
    personne_informee,
    numero_envoi,
    date_depot,
    date_derniere_activite
  )
  values (
    v_reference,
    p_nom,
    p_email,
    nullif(btrim(p_telephone), ''),
    nullif(btrim(p_entreprise), ''),
    p_categorie_id,
    p_objet,
    p_description,
    'formulaire',
    true,
    p_numero_envoi,
    v_maintenant,
    v_maintenant
  )
  returning d.id, d.reference, d.objet, d.email
    into v_demande_id, reference, objet, email;

  insert into public.evenements (demande_id, type, auteur_libelle, date_creation)
  values (v_demande_id, 'creation', 'demandeur', v_maintenant);

  return next;
end;
$$;

revoke execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean, uuid) from public;
revoke execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean, uuid) from anon;
revoke execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean, uuid) from authenticated;
grant execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean, uuid) to service_role;
