import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

// Un <button> sans type envoie le formulaire qui l'entoure : Button impose
// « button » par défaut, sauf demande explicite ou rendu d'un autre élément.

describe("Button", () => {
  it("a le type « button » par défaut", () => {
    expect(renderToStaticMarkup(<Button>x</Button>)).toContain('type="button"');
  });

  it("garde le type demandé explicitement", () => {
    const html = renderToStaticMarkup(<Button type="submit">x</Button>);
    expect(html).toContain('type="submit"');
    expect(html).not.toContain('type="button"');
  });

  it("n'ajoute pas de type à un lien rendu avec asChild", () => {
    const html = renderToStaticMarkup(
      <Button asChild>
        <a href="#x">x</a>
      </Button>,
    );
    expect(html).toMatch(/^<a /);
    expect(html).not.toContain("type=");
  });
});
