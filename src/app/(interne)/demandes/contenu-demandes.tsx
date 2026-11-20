import { exigerUtilisateur } from "@/server/garde";

// Contenu de « Demandes » (version d'attente, story 1.6). Comme toute
// lecture interne, il vérifie d'abord la personne connectée (AD-7) : sans
// session, ou avec un compte inactif, renvoi vers la connexion.
export async function ContenuDemandes() {
  await exigerUtilisateur();
  return (
    <>
      <h1 className="text-page-title text-text">Demandes</h1>
      <p className="mt-2 text-body text-text-muted">
        La liste des demandes arrive dans une prochaine version.
      </p>
    </>
  );
}
