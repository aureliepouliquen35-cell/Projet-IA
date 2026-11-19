// Format unique des réponses des Server Functions (AD-12).
//
// - Réussite : `{ ok: true, donnees }`.
// - Échec : `{ ok: false, code, message, champs? }`, avec un code de la liste
//   fermée ci-dessous et un message en français, sans détail technique.
// - Une erreur **prévue** (saisie, droits, conflit) est renvoyée avec
//   `echec()`, jamais levée. Seule une erreur imprévue est levée : l'enveloppe
//   commune (`src/server/actions/enveloppe.ts`) la transforme en
//   `ERREUR_INTERNE`, avec le code à transmettre au support (`codeSupport`).

export const CODES_ERREUR = [
  "VALIDATION",
  "NON_CONNECTE",
  "ACCES_REFUSE",
  "INTROUVABLE",
  "CONFLIT",
  "TROP_DE_TENTATIVES",
  "LIMITE_ENVOIS",
  "ERREUR_INTERNE",
] as const;

export type CodeErreur = (typeof CODES_ERREUR)[number];

/** Message d'erreur de chaque champ concerné, par nom de champ. */
export type ErreursChamps = Record<string, string>;

export type Succes<T> = { ok: true; donnees: T };

export type Echec = {
  ok: false;
  code: CodeErreur;
  message: string;
  champs?: ErreursChamps;
  /** Code court à recopier pour le support (seulement pour `ERREUR_INTERNE`). */
  codeSupport?: string;
};

export type Reponse<T> = Succes<T> | Echec;

export function succes<T>(donnees: T): Succes<T> {
  return { ok: true, donnees };
}

export function echec(
  code: CodeErreur,
  message: string,
  options: { champs?: ErreursChamps; codeSupport?: string } = {},
): Echec {
  const reponse: Echec = { ok: false, code, message };
  if (options.champs) reponse.champs = options.champs;
  if (options.codeSupport) reponse.codeSupport = options.codeSupport;
  return reponse;
}
