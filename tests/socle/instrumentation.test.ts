import { afterEach, describe, expect, it, vi } from "vitest";

// AD-12 : une erreur pendant l'affichage d'une page est journalisée par
// `onRequestError` avec le code calculé depuis l'empreinte de Next.js (celui
// que S3 affiche), sans le message de l'erreur ni les paramètres de l'adresse.

const simulation = vi.hoisted(() => ({ journaliser: vi.fn() }));

vi.mock("@/server/journal", () => ({ journaliser: simulation.journaliser }));

import { onRequestError } from "@/instrumentation";

type Contexte = Parameters<typeof onRequestError>[2];

const contexte: Contexte = {
  routerKind: "App Router",
  routePath: "/essais/erreur",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
};

describe("onRequestError", () => {
  afterEach(() => vi.clearAllMocks());

  it("journalise l'erreur avec le code de l'empreinte, la page sans paramètres, la route et le type", async () => {
    const erreur = Object.assign(new Error("dupont@exemple.fr"), { digest: "1234567890" });

    await onRequestError(
      erreur,
      { path: "/essais/erreur?email=dupont@exemple.fr#haut", method: "GET", headers: {} },
      contexte,
    );

    expect(simulation.journaliser).toHaveBeenCalledWith(
      "erreur",
      "erreur_inattendue",
      { page: "/essais/erreur", route: "/essais/erreur", type: "render" },
      "KF12OI",
    );
    expect(JSON.stringify(simulation.journaliser.mock.calls)).not.toContain("dupont");
  });

  it("journalise sans code quand l'erreur n'a pas d'empreinte", async () => {
    await onRequestError("boum", { path: "/", method: "GET", headers: {} }, contexte);
    expect(simulation.journaliser).toHaveBeenCalledWith(
      "erreur",
      "erreur_inattendue",
      { page: "/", route: "/essais/erreur", type: "render" },
      undefined,
    );
  });
});
