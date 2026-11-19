import { describe, expect, it } from "vitest";

import { CODES_ERREUR, echec, succes } from "@/shared/reponse";

// AD-12 : un seul format de réponse, des codes d'erreur en liste fermée.

describe("format de réponse des Server Functions", () => {
  it("a exactement les 8 codes d'erreur d'AD-12", () => {
    expect([...CODES_ERREUR]).toEqual([
      "VALIDATION",
      "NON_CONNECTE",
      "ACCES_REFUSE",
      "INTROUVABLE",
      "CONFLIT",
      "TROP_DE_TENTATIVES",
      "LIMITE_ENVOIS",
      "ERREUR_INTERNE",
    ]);
  });

  it("succes() renvoie { ok: true, donnees }", () => {
    expect(succes({ reference: "NOVA-2026-0001" })).toEqual({
      ok: true,
      donnees: { reference: "NOVA-2026-0001" },
    });
  });

  it("echec() renvoie { ok: false, code, message } sans clé vide", () => {
    const reponse = echec("CONFLIT", "Cette demande a été modifiée.");
    expect(reponse).toEqual({ ok: false, code: "CONFLIT", message: "Cette demande a été modifiée." });
    expect(Object.keys(reponse)).toEqual(["ok", "code", "message"]);
  });

  it("echec() ajoute les champs et le code support quand ils sont fournis", () => {
    expect(
      echec("VALIDATION", "1 champ est à corriger", {
        champs: { email: "L'email est obligatoire" },
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION",
      message: "1 champ est à corriger",
      champs: { email: "L'email est obligatoire" },
    });
    expect(echec("ERREUR_INTERNE", "x", { codeSupport: "7F3A" }).codeSupport).toBe("7F3A");
  });
});
