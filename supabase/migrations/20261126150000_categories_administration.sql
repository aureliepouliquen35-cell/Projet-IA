-- Catégories de l'écran A2, réservées aux administrateurs (FR-26, RM-7,
-- AD-7, AD-9, AD-10, AD-16)
--
-- Story 4.1. Fonctions créées : `lister_categories_administration`,
-- `ajouter_categorie`, `modifier_categorie`. Contrainte ajoutée :
-- `categories_nom_longueur_check`.
--
-- Règles :
--   - réservées aux administrateurs (RM-7) : chaque fonction commence par
--     `exiger_administrateur`, qui relit le rôle dans `profils` (AD-7) et
--     refuse tout autre appelant (NV202). La page A2, sa lecture et les
--     Server Functions ont déjà fait le même contrôle : la base le refait ;
--   - seul chemin d'écriture dans `categories` (AD-2) : la table n'a aucune
--     règle RLS d'écriture et aucun droit direct ;
--   - deux catégories actives ne portent jamais le même nom, sans tenir
--     compte des majuscules (FR-26) : c'est l'index
--     `categories_nom_actif_unique` (story 1.3) qui le garantit, même si deux
--     administrateurs agissent au même instant (AD-10). Le second attend la
--     fin du premier, puis heurte l'index ; la fonction transforme ce refus
--     en NV501 ;
--   - les espaces de début et de fin du nom sont retirés ; un nom vide heurte
--     `categories_nom_check`, un nom de plus de 50 caractères la nouvelle
--     `categories_nom_longueur_check` (code 23514) : rien n'est écrit. Les
--     mêmes limites sont dans le schéma `src/shared/schemas/categorie.ts`
--     (AD-11) ;
--   - une catégorie ajoutée est active, en dernière position (`ordre` est
--     une identité) : le formulaire public la propose à la visite suivante.
--     Un nouveau nom s'affiche aussitôt sur les demandes, le détail et le
--     filtre, qui relisent le nom dans `categories` ;
--   - rien n'est écrit au journal : il n'y a pas d'événement de journal pour
--     les catégories ;
--   - `security definer`, au chemin de recherche vide, exécutables par
--     `authenticated` seul : la session de l'administrateur, jamais la clé
--     secrète (AD-9).
--
-- La désactivation, la réactivation et la suppression (story 4.2)
-- remplaceront `modifier_categorie` par une version qui sait aussi les
-- faire. Les anciennes migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Longueur du nom (FR-26)
-- ---------------------------------------------------------------------------

-- Les cinq catégories de départ font moins de 50 caractères.
alter table public.categories
  add constraint categories_nom_longueur_check
  check (char_length(nom) <= 50);

-- ---------------------------------------------------------------------------
-- 2. Fonction lister_categories_administration (FR-26, écran A2)
-- ---------------------------------------------------------------------------

-- Toutes les catégories, désactivées comprises, pour la liste A2, dans
-- l'ordre d'affichage (`ordre`), avec le nombre de demandes qui utilisent
-- chacune.
--
-- Renvoie un tableau jsonb (vide s'il n'y a aucune catégorie) :
--   [{ "id", "nom", "active", "nombre_demandes" }, …]
--
-- Refus prévu :
--   NV202 : appelant qui n'est pas un administrateur actif.
create function public.lister_categories_administration()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_categories jsonb;
begin
  perform public.exiger_administrateur();

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'nom', c.nom,
        'active', c.active,
        'nombre_demandes', (
          select count(*)
          from public.demandes d
          where d.categorie_id = c.id
        )
      )
      order by c.ordre
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.categories c;

  return v_categories;
end;
$$;

revoke execute on function public.lister_categories_administration() from public;
revoke execute on function public.lister_categories_administration() from anon;
revoke execute on function public.lister_categories_administration() from service_role;
grant execute on function public.lister_categories_administration() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fonction ajouter_categorie (FR-26)
-- ---------------------------------------------------------------------------

