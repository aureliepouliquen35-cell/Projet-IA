import { MESSAGES_DETAIL } from "@/shared/messages";

// Squelette du détail (DESIGN.md, Squelette ; EXPERIENCE.md, I4 :
// « Squelette de la colonne et du panneau ») : blocs gris à la forme du
// contenu attendu, visibles seulement après 300 ms, sans animation. Même
// disposition que l'écran : deux colonnes à partir de 1 024 px.

const BARRE = "rounded-sm bg-border";
const CARTE = "rounded-lg border bg-background p-6 shadow-soft";

export function SqueletteDemande() {
  return (
    <div data-slot="squelette" role="status" className="animate-apres-300ms">
      <span className="sr-only">{MESSAGES_DETAIL.chargement}</span>
      <div className={`${BARRE} mb-3.5 h-3 w-40`} />
      <div className={`${BARRE} mb-2.5 h-3.5 w-36`} />
      <div className={`${BARRE} mb-6 h-6 w-3/5`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className={`${CARTE} lg:col-start-2 lg:row-start-1`}>
          <div className={`${BARRE} mb-3 h-3 w-16`} />
          <div className="h-control rounded-md bg-border" />
        </div>
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-start-1">
          {[0, 1].map((carte) => (
            <div key={carte} className={CARTE}>
              <div className={`${BARRE} mb-4 h-4 w-28`} />
              <div className={`${BARRE} mb-2.5 h-3`} />
              <div className={`${BARRE} mb-2.5 h-3 w-[85%]`} />
              <div className={`${BARRE} h-3 w-3/5`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
