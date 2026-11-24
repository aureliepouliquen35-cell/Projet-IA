-- Filtres de la liste des demandes (AD-1, AD-7, AD-9, AD-16)
--
-- Story 2.1. Fonction remplacée : `lister_demandes`, qui reçoit en plus
-- trois filtres (`p_statut`, `p_categorie`, `p_canal`). Fonction créée :
-- `lister_categories`, qui donne les catégories au filtre « Catégorie ».
--
-- Règles :
--   - convention « Adresse de la liste » : une seule fonction de lecture
--     renvoie à la fois la page de résultats et leur nombre total ; les
--     filtres se combinent entre eux et avec la recherche (toutes les
--     conditions doivent être remplies) ;
--   - un filtre absent, vide ou inconnu est ignoré : statut hors de
--     `nouvelle`, `en_cours`, `traitee` ; canal hors de `formulaire`,
--     `telephone`, `email` ; identifiant bien formé d'aucune catégorie. La
--     liste n'est alors pas filtrée sur ce point. Un identifiant mal formé
--     est refusé par l'API (`p_categorie` est de type `uuid`, erreur
--     22P02) : l'application n'en envoie jamais (`lireFiltres`) ;
--   - une catégorie désactivée reste filtrable (FR-13) ;
--   - recherche, tri, pagination et colonnes renvoyées : inchangés depuis la
--     story 1.9 ;
--   - mêmes droits qu'en story 1.8 : `security definer`, chemin de recherche
--     vide, exécutable par `authenticated` seul, appelant vérifié d'abord
--     (`exiger_utilisateur_interne`, AD-7, AD-9) ; tout utilisateur interne
--     voit toutes les demandes (RM-6) ; aucune table n'est lisible
--     directement.
--
-- Pas d'index ici : la rapidité avec 5 000 demandes est traitée par la
-- story 6.8.

-- ---------------------------------------------------------------------------
-- 1. Fonction lister_demandes, avec les filtres (FR-11, FR-12, FR-13, RM-6)
-- ---------------------------------------------------------------------------

-- L'ancienne version (page, taille, texte) est supprimée : une seule
-- signature, sans ambiguïté pour l'appel par l'API.
drop function public.lister_demandes(integer, integer, text);

-- Une page de la liste et le nombre total de résultats, en un seul appel.
--   - `p_q` : texte cherché (règles de la story 1.9) ;
--   - `p_statut`, `p_categorie`, `p_canal` : filtres (voir les règles en
--     tête) ;
--   - `p_taille` est ramenée entre 1 et 100 (25 si absente) ;
--   - `p_page` est ramenée entre 1 et la dernière page (1 si absente) ;
--   - `total` est le nombre de demandes trouvées ;
--   - tri : date de dépôt, puis référence, décroissantes.
--
-- Renvoie :
--   { "total": 42, "page": 1, "demandes": [ { "id", "reference",
--     "date_depot", "nom", "objet", "categorie", "statut" }, … ] }
create function public.lister_demandes(
  p_page integer,
  p_taille integer,
  p_q text default null,
  p_statut text default null,
  p_categorie uuid default null,
  p_canal text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 100);
  v_q text;
  v_statut text;
  v_categorie uuid;
  v_canal text;
  v_total integer;
  v_derniere integer;
  v_page integer;
  v_demandes jsonb;
begin
  perform public.exiger_utilisateur_interne();

  -- Espaces de bord retirés, 150 caractères au plus, sans accents ni
  -- majuscules. Vide : pas de recherche.
  v_q := regexp_replace(coalesce(p_q, ''), '^\s+|\s+$', '', 'g');
  v_q := regexp_replace(left(v_q, 150), '\s+$', '');
  v_q := public.normaliser_recherche(v_q);

  -- Filtres : une valeur inconnue devient `null` (pas de filtre).
  v_statut := case when p_statut in ('nouvelle', 'en_cours', 'traitee') then p_statut end;
  v_canal := case when p_canal in ('formulaire', 'telephone', 'email') then p_canal end;
  select c.id into v_categorie from public.categories c where c.id = p_categorie;

  select count(*)::integer
  into v_total
  from public.demandes d
  where (v_statut is null or d.statut = v_statut)
    and (v_categorie is null or d.categorie_id = v_categorie)
    and (v_canal is null or d.canal = v_canal)
    and (
      v_q = ''
      or strpos(public.normaliser_recherche(d.reference), v_q) > 0
      or strpos(public.normaliser_recherche(d.nom), v_q) > 0
      or strpos(public.normaliser_recherche(d.email), v_q) > 0
      or strpos(public.normaliser_recherche(d.entreprise), v_q) > 0
      or strpos(public.normaliser_recherche(d.objet), v_q) > 0
    );

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
    where (v_statut is null or d.statut = v_statut)
      and (v_categorie is null or d.categorie_id = v_categorie)
      and (v_canal is null or d.canal = v_canal)
      and (
        v_q = ''
        or strpos(public.normaliser_recherche(d.reference), v_q) > 0
        or strpos(public.normaliser_recherche(d.nom), v_q) > 0
        or strpos(public.normaliser_recherche(d.email), v_q) > 0
        or strpos(public.normaliser_recherche(d.entreprise), v_q) > 0
        or strpos(public.normaliser_recherche(d.objet), v_q) > 0
      )
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

revoke execute on function public.lister_demandes(integer, integer, text, text, uuid, text) from public;
revoke execute on function public.lister_demandes(integer, integer, text, text, uuid, text) from anon;
revoke execute on function public.lister_demandes(integer, integer, text, text, uuid, text) from service_role;
grant execute on function public.lister_demandes(integer, integer, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fonction lister_categories (FR-13)
-- ---------------------------------------------------------------------------

-- Les catégories proposées par le filtre « Catégorie » : toutes, actives
-- d'abord, puis désactivées (elles restent filtrables), chaque groupe dans
-- l'ordre d'affichage (`ordre`).
--
-- Renvoie :
--   [ { "id", "nom", "active" }, … ]
create function public.lister_categories()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_categories jsonb;
begin
  perform public.exiger_utilisateur_interne();

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', c.id, 'nom', c.nom, 'active', c.active)
      order by c.active desc, c.ordre
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.categories c;

  return v_categories;
end;
$$;

revoke execute on function public.lister_categories() from public;
revoke execute on function public.lister_categories() from anon;
revoke execute on function public.lister_categories() from service_role;
grant execute on function public.lister_categories() to authenticated;