-- Ajoute la catégorie active `p_nom` (espaces de bord retirés), en dernière
-- position.
--
-- Renvoie :
--   { "id", "nom" } : la catégorie créée, son nom nettoyé.
--
-- Refus prévus (le serveur a déjà vérifié le rôle et le nom) :
--   NV202 : appelant qui n'est pas un administrateur actif ;
--   NV501 : une catégorie active porte déjà ce nom (sans tenir compte des
--           majuscules), compris par un appel simultané.
-- Nom absent : code 22004. Nom vide ou trop long : code 23514.
create function public.ajouter_categorie(p_nom text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text := btrim(p_nom);
  v_id uuid;
  v_contrainte text;
begin
  perform public.exiger_administrateur();

  if v_nom is null then
    raise exception 'Catégorie non ajoutée : le nom est obligatoire.'
      using errcode = '22004';
  end if;

  begin
    insert into public.categories (nom)
    values (v_nom)
    returning id into v_id;
  exception
    when unique_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'categories_nom_actif_unique' then
        raise exception 'Une catégorie active porte déjà ce nom.'
          using errcode = 'NV501';
      end if;
      raise;
  end;

  return jsonb_build_object('id', v_id, 'nom', v_nom);
end;
$$;

revoke execute on function public.ajouter_categorie(text) from public;
revoke execute on function public.ajouter_categorie(text) from anon;
revoke execute on function public.ajouter_categorie(text) from service_role;
grant execute on function public.ajouter_categorie(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Fonction modifier_categorie (FR-26)
-- ---------------------------------------------------------------------------

-- Renomme la catégorie `p_categorie` en `p_nom` (espaces de bord retirés).
-- La ligne est verrouillée jusqu'à la fin de la transaction : deux
-- renommages simultanés de la même catégorie passent l'un après l'autre.
--
-- Renvoie :
--   { "id", "nom", "change" }
-- `nom` est celui en place après l'appel. `change` est faux si le nom ne
-- différait pas : rien n'est alors écrit.
--
-- Refus prévus (le serveur a déjà vérifié le rôle et le nom) :
--   NV202 : appelant qui n'est pas un administrateur actif ;
--   NV501 : une autre catégorie active porte déjà ce nom (sans tenir compte
--           des majuscules), compris par un appel simultané ;
--   NV502 : catégorie introuvable (supprimée entre-temps).
-- Catégorie ou nom absent : code 22004. Nom vide ou trop long : code 23514.
create function public.modifier_categorie(p_categorie uuid, p_nom text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text := btrim(p_nom);
  v_ancien_nom text;
  v_contrainte text;
begin
  perform public.exiger_administrateur();

  if p_categorie is null or v_nom is null then
    raise exception 'Catégorie non modifiée : catégorie et nom sont obligatoires.'
      using errcode = '22004';
  end if;

  select c.nom
  into v_ancien_nom
  from public.categories c
  where c.id = p_categorie
  for update;

  if not found then
    raise exception 'Catégorie non modifiée : catégorie introuvable.'
      using errcode = 'NV502';
  end if;

  if v_nom = v_ancien_nom then
    return jsonb_build_object('id', p_categorie, 'nom', v_ancien_nom, 'change', false);
  end if;

  begin
    update public.categories
    set nom = v_nom
    where id = p_categorie;
  exception
    when unique_violation then
      get stacked diagnostics v_contrainte = constraint_name;
      if v_contrainte = 'categories_nom_actif_unique' then
        raise exception 'Une catégorie active porte déjà ce nom.'
          using errcode = 'NV501';
      end if;
      raise;
  end;

  return jsonb_build_object('id', p_categorie, 'nom', v_nom, 'change', true);
end;
$$;

revoke execute on function public.modifier_categorie(uuid, text) from public;
revoke execute on function public.modifier_categorie(uuid, text) from anon;
revoke execute on function public.modifier_categorie(uuid, text) from service_role;
grant execute on function public.modifier_categorie(uuid, text) to authenticated;
