import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Proxy (AD-7, FR-9, FR-10, FR-21) : toute page protégée (pages internes et
// écran I2) sans session renvoie vers la connexion ; plus de 8 h sans
// activité ferment la session (message « session expirée ») ; un mot de
// passe temporaire à remplacer renvoie vers I2 ; le cookie d'activité est
// renouvelé ; les pages protégées ne sont jamais gardées en cache ; les pages
// publiques, la connexion et les adresses inconnues (`/inscription`, RM-8)
// passent sans changement. Une Server Function n'est jamais renvoyée par
// HTTP. Supabase est simulé.

const simulation = vi.hoisted(() => ({
  /** Identifiant renvoyé par `getClaims` (null : pas de session). */
  sub: null as string | null,
  /** Cookies que le rafraîchissement de la session pose (setAll). */
  cookiesRafraichis: [] as { name: string; value: string; options: Record<string, unknown> }[],
  /** Profil lu par le proxy (`actif`, `doit_changer_mdp`, `role`), ou panne. */
  profil: { doit_changer_mdp: false } as { actif?: unknown; doit_changer_mdp: unknown; role?: unknown } | null,
  erreurProfil: null as { code: string; message: string } | null,
  /** Appels de `signOut`, et panne éventuelle. */
  signOut: [] as unknown[],
  signOutLeve: false,
  lecturesProfil: 0,
  /** Erreur renvoyée par `getClaims` sans session (renouvellement refusé), ou rien. */
  erreurSession: null as { code: string; message: string; status: number } | null,
  /** Colonnes demandées à chaque lecture de `profils`. */
  colonnesLues: [] as string[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _cle: string,
    {
      cookies,
    }: {
      cookies: {
        getAll: () => { name: string; value: string }[];
        setAll: (c: unknown[], h: Record<string, string>) => void;
      };
    },
  ) => ({
    auth: {
      getClaims: async () => {
        if (simulation.cookiesRafraichis.length > 0) {
          cookies.setAll(simulation.cookiesRafraichis, { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" });
        }
        return simulation.sub
          ? { data: { claims: { sub: simulation.sub } }, error: null }
          : { data: null, error: simulation.erreurSession };
      },
      signOut: async (options: unknown) => {
        simulation.signOut.push(options);
        if (simulation.signOutLeve) throw new Error("fetch failed");
        // Comme @supabase/ssr : les cookies de session sont effacés.
        const aEffacer = cookies
          .getAll()
          .filter(({ name }) => name.startsWith("sb-"))
          .map(({ name }) => ({ name, value: "", options: { path: "/", maxAge: 0 } }));
        cookies.setAll(aEffacer, {});
        return { error: null };
      },
    },
    from: (table: string) => {
      if (table !== "profils") throw new Error(`Table inattendue : ${table}`);
      return {
        select: (colonnes: string) => ({
          eq: () => ({
            abortSignal: () => ({
              maybeSingle: async () => {
                simulation.lecturesProfil += 1;
                simulation.colonnesLues.push(colonnes);
                if (simulation.erreurProfil || !simulation.profil) {
                  return { data: null, error: simulation.erreurProfil };
                }
                // Seulement les colonnes demandées, comme PostgREST.
                const profil = simulation.profil as Record<string, unknown>;
                const lues = colonnes.split(",").map((colonne) => colonne.trim());
                return {
                  data: Object.fromEntries(lues.filter((c) => c in profil).map((c) => [c, profil[c]])),
                  error: null,
                };
              },
            }),
          }),
        }),
      };
    },
  }),
}));

import { proxy, config } from "@/proxy";
import { CACHE_PAGES_INTERNES, OPTIONS_COOKIE_ROLE } from "@/lib/supabase/proxy";
import { COOKIE_ROLE } from "@/shared/acces";
import { activiteValide, COOKIE_ACTIVITE, DUREE_INACTIVITE_MS, valeurActivite } from "@/server/garde/activite";
import { COOKIE_MESSAGE_CONNEXION, dechiffrerPassage } from "@/server/passage";

import { SECRET_COOKIES_ESSAI } from "../aides/supabase-connexion";

const ID = "0b6c3f4e-9a1d-4c2b-8e7f-1a2b3c4d5e6f";
const COOKIE_SESSION = "sb-essai-auth-token";

function requete(
  chemin: string,
  { cookies = {}, action = false }: { cookies?: Record<string, string>; action?: boolean } = {},
) {
  const entetes = new Headers();
  const liste = Object.entries(cookies).map(([nom, valeur]) => `${nom}=${valeur}`);
  if (liste.length > 0) entetes.set("cookie", liste.join("; "));
  if (action) entetes.set("next-action", "7f0e1d2c3b4a");
  return new NextRequest(new URL(chemin, "http://localhost:3000"), {
    method: action ? "POST" : "GET",
    headers: entetes,
  });
}

/** Requête d'une personne connectée, active dans les 8 h. */
const requeteConnectee = (chemin: string, options: { action?: boolean; activite?: string } = {}) =>
  requete(chemin, {
    action: options.action,
    cookies: {
      [COOKIE_SESSION]: "jeton",
      [COOKIE_ACTIVITE]: options.activite ?? valeurActivite(Date.now() - 60 * 1000),
    },
  });

beforeEach(() => {
  vi.stubEnv("SECRET_COOKIES", SECRET_COOKIES_ESSAI);
  simulation.sub = null;
  simulation.cookiesRafraichis = [];
  simulation.profil = { doit_changer_mdp: false };
  simulation.erreurProfil = null;
  simulation.signOut = [];
  simulation.signOutLeve = false;
  simulation.lecturesProfil = 0;
  simulation.erreurSession = null;
  simulation.colonnesLues = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("page protégée sans session", () => {
  it.each([
    "/demandes",
    "/demandes/NOVA-2026-0001",
    "/admin/comptes",
    "/demandes?q=facturation",
    "/connexion/nouveau-mot-de-passe",
  ])("%s renvoie vers /connexion", async (chemin) => {
    const reponse = await proxy(requete(chemin));
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
  });

  it("le renvoi n'est pas gardé en cache, sans message « session expirée »", async () => {
    const reponse = await proxy(requete("/demandes"));
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
    expect(reponse.cookies.get(COOKIE_MESSAGE_CONNEXION)).toBeUndefined();
  });

  it("garde les cookies posés ou effacés par le rafraîchissement de la session", async () => {
    simulation.cookiesRafraichis = [{ name: COOKIE_SESSION, value: "", options: { maxAge: 0, path: "/" } }];
    const reponse = await proxy(requete("/demandes"));
    expect(reponse.status).toBe(307);
    expect(reponse.cookies.get(COOKIE_SESSION)).toMatchObject({ value: "", maxAge: 0 });
  });

  it("Server Function : pas de renvoi HTTP, sa garde renverra vers /connexion", async () => {
    const reponse = await proxy(requete("/demandes", { action: true }));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
  });
});

describe("page interne avec session active", () => {
  beforeEach(() => {
    simulation.sub = ID;
  });

  it("passe, sans mise en cache (no-store)", async () => {
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.headers.get("x-middleware-next")).toBe("1");
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
    expect(CACHE_PAGES_INTERNES).toContain("no-store");
    expect(CACHE_PAGES_INTERNES).toContain("private");
  });

  it("garde les cookies rafraîchis", async () => {
    simulation.cookiesRafraichis = [{ name: COOKIE_SESSION, value: "nouveau", options: { path: "/" } }];
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.cookies.get(COOKIE_SESSION)?.value).toBe("nouveau");
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
  });

  it("renouvelle le cookie d'activité (httpOnly, lax, path /, 8 h), même après un rafraîchissement", async () => {
    simulation.cookiesRafraichis = [{ name: COOKIE_SESSION, value: "nouveau", options: { path: "/" } }];
    const avant = Date.now();
    const reponse = await proxy(requeteConnectee("/demandes", { activite: valeurActivite(avant - 7 * 60 * 60 * 1000) }));
    const cookie = reponse.cookies.get(COOKIE_ACTIVITE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
    const heure = Number(cookie!.value.split(".")[1]);
    expect(heure).toBeGreaterThanOrEqual(avant);
    expect(activiteValide(cookie!.value)).toBe(true);
  });

  it("Server Function : renouvelle aussi l'activité, sans lire le profil", async () => {
    const reponse = await proxy(requeteConnectee("/demandes", { action: true }));
    expect(reponse.status).toBe(200);
    expect(reponse.cookies.get(COOKIE_ACTIVITE)?.value).toBeTruthy();
    expect(simulation.lecturesProfil).toBe(0);
  });
});

describe("mot de passe temporaire à remplacer (I2)", () => {
  beforeEach(() => {
    simulation.sub = ID;
  });

  it.each(["/demandes", "/demandes/NOVA-2026-0001", "/admin/comptes"])(
    "drapeau vrai : %s renvoie vers I2, cookies gardés",
    async (chemin) => {
      simulation.profil = { doit_changer_mdp: true };
      simulation.cookiesRafraichis = [{ name: COOKIE_SESSION, value: "nouveau", options: { path: "/" } }];
      const reponse = await proxy(requeteConnectee(chemin));
      expect(reponse.status).toBe(307);
      expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion/nouveau-mot-de-passe");
      expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
      expect(reponse.cookies.get(COOKIE_SESSION)?.value).toBe("nouveau");
      expect(reponse.cookies.get(COOKIE_ACTIVITE)?.value).toBeTruthy();
    },
  );

  it("drapeau vrai : I2 s'affiche, sans mise en cache", async () => {
    simulation.profil = { doit_changer_mdp: true };
    const reponse = await proxy(requeteConnectee("/connexion/nouveau-mot-de-passe"));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
  });

  it("drapeau faux : I2 renvoie vers /demandes", async () => {
    const reponse = await proxy(requeteConnectee("/connexion/nouveau-mot-de-passe"));
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/demandes");
  });

  it.each([
    ["profil illisible", () => {
      simulation.erreurProfil = { code: "PGRST000", message: "panne" };
    }],
    ["profil absent", () => {
      simulation.profil = null;
    }],
    ["valeur inattendue", () => {
      simulation.profil = { doit_changer_mdp: null };
    }],
  ])("%s : la requête passe, la garde décidera", async (_, preparer) => {
    preparer();
    for (const chemin of ["/demandes", "/connexion/nouveau-mot-de-passe"]) {
      const reponse = await proxy(requeteConnectee(chemin));
      expect(reponse.status, chemin).toBe(200);
    }
  });

  it("Server Function avec le drapeau vrai : pas de renvoi HTTP (la garde s'en charge)", async () => {
    simulation.profil = { doit_changer_mdp: true };
    const reponse = await proxy(requeteConnectee("/demandes", { action: true }));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
  });
});

describe("plus de 8 h sans activité", () => {
  beforeEach(() => {
    simulation.sub = ID;
  });

  const cas: [string, () => string | undefined][] = [
    ["dernière activité il y a plus de 8 h", () => valeurActivite(Date.now() - DUREE_INACTIVITE_MS - 1000)],
    ["cookie d'activité absent", () => undefined],
    ["cookie d'activité falsifié", () => valeurActivite().replace(/\.(\d+)\./, (_, heure) => `.${Number(heure) + 1}.`)],
    ["cookie d'activité daté du futur", () => valeurActivite(Date.now() + 60 * 60 * 1000)],
  ];

  it.each(cas)("%s : session fermée, /connexion avec le message", async (_, activite) => {
    const valeur = activite();
    const reponse = await proxy(
      requete("/demandes", {
        cookies: { [COOKIE_SESSION]: "jeton", ...(valeur ? { [COOKIE_ACTIVITE]: valeur } : {}) },
      }),
    );
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
    expect(simulation.signOut).toEqual([{ scope: "local" }]);
    expect(reponse.cookies.get(COOKIE_SESSION)).toMatchObject({ value: "", maxAge: 0 });
    expect(reponse.cookies.get(COOKIE_ACTIVITE)).toMatchObject({ value: "", maxAge: 0 });

    const message = reponse.cookies.get(COOKIE_MESSAGE_CONNEXION);
    expect(message).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/connexion", maxAge: 30 * 60 });
    expect(dechiffrerPassage(COOKIE_MESSAGE_CONNEXION, message!.value)).toEqual({
      type: "message_connexion",
      message: "session_expiree",
    });
    expect(simulation.lecturesProfil).toBe(0);
  });

  it("le message n'est jamais dans l'adresse", async () => {
    const reponse = await proxy(requete("/demandes", { cookies: { [COOKIE_SESSION]: "jeton" } }));
    expect(reponse.headers.get("location")).not.toMatch(/\?|session|expir/);
  });

  it("I2 aussi : session fermée", async () => {
    simulation.profil = { doit_changer_mdp: true };
    const reponse = await proxy(requete("/connexion/nouveau-mot-de-passe", { cookies: { [COOKIE_SESSION]: "jeton" } }));
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    expect(simulation.signOut).toHaveLength(1);
  });

  it("Auth injoignable à la fermeture : cookies de session effacés quand même", async () => {
    simulation.signOutLeve = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reponse = await proxy(requete("/demandes", { cookies: { [COOKIE_SESSION]: "jeton" } }));
    expect(reponse.status).toBe(307);
    expect(reponse.cookies.get(COOKIE_SESSION)).toMatchObject({ value: "", maxAge: 0 });
    vi.mocked(console.error).mockRestore();
  });

  it.each([
    ["Auth répond", false],
    ["Auth injoignable", true],
  ])("Server Function (%s) : session fermée, pas de renvoi HTTP, la suite ne voit plus de session", async (_, leve) => {
    simulation.signOutLeve = leve;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reponse = await proxy(
      requete("/demandes", { action: true, cookies: { [COOKIE_SESSION]: "jeton", nova_autre: "1" } }),
    );
    vi.mocked(console.error).mockRestore();
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.cookies.get(COOKIE_SESSION)).toMatchObject({ value: "", maxAge: 0 });
    expect(reponse.cookies.get(COOKIE_MESSAGE_CONNEXION)?.value).toBeTruthy();
    // Cookies transmis à la Server Function (en-têtes « x-middleware-request-* »).
    const transmis = reponse.headers.get("x-middleware-request-cookie");
    expect(transmis).toContain("nova_autre=1");
    expect(transmis).not.toContain(`${COOKIE_SESSION}=jeton`);
  });

  it("dans les 8 h : rien n'est fermé", async () => {
    const reponse = await proxy(requeteConnectee("/demandes", { activite: valeurActivite(Date.now() - DUREE_INACTIVITE_MS + 60 * 1000) }));
    expect(reponse.status).toBe(200);
    expect(simulation.signOut).toEqual([]);
    expect(reponse.cookies.get(COOKIE_MESSAGE_CONNEXION)).toBeUndefined();
  });
});

describe("compte désactivé pendant la session (FR-22, story 3.4)", () => {
  beforeEach(() => {
    simulation.sub = ID;
    simulation.profil = { actif: false, doit_changer_mdp: false };
  });

  it.each(["/demandes", "/demandes/NOVA-2026-0001", "/admin/comptes", "/connexion/nouveau-mot-de-passe"])(
    "%s : session fermée, /connexion avec le message « session terminée »",
    async (chemin) => {
      const reponse = await proxy(requeteConnectee(chemin));
      expect(reponse.status).toBe(307);
      expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
      expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
      expect(simulation.signOut).toEqual([{ scope: "local" }]);
      expect(reponse.cookies.get(COOKIE_SESSION)).toMatchObject({ value: "", maxAge: 0 });
      expect(reponse.cookies.get(COOKIE_ACTIVITE)).toMatchObject({ value: "", maxAge: 0 });
      const message = reponse.cookies.get(COOKIE_MESSAGE_CONNEXION);
      expect(message).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/connexion", maxAge: 30 * 60 });
      expect(dechiffrerPassage(COOKIE_MESSAGE_CONNEXION, message!.value)).toEqual({
        type: "message_connexion",
        message: "session_terminee",
      });
      // Une seule lecture du profil, qui demande bien `actif`.
      expect(simulation.colonnesLues).toHaveLength(1);
      expect(simulation.colonnesLues[0].split(",").map((c) => c.trim())).toContain("actif");
    },
  );

  it("jeton expiré, renouvellement refusé par Auth (compte bloqué, user_banned) : même fin de session avec le message", async () => {
    simulation.sub = null;
    simulation.erreurSession = { code: "user_banned", message: "User is banned", status: 403 };
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    expect(simulation.signOut).toEqual([{ scope: "local" }]);
    expect(reponse.cookies.get(COOKIE_SESSION)).toMatchObject({ value: "", maxAge: 0 });
    expect(reponse.cookies.get(COOKIE_ACTIVITE)).toMatchObject({ value: "", maxAge: 0 });
    const message = reponse.cookies.get(COOKIE_MESSAGE_CONNEXION);
    expect(dechiffrerPassage(COOKIE_MESSAGE_CONNEXION, message!.value)).toEqual({
      type: "message_connexion",
      message: "session_terminee",
    });
    expect(simulation.lecturesProfil).toBe(0);
  });

  it("user_banned sur une Server Function : pas de renvoi HTTP, rien n'est posé (la garde décidera)", async () => {
    simulation.sub = null;
    simulation.erreurSession = { code: "user_banned", message: "User is banned", status: 403 };
    const reponse = await proxy(requeteConnectee("/demandes", { action: true }));
    expect(reponse.status).toBe(200);
    expect(simulation.signOut).toEqual([]);
    expect(reponse.cookies.get(COOKIE_MESSAGE_CONNEXION)).toBeUndefined();
  });

  it("autre erreur de session (jeton de renouvellement invalide) : renvoi vers /connexion, sans message ni fermeture", async () => {
    simulation.sub = null;
    simulation.erreurSession = { code: "refresh_token_not_found", message: "Invalid Refresh Token", status: 400 };
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    expect(simulation.signOut).toEqual([]);
    expect(reponse.cookies.get(COOKIE_MESSAGE_CONNEXION)).toBeUndefined();
  });

  it("même si le mot de passe temporaire était encore à choisir", async () => {
    simulation.profil = { actif: false, doit_changer_mdp: true };
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    expect(simulation.signOut).toHaveLength(1);
  });

  it("le message ne dit pas pourquoi et n'est jamais dans l'adresse", async () => {
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.headers.get("location")).not.toMatch(/\?|desactiv|termin/);
  });

  it("Server Function : pas de renvoi HTTP ni de lecture du profil, sa garde fermera la session", async () => {
    const reponse = await proxy(requeteConnectee("/demandes", { action: true }));
    expect(reponse.status).toBe(200);
    expect(simulation.lecturesProfil).toBe(0);
    expect(simulation.signOut).toEqual([]);
  });

  it.each([
    ["compte actif", { actif: true, doit_changer_mdp: false }],
    ["état illisible", { actif: null, doit_changer_mdp: false }],
  ])("%s : rien n'est fermé", async (_, profil) => {
    simulation.profil = profil;
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.status).toBe(200);
    expect(simulation.signOut).toEqual([]);
    expect(reponse.cookies.get(COOKIE_MESSAGE_CONNEXION)).toBeUndefined();
  });
});

describe("rôle relu pour le menu : cookie nova_role (story 3.3, FR-22)", () => {
  beforeEach(() => {
    simulation.sub = ID;
  });

  it.each(["administrateur", "collaborateur"])(
    "page protégée passée : nova_role = %s, lisible par la page (pas httpOnly), pour tout le site",
    async (role) => {
      simulation.profil = { actif: true, doit_changer_mdp: false, role };
      const reponse = await proxy(requeteConnectee("/demandes"));
      expect(reponse.status).toBe(200);
      expect(reponse.cookies.get(COOKIE_ROLE)).toMatchObject({ value: role, path: "/", sameSite: "lax" });
      expect(reponse.cookies.get(COOKIE_ROLE)?.httpOnly).toBeFalsy();
      expect(OPTIONS_COOKIE_ROLE.httpOnly).toBe(false);
      // Une seule lecture du profil, qui demande aussi le rôle.
      expect(simulation.colonnesLues).toHaveLength(1);
      expect(simulation.colonnesLues[0].split(",").map((c) => c.trim())).toEqual(["actif", "doit_changer_mdp", "role"]);
    },
  );

  it("administrateur rétrogradé : la page suivante pose collaborateur, sans renvoi (la page décide, S1)", async () => {
    simulation.profil = { actif: true, doit_changer_mdp: false, role: "collaborateur" };
    const reponse = await proxy(
      requete("/admin/comptes", {
        cookies: {
          [COOKIE_SESSION]: "jeton",
          [COOKIE_ACTIVITE]: valeurActivite(Date.now() - 60 * 1000),
          [COOKIE_ROLE]: "administrateur",
        },
      }),
    );
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.cookies.get(COOKIE_ROLE)?.value).toBe("collaborateur");
  });

  it.each([
    ["rôle inconnu", () => {
      simulation.profil = { actif: true, doit_changer_mdp: false, role: "superadmin" };
    }],
    ["rôle absent", () => {
      simulation.profil = { actif: true, doit_changer_mdp: false };
    }],
    ["profil illisible", () => {
      simulation.erreurProfil = { code: "PGRST000", message: "panne" };
    }],
  ])("%s : aucun cookie posé, la requête passe", async (_, preparer) => {
    preparer();
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.status).toBe(200);
    expect(reponse.cookies.get(COOKIE_ROLE)).toBeUndefined();
  });

  it("Server Function : aucun cookie (le profil n'est pas lu)", async () => {
    simulation.profil = { actif: true, doit_changer_mdp: false, role: "administrateur" };
    const reponse = await proxy(requeteConnectee("/admin/comptes", { action: true }));
    expect(reponse.cookies.get(COOKIE_ROLE)).toBeUndefined();
    expect(simulation.lecturesProfil).toBe(0);
  });

  it("compte désactivé : session fermée, cookie de rôle effacé", async () => {
    simulation.profil = { actif: false, doit_changer_mdp: false, role: "administrateur" };
    const reponse = await proxy(requeteConnectee("/demandes"));
    expect(reponse.status).toBe(307);
    expect(reponse.cookies.get(COOKIE_ROLE)).toMatchObject({ value: "", maxAge: 0, path: "/" });
  });

  it("session expirée (plus de 8 h sans activité) : cookie de rôle effacé", async () => {
    simulation.profil = { actif: true, doit_changer_mdp: false, role: "administrateur" };
    const reponse = await proxy(
      requete("/demandes", {
        cookies: {
          [COOKIE_SESSION]: "jeton",
          [COOKIE_ACTIVITE]: valeurActivite(Date.now() - 9 * 60 * 60 * 1000),
          [COOKIE_ROLE]: "administrateur",
        },
      }),
    );
    expect(reponse.status).toBe(307);
    expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    expect(reponse.cookies.get(COOKIE_ROLE)).toMatchObject({ value: "", maxAge: 0, path: "/" });
  });

  it("pages publiques : aucun cookie de rôle", async () => {
    simulation.profil = { actif: true, doit_changer_mdp: false, role: "administrateur" };
    const reponse = await proxy(requete("/", { cookies: { [COOKIE_SESSION]: "jeton" } }));
    expect(reponse.cookies.get(COOKIE_ROLE)).toBeUndefined();
  });

  it("simple signal : le proxy ne refuse ni ne renvoie rien selon le rôle", async () => {
    simulation.profil = { actif: true, doit_changer_mdp: false, role: "collaborateur" };
    for (const chemin of ["/demandes", "/admin/comptes"]) {
      const reponse = await proxy(requeteConnectee(chemin));
      expect(reponse.status, chemin).toBe(200);
    }
  });
});

describe("pages publiques et adresses inconnues : inchangées", () => {
  it.each(["/", "/confirmation", "/connexion", "/inscription", "/demandesxyz", "/essais", "/connexion/autre"])(
    "%s passe sans renvoi ni en-tête de cache, même connecté sans activité",
    async (chemin) => {
      simulation.sub = ID;
      const reponse = await proxy(requete(chemin, { cookies: { [COOKIE_SESSION]: "jeton" } }));
      expect(reponse.status).toBe(200);
      expect(reponse.headers.get("location")).toBeNull();
      expect(reponse.headers.get("x-middleware-next")).toBe("1");
      expect(reponse.headers.get("cache-control")).toBeNull();
      expect(simulation.signOut).toEqual([]);
      expect(reponse.cookies.get(COOKIE_ACTIVITE)).toBeUndefined();
    },
  );
});

describe("matcher", () => {
  it("reste celui de départ : toutes les routes sauf les fichiers statiques", () => {
    expect(config.matcher).toEqual([
      "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ]);
  });
});
