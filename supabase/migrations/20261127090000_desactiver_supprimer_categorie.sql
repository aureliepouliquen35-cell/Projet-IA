-- Désactiver, réactiver ou supprimer une catégorie de l'écran A2 (FR-26,
-- RM-7, RM-11, AD-7, AD-9, AD-10, AD-16)
--
-- Story 4.2. Fonction remplacée : `modifier_categorie` (story 4.1), qui sait
-- maintenant aussi désactiver, réactiver et supprimer une catégorie, en plus
-- de la renommer. Fonction élargie : `lire_demande` (story 1.11), qui dit en
-- plus si la catégorie de la demande est active (« Autre (désactivée) » sur
-- le détail I4).
--
-- Règles :
--   - réservée aux administrateurs (RM-7) : `modifier_categorie` commence par
--     `exiger_administrateur`, qui relit le rôle dans `profils` (AD-7) et
--     refuse tout autre appelant (NV202). La Server Function a déjà fait le
--     même contrôle : la base le refait ;
--   - seul chemin d'écriture dans `categories` (AD-2) : la table n'a aucune
--     règle RLS d'écriture et aucun droit direct ;
--   - une seule opération par appel : renommer, désactiver ou réactiver, ou
--     supprimer ;
--   - il reste toujours au moins une catégorie active, sinon le formulaire
--     serait inutilisable (AD-10) : c'est la base qui tient la règle, même si
--     deux administrateurs agissent au même instant. Pour désactiver ou
--     supprimer, la fonction verrouille d'abord toutes les catégories
--     actives, toujours dans le même ordre (par identifiant, sans
--     interblocage), puis la catégorie visée, puis compte les actives. Le
--     second appel attend la fin du premier et voit son résultat ; il est
--     refusé (NV503) s'il ne laisserait aucune catégorie active. Supprimer
--     une catégorie désactivée ne change pas ce nombre ;
--   - seule une catégorie sans aucune demande peut être supprimée (NV504) :
--     la fonction le vérifie, la ligne verrouillée. Une demande déposée au
--     même instant attend la fin de la suppression, puis heurte la clé
--     étrangère `demandes_categorie_id_fkey` ; une demande déjà déposée fait
--     heurter cette clé au `delete`, qui donne aussi NV504 ;
--   - une catégorie réactivée heurte l'index `categories_nom_actif_unique`
--     si une catégorie active porte déjà son nom : NV501 ;
--   - une catégorie désactivée disparaît du formulaire public et de la
--     saisie I5, qui ne lisent que les actives ; les demandes la gardent, et
--     le filtre de I3 la propose encore (RM-11) ;
--   - rien n'est écrit au journal : il n'y a pas d'événement de journal pour
--     les catégories ;
--   - `security definer`, au chemin de recherche vide, exécutables par
--     `authenticated` seul : la session de l'administrateur, jamais la clé
--     secrète (AD-9).
--
-- L'ancienne fonction, à deux paramètres, est supprimée puis recréée avec
-- deux paramètres de plus : le renommage (story 4.1) l'appelle par noms de
-- paramètres et continue de marcher sans changement. Les anciennes
-- migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Fonction modifier_categorie (FR-26, RM-11)
-- ---------------------------------------------------------------------------

drop function public.modifier_categorie(uuid, text);

