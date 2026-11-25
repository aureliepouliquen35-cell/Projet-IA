-- Désactiver ou réactiver un compte (AD-6, AD-9, AD-10, AD-16)
--
-- Story 3.4. Fonctions créées : `modifier_compte`, `retablir_compte`.
--
-- Règles :
--   - un compte n'est jamais supprimé (RM-10) : la désactivation passe
--     `profils.actif` à faux, la réactivation le remet à vrai. Le module
--     `src/server/admin` bloque ensuite (ou débloque) le compte dans Supabase
--     Auth, pour que la session ne puisse plus se renouveler ; si Auth
--     échoue, il remet le profil comme avant avec `retablir_compte` ;
--   - il reste toujours au moins un administrateur actif (RM-9, FR-25), y
--     compris quand un administrateur désactive son propre compte, et même si
--     deux administrateurs agissent au même instant : c'est la base qui tient
--     la règle (AD-10). Chaque appel verrouille d'abord toutes les lignes
--     administrateur, dans le même ordre (par identifiant), puis vérifie
--     l'auteur et compte les autres administrateurs actifs. Le second appel
--     attend la fin du premier et voit son résultat ;
--   - l'auteur est revérifié ici (NV202) : un administrateur actif, au mot de
--     passe choisi. Il est donné par le serveur (`exigerAdministrateur()`),
--     puisque la clé secrète n'a pas de session ;
--   - les deux fonctions sont `security definer`, au chemin de recherche
--     vide, exécutables par `service_role` seul (la clé secrète, côté
--     serveur, AD-9). Personne n'écrit directement dans `profils` ;
--   - le nom d'un compte désactivé reste lisible dans l'historique des
--     demandes : `lire_demande` (story 1.11) le lit dans `profils` sans
--     regarder `actif`. Rien n'y change.
--
-- La story 3.3 étendra `modifier_compte` au changement de rôle, avec la
-- même règle du dernier administrateur. Les anciennes migrations ne sont pas
-- modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Fonction modifier_compte (FR-22, FR-25, RM-9, RM-10)
-- ---------------------------------------------------------------------------

-- Désactive (`p_actif` faux) ou réactive (`p_actif` vrai) le compte
-- `p_compte`, à la demande de l'administrateur `p_auteur`.
--
-- Renvoie :
--   { "nom", "email", "change" }
-- `change` est faux si le compte était déjà dans l'état voulu : rien n'est
-- alors écrit.
--
-- Refus prévus :
--   NV202 : l'auteur n'est pas un administrateur actif au mot de passe
--           choisi (désactivé ou rétrogradé entre-temps, compris par un
--           appel simultané) ;
--   NV203 : désactiver ce compte ne laisserait aucun administrateur actif ;
--   NV204 : compte introuvable.
-- Un paramètre absent heurte le code 22004.
create function public.modifier_compte(
  p_auteur uuid,
  p_compte uuid,
  p_actif boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text;
  v_email text;
  v_role text;
  v_actif boolean;
begin
  if p_auteur is null or p_compte is null or p_actif is null then
    raise exception 'Compte non modifié : auteur, compte et état sont obligatoires.'
      using errcode = '22004';
  end if;

  -- 1. Toutes les lignes administrateur, toujours dans le même ordre : deux
  --    appels simultanés passent l'un après l'autre, sans s'interbloquer.
  perform 1
  from public.profils p
  where p.role = 'administrateur'
  order by p.id
  for update;

  -- 2. L'auteur, relu après l'attente : un administrateur désactivé par un
  --    appel simultané est refusé.
  if not exists (
    select 1
    from public.profils p
    where p.id = p_auteur
      and p.actif
      and not p.doit_changer_mdp
      and p.role = 'administrateur'
  ) then
    raise exception 'Compte non modifié : réservé aux administrateurs actifs.'
      using errcode = 'NV202';
  end if;

  -- 3. Le compte visé (déjà verrouillé s'il est administrateur).
  select p.nom, p.email, p.role, p.actif
  into v_nom, v_email, v_role, v_actif
  from public.profils p
  where p.id = p_compte
  for update;

  if not found then
    raise exception 'Compte non modifié : compte introuvable.'
      using errcode = 'NV204';
  end if;

  if v_actif = p_actif then
    return jsonb_build_object('nom', v_nom, 'email', v_email, 'change', false);
  end if;

  -- 4. Dernier administrateur actif (RM-9), y compris soi-même.
  if not p_actif and v_role = 'administrateur' and not exists (
    select 1
    from public.profils p
    where p.role = 'administrateur'
      and p.actif
      and p.id <> p_compte
  ) then
    raise exception 'Impossible : il doit rester au moins un administrateur actif.'
      using errcode = 'NV203';
  end if;

  update public.profils
  set actif = p_actif,
      date_modification = now()
  where id = p_compte;

  return jsonb_build_object('nom', v_nom, 'email', v_email, 'change', true);
end;
$$;

revoke execute on function public.modifier_compte(uuid, uuid, boolean) from public;
revoke execute on function public.modifier_compte(uuid, uuid, boolean) from anon;
revoke execute on function public.modifier_compte(uuid, uuid, boolean) from authenticated;
grant execute on function public.modifier_compte(uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Fonction retablir_compte (retour arrière, AD-6)
-- ---------------------------------------------------------------------------

-- Remet `profils.actif` du compte `p_compte` à `p_actif`, quand Supabase
-- Auth a refusé le blocage ou le déblocage qui suivait `modifier_compte`.
-- Appelée seulement par `src/server/admin`, juste après cet échec.
--
-- Sans vérification de l'auteur : celui qui se désactive lui-même n'est
-- plus un administrateur actif au moment du retour arrière. La règle du
-- dernier administrateur reste tenue, avec le même verrou.
--
-- Refus prévus :
--   NV203 : remettre ce compte désactivé ne laisserait aucun administrateur
--           actif ;
--   NV204 : compte introuvable.
create function public.retablir_compte(
  p_compte uuid,
  p_actif boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if p_compte is null or p_actif is null then
    raise exception 'Compte non rétabli : compte et état sont obligatoires.'
      using errcode = '22004';
  end if;

  perform 1
  from public.profils p
  where p.role = 'administrateur'
  order by p.id
  for update;

  select p.role
  into v_role
  from public.profils p
  where p.id = p_compte
  for update;

  if not found then
    raise exception 'Compte non rétabli : compte introuvable.'
      using errcode = 'NV204';
  end if;

  if not p_actif and v_role = 'administrateur' and not exists (
    select 1
    from public.profils p
    where p.role = 'administrateur'
      and p.actif
      and p.id <> p_compte
  ) then
    raise exception 'Impossible : il doit rester au moins un administrateur actif.'
      using errcode = 'NV203';
  end if;

  update public.profils
  set actif = p_actif,
      date_modification = now()
  where id = p_compte
    and actif <> p_actif;
end;
$$;

revoke execute on function public.retablir_compte(uuid, boolean) from public;
revoke execute on function public.retablir_compte(uuid, boolean) from anon;
revoke execute on function public.retablir_compte(uuid, boolean) from authenticated;
grant execute on function public.retablir_compte(uuid, boolean) to service_role;
