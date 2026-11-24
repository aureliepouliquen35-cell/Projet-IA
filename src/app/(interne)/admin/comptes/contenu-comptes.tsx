import { connection } from "next/server";

import { EcranAccesRefuse } from "@/components/ecran-acces-refuse";
import { EtatComptesErreur, TableauComptes } from "@/components/interne/tableau-comptes";
import { exigerAdministrateur } from "@/server/garde";
import { lireComptes } from "@/server/lectures/comptes";
import { MESSAGES_COMPTES } from "@/shared/messages";

// Contenu de « Comptes » (A1). Comme toute page d'administration, il vérifie
// d'abord la personne connectée et son rôle (`exigerAdministrateur`, AD-7) :
//   - sans session, ou avec un compte inactif : renvoi vers la connexion ;
//   - collaborateur : écran S1, sans aucune lecture des comptes ;
//   - administrateur : le titre « Comptes », puis le tableau de tous les
//     comptes, ou « Impossible de charger les comptes. » avec « Réessayer ».
// La lecture vérifie de nouveau le rôle, puis la fonction SQL (AD-9) : un
// refus de la base (rôle retiré entre-temps) donne aussi S1.

export async function ContenuComptes() {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  if (!(await exigerAdministrateur())) return <EcranAccesRefuse />;

  const lecture = await lireComptes();
  if (!lecture.ok && "accesRefuse" in lecture) return <EcranAccesRefuse />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text">{MESSAGES_COMPTES.titre}</h1>
      {lecture.ok ? <TableauComptes comptes={lecture.donnees} /> : <EtatComptesErreur />}
    </div>
  );
}
