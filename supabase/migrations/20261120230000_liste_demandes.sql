-- Liste des demandes et compteur « à traiter » (AD-1, AD-5, AD-7, AD-9, AD-16)
--
-- Story 1.8. Colonne créée : `demandes.a_traiter`. Index créés :
-- `demandes_date_depot_reference`, `demandes_a_traiter`. Fonctions créées :
-- `exiger_utilisateur_interne`, `compter_a_traiter`, `lister_demandes`.
--
-- Règles :
--   - la définition des demandes **à traiter** existe une seule fois, ici
--     (AD-5) : la colonne générée `a_traiter` vaut vrai pour une demande
--     *Nouvelle*, ou *Urgente* et non *Traitée*. Le compteur (cette story) et
--     le filtre « À traiter » (story 2.2) la lisent tous les deux. Tant que la
--     priorité reste *Normale* (FR-19 pas encore réalisée), le compte est
--     celui des demandes *Nouvelle* ;
--   - aucune table n'est ouverte en lecture directe : les utilisateurs
--     internes lisent la liste et le compteur par deux fonctions
--     `security definer`, au chemin de recherche vide, exécutables par
--     `authenticated` seul (AD-9). Chacune commence par vérifier l'appelant
--     avec `exiger_utilisateur_interne` : profil de la session actif et mot
--     de passe déjà choisi (AD-7, double barrière avec `exigerUtilisateur`) ;
--   - tout utilisateur interne voit toutes les demandes (RM-6) : aucune
--     fonction ne filtre selon la personne connectée ;
--   - la liste ne renvoie que ce que l'écran I3 affiche : ni l'email, ni le
--     téléphone, ni la description du demandeur (EXPERIENCE.md, « Le moins
--     possible à l'écran »).
--
-- La recherche (story 1.9, paramètre `p_q`) et les filtres (story 2.1)
-- s'ajouteront à `lister_demandes` par de nouvelles migrations.

-- ---------------------------------------------------------------------------
-- 1. Colonne a_traiter (AD-5)
-- ---------------------------------------------------------------------------

alter table public.demandes
  add column a_traiter boolean not null
    generated always as (
      statut = 'nouvelle'
      or (priorite = 'urgente' and statut <> 'traitee')
    ) stored;

comment on column public.demandes.a_traiter is
  'Demande à traiter (AD-5, FR-14) : Nouvelle, ou Urgente non Traitée. Seule définition : le compteur et le filtre « À traiter » la lisent.';

-- ---------------------------------------------------------------------------
-- 2. Index de la liste (NFR-13)
-- ---------------------------------------------------------------------------

-- Tri de la liste : plus récentes d'abord, puis référence décroissante pour
-- départager deux dépôts à la même heure.
create index demandes_date_depot_reference
  on public.demandes (date_depot desc, reference desc);

-- Compteur et filtre « À traiter » : seulement les demandes concernées.
create index demandes_a_traiter
  on public.demandes (date_depot desc, reference desc)
  where a_traiter;

-- ---------------------------------------------------------------------------
-- 3. Fonction exiger_utilisateur_interne (AD-7, AD-9)
-- ---------------------------------------------------------------------------

-- Vérification de l'appelant, commune aux fonctions de lecture internes.
-- Renvoie l'identifiant de la personne connectée (`auth.uid()`) si son
-- profil est actif et que son mot de passe temporaire a été remplacé.
--
-- Refus prévu :
--   NV201 : pas de session, pas de profil, compte désactivé, ou mot de passe
--           encore à choisir.
--
-- Exécutable par personne : seules les fonctions de cette base (qui
-- appartiennent au même propriétaire) l'appellent.
create function public.exiger_utilisateur_interne()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null or not exists (
    select 1
    from public.profils p
    where p.id = v_id
      and p.actif
      and not p.doit_changer_mdp
  ) then
    raise exception 'Accès refusé : réservé aux utilisateurs internes actifs.'
      using errcode = 'NV201';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.exiger_utilisateur_interne() from public;
revoke execute on function public.exiger_utilisateur_interne() from anon;
revoke execute on function public.exiger_utilisateur_interne() from authenticated;
revoke execute on function public.exiger_utilisateur_interne() from service_role;

-- ---------------------------------------------------------------------------
-- 4. Fonction compter_a_traiter (FR-14)
-- ---------------------------------------------------------------------------

-- Nombre de demandes à traiter (colonne `a_traiter`), pour la carte
-- compteur et la pastille du menu.
create function public.compter_a_traiter()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_utilisateur_interne();

  return (
    select count(*)::integer
    from public.demandes d
    where d.a_traiter
  );
end;
$$;

revoke execute on function public.compter_a_traiter() from public;
revoke execute on function public.compter_a_traiter() from anon;
revoke execute on function public.compter_a_traiter() from service_role;
grant execute on function public.compter_a_traiter() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Fonction lister_demandes (FR-11, RM-6)
-- ---------------------------------------------------------------------------

-- Une page de la liste et le nombre total de demandes, en un seul appel.
--   - `p_taille` est ramenée entre 1 et 100 (25 si absente) ;
--   - `p_page` est ramenée entre 1 et la dernière page (1 si absente) : une
--     page trop loin donne la dernière, une base vide donne la page 1 ;
--   - tri : date de dépôt, puis référence, décroissantes.
--
-- Renvoie :
--   { "total": 42, "page": 1, "demandes": [ { "id", "reference",
--     "date_depot", "nom", "objet", "categorie", "statut" }, … ] }
create function public.lister_demandes(p_page integer, p_taille integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 100);
  v_total integer;
  v_derniere integer;
  v_page integer;
  v_demandes jsonb;
begin
  perform public.exiger_utilisateur_interne();

  select count(*)::integer
  into v_total
  from public.demandes;

  v_derniere := greatest(1, ceil(v_total::numeric / v_taille)::integer);
  v_page := least(greatest(coalesce(p_page, 1), 1), v_derniere);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', l.id,
        'reference', l.reference,
        'date_depot', l.date_depot,
        'nom', l.nom,
        'objet', l.objet,
        'categorie', l.categorie,
        'statut', l.statut
      )
      order by l.date_depot desc, l.reference desc
    ),
    '[]'::jsonb
  )
  into v_demandes
  from (
    select d.id, d.reference, d.date_depot, d.nom, d.objet, c.nom as categorie, d.statut
    from public.demandes d
    join public.categories c on c.id = d.categorie_id
    order by d.date_depot desc, d.reference desc
    limit v_taille
    offset (v_page - 1) * v_taille
  ) l;

  return jsonb_build_object(
    'total', v_total,
    'page', v_page,
    'demandes', v_demandes
  );
end;
$$;

revoke execute on function public.lister_demandes(integer, integer) from public;
revoke execute on function public.lister_demandes(integer, integer) from anon;
revoke execute on function public.lister_demandes(integer, integer) from service_role;
grant execute on function public.lister_demandes(integer, integer) to authenticated;
