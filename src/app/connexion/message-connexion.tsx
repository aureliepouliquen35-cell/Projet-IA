import { Info } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { lireMessageConnexion } from "@/server/passage";
import { MESSAGE_SESSION_EXPIREE } from "@/shared/messages";

// Encadré d'information de la connexion I1 (`alert-info`, icône « i ») :
// « Votre session a expiré… » après 8 h d'inactivité (FR-9). Le message
// arrive par un cookie de `src/server/passage` (AD-20), posé par le proxy :
// à placer sous `<Suspense>`, la lecture des cookies est dynamique.

export async function MessageConnexion() {
  const message = await lireMessageConnexion();
  if (message !== "session_expiree") return null;
  return <EncadreSessionExpiree />;
}

/** « Votre session a expiré. Reconnectez-vous pour continuer. » */
export function EncadreSessionExpiree() {
  return (
    <Alert variant="information" data-slot="session-expiree" className="mb-5">
      <AlertTitle>
        <Info aria-hidden="true" />
        {MESSAGE_SESSION_EXPIREE}
      </AlertTitle>
    </Alert>
  );
}
