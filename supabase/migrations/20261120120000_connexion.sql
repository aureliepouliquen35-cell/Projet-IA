-- Connexion à l'espace interne (AD-7, AD-8, AD-9, AD-14, AD-16)
--
-- Story 1.6. Table créée : `tentatives_connexion`. Fonctions créées :
-- `connexion_bloquee`, `enregistrer_tentative`. Règle RLS créée : lecture de
-- son propre profil par un utilisateur connecté.
--
-- Règles :
--   - la Server Function de connexion (`src/server/connexion`) demande à
--     `connexion_bloquee` si l'email est bloqué **avant** d'appeler Supabase
--     Auth (AD-8) : 5 échecs d'affilée en 15 minutes bloquent, que l'email ait
--     un compte ou non. Le blocage prend fin 15 minutes après le premier des
--     5 échecs : un essai pendant le blocage n'est pas enregistré, il ne le
--     prolonge donc pas ;
--   - chaque essai jugé par Supabase (réussi ou non) est enregistré par
--     `enregistrer_tentative`, qui efface d'abord les tentatives de plus de
--     24 h (AD-14 : aucune tâche planifiée) ;
--   - `tentatives_connexion` : RLS activé, sans aucune règle, tous les droits
--     directs retirés, y compris à `service_role` (AD-9). Les deux fonctions
--     ne sont exécutables que par `service_role` (la clé secrète, côté
--     serveur) : ce droit d'exécution est la vérification de l'appelant ;
--   - `profils` : un utilisateur connecté (`authenticated`) lit **sa propre
--     ligne**, et seulement elle, pour que la garde (`src/server/garde`) relise
--     son rôle et son état (AD-7). Aucune écriture. La lecture des autres
--     profils arrivera avec les écrans qui en ont besoin.

-- ---------------------------------------------------------------------------
-- 1. Tentatives de connexion
-- ---------------------------------------------------------------------------

create table public.tentatives_connexion (
  id bigint generated always as identity primary key,
  -- Email saisi, en minuscules, qu'il ait un compte ou non. Même limite que
  -- l'email d'un compte (100 caractères).
  email text not null
    constraint tentatives_connexion_email_check
    check (email = lower(btrim(email)) and email <> '' and char_length(email) <= 100),
  date_tentative timestamptz not null default now(),
  reussite boolean not null
);

comment on table public.tentatives_connexion is
  'Essais de connexion des dernières 24 h (AD-8, AD-14). Écriture uniquement par enregistrer_tentative ; lecture uniquement par connexion_bloquee.';

-- Recherche des essais récents d'un email (blocage) et effacement par date.
create index tentatives_connexion_email_date
  on public.tentatives_connexion (email, date_tentative);

create index tentatives_connexion_date
  on public.tentatives_connexion (date_tentative);

-- ---------------------------------------------------------------------------
-- 2. Droits (AD-9)
-- ---------------------------------------------------------------------------

-- Rien n'est permis sauf ce qui est écrit : aucune règle, donc aucun accès.
alter table public.tentatives_connexion enable row level security;

-- Aucun droit direct sur la table, pour personne.
revoke all on table public.tentatives_connexion from public;
revoke all on table public.tentatives_connexion from anon;
revoke all on table public.tentatives_connexion from authenticated;
revoke all on table public.tentatives_connexion from service_role;

-- ---------------------------------------------------------------------------
-- 3. Fonction connexion_bloquee (AD-8)
-- ---------------------------------------------------------------------------

-- Vrai si l'email a au moins 5 échecs de moins de 15 minutes, tous
-- postérieurs à sa dernière connexion réussie (« d'affilée »).
create function public.connexion_bloquee(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_derniere_reussite timestamptz;
  v_echecs integer;
begin
  select max(t.date_tentative)
  into v_derniere_reussite
  from public.tentatives_connexion t
  where t.email = v_email
    and t.reussite;

  select count(*)
  into v_echecs
  from public.tentatives_connexion t
  where t.email = v_email
    and not t.reussite
    and t.date_tentative > now() - interval '15 minutes'
    and (v_derniere_reussite is null or t.date_tentative > v_derniere_reussite);

  return v_echecs >= 5;
end;
$$;

revoke execute on function public.connexion_bloquee(text) from public;
revoke execute on function public.connexion_bloquee(text) from anon;
revoke execute on function public.connexion_bloquee(text) from authenticated;
grant execute on function public.connexion_bloquee(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Fonction enregistrer_tentative (AD-8, AD-14)
-- ---------------------------------------------------------------------------

-- Efface les tentatives de plus de 24 h, puis enregistre celle-ci.
-- Un email vide ou de plus de 100 caractères heurte
-- `tentatives_connexion_email_check` (code 23514).
create function public.enregistrer_tentative(p_email text, p_reussite boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tentatives_connexion
  where date_tentative < now() - interval '24 hours';

  insert into public.tentatives_connexion (email, reussite)
  values (lower(btrim(p_email)), coalesce(p_reussite, false));
end;
$$;

revoke execute on function public.enregistrer_tentative(text, boolean) from public;
revoke execute on function public.enregistrer_tentative(text, boolean) from anon;
revoke execute on function public.enregistrer_tentative(text, boolean) from authenticated;
grant execute on function public.enregistrer_tentative(text, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Profils : lecture de sa propre ligne (AD-7, AD-9)
-- ---------------------------------------------------------------------------

-- La règle limite la lecture à la ligne de l'utilisateur connecté ; le droit
-- de lecture seul (aucune écriture) est rendu à `authenticated`.
create policy profils_lecture_soi_meme
  on public.profils
  for select
  to authenticated
  using (id = (select auth.uid()));

grant select on table public.profils to authenticated;
