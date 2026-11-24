-- Saisie interne d'une demande (AD-2, AD-4, AD-7, AD-9, AD-16, AD-20)
--
-- Story 2.3. Fonctions créées : `saisir_demande`, `lire_formulaire_saisie`.
-- Aucune table ni colonne créée : la colonne `demandes.canal` existe depuis
-- la story 1.3, `demandes.numero_envoi` depuis la story 1.4, et
-- `evenements.auteur_id` depuis la story 1.11.
--
-- Règles :
--   - seul chemin de création d'une demande reçue par téléphone ou par
--     email (AD-2) : `saisir_demande`, appelée avec la session de la
--     personne connectée (rôle `authenticated`), jamais avec la clé
--     secrète. Elle vérifie l'appelant (`exiger_utilisateur_interne`),
--     attribue la référence `NOVA-AAAA-NNNN` par le compteur annuel
--     verrouillé (AD-4), crée la demande (statut *Nouvelle*, priorité
--     *Normale* : valeurs par défaut de la table, RM-1) avec son canal, et
--     écrit l'événement « Demande créée » au nom de l'appelant, dans une
--     seule transaction ;
--   - le canal saisi est *Téléphone* ou *Email* : *Formulaire* est réservé
--     au dépôt public (FR-30) ;
--   - aucune demande sans que la personne ait été informée de l'usage de
--     ses données (RM-12) ;
--   - numéro d'envoi (AD-20) : comme `deposer_demande` (story 1.4), un
--     second envoi avec le même numéro renvoie la demande déjà créée, sans
--     rien écrire ;
--   - pas de colonne « saisie par » : l'auteur de l'événement `creation`
--     (`auteur_id`) dit qui a saisi la demande ;
--   - `lire_formulaire_saisie` donne à l'écran I5 ce qu'il affiche : les
--     catégories actives et le contact pour les données personnelles (la
--     mention de P1, « Texte à lui lire ») ;
--   - les deux fonctions sont `security definer`, au chemin de recherche
--     vide, exécutables par `authenticated` seul, et commencent par
--     `exiger_utilisateur_interne` (AD-7, AD-9). Aucune table n'est ouverte
--     en lecture ou en écriture directe.
--
-- Les anciennes migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Fonction saisir_demande (FR-30, RM-1, RM-12, AD-2, AD-4, AD-20)
-- ---------------------------------------------------------------------------

-- Crée une demande reçue par téléphone ou par email.
--   - `p_canal` : `telephone` ou `email` ;
--   - les autres champs : ceux du formulaire public, déjà vérifiés par le
--     serveur avec les mêmes limites (les contraintes de la table les
--     répètent) ;
--   - `p_numero_envoi` : UUID tiré par l'écran I5 à son affichage.
--
-- Dans une seule transaction, elle :
--   1. vérifie l'appelant (`exiger_utilisateur_interne`, AD-7) ;
--   2. refuse un numéro d'envoi absent (refus imprévu : le serveur le
--      vérifie avant d'appeler) ;
--   3. verrouille ce numéro jusqu'à la fin de la transaction : deux envois
--      simultanés du même numéro passent l'un après l'autre ;
--   4. si une demande porte déjà ce numéro, renvoie sa référence, avant
--      toute vérification : rien n'est créé, aucun numéro de référence
--      n'est consommé ;
--   5. sinon : refus prévus NV401, NV001, NV002, numéro suivant de
--      l'année, demande, événement « Demande créée » au nom de l'appelant,
--      tous à la même heure.
--
-- Renvoie une ligne : la référence de la demande.
--
-- Refus prévus, que le serveur traduit en erreur de saisie :
--   NV201 : appelant qui n'est pas un utilisateur interne actif ;
--   NV401 : canal absent, ou autre que `telephone` et `email` ;
--   NV001 : case « La personne a été informée » non cochée (RM-12) ;
--   NV002 : catégorie inconnue ou désactivée.
create function public.saisir_demande(
  p_canal text,
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
returns table (reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auteur uuid;
  v_maintenant timestamptz := now();
  v_annee integer := extract(year from (v_maintenant at time zone 'Europe/Paris'))::integer;
  v_numero integer;
  v_reference text;
  v_demande_id uuid;
begin
  v_auteur := public.exiger_utilisateur_interne();

  if p_numero_envoi is null then
    raise exception 'Demande refusée : numéro d''envoi absent.';
  end if;

  -- Verrou propre à ce numéro, libéré à la fin de la transaction. Le second
  -- de deux envois simultanés attend ici, puis trouve la demande du premier.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_numero_envoi::text, 0)
  );

  -- Même numéro d'envoi : la demande existe déjà, on renvoie sa référence.
  select d.reference
    into reference
    from public.demandes d
    where d.numero_envoi = p_numero_envoi;
  if found then
    return next;
    return;
  end if;

  if p_canal is null or p_canal not in ('telephone', 'email') then
    raise exception 'Demande refusée : canal absent ou réservé au formulaire public.'
      using errcode = 'NV401';
  end if;

  if p_personne_informee is not true then
    raise exception 'Demande refusée : la personne n''a pas été informée de l''usage de ses données (RM-12).'
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
    p_canal,
    true,
    p_numero_envoi,
    v_maintenant,
    v_maintenant
  )
  returning d.id, d.reference
    into v_demande_id, reference;

  -- « Demande créée » au nom de la personne connectée : un seul auteur
  -- (contrainte `evenements_un_seul_auteur_check`), sans libellé.
  insert into public.evenements (demande_id, type, auteur_id, date_creation)
  values (v_demande_id, 'creation', v_auteur, v_maintenant);

  return next;
end;
$$;

revoke execute on function public.saisir_demande(text, text, text, text, text, uuid, text, text, boolean, uuid) from public;
revoke execute on function public.saisir_demande(text, text, text, text, text, uuid, text, text, boolean, uuid) from anon;
revoke execute on function public.saisir_demande(text, text, text, text, text, uuid, text, text, boolean, uuid) from service_role;
grant execute on function public.saisir_demande(text, text, text, text, text, uuid, text, text, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Fonction lire_formulaire_saisie (FR-30, FR-5)
-- ---------------------------------------------------------------------------

-- Ce que l'écran I5 affiche : les catégories actives, dans l'ordre
-- d'affichage (`ordre`), et le contact pour les données personnelles de la
-- mention (« Texte à lui lire »).
--
-- Renvoie :
--   { "categories": [ { "id", "nom" }, … ], "contact_donnees": "…" }
create function public.lire_formulaire_saisie()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_categories jsonb;
  v_contact text;
begin
  perform public.exiger_utilisateur_interne();

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', c.id, 'nom', c.nom)
      order by c.ordre
    ),
    '[]'::jsonb
  )
  into v_categories
  from public.categories c
  where c.active;

  select p.contact_donnees
  into v_contact
  from public.parametres p
  limit 1;

  return jsonb_build_object(
    'categories', v_categories,
    'contact_donnees', v_contact
  );
end;
$$;

revoke execute on function public.lire_formulaire_saisie() from public;
revoke execute on function public.lire_formulaire_saisie() from anon;
revoke execute on function public.lire_formulaire_saisie() from service_role;
grant execute on function public.lire_formulaire_saisie() to authenticated;
