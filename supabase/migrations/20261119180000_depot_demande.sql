-- Dépôt d'une demande (AD-2, AD-4, AD-9, AD-11, AD-16)
--
-- Tables créées : `categories`, `parametres`, `compteurs_reference`,
-- `demandes`, `evenements`. Elles reçoivent les demandes déposées sur le
-- formulaire public (story 1.3).
--
-- Règles :
--   - une demande n'est créée que par la fonction `deposer_demande`, appelée
--     par le seul module `src/server/depot` avec la clé secrète (AD-2, AD-9).
--     Elle attribue la référence `NOVA-AAAA-NNNN` (AD-4) et écrit l'événement
--     « Demande créée » dans la même transaction ;
--   - RLS activé sur les cinq tables, sans aucune règle : rien n'est permis.
--     Tous les droits directs sont retirés, y compris à `service_role` (qui
--     ignore le RLS : seul le retrait des droits l'arrête). Seule exception :
--     `service_role` peut lire `categories` et `parametres`, pour afficher le
--     formulaire ;
--   - les limites de longueur sont celles du PRD (FR-1), les mêmes que dans
--     le schéma de validation `src/shared/schemas/depot.ts` (AD-11) ;
--   - les valeurs fermées sont écrites en minuscules, sans accent.
--
-- Les règles de lecture pour les utilisateurs internes, les index de la
-- liste, les colonnes d'attribution, de clôture et d'anonymisation, et
-- l'auteur interne d'un événement arrivent avec les stories qui en ont
-- besoin.

-- ---------------------------------------------------------------------------
-- 1. Catégories
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null
    constraint categories_nom_check
    check (btrim(nom) <> ''),
  active boolean not null default true,
  -- Ordre d'affichage dans les listes : l'ordre de création.
  ordre integer generated always as identity,
  date_creation timestamptz not null default now()
);

comment on table public.categories is
  'Catégories des demandes (FR-26). Une catégorie désactivée n''est plus proposée mais reste sur les demandes existantes (RM-11).';

-- Deux catégories actives ne peuvent pas porter le même nom (FR-26).
create unique index categories_nom_actif_unique
  on public.categories (lower(nom))
  where active;

-- Les cinq catégories de départ (FR-26), dans l'ordre du PRD.
insert into public.categories (nom) values ('Demande d''information');
insert into public.categories (nom) values ('Problème technique');
insert into public.categories (nom) values ('Demande de rendez-vous');
insert into public.categories (nom) values ('Question administrative');
insert into public.categories (nom) values ('Autre');

-- ---------------------------------------------------------------------------
-- 2. Paramètres (informations générales, FR-31)
-- ---------------------------------------------------------------------------

create table public.parametres (
  id uuid primary key default gen_random_uuid(),
  telephone text
    constraint parametres_telephone_check
    check (btrim(telephone) <> ''),
  email_contact text not null
    constraint parametres_email_contact_check
    check (btrim(email_contact) <> ''),
  -- Contact pour les données personnelles, affiché dans la mention du
  -- formulaire (FR-5).
  contact_donnees text not null
    constraint parametres_contact_donnees_check
    check (btrim(contact_donnees) <> ''),
  date_modification timestamptz not null default now()
);

comment on table public.parametres is
  'Informations générales affichées aux demandeurs (FR-31). Une seule ligne.';

-- Une seule ligne : toute deuxième ligne heurte cet index.
create unique index parametres_ligne_unique
  on public.parametres ((true));

-- Valeurs d'exemple, clairement fictives. En production, elles sont
-- remplacées par les vraies coordonnées de Nova (procédure de la story 1.5).
insert into public.parametres (telephone, email_contact, contact_donnees)
values (
  '01 99 00 00 00',
  'contact@nova-services.example',
  'donnees@nova-services.example'
);

-- ---------------------------------------------------------------------------
-- 3. Compteurs des références (AD-4)
-- ---------------------------------------------------------------------------

create table public.compteurs_reference (
  id uuid primary key default gen_random_uuid(),
  annee integer not null
    constraint compteurs_reference_annee_unique unique
    constraint compteurs_reference_annee_check
    check (annee between 2000 and 9999),
  dernier_numero integer not null
    constraint compteurs_reference_dernier_numero_check
    check (dernier_numero >= 1)
);