-- Modifie la catégorie `p_categorie`, une seule opération par appel :
--   p_nom       : nouveau nom (espaces de bord retirés) ;
--   p_active    : faux pour désactiver, vrai pour réactiver ;
--   p_supprimer : vrai pour supprimer.
-- Un paramètre `null` (ou absent, ou `p_supprimer` faux) n'est pas une
-- opération ; exactement une est donnée.
--
-- Renvoie :
--   { "id", "nom", "active", "change", "supprimee" }
-- `nom` et `active` sont ceux en place après l'appel (ceux d'avant pour une
-- suppression). `change` est faux si rien ne différait : rien n'est alors
-- écrit. `supprimee` est vrai si la catégorie a été supprimée.
--
-- Refus prévus (le serveur a déjà vérifié le rôle, l'identifiant et le nom) :
--   NV202 : appelant qui n'est pas un administrateur actif ;
--   NV501 : une autre catégorie active porte déjà ce nom (sans tenir compte
--           des majuscules), au renommage ou à la réactivation, compris par
--           un appel simultané ;
--   NV502 : catégorie introuvable (supprimée entre-temps) ;
--   NV503 : la désactivation ou la suppression ne laisserait aucune
--           catégorie active, compris par un appel simultané ;
--   NV504 : suppression d'une catégorie utilisée par au moins une demande.
-- Catégorie absente, ou pas exactement une opération : code 22004. Nom vide
-- ou trop long : code 23514.
create function public.modifier_categorie(
  p_categorie uuid,
  p_nom text default null,
  p_active boolean default null,
  p_supprimer boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text := btrim(p_nom);
  v_supprimer boolean := coalesce(p_supprimer, false);
  v_ancien_nom text;
  v_active boolean;
  v_contrainte text;
begin
  perform public.exiger_administrateur();

  if p_categorie is null
    or (p_nom is not null)::integer + (p_active is not null)::integer + v_supprimer::integer <> 1 then
    raise exception 'Catégorie non modifiée : catégorie et une seule opération sont obligatoires.'
      using errcode = '22004';
  end if;

  -- 1. Désactiver ou supprimer : toutes les catégories actives, toujours
  --    dans le même ordre. Deux appels simultanés passent l'un après
  --    l'autre, sans s'interbloquer.
  if p_active = false or v_supprimer then
    perform 1
    from public.categories c
    where c.active
    order by c.id
    for update;
  end if;

  -- 2. La catégorie visée (déjà verrouillée si elle est active), relue
  --    après l'attente.
  select c.nom, c.active
  into v_ancien_nom, v_active
  from public.categories c
  where c.id = p_categorie
  for update;

  if not found then
    raise exception 'Catégorie non modifiée : catégorie introuvable.'
      using errcode = 'NV502';
  end if;

  -- 3. Renommer (story 4.1).
  if p_nom is not null then
    if v_nom = v_ancien_nom then
      return jsonb_build_object(
        'id', p_categorie, 'nom', v_ancien_nom, 'active', v_active, 'change', false, 'supprimee', false
      );
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

    return jsonb_build_object(
      'id', p_categorie, 'nom', v_nom, 'active', v_active, 'change', true, 'supprimee', false
    );
  end if;

  -- 4. Désactiver ou réactiver.
  if p_active is not null then
    if p_active = v_active then
      return jsonb_build_object(
        'id', p_categorie, 'nom', v_ancien_nom, 'active', v_active, 'change', false, 'supprimee', false
      );
    end if;

    -- La catégorie visée est active : elle est comptée.
    if not p_active and (
      select count(*)
      from public.categories c
      where c.active
    ) <= 1 then
      raise exception 'Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable.'
        using errcode = 'NV503';
    end if;

    begin
      update public.categories
      set active = p_active
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

    return jsonb_build_object(
      'id', p_categorie, 'nom', v_ancien_nom, 'active', p_active, 'change', true, 'supprimee', false
    );
  end if;

  -- 5. Supprimer.
  if v_active and (
    select count(*)
    from public.categories c
    where c.active
  ) <= 1 then
    raise exception 'Impossible : au moins une catégorie doit rester active, sinon le formulaire serait inutilisable.'
      using errcode = 'NV503';
  end if;

  if exists (
    select 1
    from public.demandes d
    where d.categorie_id = p_categorie
  ) then
    raise exception 'Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver.'
      using errcode = 'NV504';
  end if;

  begin
    delete from public.categories
    where id = p_categorie;
  exception
    when foreign_key_violation then
      raise exception 'Impossible de supprimer une catégorie utilisée par des demandes. Vous pouvez la désactiver.'
        using errcode = 'NV504';
  end;

  return jsonb_build_object(
    'id', p_categorie, 'nom', v_ancien_nom, 'active', v_active, 'change', true, 'supprimee', true
  );
end;
$$;

revoke execute on function public.modifier_categorie(uuid, text, boolean, boolean) from public;
revoke execute on function public.modifier_categorie(uuid, text, boolean, boolean) from anon;
revoke execute on function public.modifier_categorie(uuid, text, boolean, boolean) from service_role;
grant execute on function public.modifier_categorie(uuid, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fonction lire_demande, élargie (FR-15, RM-11)
-- ---------------------------------------------------------------------------

-- Comme celle de la story 1.11, avec en plus `categorie_active` : faux si la
-- catégorie de la demande a été désactivée. Le détail I4 affiche alors
-- « Autre (désactivée) ».
--
-- Renvoie :
--   { "id", "reference", "nom", "email", "telephone", "entreprise",
--     "objet", "description", "categorie", "categorie_active", "canal",
--     "statut", "date_depot", "date_cloture",
--     "evenements": [ { "type", "auteur", "auteur_nom", "ancien_statut",
--                       "nouveau_statut", "date" }, … ] }
create or replace function public.lire_demande(p_reference text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_demande jsonb;
begin
  perform public.exiger_utilisateur_interne();

  select jsonb_build_object(
    'id', d.id,
    'reference', d.reference,
    'nom', d.nom,
    'email', d.email,
    'telephone', d.telephone,
    'entreprise', d.entreprise,
    'objet', d.objet,
    'description', d.description,
    'categorie', c.nom,
    'categorie_active', c.active,
    'canal', d.canal,
    'statut', d.statut,
    'date_depot', d.date_depot,
    'date_cloture', d.date_cloture,
    'evenements', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', e.type,
            'auteur', e.auteur_libelle,
            'auteur_nom', p.nom,
            'ancien_statut', e.ancien_statut,
            'nouveau_statut', e.nouveau_statut,
            'date', e.date_creation
          )
          order by e.date_creation, e.id
        )
        from public.evenements e
        left join public.profils p on p.id = e.auteur_id
        where e.demande_id = d.id
      ),
      '[]'::jsonb
    )
  )
  into v_demande
  from public.demandes d
  join public.categories c on c.id = d.categorie_id
  where d.reference = upper(p_reference);

  -- Aucune ligne : `v_demande` reste `null`.
  return v_demande;
end;
$$;

revoke execute on function public.lire_demande(text) from public;
revoke execute on function public.lire_demande(text) from anon;
revoke execute on function public.lire_demande(text) from service_role;
grant execute on function public.lire_demande(text) to authenticated;
