-- Changer le statut d'une demande (AD-2, AD-3, AD-5, AD-7, AD-9, AD-16)
--
-- Story 1.11. Colonnes créées : `demandes.date_cloture`,
-- `evenements.auteur_id`, `evenements.ancien_statut`,
-- `evenements.nouveau_statut`. Fonctions créées :
-- `transition_statut_permise`, `changer_statut`. Fonction remplacée :
-- `lire_demande` (même signature, réponse élargie).
--
-- Règles :
--   - seul chemin pour changer un statut (AD-2) : `changer_statut`, qui
--     vérifie l'appelant, verrouille la demande, applique la règle depuis le
--     statut **réel**, écrit l'événement « Statut : ancien → nouveau » avec
--     l'auteur interne, pose ou efface la date de clôture et met à jour la
--     dernière activité, dans une seule transaction ;
--   - les passages permis (FR-16, RM-4) n'existent qu'ici, dans
--     `transition_statut_permise` : Nouvelle → En cours, Nouvelle → Traitée,
--     En cours → Traitée, Traitée → En cours (réouverture). Jamais de retour
--     à *Nouvelle*. `TRANSITIONS_STATUT` (src/shared/constantes.ts) ne sert
--     qu'à afficher les boutons ; un test vérifie qu'elle dit la même chose
--     (AD-5) ;
--   - choisir le statut déjà en place ne crée rien (FR-16) ;
--   - une réouverture n'est appliquée que si la personne voyait *Traitée*
--     (décision d'Aurel, 21 nov. 2026) : elle passe toujours par la fenêtre
--     de confirmation ;
--   - *Traitée* pose la date de clôture, la réouverture l'efface : la
--     contrainte `demandes_date_cloture_check` le garantit ;
--   - l'historique reste en ajout seul (AD-3) : rien n'est modifié ni
--     supprimé dans `evenements`. Un événement a un seul auteur : un
--     utilisateur interne (`auteur_id`) ou un libellé (`demandeur`,
--     `systeme`). Le nom de l'auteur interne est lu dans `profils`, même si
--     son compte a été désactivé (FR-17) ;
--   - `changer_statut` et `lire_demande` sont `security definer`, au chemin
--     de recherche vide, exécutables par `authenticated` seul, et commencent
--     par `exiger_utilisateur_interne` (AD-7, AD-9).
--
-- Les anciennes migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Date de clôture (FR-16)
-- ---------------------------------------------------------------------------

alter table public.demandes
  add column date_cloture timestamptz;

-- Aucune demande n'a pu être clôturée avant cette migration (seul
-- `deposer_demande` écrivait, toujours en *Nouvelle*) ; par précaution, une
-- demande déjà *Traitée* reçoit sa dernière activité comme date de clôture.
update public.demandes
set date_cloture = date_derniere_activite
where statut = 'traitee'
  and date_cloture is null;

alter table public.demandes
  add constraint demandes_date_cloture_check
    check ((statut = 'traitee') = (date_cloture is not null));

comment on column public.demandes.date_cloture is
  'Date du passage à Traitée (FR-16). Présente si et seulement si la demande est Traitée ; effacée à la réouverture. Écrite uniquement par changer_statut.';

-- ---------------------------------------------------------------------------
-- 2. Historique : auteur interne, ancien et nouveau statut (FR-17)
-- ---------------------------------------------------------------------------

-- Auteur interne. Pas de suppression en cascade : un compte n'est jamais
-- supprimé (RM-10), et son nom reste dans l'historique.
alter table public.evenements
  add column auteur_id uuid
    constraint evenements_auteur_id_fkey
    references public.profils (id);

alter table public.evenements
  add column ancien_statut text
    constraint evenements_ancien_statut_check
    check (ancien_statut in ('nouvelle', 'en_cours', 'traitee'));

alter table public.evenements
  add column nouveau_statut text
    constraint evenements_nouveau_statut_check
    check (nouveau_statut in ('nouvelle', 'en_cours', 'traitee'));

