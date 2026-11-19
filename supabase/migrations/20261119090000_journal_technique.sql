-- Journal technique (AD-9, AD-12, AD-13, AD-16)
--
-- Les journaux de Vercel ne sont gardés qu'une heure : les erreurs et les
-- événements importants sont donc enregistrés dans cette table, que le
-- support de niveau 2 consulte et filtre dans le tableau de bord de Supabase
-- (par exemple sur `code_erreur`, le code affiché par l'écran S3).
--
-- Règles :
--   - on n'y écrit que par la fonction `ecrire_journal`, appelée par le seul
--     module `src/server/journal` (fonction `journaliser`) avec la clé
--     secrète ;
--   - niveaux et événements forment des listes fermées (AD-13) ;
--   - jamais de mot de passe, ni de nom, coordonnées ou texte d'un
--     demandeur ;
--   - aucune lecture ni écriture directe : RLS activé sans aucune règle, et
--     tous les droits sur la table retirés, y compris à `service_role`
--     (qui ignore le RLS : seul le retrait des droits l'arrête).

create table public.journal_technique (
  id uuid primary key default gen_random_uuid(),
  date_creation timestamptz not null default now(),
  niveau text not null
    constraint journal_technique_niveau_check
    check (niveau in ('info', 'avertissement', 'erreur')),
  evenement text not null
    constraint journal_technique_evenement_check
    check (evenement in (
      'connexion_reussie',
      'connexion_echouee',
      'connexion_bloquee',
      'compte_cree',
      'role_modifie',
      'compte_desactive',
      'compte_reactive',
      'mot_de_passe_reinitialise',
      'demande_supprimee',
      'anonymisation',
      'parametres_modifies',
      'envoi_refuse',
      'erreur_inattendue',
      'sauvegarde_reussie'
    )),
  details jsonb not null default '{}'::jsonb
    constraint journal_technique_details_check
    check (jsonb_typeof(details) = 'object'),
  -- Code court à recopier pour le support (base 36, majuscules : « 7F3A »).
  code_erreur text
    constraint journal_technique_code_erreur_check
    check (code_erreur ~ '^[0-9A-Z]{1,7}$')
);

comment on table public.journal_technique is
  'Journal technique (AD-13). Écriture uniquement par ecrire_journal. Jamais de mot de passe ni de donnée de demandeur.';

-- Consultation par date, la plus récente d'abord.
create index journal_technique_date_creation_idx
  on public.journal_technique (date_creation desc);

-- Recherche par le support à partir du code affiché par S3.
create index journal_technique_code_erreur_idx
  on public.journal_technique (code_erreur)
  where code_erreur is not null;

-- Rien n'est permis sauf ce qui est écrit : aucune règle, donc aucun accès.
alter table public.journal_technique enable row level security;

-- Aucun droit direct sur la table, pour personne (AD-9).
revoke all on table public.journal_technique from public;
revoke all on table public.journal_technique from anon;
revoke all on table public.journal_technique from authenticated;
revoke all on table public.journal_technique from service_role;

-- Seul chemin d'écriture. La fonction s'exécute avec les droits de son
-- propriétaire (`security definer`), avec un chemin de recherche vide. Seul
-- `service_role` (la clé secrète, côté serveur) peut la lancer : ce droit
-- d'exécution est la vérification de l'appelant. Les contraintes de la table
-- refusent un niveau, un événement ou un code hors liste.
create function public.ecrire_journal(
  p_niveau text,
  p_evenement text,
  p_details jsonb default '{}'::jsonb,
  p_code_erreur text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.journal_technique (niveau, evenement, details, code_erreur)
  values (p_niveau, p_evenement, coalesce(p_details, '{}'::jsonb), p_code_erreur);
end;
$$;

revoke execute on function public.ecrire_journal(text, text, jsonb, text) from public;
revoke execute on function public.ecrire_journal(text, text, jsonb, text) from anon;
revoke execute on function public.ecrire_journal(text, text, jsonb, text) from authenticated;
grant execute on function public.ecrire_journal(text, text, jsonb, text) to service_role;
