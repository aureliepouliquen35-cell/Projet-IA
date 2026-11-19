import { notFound } from "next/navigation";

// Page d'essai : provoque une erreur pendant l'affichage, pour vérifier S3 et
// la ligne correspondante de `journal_technique`. En développement seulement :
// ailleurs, `notFound()` est appelé avant tout calcul (sinon `next build`
// échouerait en préparant la page).
export default function EssaiErreur(): never {
  if (process.env.NODE_ENV !== "development") notFound();

  throw new Error("Erreur d'essai levée par la page /essais/erreur");
}