comment on table public.compteurs_reference is
  'Dernier numéro de référence attribué, par année (AD-4). Modifié uniquement par les fonctions qui créent une demande.';

-- ---------------------------------------------------------------------------
-- 4. Demandes
-- ---------------------------------------------------------------------------

create table public.demandes (
  id uuid primary key default gen_random_uuid(),
  -- RM-2 : unique, attribuée par la base, jamais modifiée (voir le
  -- déclencheur plus bas).
  reference text not null
    constraint demandes_reference_unique unique
    constraint demandes_reference_check
    check (reference ~ '^NOVA-[0-9]{4}-[0-9]{4,}$'),
  nom text not null
    constraint demandes_nom_check
    check (char_length(nom) between 1 and 100),
  email text not null
    constraint demandes_email_check
    check (char_length(email) between 1 and 100),
  telephone text
    constraint demandes_telephone_check
    check (char_length(telephone) between 1 and 30),
  entreprise text
    constraint demandes_entreprise_check
    check (char_length(entreprise) between 1 and 100),
  categorie_id uuid not null
    constraint demandes_categorie_id_fkey
    references public.categories (id),
  objet text not null
    constraint demandes_objet_check
    check (char_length(objet) between 1 and 150),
  description text not null
    constraint demandes_description_check
    check (char_length(description) between 10 and 5000),
  canal text not null
    constraint demandes_canal_check
    check (canal in ('formulaire', 'telephone', 'email')),
  -- RM-1 : une demande créée est toujours « nouvelle » et « normale ».
  statut text not null default 'nouvelle'
    constraint demandes_statut_check
    check (statut in ('nouvelle', 'en_cours', 'traitee')),
  priorite text not null default 'normale'
    constraint demandes_priorite_check
    check (priorite in ('normale', 'urgente')),
  -- RM-12 : aucune demande sans que la personne ait été informée de l'usage
  -- de ses données. La colonne ne peut contenir que « vrai ».
  personne_informee boolean not null
    constraint demandes_personne_informee_check
    check (personne_informee),
  date_depot timestamptz not null default now(),
  date_derniere_activite timestamptz not null default now()
);

comment on table public.demandes is
  'Demandes des clients. Création uniquement par deposer_demande (AD-2). Contient des données personnelles.';

-- RM-2 : la référence ne change jamais, quelle que soit la fonction qui
-- modifiera une demande plus tard.
create function public.refuser_changement_reference()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La référence d''une demande ne change jamais (RM-2).';
end;
$$;

revoke execute on function public.refuser_changement_reference() from public;
revoke execute on function public.refuser_changement_reference() from anon;
revoke execute on function public.refuser_changement_reference() from authenticated;
revoke execute on function public.refuser_changement_reference() from service_role;

create trigger demandes_reference_immuable
  before update of reference on public.demandes
  for each row
  when (old.reference is distinct from new.reference)
  execute function public.refuser_changement_reference();

