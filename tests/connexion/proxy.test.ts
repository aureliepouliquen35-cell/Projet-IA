import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Proxy (AD-7, FR-9, FR-10) : toute page interne sans session renvoie vers
// la connexion ; les pages internes ne sont jamais gardées en cache ; les
// pages publiques, la connexion et les adresses inconnues (`/inscription`,
// RM-8) passent sans changement. Supabase est simulé.

const simulation = vi.hoisted(() => ({
  /** Identifiant renvoyé par `getClaims` (null : pas de session). */
  sub: null as string | null,
  /** Cookies que le rafraîchissement de la session pose (setAll). */
  cookiesRafraichis: [] as { name: string; value: string; options: Record<string, unknown> }[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _cle: string,
    { cookies }: { cookies: { setAll: (c: unknown[], h: Record<string, string>) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (simulation.cookiesRafraichis.length > 0) {
          cookies.setAll(simulation.cookiesRafraichis, { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" });
        }
        return simulation.sub
          ? { data: { claims: { sub: simulation.sub } }, error: null }
          : { data: null, error: null };
      },
    },
  }),
}));

import { proxy, config } from "@/proxy";
import { CACHE_PAGES_INTERNES } from "@/lib/supabase/proxy";

const requete = (chemin: string) => new NextRequest(new URL(chemin, "http://localhost:3000"));

beforeEach(() => {
  simulation.sub = null;
  simulation.cookiesRafraichis = [];
});

describe("page interne sans session", () => {
  it.each(["/demandes", "/demandes/NOVA-2026-0001", "/admin/comptes", "/demandes?q=facturation"])(
    "%s renvoie vers /connexion",
    async (chemin) => {
      const reponse = await proxy(requete(chemin));
      expect(reponse.status).toBe(307);
      expect(reponse.headers.get("location")).toBe("http://localhost:3000/connexion");
    },
  );

  it("le renvoi n'est pas gardé en cache", async () => {
    const reponse = await proxy(requete("/demandes"));
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
  });

  it("garde les cookies posés ou effacés par le rafraîchissement de la session", async () => {
    simulation.cookiesRafraichis = [{ name: "sb-essai-auth-token", value: "", options: { maxAge: 0, path: "/" } }];
    const reponse = await proxy(requete("/demandes"));
    expect(reponse.status).toBe(307);
    expect(reponse.cookies.get("sb-essai-auth-token")).toMatchObject({ value: "", maxAge: 0 });
  });
});

describe("page interne avec session", () => {
  beforeEach(() => {
    simulation.sub = "0b6c3f4e-9a1d-4c2b-8e7f-1a2b3c4d5e6f";
  });

  it("passe, sans mise en cache (no-store)", async () => {
    const reponse = await proxy(requete("/demandes"));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("location")).toBeNull();
    expect(reponse.headers.get("x-middleware-next")).toBe("1");
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
    expect(CACHE_PAGES_INTERNES).toContain("no-store");
    expect(CACHE_PAGES_INTERNES).toContain("private");
  });

  it("garde les cookies rafraîchis", async () => {
    simulation.cookiesRafraichis = [{ name: "sb-essai-auth-token", value: "nouveau", options: { path: "/" } }];
    const reponse = await proxy(requete("/demandes"));
    expect(reponse.cookies.get("sb-essai-auth-token")?.value).toBe("nouveau");
    expect(reponse.headers.get("cache-control")).toBe(CACHE_PAGES_INTERNES);
  });
});

describe("pages publiques et adresses inconnues : inchangées", () => {
  it.each(["/", "/confirmation", "/connexion", "/inscription", "/demandesxyz", "/essais"])(
    "%s passe sans renvoi ni en-tête de cache",
    async (chemin) => {
      const reponse = await proxy(requete(chemin));
      expect(reponse.status).toBe(200);
      expect(reponse.headers.get("location")).toBeNull();
      expect(reponse.headers.get("x-middleware-next")).toBe("1");
      expect(reponse.headers.get("cache-control")).toBeNull();
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
