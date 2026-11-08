import { Inbox, SquarePlus } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

// Page d'accueil provisoire : elle sera remplacée par le formulaire de dépôt
// (story 1.3).
export default function Accueil() {
  return (
    <main className="mx-auto flex w-full max-w-form flex-1 flex-col justify-center px-gutter-mobile py-12">
      <Logo />

      <h1 className="mt-8 text-page-title text-text">
        Bienvenue sur Nova Services
      </h1>
      <p className="mt-2 text-body text-text-muted">
        Cet espace vous permettra de déposer une demande auprès de Nova et
        d’en suivre le traitement. Il est en cours de préparation.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <a href="#bientot">
            <SquarePlus aria-hidden="true" />
            Déposer une demande
          </a>
        </Button>
        <Button asChild variant="secondaire">
          <a href="#bientot">
            <Inbox aria-hidden="true" />
            Espace collaborateurs
          </a>
        </Button>
      </div>

      <p id="bientot" className="mt-6 text-caption text-text-muted">
        Ces deux espaces ouvriront prochainement.
      </p>
    </main>
  );
}
