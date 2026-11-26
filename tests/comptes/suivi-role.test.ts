import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Suivi du rôle dans le menu latéral (story 3.3 ; FR-22) : un administrateur
// rétrogradé perd la section Administration à sa prochaine navigation. Le
// proxy pose le cookie `nova_role` (rôle relu dans `profils`) ; `SuiviRole`,
// dans le menu, le compare au rôle avec lequel le menu a été rendu quand le
// cookie change (`cookieStore`, si le navigateur l'a) et à chaque changement
// de chemin (repli), et recharge le menu s'ils diffèrent. Simple signal
// d'affichage : jamais lu par le serveur.
//
// `SuiviRole` est appelé ici comme une simple fonction : `useEffect` est
// remplacé par un appel immédiat qui garde chaque effet, son tableau de
// dépendances et son nettoyage ; `useEffectEvent` rend la fonction telle
// quelle. L'adresse et le routeur sont simulés, `document.cookie` et
// `cookieStore` sont fixés par le test.

const navigation = vi.hoisted(() => ({ chemin: "/demandes", refresh: vi.fn() }));
const effets = vi.hoisted(() => ({
  liste: [] as { dependances: unknown[] | undefined; nettoyage: (() => void) | undefined }[],
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.chemin,
  useRouter: () => ({ refresh: navigation.refresh }),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effet: () => void | (() => void), dependances?: unknown[]) => {
    const nettoyage = effet();
    effets.liste.push({ dependances, nettoyage: typeof nettoyage === "function" ? nettoyage : undefined });
  },
  useEffectEvent: <T extends (...args: never[]) => unknown>(fonction: T) => fonction,
}));

import { SuiviRole } from "@/components/interne/suivi-role";
import { COOKIE_ROLE, lireCookieRole, roleAChange, roleDuCookie } from "@/shared/acces";

const racine = process.cwd();

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

type Changement = { name?: string; value?: string };
type Ecouteur = (evenement: { changed?: Changement[] }) => void;

/** `window.cookieStore` simulé : garde les écouteurs de l'événement `change`. */
function simulerCookieStore() {
  const ecouteurs = new Set<Ecouteur>();
  const magasin = {
    addEventListener: vi.fn((type: string, ecouteur: Ecouteur) => {
      if (type === "change") ecouteurs.add(ecouteur);
    }),
    removeEventListener: vi.fn((type: string, ecouteur: Ecouteur) => {
      if (type === "change") ecouteurs.delete(ecouteur);
    }),
    /** Le navigateur signale un changement de cookies. */
    changer(changed: Changement[]) {
      for (const ecouteur of ecouteurs) ecouteur({ changed });
    },
  };
  vi.stubGlobal("cookieStore", magasin);
  return magasin;
}