-- ---------------------------------------------------------------------------
-- 5. Événements (historique d'une demande, FR-17)
-- ---------------------------------------------------------------------------

create table public.evenements (
  id uuid primary key default gen_random_uuid(),
  -- L'historique est supprimé avec sa demande (FR-28).
  demande_id uuid not null
    constraint evenements_demande_id_fkey
    references public.demandes (id) on delete cascade,
  type text not null
    constraint evenements_type_check
    check (type in (
      'creation',
      'statut',
      'attribution',
      'priorite',
      'commentaire',
      'anonymisation'
    )),
  -- Auteur qui n'est pas un utilisateur interne. La colonne de l'auteur
  -- interne arrive avec la table `profils` (story 1.5).
  auteur_libelle text not null
    constraint evenements_auteur_libelle_check
    check (auteur_libelle in ('demandeur', 'systeme')),
  date_creation timestamptz not null default now()
);

comment on table public.evenements is
  'Historique des demandes (FR-17). Ajout seulement, par les fonctions SQL d''AD-2 ; jamais modifié (AD-3).';

-- ---------------------------------------------------------------------------
-- 6. Droits (AD-9)
-- ---------------------------------------------------------------------------

-- Rien n'est permis sauf ce qui est écrit : aucune règle, donc aucun accès.
alter table public.categories enable row level security;
alter table public.parametres enable row level security;
alter table public.compteurs_reference enable row level security;
alter table public.demandes enable row level security;
alter table public.evenements enable row level security;

-- Aucun droit direct sur les tables, pour personne.
revoke all on table public.categories from public;
revoke all on table public.categories from anon;
revoke all on table public.categories from authenticated;
revoke all on table public.categories from service_role;

revoke all on table public.parametres from public;
revoke all on table public.parametres from anon;
revoke all on table public.parametres from authenticated;
revoke all on table public.parametres from service_role;

revoke all on table public.compteurs_reference from public;
revoke all on table public.compteurs_reference from anon;
revoke all on table public.compteurs_reference from authenticated;
revoke all on table public.compteurs_reference from service_role;

revoke all on table public.demandes from public;
revoke all on table public.demandes from anon;
revoke all on table public.demandes from authenticated;
revoke all on table public.demandes from service_role;

revoke all on table public.evenements from public;
revoke all on table public.evenements from anon;
revoke all on table public.evenements from authenticated;
revoke all on table public.evenements from service_role;

-- Compteur interne de la colonne `categories.ordre`.
revoke all on sequence public.categories_ordre_seq from public;
revoke all on sequence public.categories_ordre_seq from anon;
revoke all on sequence public.categories_ordre_seq from authenticated;
revoke all on sequence public.categories_ordre_seq from service_role;

-- Seule lecture permise : le formulaire public est affiché par le serveur,
-- avec la clé secrète (`lireFormulaireDepot`, src/server/depot).
grant select on table public.categories to service_role;
grant select on table public.parametres to service_role;

-- ---------------------------------------------------------------------------
-- 7. Fonction deposer_demande (AD-2, AD-4)
-- ---------------------------------------------------------------------------

-- Seul chemin de création d'une demande déposée sur le formulaire public.
-- La fonction s'exécute avec les droits de son propriétaire (`security
-- definer`), avec un chemin de recherche vide. Seul `service_role` (la clé
-- secrète, côté serveur) peut la lancer : ce droit d'exécution est la
-- vérification de l'appelant.
--
-- Dans une seule transaction, elle :
--   1. refuse la demande si la case d'information n'est pas cochée (RM-12)
--      ou si la catégorie n'est pas active ;
--   2. prend le numéro suivant de l'année en cours (heure de Paris) dans
--      `compteurs_reference`, dont la ligne reste verrouillée jusqu'à la fin
--      de la transaction : deux dépôts simultanés n'ont jamais le même
--      numéro, et un dépôt refusé ne consomme aucun numéro ;
--   3. crée la demande : canal « formulaire », statut « nouvelle » et
--      priorité « normale » (valeurs par défaut de la table, RM-1) ;
--   4. écrit l'événement « Demande créée » par le demandeur.
--
-- Elle renvoie la référence attribuée.
--
-- Refus prévus, que le serveur traduit en erreur de saisie :
--   NV001 : case d'information non cochée ;
--   NV002 : catégorie inconnue ou désactivée.
-- Tout autre refus (limite de longueur dépassée, par exemple) est imprévu :
-- le serveur a déjà vérifié la saisie avec les mêmes limites.
create function public.deposer_demande(
  p_nom text,
  p_email text,
  p_telephone text,
  p_entreprise text,
  p_categorie_id uuid,
  p_objet text,
  p_description text,
  p_personne_informee boolean
)
returns text
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

  insert into public.demandes (
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
    v_maintenant,
    v_maintenant
  )
  returning id into v_demande_id;

  insert into public.evenements (demande_id, type, auteur_libelle, date_creation)
  values (v_demande_id, 'creation', 'demandeur', v_maintenant);

  return v_reference;
end;
$$;

revoke execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean) from public;
revoke execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean) from anon;
revoke execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean) from authenticated;
grant execute on function public.deposer_demande(text, text, text, text, uuid, text, text, boolean) to service_role;
