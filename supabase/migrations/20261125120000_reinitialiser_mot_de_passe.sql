-- Réinitialiser le mot de passe d'un collègue (AD-6, AD-9, AD-16)
--
-- Story 3.5. Fonction créée : `reinitialiser_mdp`. Aucune table créée ni
-- modifiée.
--
-- Règles :
--   - l'administrateur donne un nouveau mot de passe temporaire (FR-23) :
--     le profil repasse à « doit changer son mot de passe », et l'empreinte
--     bcrypt (`extensions.crypt`) du nouveau mot de passe temporaire
--     remplace l'ancienne dans `mdp_temporaires`. Jamais de mot de passe en
--     clair ;
--   - la base d'abord, puis Supabase Auth : le module `src/server/admin`
--     change ensuite le mot de passe du compte Auth. Si Auth échoue, rien
--     n'est défait : l'ancien mot de passe marche encore, et la personne
--     devra le changer à sa prochaine connexion ; un nouvel essai répare.
--     Dans l'autre ordre, un mot de passe temporaire serait utilisable sans
--     obligation de le changer ;
--   - l'auteur est revérifié ici (NV202) : un administrateur actif, au mot de
--     passe choisi. Il est donné par le serveur (`exigerAdministrateur()`),
--     puisque la clé secrète n'a pas de session ;
--   - un compte désactivé peut être réinitialisé, et reste désactivé :
--     `actif` n'est jamais touché ;
--   - `security definer`, chemin de recherche vide, exécutable par
--     `service_role` seul (la clé secrète, côté serveur, AD-9). Personne
--     n'écrit directement dans `profils` ni dans `mdp_temporaires`.
--
-- `terminer_changement_mdp` (story 1.7) efface l'empreinte quand la personne
-- choisit son mot de passe ; elle refuse déjà le mot de passe temporaire remis
-- entre-temps (NV106). Les anciennes migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Fonction reinitialiser_mdp (FR-23)
-- ---------------------------------------------------------------------------

-- Donne au compte `p_compte` le mot de passe temporaire `p_mdp_temporaire`,
-- à la demande de l'administrateur `p_auteur`.
--
-- Renvoie :
--   { "nom", "email" }
--
-- Refus prévus :
--   NV202 : l'auteur n'est pas un administrateur actif au mot de passe
--           choisi ;
--   NV204 : compte introuvable ;
--   NV205 : mot de passe temporaire de moins de 12 caractères (NFR-11).
-- Un paramètre absent heurte le code 22004.
create function public.reinitialiser_mdp(
  p_auteur uuid,
  p_compte uuid,
  p_mdp_temporaire text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nom text;
  v_email text;
begin
  if p_auteur is null or p_compte is null then
    raise exception 'Mot de passe non réinitialisé : auteur et compte sont obligatoires.'
      using errcode = '22004';
  end if;

  -- 1. L'auteur : un administrateur actif, au mot de passe choisi.
  if not exists (
    select 1
    from public.profils p
    where p.id = p_auteur
      and p.actif
      and not p.doit_changer_mdp
      and p.role = 'administrateur'
  ) then
    raise exception 'Mot de passe non réinitialisé : réservé aux administrateurs actifs.'
      using errcode = 'NV202';
  end if;

  -- 2. Le mot de passe temporaire : 12 caractères au moins (NFR-11).
  if p_mdp_temporaire is null or char_length(p_mdp_temporaire) < 12 then
    raise exception 'Mot de passe non réinitialisé : le mot de passe temporaire doit faire au moins 12 caractères.'
      using errcode = 'NV205';
  end if;

  -- 3. Le compte visé, verrouillé : un choix de mot de passe simultané
  --    (`terminer_changement_mdp`) passe avant ou après, jamais entre les deux.
  select p.nom, p.email
  into v_nom, v_email
  from public.profils p
  where p.id = p_compte
  for update;

  if not found then
    raise exception 'Mot de passe non réinitialisé : compte introuvable.'
      using errcode = 'NV204';
  end if;

  -- 4. « Doit changer son mot de passe », sans toucher à `actif`.
  update public.profils
  set doit_changer_mdp = true,
      date_modification = now()
  where id = p_compte;

  -- 5. Un seul mot de passe temporaire par compte : la ligne est remplacée.
  insert into public.mdp_temporaires (profil_id, empreinte)
  values (p_compte, extensions.crypt(p_mdp_temporaire, extensions.gen_salt('bf')))
  on conflict (profil_id) do update
  set empreinte = excluded.empreinte,
      date_creation = now();

  return jsonb_build_object('nom', v_nom, 'email', v_email);
end;
$$;

revoke execute on function public.reinitialiser_mdp(uuid, uuid, text) from public;
revoke execute on function public.reinitialiser_mdp(uuid, uuid, text) from anon;
revoke execute on function public.reinitialiser_mdp(uuid, uuid, text) from authenticated;
grant execute on function public.reinitialiser_mdp(uuid, uuid, text) to service_role;
