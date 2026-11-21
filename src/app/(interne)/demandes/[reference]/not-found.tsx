import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { EcranPageIntrouvable } from "@/components/ecran-erreur";
import { Button } from "@/components/ui/button";
import { adresseListe } from "@/shared/adresse-liste";
import { MESSAGES_DETAIL } from "@/shared/messages";

// I4, « demande supprimée ou inexistante » (EXPERIENCE.md) : page S2 avec
// son message propre et « Retour aux demandes ». Affichée quand la
// référence est inconnue ou mal formée (`notFound()` de `ContenuDemande`).
export default function DemandeIntrouvable() {
  return (
    <EcranPageIntrouvable
      message={MESSAGES_DETAIL.introuvable}
      actions={
        <Button asChild>
          <Link href={adresseListe()}>
            <ArrowLeft aria-hidden="true" />
            {MESSAGES_DETAIL.retourAuxDemandes}
          </Link>
        </Button>
      }
    />
  );
}