-- Le libellé n'est plus obligatoire : un utilisateur interne peut être
-- l'auteur à sa place.
alter table public.evenements
  alter column auteur_libelle drop not null;

-- Un seul auteur : un utilisateur interne, ou un libellé.
alter table public.evenements
  add constraint evenements_un_seul_auteur_check
    check (num_nonnulls(auteur_id, auteur_libelle) = 1);

-- Un changement de statut dit d'où et vers où il va, jamais vers *Nouvelle*
-- (RM-4), jamais vers le même statut (FR-16). Les autres événements n'ont
-- ni ancien ni nouveau statut.
alter table public.evenements
  add constraint evenements_statut_check
    check (
      case
        when type = 'statut' then
          ancien_statut is not null
          and nouveau_statut is not null
          and ancien_statut <> nouveau_statut
          and nouveau_statut <> 'nouvelle'
        else
          ancien_statut is null
          and nouveau_statut is null
      end
    );

comment on column public.evenements.auteur_id is
  'Utilisateur interne auteur de l''événement (FR-17). Vide si l''auteur est un libellé (auteur_libelle).';

-- ---------------------------------------------------------------------------
-- 3. Fonction transition_statut_permise (FR-16, RM-4, AD-5)
-- ---------------------------------------------------------------------------

-- Vrai si le passage de `p_de` à `p_vers` est permis. Seule définition des
-- passages : `changer_statut` la lit, et l'écran affiche les mêmes
-- (`TRANSITIONS_STATUT`, vérifiée par un test).
--
-- Exécutable par personne : seules les fonctions de cette base (qui
-- appartiennent au même propriétaire) l'appellent.
create function public.transition_statut_permise(p_de text, p_vers text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((p_de, p_vers) in (
    ('nouvelle', 'en_cours'),
    ('nouvelle', 'traitee'),
    ('en_cours', 'traitee'),
    ('traitee', 'en_cours')
  ), false);
$$;

revoke execute on function public.transition_statut_permise(text, text) from public;
revoke execute on function public.transition_statut_permise(text, text) from anon;
revoke execute on function public.transition_statut_permise(text, text) from authenticated;
revoke execute on function public.transition_statut_permise(text, text) from service_role;

-- ---------------------------------------------------------------------------
-- 4. Fonction changer_statut (FR-16, FR-17, AD-2, AD-5)
-- ---------------------------------------------------------------------------

-- Change le statut d'une demande, par sa référence (mise en majuscules).
--   - `p_statut_vu` : le statut que la personne avait sous les yeux ;
--   - `p_nouveau_statut` : `en_cours` ou `traitee`, jamais `nouvelle`.
--
-- Dans une seule transaction, elle :
--   1. vérifie l'appelant (`exiger_utilisateur_interne`, AD-7) ;
--   2. refuse un nouveau statut absent, inconnu ou *Nouvelle* (NV301), ou un
--      statut vu inconnu (NV302) : rien n'est écrit ;
--   3. verrouille la demande jusqu'à la fin de la transaction : deux
--      changements simultanés passent l'un après l'autre, et chacun part du
--      statut réellement en place ;
--   4. si le statut réel n'est pas celui que la personne voyait, lit qui a
--      fait le dernier changement de statut, et quand (`modifiee_par`) ;
--   5. décide :
--        - `inchange` : le statut demandé est déjà en place ; rien n'est
--          écrit ;
--        - `refuse` : passage non permis depuis le statut réel, ou
--          réouverture alors que la personne ne voyait pas *Traitée* ; rien
--          n'est écrit ;
--        - `applique` : nouveau statut, date de clôture posée (*Traitée*)
--          ou effacée, dernière activité, et événement « Statut : réel →
--          nouveau » au nom de l'appelant, tous à la même heure.
--
-- Renvoie :
--   { "resultat": "applique" | "inchange" | "refuse" | "introuvable",
--     "statut": statut réel après l'appel (null si introuvable),
--     "modifiee_par": { "nom", "date" } | null }
--
-- Refus prévus (le serveur les vérifie avant d'appeler) :
--   NV201 : appelant qui n'est pas un utilisateur interne actif ;
--   NV301 : nouveau statut absent, inconnu ou *Nouvelle* ;
--   NV302 : statut vu absent ou inconnu.
create function public.changer_statut(
  p_reference text,
  p_statut_vu text,
  p_nouveau_statut text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auteur uuid;
  v_maintenant timestamptz := now();
  v_demande_id uuid;
  v_statut text;
  v_modifiee_par jsonb;
begin
  v_auteur := public.exiger_utilisateur_interne();

  if p_nouveau_statut is null or p_nouveau_statut not in ('en_cours', 'traitee') then
    raise exception 'Changement refusé : nouveau statut absent, inconnu ou Nouvelle (RM-4).'
      using errcode = 'NV301';
  end if;

  if p_statut_vu is null or p_statut_vu not in ('nouvelle', 'en_cours', 'traitee') then
    raise exception 'Changement refusé : statut vu absent ou inconnu.'
      using errcode = 'NV302';
  end if;

  select d.id, d.statut
  into v_demande_id, v_statut
  from public.demandes d
  where d.reference = upper(p_reference)
  for update;

  if v_demande_id is null then
    return jsonb_build_object('resultat', 'introuvable', 'statut', null, 'modifiee_par', null);
  end if;

  -- Un collègue est passé avant : son nom (même si son compte a été
  -- désactivé depuis) et l'heure de son changement.
  if v_statut <> p_statut_vu then
    select jsonb_build_object('nom', p.nom, 'date', e.date_creation)
    into v_modifiee_par
    from public.evenements e
    join public.profils p on p.id = e.auteur_id
    where e.demande_id = v_demande_id
      and e.type = 'statut'
    order by e.date_creation desc, e.id desc
    limit 1;
  end if;

  if v_statut = p_nouveau_statut then
    return jsonb_build_object('resultat', 'inchange', 'statut', v_statut, 'modifiee_par', v_modifiee_par);
  end if;

  if not public.transition_statut_permise(v_statut, p_nouveau_statut)
    or (v_statut = 'traitee' and p_statut_vu <> 'traitee') then
    return jsonb_build_object('resultat', 'refuse', 'statut', v_statut, 'modifiee_par', v_modifiee_par);
  end if;

  update public.demandes
  set statut = p_nouveau_statut,
      date_cloture = case when p_nouveau_statut = 'traitee' then v_maintenant end,
      date_derniere_activite = v_maintenant
  where id = v_demande_id;

  insert into public.evenements (
    demande_id,
    type,
    auteur_id,
    ancien_statut,
    nouveau_statut,
    date_creation
  )
  values (
    v_demande_id,
    'statut',
    v_auteur,
    v_statut,
    p_nouveau_statut,
    v_maintenant
  );

  return jsonb_build_object('resultat', 'applique', 'statut', p_nouveau_statut, 'modifiee_par', v_modifiee_par);
end;
$$;

revoke execute on function public.changer_statut(text, text, text) from public;
revoke execute on function public.changer_statut(text, text, text) from anon;
revoke execute on function public.changer_statut(text, text, text) from service_role;
grant execute on function public.changer_statut(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Fonction lire_demande, élargie (FR-15, FR-16, FR-17)
-- ---------------------------------------------------------------------------

-- Comme celle de la story 1.10, avec en plus :
--   - `date_cloture` : null si la demande n'est pas *Traitée* ;
--   - pour chaque événement : `auteur` (libellé `demandeur` / `systeme`, ou
--     null), `auteur_nom` (nom de l'utilisateur interne, même désactivé, ou
--     null), `ancien_statut` et `nouveau_statut` (null hors changement de
--     statut).
--
-- Renvoie :
--   { "id", "reference", "nom", "email", "telephone", "entreprise",
--     "objet", "description", "categorie", "canal", "statut", "date_depot",
--     "date_cloture",
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
