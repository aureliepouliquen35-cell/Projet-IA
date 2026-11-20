-- Choix du mot de passe définitif (AD-6, AD-7, AD-9, AD-16)
--
-- Story 1.7. Fonctions créées : `est_mot_de_passe_temporaire`,
-- `terminer_changement_mdp`. Aucune table créée ni modifiée.
--
-- Règles :
--   - l'application ne lit jamais `mdp_temporaires` : elle demande à
--     `est_mot_de_passe_temporaire` si le mot de passe proposé est le
--     mot de passe temporaire du compte, en comparant son empreinte bcrypt
--     (`extensions.crypt`). Le mot de passe n'est jamais enregistré ;
--   - le module `src/server/connexion` change d'abord le mot de passe dans
--     Supabase Auth, puis appelle `terminer_changement_mdp`, qui lève
--     « doit changer son mot de passe » et efface l'empreinte du mot de passe
--     temporaire (AD-6). Elle refait les contrôles de longueur et de
--     différence de son côté (AD-7, double barrière) ;
--   - les deux fonctions ne sont exécutables que par `service_role` (la clé
--     secrète, côté serveur) : ce droit d'exécution est la vérification de
--     l'appelant. Le module ne les appelle qu'avec l'identifiant de la
--     session vérifiée par la garde.

-- ---------------------------------------------------------------------------
-- 1. Fonction est_mot_de_passe_temporaire (AD-6)
-- ---------------------------------------------------------------------------

-- Vrai si `p_mdp` est le mot de passe temporaire encore enregistré pour ce
-- compte. Faux s'il est différent, ou s'il n'y a plus d'empreinte.
create function public.est_mot_de_passe_temporaire(p_id uuid, p_mdp text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_id is null or p_mdp is null then
    return false;
  end if;

  return exists (
    select 1
    from public.mdp_temporaires m
    where m.profil_id = p_id
      and m.empreinte = extensions.crypt(p_mdp, m.empreinte)
  );
end;
$$;

revoke execute on function public.est_mot_de_passe_temporaire(uuid, text) from public;
revoke execute on function public.est_mot_de_passe_temporaire(uuid, text) from anon;
revoke execute on function public.est_mot_de_passe_temporaire(uuid, text) from authenticated;
grant execute on function public.est_mot_de_passe_temporaire(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Fonction terminer_changement_mdp (AD-6)
-- ---------------------------------------------------------------------------

-- Appelée juste après le changement du mot de passe dans Supabase Auth.
-- Dans une seule transaction, elle :
--   1. verrouille le profil (deux envois simultanés passent l'un après
--      l'autre) ;
--   2. ne fait rien si le mot de passe a déjà été choisi (drapeau faux) ;
--   3. vérifie que le nouveau mot de passe a au moins 12 caractères
--      (NFR-11) et qu'il n'est pas le mot de passe temporaire ;
--   4. lève « doit changer son mot de passe » ;
--   5. efface l'empreinte du mot de passe temporaire.
--
-- Refus prévus :
--   NV105 : nouveau mot de passe de moins de 12 caractères ;
--   NV106 : nouveau mot de passe identique au mot de passe temporaire.
create function public.terminer_changement_mdp(p_id uuid, p_mdp text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doit_changer boolean;
begin
  select p.doit_changer_mdp
  into v_doit_changer
  from public.profils p
  where p.id = p_id
  for update;

  if v_doit_changer is distinct from true then
    return;
  end if;

  if p_mdp is null or char_length(p_mdp) < 12 then
    raise exception 'Changement refusé : le nouveau mot de passe doit faire au moins 12 caractères.'
      using errcode = 'NV105';
  end if;

  if exists (
    select 1
    from public.mdp_temporaires m
    where m.profil_id = p_id
      and m.empreinte = extensions.crypt(p_mdp, m.empreinte)
  ) then
    raise exception 'Changement refusé : le nouveau mot de passe est le mot de passe temporaire.'
      using errcode = 'NV106';
  end if;

  update public.profils
  set doit_changer_mdp = false,
      date_modification = now()
  where id = p_id;

  delete from public.mdp_temporaires
  where profil_id = p_id;
end;
$$;

revoke execute on function public.terminer_changement_mdp(uuid, text) from public;
revoke execute on function public.terminer_changement_mdp(uuid, text) from anon;
revoke execute on function public.terminer_changement_mdp(uuid, text) from authenticated;
grant execute on function public.terminer_changement_mdp(uuid, text) to service_role;
