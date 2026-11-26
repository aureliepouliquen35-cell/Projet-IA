import { Info } from "lucide-react";
import { connection } from "next/server";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { lireMessageConnexion } from "@/server/passage";
import { MESSAGE_SESSION_EXPIREE, MESSAGE_SESSION_TERMINEE } from "@/shared/messages";

// Encadré d'information de la connexion I1 (`alert-info`, icône « i ») :
// - « Votre session a expiré… » après 8 h d'inactivité (FR-9) ;
// - « Votre session a pris fin… » quand le compte a été désactivé pendant
//   la session (FR-22, story 3.4) : neutre, il ne dit pas pourquoi.
// Le message arrive par un cookie de `src/server/passage` (AD-20), posé par
// le proxy ou par la garde d'une Server Function : à placer sous
// `<Suspense>`, la lecture des cookies est dynamique.

export async function MessageConnexion() {
  // Lecture à chaque visite, jamais pendant la préparation de la page : le
  // déchiffrement du cookie consulte l'heure (`Date.now()`, expiration), ce
  // que Cache Components interdit avant une vraie requête.
  await connection();
  const message = await lireMessageConnexion();
  if (message === "session_expiree") return <EncadreSessionExpiree />;
  if (message === "session_terminee") return <EncadreSessionTerminee />;
  return null;
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

/** « Votre session a pris fin. Contactez votre administrateur si besoin. » */
export function EncadreSessionTerminee() {
  return (
    <Alert variant="information" data-slot="session-terminee" className="mb-5">
      <AlertTitle>
        <Info aria-hidden="true" />
        {MESSAGE_SESSION_TERMINEE}
      </AlertTitle>
    </Alert>
  );
}
