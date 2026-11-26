"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useEffectEvent } from "react";

import { COOKIE_ROLE, lireCookieRole, roleAChange, roleDuCookie } from "@/shared/acces";
import type { Role } from "@/shared/constantes";

// Suivi du rôle dans le menu latéral (story 3.3 ; FR-22) : le menu est dans
// le layout, qui n'est pas rendu de nouveau quand on passe d'une page
// interne à l'autre. Ce composant compare le rôle avec lequel le menu a été
// rendu (`role`) au cookie `nova_role`, que le proxy pose avec le rôle relu
// dans `profils` à chaque page protégée. S'ils diffèrent (administrateur
// rétrogradé, ou promu), le menu est rechargé (`router.refresh()`) : la
// section Administration apparaît ou disparaît.
//
// La comparaison a lieu :
// - quand le cookie `nova_role` change, si le navigateur sait le signaler
//   (`cookieStore`, événement `change`). C'est ce qui couvre une navigation
//   qui ne change que les paramètres de l'adresse (filtres, pagination), et
//   une page affichée avant que la réponse qui pose le cookie soit arrivée ;
// - à chaque changement de chemin, en repli pour les navigateurs sans
//   `cookieStore` (et à l'arrivée du composant).
//
// Pas de boucle : le menu n'est rechargé que si le cookie donne un autre
// rôle que le sien ; après le rechargement, ils sont d'accord, et un
// nouveau rôle du menu ne relance pas de comparaison.
//
// Simple signal d'affichage, rendu pour les deux rôles : il n'affiche rien
// et ne protège rien. La page, la garde (`exigerAdministrateur()`) et la
// base vérifient elles-mêmes le rôle. Sans cookie lisible, rien ne se passe.

/** Ce que le composant utilise de `window.cookieStore` (absent de certains navigateurs). */
type MagasinCookies = {
  addEventListener(type: "change", ecouteur: (evenement: ChangementCookies) => void): void;
  removeEventListener(type: "change", ecouteur: (evenement: ChangementCookies) => void): void;
};
type ChangementCookies = { changed?: readonly { name?: string; value?: string }[] };

export function SuiviRole({ role }: { role: Role }) {
  const chemin = usePathname();
  const router = useRouter();

  // Lit le rôle du menu au moment de la vérification, sans relancer les
  // vérifications quand il change (après un rechargement, il est à jour).
  const verifier = useEffectEvent((roleDuNavigateur: Role | null) => {
    if (roleAChange(roleDuNavigateur, role)) router.refresh();
  });

  // Repli : à chaque changement de chemin.
  useEffect(() => {
    verifier(lireCookieRole(document.cookie));
  }, [chemin]);

  // Dès que le proxy pose un nouveau `nova_role`, si le navigateur le signale.
  useEffect(() => {
    const magasin = (globalThis as { cookieStore?: MagasinCookies }).cookieStore;
    if (!magasin) return;
    const ecouteur = (evenement: ChangementCookies) => {
      const cookie = evenement.changed?.find((c) => c.name === COOKIE_ROLE);
      if (cookie) verifier(roleDuCookie(cookie.value));
    };
    magasin.addEventListener("change", ecouteur);
    return () => magasin.removeEventListener("change", ecouteur);
  }, []);

  return null;
}
