import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Alert } from "@/components/ui/alert";

// Une erreur coupe la lecture en cours des lecteurs d'écran (`alert`) ; une
// confirmation ou une information est annoncée sans l'interrompre (`status`).

describe("Alert", () => {
  it("annonce une erreur aussitôt", () => {
    expect(renderToStaticMarkup(<Alert variant="erreur">x</Alert>)).toContain('role="alert"');
  });

  it.each(["succes", "information"] as const)("annonce « %s » sans urgence", (variant) => {
    const html = renderToStaticMarkup(<Alert variant={variant}>x</Alert>);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('role="alert"');
  });

  it("sans variante, c'est une information", () => {
    const html = renderToStaticMarkup(<Alert>x</Alert>);
    expect(html).toContain('data-variant="information"');
    expect(html).toContain('role="status"');
  });

  it("laisse le rôle demandé explicitement l'emporter", () => {
    const html = renderToStaticMarkup(
      <Alert variant="succes" role="alert">
        x
      </Alert>,
    );
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
});
