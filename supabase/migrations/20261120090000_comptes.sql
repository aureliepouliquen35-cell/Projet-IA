-- Comptes internes et informations générales (AD-6, AD-9, AD-13, AD-16)
--
-- Story 1.5. Tables créées : `profils`, `mdp_temporaires`. Fonctions créées :
-- `creer_profil`, `modifier_parametres`.
--
-- Règles :
--   - un compte se crée d'une seule façon (AD-6), en deux temps : le module
--     `src/server/admin` crée le compte dans Supabase Auth (« email
--     confirmé », aucun email envoyé), puis appelle aussitôt `creer_profil`.
--     Si celle-ci échoue, le module supprime le compte Auth : il n'existe
--     jamais de compte sans profil. Aucun déclencheur sur `auth.users` ;
--   - le rôle vient toujours de `profils`, jamais des métadonnées du compte
--     Supabase, que l'utilisateur peut modifier lui-même (AD-7) ;
--   - un compte n'est jamais supprimé (RM-10) : `profils.id` désigne le
--     compte Auth sans suppression en cascade, ce qui empêche aussi de
--     supprimer un compte Auth qui a un profil ;
--   - le mot de passe temporaire n'est jamais gardé en clair : seule son
--     empreinte bcrypt, calculée par la base, est écrite dans
--     `mdp_temporaires`. La story 1.7 la compare au nouveau mot de passe dans
--     une fonction SQL, sans que l'application lise la table ;
--   - RLS activé sur les deux tables, sans aucune règle, et tous les droits
--     directs retirés, y compris à `service_role` (AD-9). Les deux fonctions
--     ne sont exécutables que par `service_role` (la clé secrète, côté
--     serveur) : ce droit d'exécution est la vérification de l'appelant.
--
-- Les règles de lecture pour les utilisateurs connectés arrivent avec les
-- stories de connexion (1.6, 1.7) ; `modifier_parametres` sera ouverte aux
-- administrateurs avec l'écran A3 (story 4.3).

-- Fonctions d'empreinte (`crypt`, `gen_salt`). Déjà installées par Supabase
-- dans le schéma `extensions` : cette ligne ne fait alors rien.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Profils
-- ---------------------------------------------------------------------------

