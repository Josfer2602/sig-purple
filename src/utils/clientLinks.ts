/**
 * Utility to build human-readable, descriptive client URLs
 * containing client name, project name, and version.
 */

function sanitizeForParam(val?: string | number | null) {
  if (!val) return '';
  return String(val)
    .trim()
    .replace(/[#&?\\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds a descriptive client URL for a quote.
 * Example: https://purple.devlian.de/?print=UUID&cliente=Nestle&proyecto=Lanzamiento&v=1
 */
export function buildQuoteClientUrl(
  quoteId: string,
  clientName?: string,
  projectName?: string,
  version?: number | string
): string {
  const origin = window.location.origin;
  const params = new URLSearchParams();
  params.set('print', quoteId);

  const cleanClient = sanitizeForParam(clientName);
  const cleanProject = sanitizeForParam(projectName);
  const cleanVersion = version !== undefined && version !== null ? String(version) : '';

  if (cleanClient && cleanClient !== '-') params.set('cliente', cleanClient);
  if (cleanProject && cleanProject !== '-') params.set('proyecto', cleanProject);
  if (cleanVersion) params.set('v', cleanVersion);

  return `${origin}/?${params.toString()}`;
}

/**
 * Builds a descriptive client URL for a project Gantt / cronograma.
 * Example: https://purple.devlian.de/?gantt=TOKEN&cliente=Nestle&proyecto=Lanzamiento&v=1
 */
export function buildGanttClientUrl(
  token: string,
  clientName?: string,
  projectName?: string,
  version?: number | string
): string {
  const origin = window.location.origin;
  const params = new URLSearchParams();
  params.set('gantt', token);

  const cleanClient = sanitizeForParam(clientName);
  const cleanProject = sanitizeForParam(projectName);
  const cleanVersion = version !== undefined && version !== null ? String(version) : '';

  if (cleanClient && cleanClient !== '-') params.set('cliente', cleanClient);
  if (cleanProject && cleanProject !== '-') params.set('proyecto', cleanProject);
  if (cleanVersion) params.set('v', cleanVersion);

  return `${origin}/?${params.toString()}`;
}

export function buildBookClientUrl(
  token: string,
  clientName?: string,
  projectName?: string,
  versionLabel?: string
): string {
  const origin = window.location.origin;
  const params = new URLSearchParams();
  params.set('book', token);

  const cleanClient = sanitizeForParam(clientName);
  const cleanProject = sanitizeForParam(projectName);
  const cleanVersion = sanitizeForParam(versionLabel);

  if (cleanClient && cleanClient !== '-') params.set('cliente', cleanClient);
  if (cleanProject && cleanProject !== '-') params.set('proyecto', cleanProject);
  if (cleanVersion && cleanVersion !== '-') params.set('v', cleanVersion);

  return `${origin}/?${params.toString()}`;
}

/**
 * Formats a clean human-readable title for copy/toast/notifications.
 */
export function formatClientDocumentLabel(
  type: 'Cotización' | 'Cronograma',
  clientName?: string,
  projectName?: string,
  version?: number | string
): string {
  const c = sanitizeForParam(clientName);
  const p = sanitizeForParam(projectName);
  const v = version ? `V${version}` : '';

  const parts = [];
  if (c && c !== '-') parts.push(c);
  if (p && p !== '-') parts.push(p);

  const main = parts.join(' - ') || type;
  return v ? `${type}: ${main} (${v})` : `${type}: ${main}`;
}
