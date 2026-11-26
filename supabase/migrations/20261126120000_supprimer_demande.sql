-- Supprimer définitivement une demande (FR-28, RM-5, RM-7, AD-2, AD-3, AD-7,
-- AD-9, AD-16)
--
-- Story 4.4. Fonction créée : `supprimer_demande`.
--
-- Règles :
--   - seul chemin qui efface une demande et son historique (AD-2) :
--     l'application ne fait jamais de `delete` direct sur `demandes` ou
--     `evenements`, qui n'ont aucune règle RLS d'écriture ;
--   - c'est l'une des deux seules exceptions à « l'historique ne se modifie
--     ni ne se supprime » (RM-5, AD-3) ; l'autre, l'anonymisation, viendra
--     avec l'epic 6. Les événements ne sont effacés nulle part ailleurs ;
--   - réservée aux administrateurs (RM-7) : la fonction commence par
--     `exiger_administrateur`, qui relit le rôle dans `profils` (AD-7) et
--     refuse tout autre appelant (NV202). La Server Function a déjà fait le
--     même contrôle : la base le refait ;
--   - dans une seule transaction : la demande est verrouillée, puis ses
--     événements sont effacés, puis la demande. `evenements.demande_id` est
--     déjà en `on delete cascade` (story 1.3), mais l'effacement des
--     événements reste écrit ici, explicitement ;
--   - la clé étrangère est déjà indexée (`evenements_demande_id_date_creation`,
--     story 1.10) : aucun nouvel index ;
--   - rien n'est écrit au journal ici : la Server Function écrit
--     `demande_supprimee` par `journaliser()`, avec seulement la référence et
--     l'auteur, jamais une donnée du demandeur (AD-13) ;
--   - `security definer`, au chemin de recherche vide, exécutable par
--     `authenticated` seul (AD-9).
--
-- Les anciennes migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- Fonction supprimer_demande (FR-28)
-- ---------------------------------------------------------------------------

-- Efface la demande `p_reference` (mise en majuscules) et tout son
-- historique.
--
-- Dans une seule transaction, elle :
--   1. vérifie l'appelant (`exiger_administrateur`, AD-7) ;
--   2. verrouille la demande jusqu'à la fin de la transaction : deux
--      suppressions simultanées passent l'une après l'autre, et la seconde
--      ne trouve plus rien ;
--   3. efface ses événements, puis la demande.
--
-- Renvoie :
--   { "resultat": "supprimee" | "introuvable", "reference": référence en
--     majuscules }
--
-- Refus prévu (le serveur l'a déjà vérifié avant d'appeler) :
--   NV202 : appelant qui n'est pas un administrateur actif.
create function public.supprimer_demande(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text := upper(p_reference);
  v_demande_id uuid;
begin
  perform public.exiger_administrateur();

  select d.id
  into v_demande_id
  from public.demandes d
  where d.reference = v_reference
  for update;

  if v_demande_id is null then
    return jsonb_build_object('resultat', 'introuvable', 'reference', v_reference);
  end if;

  delete from public.evenements e
  where e.demande_id = v_demande_id;

  delete from public.demandes d
  where d.id = v_demande_id;

  return jsonb_build_object('resultat', 'supprimee', 'reference', v_reference);
end;
$$;

revoke execute on function public.supprimer_demande(text) from public;
revoke execute on function public.supprimer_demande(text) from anon;
revoke execute on function public.supprimer_demande(text) from service_role;
grant execute on function public.supprimer_demande(text) to authenticated;
