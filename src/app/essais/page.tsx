import { notFound } from "next/navigation";

import { Logo } from "@/components/logo";

// Pages d'essai de la story 1.2, en développement seulement : ailleurs
// (build, production), elles répondent S2 avant tout calcul.
export default function Essais() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto flex w-full max-w-form flex-1 flex-col justify-center px-gutter-mobile py-12">
      <Logo />
      <h1 className="mt-8 text-page-title text-text">Pages d’essai</h1>
      <p className="mt-2 text-body text-text-muted">
        Visibles en développement seulement.
      </p>
      <ul className="mt-6 flex flex-col gap-2 text-body">
        <li>
          <a className="text-primary underline" href="/essais/erreur">
            Erreur pendant l’affichage d’une page (S3)
          </a>
        </li>
        <li>
          <a className="text-primary underline" href="/essais/action">
            Erreurs d’une action (format de réponse)
          </a>
        </li>
        <li>
          <a className="text-primary underline" href="/essais/page-inexistante">
            Adresse inconnue (S2)
          </a>
        </li>
      </ul>
    </main>
  );
}
