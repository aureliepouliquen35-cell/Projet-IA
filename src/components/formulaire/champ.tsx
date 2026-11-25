import { CircleAlert } from "lucide-react";
import { cloneElement, type ReactElement, type ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { formaterNombre } from "@/shared/constantes";
import { cn } from "@/lib/utils";

// Champ de formulaire de DESIGN.md (UX-DR4) : étiquette toujours visible
// au-dessus, astérisque rouge si le champ est obligatoire, aide et compteur de
// caractères sous le champ, puis le message d'erreur (icône et texte rouges).
//
// Le contrôle (champ, zone de texte, liste) est passé en enfant : il reçoit
// ici son identifiant et ses liens d'accessibilité (`aria-invalid`,
// `aria-describedby`, `required`), pour que l'étiquette, l'aide et l'erreur
// lui soient toujours reliées.

/** Astérisque des champs obligatoires. Le champ porte aussi `required`. */
function Asterisque() {
  return (
    <span aria-hidden="true" className="text-danger">
      {" *"}
    </span>
  );
}

/**
 * Message d'erreur sous un champ. Le conteneur est toujours présent, pour que
 * les lecteurs d'écran annoncent le message quand il apparaît.
 */
function ErreurChamp({ id, message }: { id: string; message?: string }) {
  return (
    <div aria-live="polite">
      {message ? (
        <p
          id={id}
          data-slot="erreur-champ"
          className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** Le contrôle passé en enfant, à qui l'on ajoute des propriétés. */
type Controle = ReactElement<Record<string, unknown>>;

/** Donne au contrôle son identifiant et ses liens d'accessibilité. */
function relier(
  controle: Controle,
  liens: { id: string; obligatoire: boolean; erreur?: string; decritPar: string },
) {
  return cloneElement(controle, {
    id: liens.id,
    required: liens.obligatoire || undefined,
    "aria-invalid": liens.erreur ? true : undefined,
    "aria-describedby": liens.decritPar || undefined,
  });
}

const identifiants = (id: string) => ({
  aide: `${id}-aide`,
  compteur: `${id}-compteur`,
  erreur: `${id}-erreur`,
});

export function Champ({
  id,
  etiquette,
  obligatoire = false,
  aide,
  compteur,
  erreur,
  className,
  apres,
  children,
}: {
  /** Identifiant du contrôle : celui visé par les liens du résumé d'erreurs. */
  id: string;
  etiquette: string;
  obligatoire?: boolean;
  /** Aide affichée sous le champ (« 10 caractères minimum »). */
  aide?: string;
  /** Compteur « 163 / 5 000 » ; il passe en rouge au-delà du maximum. */
  compteur?: { actuel: number; maximum: number };
  erreur?: string;
  className?: string;
  /** Bouton placé à droite du contrôle, sur la même ligne (« Générer »). */
  apres?: ReactNode;
  /** Le contrôle : `Input`, `Textarea` ou `NativeSelect`. */
  children: Controle;
}) {
  const ids = identifiants(id);
  const decritPar = [
    aide ? ids.aide : null,
    compteur ? ids.compteur : null,
    erreur ? ids.erreur : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div data-slot="champ" className={cn("flex flex-col", className)}>
      <Label htmlFor={id} className="mb-1.5">
        {etiquette}
        {obligatoire ? <Asterisque /> : null}
      </Label>
      {apres ? (
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">{relier(children, { id, obligatoire, erreur, decritPar })}</div>
          {apres}
        </div>
      ) : (
        relier(children, { id, obligatoire, erreur, decritPar })
      )}
      {aide || compteur ? (
        <div className="mt-1.5 flex justify-between gap-3 text-caption text-text-muted">
          <span id={ids.aide}>{aide}</span>
          {compteur ? (
            <span
              id={ids.compteur}
              data-slot="compteur"
              data-depasse={compteur.actuel > compteur.maximum || undefined}
              className="shrink-0 whitespace-nowrap data-depasse:font-medium data-depasse:text-danger"
            >
              {formaterNombre(compteur.actuel)} / {formaterNombre(compteur.maximum)}
            </span>
          ) : null}
        </div>
      ) : null}
      <ErreurChamp id={ids.erreur} message={erreur} />
    </div>
  );
}

/**
 * Case à cocher avec son libellé cliquable à droite (UX-DR13), et son message
 * d'erreur dessous. La case elle-même est passée en enfant.
 */
export function ChampCase({
  id,
  etiquette,
  obligatoire = false,
  erreur,
  className,
  children,
}: {
  id: string;
  etiquette: ReactNode;
  obligatoire?: boolean;
  erreur?: string;
  className?: string;
  /** La case : `Checkbox`. */
  children: Controle;
}) {
  const ids = identifiants(id);

  return (
    <div data-slot="champ" className={cn("flex flex-col", className)}>
      <div className="flex items-start gap-2.5">
        {relier(children, {
          id,
          obligatoire,
          erreur,
          decritPar: erreur ? ids.erreur : "",
        })}
        <Label htmlFor={id} className="pt-px font-normal">
          {etiquette}
          {obligatoire ? <Asterisque /> : null}
        </Label>
      </div>
      <ErreurChamp id={ids.erreur} message={erreur} />
    </div>
  );
}