create table public.profils (
  -- Identifiant du compte Supabase Auth. Pas de suppression en cascade :
  -- un compte n'est jamais supprimé (RM-10).
  id uuid primary key
    constraint profils_id_fkey
    references auth.users (id),
  nom text not null
    constraint profils_nom_check
    check (btrim(nom) <> '' and char_length(nom) <= 100),
  email text not null
    constraint profils_email_check
    check (btrim(email) <> '' and char_length(email) <= 100),
  role text not null
    constraint profils_role_check
    check (role in ('collaborateur', 'administrateur')),
  actif boolean not null default true,
  -- Vrai à la création et à la réinitialisation : l'utilisateur doit choisir
  -- son mot de passe à sa prochaine connexion (FR-21, FR-23).
  doit_changer_mdp boolean not null default true,
  date_creation timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

comment on table public.profils is
  'Comptes internes (AD-6). Création uniquement par creer_profil. Le rôle ne vient que d''ici (AD-7). Jamais supprimé (RM-10).';

-- Deux comptes ne peuvent pas avoir le même email, quelle que soit la casse
-- (FR-21).
create unique index profils_email_unique
  on public.profils (lower(email));

-- ---------------------------------------------------------------------------
-- 2. Mots de passe temporaires
-- ---------------------------------------------------------------------------

create table public.mdp_temporaires (
  -- Un seul mot de passe temporaire par compte : la réinitialisation
  -- (story 3.5) remplacera la ligne.
  profil_id uuid primary key
    constraint mdp_temporaires_profil_id_fkey
    references public.profils (id),
  -- Empreinte bcrypt (`extensions.crypt`), jamais le mot de passe en clair.
  empreinte text not null
    constraint mdp_temporaires_empreinte_check
    check (empreinte like '$2_$%'),
  date_creation timestamptz not null default now()
);

comment on table public.mdp_temporaires is
  'Empreinte bcrypt du dernier mot de passe temporaire de chaque compte (AD-6). Illisible par l''application ; comparée par une fonction SQL (story 1.7).';

-- ---------------------------------------------------------------------------
-- 3. Droits (AD-9)
-- ---------------------------------------------------------------------------

-- Rien n'est permis sauf ce qui est écrit : aucune règle, donc aucun accès.
alter table public.profils enable row level security;
alter table public.mdp_temporaires enable row level security;

-- Aucun droit direct sur les tables, pour personne.
revoke all on table public.profils from public;
revoke all on table public.profils from anon;
revoke all on table public.profils from authenticated;
revoke all on table public.profils from service_role;

revoke all on table public.mdp_temporaires from public;
revoke all on table public.mdp_temporaires from anon;
revoke all on table public.mdp_temporaires from authenticated;
revoke all on table public.mdp_temporaires from service_role;

-- ---------------------------------------------------------------------------
-- 4. Fonction creer_profil (AD-6)
-- ---------------------------------------------------------------------------

-- Second temps de la création d'un compte, appelé par `src/server/admin`
-- juste après la création du compte Auth. Dans une seule transaction, elle :
--   1. vérifie que le mot de passe temporaire a au moins 12 caractères
--      (NFR-11) ;
--   2. vérifie que le compte Auth existe et porte bien cet email ;
--   3. crée le profil : rôle donné, actif, « doit changer son mot de passe » ;
--   4. écrit l'empreinte bcrypt du mot de passe temporaire.
--
-- Refus prévus :
--   NV101 : compte Auth introuvable, ou email différent ;
--   NV102 : mot de passe temporaire de moins de 12 caractères.
-- Un email déjà utilisé par un autre profil heurte `profils_email_unique`
-- (code 23505) ; un rôle inconnu heurte `profils_role_check` (code 23514).
create function public.creer_profil(
  p_id uuid,
  p_nom text,
  p_email text,
  p_role text,
  p_mdp_temporaire text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_mdp_temporaire is null or char_length(p_mdp_temporaire) < 12 then
    raise exception 'Profil refusé : le mot de passe temporaire doit faire au moins 12 caractères.'
      using errcode = 'NV102';
  end if;

  if not exists (
    select 1
    from auth.users u
    where u.id = p_id
      and lower(u.email) = lower(btrim(p_email))
  ) then
    raise exception 'Profil refusé : aucun compte Auth avec cet identifiant et cet email.'
      using errcode = 'NV101';
  end if;

  insert into public.profils (id, nom, email, role, actif, doit_changer_mdp)
  values (p_id, btrim(p_nom), btrim(p_email), p_role, true, true);

  insert into public.mdp_temporaires (profil_id, empreinte)
  values (p_id, extensions.crypt(p_mdp_temporaire, extensions.gen_salt('bf')));
end;
$$;

revoke execute on function public.creer_profil(uuid, text, text, text, text) from public;
revoke execute on function public.creer_profil(uuid, text, text, text, text) from anon;
revoke execute on function public.creer_profil(uuid, text, text, text, text) from authenticated;
grant execute on function public.creer_profil(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Fonction modifier_parametres (FR-31)
-- ---------------------------------------------------------------------------

-- Remplace les informations générales de l'unique ligne de `parametres`
-- (téléphone facultatif, email de contact, contact pour les données
-- personnelles). Elles sont lues à chaque affichage du formulaire et de la
-- confirmation : le changement est visible aussitôt.
--
-- Réservée ici à `service_role` (procédure d'installation) ; la story 4.3
-- l'ouvrira aux administrateurs, avec vérification de l'appelant.
--
-- Refus prévus :
--   NV103 : email de contact mal formé ;
--   NV104 : la ligne de `parametres` n'existe pas.
-- Un email de contact ou un contact données vide heurte les contraintes de
-- la table (code 23514).
create function public.modifier_parametres(
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
revoke execute on function public.modifier_parametres(text, text, text) from authenticated;
grant execute on function public.modifier_parametres(text, text, text) to service_role;
