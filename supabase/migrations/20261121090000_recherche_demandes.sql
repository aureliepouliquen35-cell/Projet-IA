-- Recherche dans la liste des demandes (AD-1, AD-7, AD-9, AD-16)
--
-- Story 1.9. Extension installée : `unaccent` (schéma `extensions`).
-- Fonction créée : `normaliser_recherche`. Fonction remplacée :
-- `lister_demandes`, qui reçoit en plus le texte cherché (`p_q`).
--
-- Règles :
--   - convention « Recherche » : une seule fonction de lecture renvoie à la
--     fois la page de résultats et leur nombre total ; la recherche ne tient
--     compte ni des majuscules ni des accents (`unaccent`, FR-12) ;
--   - le texte est cherché dans la référence, le nom, l'email, l'entreprise
--     et l'objet, **champ par champ** : un mot ne peut pas « déborder » d'un
--     champ sur le suivant ;
--   - il est cherché tel quel (`strpos`, pas `like`) : `%`, `_`, `'` ou `\`
--     ne sont pas des jokers ;
--   - `p_q` est nettoyé : espaces de bord retirés, 150 caractères au plus ;
--     vide ou absent = pas de recherche, toute la liste ;
--   - la liste renvoie toujours les mêmes colonnes que l'écran I3 : ni
--     l'email, ni le téléphone, ni la description (la recherche par email
--     reste possible, EXPERIENCE.md E-H12) ;
--   - mêmes droits qu'en story 1.8 : `security definer`, chemin de recherche
--     vide, exécutable par `authenticated` seul, appelant vérifié d'abord
--     (`exiger_utilisateur_interne`, AD-7, AD-9) ; tout utilisateur interne
--     voit toutes les demandes (RM-6).
--
-- Pas d'index de recherche ici : la rapidité avec 5 000 demandes est
-- traitée par la story 6.8. Les filtres (story 2.1) s'ajouteront par une
-- nouvelle migration.

-- Suppression des accents. Installée dans le schéma `extensions`, comme
-- `pgcrypto` ; si elle y est déjà, cette ligne ne fait rien.
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Fonction normaliser_recherche (FR-12)
-- ---------------------------------------------------------------------------

-- Texte sans accents et en minuscules : « HÉLÈNE » et « helene » donnent
-- tous deux « helene ». Le dictionnaire est nommé avec son schéma : la
-- fonction ne dépend pas du chemin de recherche.
--
-- Exécutable par personne : seules les fonctions de cette base (qui
-- appartiennent au même propriétaire) l'appellent.
create function public.normaliser_recherche(p_texte text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, p_texte));
$$;

revoke execute on function public.normaliser_recherche(text) from public;
revoke execute on function public.normaliser_recherche(text) from anon;
revoke execute on function public.normaliser_recherche(text) from authenticated;
revoke execute on function public.normaliser_recherche(text) from service_role;

-- ---------------------------------------------------------------------------
-- 2. Fonction lister_demandes, avec la recherche (FR-11, FR-12, RM-6)
-- ---------------------------------------------------------------------------

-- L'ancienne version (page, taille) est supprimée : une seule signature,
-- sans ambiguïté pour l'appel par l'API.
drop function public.lister_demandes(integer, integer);

-- Une page de la liste et le nombre total de résultats, en un seul appel.
--   - `p_q` : texte cherché (voir les règles en tête) ;
--   - `p_taille` est ramenée entre 1 et 100 (25 si absente) ;
--   - `p_page` est ramenée entre 1 et la dernière page (1 si absente) : une
--     page trop loin donne la dernière, aucun résultat donne la page 1 ;
--   - `total` est le nombre de demandes trouvées (toutes sans recherche) ;
--   - tri : date de dépôt, puis référence, décroissantes.
--
-- Renvoie :
--   { "total": 42, "page": 1, "demandes": [ { "id", "reference",
--     "date_depot", "nom", "objet", "categorie", "statut" }, … ] }
create function public.lister_demandes(p_page integer, p_taille integer, p_q text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_taille integer := least(greatest(coalesce(p_taille, 25), 1), 100);
  v_q text;
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

  select count(*)::integer
  into v_total
  from public.demandes d
  where v_q = ''
    or strpos(public.normaliser_recherche(d.reference), v_q) > 0
    or strpos(public.normaliser_recherche(d.nom), v_q) > 0
    or strpos(public.normaliser_recherche(d.email), v_q) > 0
    or strpos(public.normaliser_recherche(d.entreprise), v_q) > 0
    or strpos(public.normaliser_recherche(d.objet), v_q) > 0;

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
    where v_q = ''
      or strpos(public.normaliser_recherche(d.reference), v_q) > 0
      or strpos(public.normaliser_recherche(d.nom), v_q) > 0
      or strpos(public.normaliser_recherche(d.email), v_q) > 0
      or strpos(public.normaliser_recherche(d.entreprise), v_q) > 0
      or strpos(public.normaliser_recherche(d.objet), v_q) > 0
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

revoke execute on function public.lister_demandes(integer, integer, text) from public;
revoke execute on function public.lister_demandes(integer, integer, text) from anon;
revoke execute on function public.lister_demandes(integer, integer, text) from service_role;
grant execute on function public.lister_demandes(integer, integer, text) to authenticated;
