-- Détail d'une demande et son historique (AD-1, AD-3, AD-7, AD-9, AD-16)
--
-- Story 1.10. Index créé : `evenements_demande_id_date_creation`. Fonction
-- créée : `lire_demande`.
--
-- Règles :
--   - l'écran I4 lit une demande et son historique par une seule fonction
--     `security definer`, au chemin de recherche vide, exécutable par
--     `authenticated` seul ; elle vérifie d'abord l'appelant
--     (`exiger_utilisateur_interne`, AD-7, AD-9). Aucune table n'est ouverte
--     en lecture directe ;
--   - tout utilisateur interne voit toutes les demandes (RM-6) : aucun filtre
--     selon la personne connectée ;
--   - lecture seule : l'historique n'est jamais modifié (AD-3) ;
--   - le détail renvoie les coordonnées complètes du demandeur (email,
--     téléphone), que la liste ne montre pas (EXPERIENCE.md, « Le moins
--     possible à l'écran ») ;
--   - l'historique est générique (`type`, `auteur`, `date`) : la story 1.11
--     y ajoutera l'ancien et le nouveau statut et le nom de l'auteur interne
--     par une nouvelle migration.
--
-- Les anciennes migrations ne sont pas modifiées (AD-16).

-- ---------------------------------------------------------------------------
-- 1. Index de l'historique (NFR-13)
-- ---------------------------------------------------------------------------

-- Événements d'une demande, du plus ancien au plus récent. Sert aussi la
-- suppression en cascade d'une demande (FR-28) : Postgres n'indexe pas seul
-- une clé étrangère.
create index evenements_demande_id_date_creation
  on public.evenements (demande_id, date_creation);

-- ---------------------------------------------------------------------------
-- 2. Fonction lire_demande (FR-15, FR-17, RM-6)
-- ---------------------------------------------------------------------------

-- Une demande et son historique, par sa référence (mise en majuscules :
-- `nova-2026-0042` désigne `NOVA-2026-0042`).
--   - `null` si aucune demande ne porte cette référence ;
--   - `telephone` et `entreprise` valent `null` s'ils n'ont pas été donnés ;
--   - `categorie` est le nom de la catégorie ;
--   - `evenements` : du plus ancien au plus récent (date, puis identifiant
--     pour départager deux événements à la même heure) ; `auteur` est
--     `auteur_libelle` (`demandeur` ou `systeme`).
--
-- Renvoie :
--   { "id", "reference", "nom", "email", "telephone", "entreprise",
--     "objet", "description", "categorie", "canal", "statut", "date_depot",
--     "evenements": [ { "type", "auteur", "date" }, … ] }
create function public.lire_demande(p_reference text)
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
    'evenements', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', e.type,
            'auteur', e.auteur_libelle,
            'date', e.date_creation
          )
          order by e.date_creation, e.id
        )
        from public.evenements e
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
