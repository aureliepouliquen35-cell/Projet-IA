-- Socle des droits (AD-9, AD-16)
--
-- Le rôle public de Supabase (`anon`) correspond à la clé publique, visible
-- dans le navigateur : il ne doit avoir aucun droit sur la base. Le dépôt
-- public passe par le serveur (clé secrète), jamais par `anon`.
--
-- Par ailleurs, Postgres donne par défaut à tout le monde (`public`) le droit
-- d'exécuter une nouvelle fonction, et Supabase le donne aussi à `anon` et
-- `authenticated`. On le retire : chaque migration qui crée une fonction
-- donne ensuite ce droit explicitement, à `authenticated` ou au seul
-- `service_role` (AD-9).
--
-- Cette migration ne crée aucune table ni fonction.

-- 1. Objets déjà présents dans le schéma public : plus aucun droit pour anon.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
-- Postgres donne aussi l'exécution des fonctions à `public` (donc à anon,
-- par héritage) : on la retire pour les fonctions déjà présentes.
revoke execute on all functions in schema public from public;

-- 2. Objets créés plus tard par les migrations (propriétaire : postgres) :
--    anon ne reçoit plus aucun droit automatiquement.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all on functions from anon;

-- 3. Droit d'exécution des nouvelles fonctions : plus rien par défaut.
--    Le droit donné à `public` par Postgres est un réglage global (il ne peut
--    pas être retiré schéma par schéma) ; celui donné par Supabase à
--    `authenticated` est propre au schéma public.
alter default privileges for role postgres
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;
