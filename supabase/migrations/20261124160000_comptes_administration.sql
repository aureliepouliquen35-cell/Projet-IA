-- Comptes de l'écran A1, réservés aux administrateurs (AD-7, AD-9, AD-16)
--
-- Story 3.1. Fonctions créées : `exiger_administrateur`, `lister_comptes`.
--
-- Règles :
--   - un collaborateur n'a accès à aucune fonction d'administration, et c'est
--     la base qui le vérifie (FR-24, RM-7) : cacher le menu ne suffit pas.
--     La protection est vérifiée trois fois : `exigerAdministrateur()` dans
--     la page A1, dans sa lecture, puis ici ;
--   - le rôle est relu dans `profils` à chaque appel, jamais dans les
--     métadonnées du compte Supabase, que l'utilisateur peut modifier
--     lui-même (AD-7) ;
--   - aucune table n'est ouverte en lecture directe : la liste des comptes
--     passe par une fonction `security definer`, au chemin de recherche vide,
--     exécutable par `authenticated` seul (AD-9). Elle commence par vérifier
--     l'appelant avec `exiger_administrateur` ;
--   - la liste ne renvoie que ce que l'écran A1 affiche : identifiant, nom,
--     email, rôle et état. Jamais de mot de passe ni d'empreinte
--     (`mdp_temporaires` n'est pas lue) ;
--   - tous les comptes sont renvoyés, désactivés compris (seuls les
--     administrateurs les voient), triés par nom (sans tenir compte des
--     majuscules ni des accents) puis par email.
--
-- La création, la modification, la désactivation et la réinitialisation
-- (stories 3.2 à 3.5) s'ajouteront par de nouvelles migrations.

-- ---------------------------------------------------------------------------
-- 1. Fonction exiger_administrateur (AD-7, AD-9)
-- ---------------------------------------------------------------------------

-- Vérification de l'appelant, commune aux fonctions d'administration.
-- Renvoie l'identifiant de la personne connectée (`auth.uid()`) si son
-- profil est actif, que son mot de passe temporaire a été remplacé et que
-- son rôle est `administrateur`.
--
-- Refus prévu :
--   NV202 : pas de session, pas de profil, compte désactivé, mot de passe
--           encore à choisir, ou rôle autre qu'administrateur.
--
-- Exécutable par personne : seules les fonctions de cette base (qui
-- appartiennent au même propriétaire) l'appellent.
create function public.exiger_administrateur()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
begin
  if v_id is null or not exists (
    select 1
    from public.profils p
    where p.id = v_id
      and p.actif
      and not p.doit_changer_mdp
      and p.role = 'administrateur'
  ) then
    raise exception 'Accès refusé : réservé aux administrateurs actifs.'
      using errcode = 'NV202';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.exiger_administrateur() from public;
revoke execute on function public.exiger_administrateur() from anon;
revoke execute on function public.exiger_administrateur() from authenticated;
revoke execute on function public.exiger_administrateur() from service_role;

-- ---------------------------------------------------------------------------
-- 2. Fonction lister_comptes (FR-24, écran A1)
-- ---------------------------------------------------------------------------

-- Tous les comptes, désactivés compris, pour le tableau A1.
--
-- Renvoie un tableau jsonb (vide s'il n'y a aucun profil, ce qui n'arrive
-- pas : l'administrateur connecté en a un) :
--   [{ "id", "nom", "email", "role", "actif" }, …]
-- trié par nom (`normaliser_recherche` : sans majuscules ni accents), puis
-- par email.
create function public.lister_comptes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_administrateur();

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nom', p.nom,
          'email', p.email,
          'role', p.role,
          'actif', p.actif
        )
        order by public.normaliser_recherche(p.nom), p.nom, lower(p.email)
      )
      from public.profils p
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.lister_comptes() from public;
revoke execute on function public.lister_comptes() from anon;
revoke execute on function public.lister_comptes() from service_role;
grant execute on function public.lister_comptes() to authenticated;
