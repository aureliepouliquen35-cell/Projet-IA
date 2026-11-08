import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

// `cn` doit connaître les tokens nommés de globals.css : une taille de texte
// (`text-label`) ne doit pas être prise pour une couleur et supprimée.

describe("cn", () => {
  it("garde une taille de texte nommée à côté d'une couleur de texte", () => {
    expect(cn("text-label", "text-primary-foreground").split(" ")).toEqual([
      "text-label",
      "text-primary-foreground",
    ]);
    expect(cn("text-body", "text-text-muted").split(" ")).toEqual([
      "text-body",
      "text-text-muted",
    ]);
  });

  it("ne garde que la dernière ombre nommée", () => {
    expect(cn("shadow-soft", "shadow-primary")).toBe("shadow-primary");
  });
});
