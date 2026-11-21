// Dates affichées à l'écran, toujours en heure de Paris :
// « 8 nov. 2026, 9 h 14 ».

const FUSEAU = "Europe/Paris";

const formatDateHeure = new Intl.DateTimeFormat("fr-FR", {
  timeZone: FUSEAU,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formaterDateHeure(date: Date): string {
  const parties: Record<string, string> = {};
  for (const { type, value } of formatDateHeure.formatToParts(date)) {
    parties[type] = value;
  }
  // Heure sans zéro devant (« 9 h »), minutes toujours sur deux chiffres
  // (« 05 ») : on ne dépend pas des variantes d'ICU sur ces deux points.
  const heure = Number(parties.hour);
  const minutes = parties.minute.padStart(2, "0");
  return `${Number(parties.day)} ${parties.month} ${parties.year}, ${heure} h ${minutes}`;
}

/** Heure seule, en heure de Paris : « 9 h 11 » (encadré « modifiée par », I4). */
export function formaterHeure(date: Date): string {
  return formaterDateHeure(date).split(", ").at(-1)!;
}