beforeEach(() => {
  navigation.refresh.mockClear();
  navigation.chemin = "/demandes";
  effets.liste.length = 0;
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("cookieStore", undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lecture du cookie nova_role", () => {
  it("nom du cookie : nova_role", () => {
    expect(COOKIE_ROLE).toBe("nova_role");
  });

  it.each([
    ["nova_role=administrateur", "administrateur"],
    ["sb-x-auth-token=abc; nova_role=collaborateur; autre=1", "collaborateur"],
    ["  nova_role = administrateur ", "administrateur"],
  ])("%s → %s", (cookies, role) => {
    expect(lireCookieRole(cookies)).toBe(role);
  });

  it.each(["", "autre=1", "nova_role=", "nova_role=admin", "nova_role=Administrateur", "x_nova_role=administrateur"])(
    "« %s » : aucun rôle lisible",
    (cookies) => {
      expect(lireCookieRole(cookies)).toBeNull();
    },
  );

  it("valeur du cookie : un rôle connu, sinon rien", () => {
    expect(roleDuCookie("administrateur")).toBe("administrateur");
    expect(roleDuCookie(" collaborateur ")).toBe("collaborateur");
    expect(roleDuCookie("admin")).toBeNull();
    expect(roleDuCookie(undefined)).toBeNull();
  });

  it("rechargement seulement si le cookie donne un autre rôle que celui du menu", () => {
    expect(roleAChange("collaborateur", "administrateur")).toBe(true);
    expect(roleAChange("administrateur", "collaborateur")).toBe(true);
    expect(roleAChange("administrateur", "administrateur")).toBe(false);
    expect(roleAChange(null, "administrateur")).toBe(false);
  });
});

describe("SuiviRole : à chaque changement de chemin (repli)", () => {
  it("n'affiche rien", () => {
    document.cookie = "nova_role=administrateur";
    expect(SuiviRole({ role: "administrateur" })).toBeNull();
  });

  it("administrateur rétrogradé qui change de page : le menu est rechargé (la section disparaîtra)", () => {
    document.cookie = "nova_role=collaborateur";
    navigation.chemin = "/demandes/NOVA-2026-0001";
    SuiviRole({ role: "administrateur" });
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("collaborateur promu : le menu est rechargé (la section apparaîtra)", () => {
    document.cookie = "nova_role=administrateur";
    SuiviRole({ role: "collaborateur" });
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("même rôle, ou cookie absent ou illisible : rien", () => {
    for (const [cookie, role] of [
      ["nova_role=administrateur", "administrateur"],
      ["nova_role=collaborateur", "collaborateur"],
      ["", "administrateur"],
      ["nova_role=inconnu", "collaborateur"],
    ] as const) {
      document.cookie = cookie;
      SuiviRole({ role });
    }
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("la vérification dépend du chemin seulement, jamais du rôle du menu (pas de boucle après un rechargement)", () => {
    SuiviRole({ role: "administrateur" });
    expect(effets.liste.map((e) => e.dependances)).toEqual([["/demandes"], []]);

    // Nouveau rendu avec un autre rôle, même adresse : mêmes dépendances,
    // donc React ne relance aucune vérification.
    effets.liste.length = 0;
    SuiviRole({ role: "collaborateur" });
    expect(effets.liste.map((e) => e.dependances)).toEqual([["/demandes"], []]);

    // Autre adresse : la vérification suit.
    effets.liste.length = 0;
    navigation.chemin = "/admin/comptes";
    SuiviRole({ role: "collaborateur" });
    expect(effets.liste.map((e) => e.dependances)).toEqual([["/admin/comptes"], []]);
  });
});

describe("SuiviRole : quand le cookie nova_role change (cookieStore)", () => {
  it("cookie posé avec un autre rôle (paramètres d'adresse seuls, réponse arrivée après l'affichage) : menu rechargé", () => {
    const magasin = simulerCookieStore();
    document.cookie = "nova_role=administrateur";
    SuiviRole({ role: "administrateur" });
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(magasin.addEventListener).toHaveBeenCalledExactlyOnceWith("change", expect.any(Function));

    magasin.changer([{ name: COOKIE_ROLE, value: "collaborateur" }]);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("même rôle, autre cookie, ou valeur illisible : rien", () => {
    const magasin = simulerCookieStore();
    document.cookie = "nova_role=administrateur";
    SuiviRole({ role: "administrateur" });
    magasin.changer([{ name: COOKIE_ROLE, value: "administrateur" }]);
    magasin.changer([{ name: "nova_activite", value: "collaborateur" }]);
    magasin.changer([{ name: COOKIE_ROLE, value: "inconnu" }]);
    magasin.changer([]);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("au départ du composant, l'écoute est retirée", () => {
    const magasin = simulerCookieStore();
    SuiviRole({ role: "administrateur" });
    const ecouteur = magasin.addEventListener.mock.calls[0][1];
    for (const { nettoyage } of effets.liste) nettoyage?.();
    expect(magasin.removeEventListener).toHaveBeenCalledExactlyOnceWith("change", ecouteur);
    magasin.changer([{ name: COOKIE_ROLE, value: "collaborateur" }]);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });

  it("navigateur sans cookieStore : rien ne casse, la vérification au changement de chemin reste", () => {
    document.cookie = "nova_role=collaborateur";
    expect(() => SuiviRole({ role: "administrateur" })).not.toThrow();
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
    expect(effets.liste[1].nettoyage).toBeUndefined();
  });
});

describe("simple signal d'affichage, jamais une protection", () => {
  it("le cookie n'est écrit que par le proxy, et lu seulement par SuiviRole : jamais par le serveur", () => {
    const code = fichiers(join(racine, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    const sansCommentaires = (texte: string) => texte.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const utilisateurs = code
      .filter((f) => /COOKIE_ROLE|lireCookieRole|roleDuCookie|nova_role/.test(sansCommentaires(readFileSync(f, "utf8"))))
      .map((f) => relative(racine, f).replace(/\\/g, "/"))
      .sort();
    expect(utilisateurs).toEqual([
      "src/components/interne/suivi-role.tsx",
      "src/lib/supabase/proxy.ts",
      "src/shared/acces.ts",
    ]);
    // Le proxy l'écrit (ou l'efface), sans jamais le lire.
    const proxy = readFileSync(join(racine, "src/lib/supabase/proxy.ts"), "utf8");
    expect(proxy).toContain("response.cookies.set(COOKIE_ROLE, role, OPTIONS_COOKIE_ROLE)");
    expect(proxy).not.toMatch(/cookies\.get\(COOKIE_ROLE\)|lireCookieRole|roleDuCookie/);
  });

  it("la garde relit toujours le rôle dans profils", () => {
    const garde = readFileSync(join(racine, "src/server/garde/index.ts"), "utf8");
    expect(garde).toContain('.select("id, nom, role, actif, doit_changer_mdp")');
    expect(garde).not.toMatch(/nova_role|COOKIE_ROLE/);
  });
});
