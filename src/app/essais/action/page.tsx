import { notFound } from "next/navigation";

import { Logo } from "@/components/logo";

import { EssaiAction } from "./essai-action";

// Page d'essai : appelle les actions d'essai et montre leur réponse brute.
// En développement seulement.
export default function PageEssaiAction() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto flex w-full max-w-form flex-1 flex-col justify-center px-gutter-mobile py-12">
      <Logo />
      <h1 className="mt-8 text-page-title text-text">
        Essai du format de réponse
      </h1>
      <p className="mt-2 text-body text-text-muted">
        Chaque bouton appelle une action d’essai et affiche sa réponse.
      </p>
      <EssaiAction />
    </main>
  );
}
