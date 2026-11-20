"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { actionSeDeconnecter } from "@/server/actions/se-deconnecter";
import { ADRESSE_CONNEXION } from "@/shared/acces";
import { MESSAGES_INTERNE } from "@/shared/messages";

// Déconnexion (FR-9) : bouton « Se déconnecter » de l'espace interne, et
// rechargement d'une page interne que le navigateur ressortirait de son
// cache (bouton Retour).

/** Ce dont la déconnexion a besoin : passé en paramètre pour pouvoir être essayé seul. */
export type DependancesDeconnexion = {
  /** La Server Function (`actionSeDeconnecter`). */
  seDeconnecter: () => Promise<unknown>;
  /** Remplace la page par une autre, avec un rechargement complet. */
  remplacer: (adresse: string) => void;
};

/**
 * Ferme la session, puis charge entièrement la page de connexion à la place
 * de la page actuelle (`location.replace`) : le cache du routeur de Next.js,
 * qui garde les pages déjà vues, disparaît avec la page. La page de
 * connexion s'ouvre même si la fermeture a échoué.
 */
export async function seDeconnecter({ seDeconnecter, remplacer }: DependancesDeconnexion) {
  try {
    await seDeconnecter();
  } catch {
    // Serveur injoignable : la page de connexion s'ouvre quand même ; une
    // page interne rouverte repassera par la garde.
  }
  remplacer(ADRESSE_CONNEXION);
}

export function BoutonDeconnexion() {
  const [enCours, setEnCours] = useState(false);

  function deconnecter() {
    if (enCours) return;
    setEnCours(true);
    void seDeconnecter({
      seDeconnecter: actionSeDeconnecter,
      remplacer: (adresse) => window.location.replace(adresse),
    });
  }

  return (
    <Button
      variant="secondaire"
      size="sm"
      disabled={enCours}
      aria-busy={enCours || undefined}
      onClick={deconnecter}
    >
      {enCours ? (
        <>
          <LoaderCircle aria-hidden="true" className="animate-spin" />
          {MESSAGES_INTERNE.deconnexionEnCours}
        </>
      ) : (
        <>
          <LogOut aria-hidden="true" />
          {MESSAGES_INTERNE.seDeconnecter}
        </>
      )}
    </Button>
  );
}

/**
 * Recharge la page quand `cible` (la fenêtre) signale, par `pageshow` avec
 * `persisted`, qu'elle a été ressortie du cache du navigateur (bouton
 * Retour) sans être redemandée au serveur. Renvoie la fonction qui retire
 * l'écoute.
 */
export function installerRechargement(cible: EventTarget, recharger: () => void): () => void {
  function auRetour(evenement: Event) {
    if ((evenement as PageTransitionEvent).persisted === true) recharger();
  }
  cible.addEventListener("pageshow", auRetour);
  return () => cible.removeEventListener("pageshow", auRetour);
}

/**
 * Une page interne ressortie du cache du navigateur est rechargée, pour
 * repasser par le proxy et la garde. Sans session, on arrive sur la
 * connexion.
 */
export function RechargementSiRestauree() {
  useEffect(() => installerRechargement(window, () => window.location.reload()), []);
  return null;
}
