import { afterEach, describe, expect, it, vi } from "vitest";

import PageEssaiAction from "@/app/essais/action/page";
import EssaiErreur from "@/app/essais/erreur/page";
import Essais from "@/app/essais/page";

// Les pages d'essai n'existent qu'en développement : ailleurs, elles appellent
// `notFound()` (S2) avant tout calcul, sans lever l'erreur d'essai.

describe("pages d'essai hors développement", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["/essais", Essais],
    ["/essais/erreur", EssaiErreur],
    ["/essais/action", PageEssaiAction],
  ])("%s appelle notFound()", (_, page) => {
    vi.stubEnv("NODE_ENV", "production");
    let levee: unknown;
    try {
      page();
    } catch (erreur) {
      levee = erreur;
    }
    expect(levee).toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) });
  });
});
