/**
 * Helper to generate a concise, clean title summarizing one or more items of an Orden
 */

/**
 * Extrae únicamente la descripción final del ítem para los documentos de OS y OC,
 * quitando los prefijos de categoría e ítem (ej. "JUEGOS > TARJETAS IMITACIÓN > Tarjetas" -> "Tarjetas").
 */
export function cleanItemDescription(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed.includes('>')) return trimmed;
  const parts = trimmed.split(/\s*>\s*/);
  return parts[parts.length - 1]?.trim() || trimmed;
}

export function generateItemsTitle(items?: { name?: string | null; customDescription?: string | null }[]): string {
  if (!items || items.length === 0) return '';
  const names = items.map(it => cleanItemDescription(it.customDescription || it.name)).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  const remainder = names.length - 2;
  return `${names[0]}, ${names[1]} y ${remainder} ítem${remainder > 1 ? 's' : ''} más`;
}
