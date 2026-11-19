"use client"; // Les écrans d'erreur de Next.js sont des Client Components.

import { usePathname } from "next/navigation";
import { useState } from "react";

import { EcranErreurInattendue } from "@/components/ecran-erreur";
import { codeDepuisErreur } from "@/shared/code-support";

// S3 — erreur inattendue pendant l'affichage d'une page.
// Le code est calculé depuis l'empreinte posée par Next.js (`error.digest`),
// comme côté serveur dans `onRequestError` : c'est celui de la ligne du
// journal. Aucun détail de l'erreur n'est affiché.
export default function ErreurInattendue({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const page = usePathname() ?? "/";
  const [date] = useState(() => new Date());

  return (
    <EcranErreurInattendue
      code={codeDepuisErreur(error)}
      date={date}
      page={page}
      onReessayer={retry}
    />
  );
}
