import { connection } from "next/server";

import { EcranAccesRefuse } from "@/components/ecran-acces-refuse";
import { EtatInformationsErreur, InformationsGeneralesFormulaire } from "@/components/interne/informations-generales";
import { exigerAdministrateur } from "@/server/garde";
import { lireInformationsGenerales } from "@/server/lectures/parametres";
import { MESSAGES_PARAMETRES } from "@/shared/messages";

// Contenu de « Informations générales » (A3). Comme toute page
// d'administration, il vérifie d'abord la personne connectée et son rôle
// (`exigerAdministrateur`, AD-7) :
//   - sans session, ou avec un compte inactif : renvoi vers la connexion ;
//   - collaborateur : écran S1, sans aucune lecture des informations ;
//   - administrateur : le titre « Informations générales », puis le
//     formulaire rempli avec les valeurs en place, ou « Impossible de
//     charger les informations. » avec « Réessayer ».
// La lecture vérifie de nouveau le rôle, puis la fonction SQL (AD-9) : un
// refus de la base (rôle retiré entre-temps) donne aussi S1.

export async function ContenuInformations() {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  if (!(await exigerAdministrateur())) return <EcranAccesRefuse />;

  const lecture = await lireInformationsGenerales();
  if (!lecture.ok && "accesRefuse" in lecture) return <EcranAccesRefuse />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text">{MESSAGES_PARAMETRES.titre}</h1>
      {lecture.ok ? <InformationsGeneralesFormulaire informations={lecture.donnees} /> : <EtatInformationsErreur />}
    </div>
  );
}
