import { connection } from "next/server";

import { EcranAccesRefuse } from "@/components/ecran-acces-refuse";
import { AjouterCategorie } from "@/components/interne/ajouter-categorie";
import { EtatCategoriesErreur, TableauCategories } from "@/components/interne/tableau-categories";
import { exigerAdministrateur } from "@/server/garde";
import { lireCategoriesAdministration } from "@/server/lectures/categories";
import { MESSAGES_CATEGORIES } from "@/shared/messages";

// Contenu de « Catégories » (A2). Comme toute page d'administration, il
// vérifie d'abord la personne connectée et son rôle (`exigerAdministrateur`,
// AD-7) :
//   - sans session, ou avec un compte inactif : renvoi vers la connexion ;
//   - collaborateur : écran S1, sans aucune lecture des catégories ;
//   - administrateur : le titre « Catégories », le champ « Nouvelle
//     catégorie » et « Ajouter », puis la liste de toutes les catégories,
//     ou « Impossible de charger les catégories. » avec « Réessayer » (le
//     champ reste : ajouter une catégorie ne dépend pas de cette lecture).
// La lecture vérifie de nouveau le rôle, puis la fonction SQL (AD-9) : un
// refus de la base (rôle retiré entre-temps) donne aussi S1.

export async function ContenuCategories() {
  // Lecture à chaque visite, jamais pendant la préparation de la page : la
  // lecture de la session par Supabase consulte l'heure (`Date.now()`), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  if (!(await exigerAdministrateur())) return <EcranAccesRefuse />;

  const lecture = await lireCategoriesAdministration();
  if (!lecture.ok && "accesRefuse" in lecture) return <EcranAccesRefuse />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text">{MESSAGES_CATEGORIES.titre}</h1>
      <AjouterCategorie />
      {lecture.ok ? <TableauCategories categories={lecture.donnees} /> : <EtatCategoriesErreur />}
    </div>
  );
}
