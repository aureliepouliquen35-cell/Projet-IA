-- Modifier le nom ou le rôle d'un compte (AD-6, AD-9, AD-10, AD-16)
--
-- Story 3.3. Fonction remplacée : `modifier_compte` (story 3.4), qui sait
-- maintenant changer aussi le nom et le rôle d'un compte, en plus de son
-- état (désactivé ou actif). `retablir_compte` ne change pas.
--
-- Règles :
--   - seuls le nom et le rôle sont modifiables (FR-22) : l'email n'est
--     jamais écrit ici ;
--   - il reste toujours au moins un administrateur actif (RM-9, FR-25), y
--     compris quand un administrateur se passe lui-même collaborateur, et
--     même si deux administrateurs agissent au même instant : c'est la base
--     qui tient la règle (AD-10). Même verrou qu'à la story 3.4 : toutes les
--     lignes administrateur, dans le même ordre (par identifiant), puis
--     l'auteur revérifié et les autres administrateurs actifs comptés. Le
--     second appel attend la fin du premier et voit son résultat ;
--   - l'auteur est revérifié ici (NV202) : un administrateur actif, au mot de
--     passe choisi. Il est donné par le serveur (`exigerAdministrateur()`),
--     puisque la clé secrète n'a pas de session ;
--   - un nom vide ou trop long, un rôle inconnu heurtent les contraintes de
--     `profils` (`profils_nom_check`, `profils_role_check`, code 23514) : rien
--     n'est écrit ;
--   - la fonction est `security definer`, au chemin de recherche vide,
--     exécutable par `service_role` seul (la clé secrète, côté serveur,
--     AD-9). Personne n'écrit directement dans `profils` ;
--   - le nom affiché dans l'historique des demandes est relu dans `profils`
--     par `lire_demande` (story 1.11) : un nom corrigé y apparaît aussitôt.
--
-- L'ancienne fonction, à trois paramètres, est supprimée puis recréée avec
-- deux paramètres de plus : le module `src/server/admin` l'appelle par noms
-- de paramètres, la désactivation et la réactivation (story 3.4) continuent
-- de marcher sans changement. Les anciennes migrations ne sont pas modifiées
-- (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Fonction modifier_compte (FR-22, FR-25, RM-9, RM-10)
-- ---------------------------------------------------------------------------

drop function public.modifier_compte(uuid, uuid, boolean);

-- Modifie le compte `p_compte`, à la demande de l'administrateur `p_auteur` :
--   p_actif : faux pour désactiver, vrai pour réactiver ;
--   p_nom   : nouveau nom (espaces de bord retirés) ;
--   p_role  : nouveau rôle (`collaborateur` ou `administrateur`).
-- Un paramètre `null` (ou absent) laisse la valeur en place ; au moins un
-- des trois est donné.
--
-- Renvoie :
--   { "nom", "email", "role", "actif", "change", "ancien_role" }
-- `nom`, `role` et `actif` sont ceux en place après l'appel ; `ancien_role`
-- celui d'avant. `change` est faux si rien ne différait : rien n'est alors
-- écrit.
--
-- Refus prévus :
--   NV202 : l'auteur n'est pas un administrateur actif au mot de passe
--           choisi (désactivé ou rétrogradé entre-temps, compris par un
--           appel simultané) ;
--   NV203 : le compte est un administrateur actif, ne le serait plus après
--           l'appel (désactivé ou passé collaborateur), et aucun autre
--           administrateur actif ne resterait ;
--   NV204 : compte introuvable.
-- Auteur ou compte absent, ou aucun changement demandé : code 22004.
create function public.modifier_compte(
  p_auteur uuid,
  p_compte uuid,
  p_actif boolean default null,
  p_nom text default null,
  p_role text default null
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
  v_nouveau_nom text;
  v_nouveau_role text;
  v_nouvel_actif boolean;
begin
  if p_auteur is null or p_compte is null or (p_actif is null and p_nom is null and p_role is null) then
    raise exception 'Compte non modifié : auteur, compte et au moins un changement sont obligatoires.'
      using errcode = '22004';
  end if;

  -- 1. Toutes les lignes administrateur, toujours dans le même ordre : deux
  --    appels simultanés passent l'un après l'autre, sans s'interbloquer.
  perform 1
  from public.profils p
  where p.role = 'administrateur'
  order by p.id
  for update;

  -- 2. L'auteur, relu après l'attente : un administrateur désactivé ou
  --    rétrogradé par un appel simultané est refusé.
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

  v_nouveau_nom := coalesce(btrim(p_nom), v_nom);
  v_nouveau_role := coalesce(p_role, v_role);
  v_nouvel_actif := coalesce(p_actif, v_actif);

  if v_nouveau_nom = v_nom and v_nouveau_role = v_role and v_nouvel_actif = v_actif then
    return jsonb_build_object(
      'nom', v_nom,
      'email', v_email,
      'role', v_role,
      'actif', v_actif,
      'change', false,
      'ancien_role', v_role
    );
  end if;

  -- 4. Dernier administrateur actif (RM-9), y compris soi-même : un
  --    administrateur actif qui ne le serait plus après l'appel.
  if v_role = 'administrateur' and v_actif
    and not (v_nouveau_role = 'administrateur' and v_nouvel_actif)
    and not exists (
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
  set nom = v_nouveau_nom,
      role = v_nouveau_role,
      actif = v_nouvel_actif,
      date_modification = now()
  where id = p_compte;

  return jsonb_build_object(
    'nom', v_nouveau_nom,
    'email', v_email,
    'role', v_nouveau_role,
    'actif', v_nouvel_actif,
    'change', true,
    'ancien_role', v_role
  );
end;
$$;

revoke execute on function public.modifier_compte(uuid, uuid, boolean, text, text) from public;
revoke execute on function public.modifier_compte(uuid, uuid, boolean, text, text) from anon;
revoke execute on function public.modifier_compte(uuid, uuid, boolean, text, text) from authenticated;
grant execute on function public.modifier_compte(uuid, uuid, boolean, text, text) to service_role;
