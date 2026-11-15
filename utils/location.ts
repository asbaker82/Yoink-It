// Locations are stored as "City, ST 12345" — never a street address.
// Older rows may hold just "12345"; parseLocation handles both.

export interface Location {
  city: string;
  state: string;
  zip: string;
}

export const EMPTY_LOCATION: Location = { city: '', state: '', zip: '' };

export const isValidZip   = (zip: string) => /^\d{5}$/.test(zip);
export const isValidState = (state: string) => /^[A-Z]{2}$/.test(state);

export function formatLocation({ city, state, zip }: Location): string {
  if (!zip) return '';
  return city && state ? `${city.trim()}, ${state} ${zip}` : zip;
}

export function parseLocation(value: string | undefined | null): Location {
  if (!value) return { ...EMPTY_LOCATION };
  const m = value.match(/(?:^|,\s*)([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-\d{4})?\s*$/);
  if (m) return { city: m[1].trim(), state: m[2].toUpperCase(), zip: m[3] };
  const zip = value.match(/(\d{5})(?:-\d{4})?\s*$/)?.[1] ?? '';
  return { city: '', state: '', zip };
}

// "City, ST" when known, otherwise the ZIP — for compact labels.
export function shortLocation(value: string | undefined | null): string {
  const { city, state, zip } = parseLocation(value);
  return city && state ? `${city}, ${state}` : zip;
}

export function locationError(loc: Location, required: boolean): string | undefined {
  const empty = !loc.zip && !loc.city && !loc.state;
  if (empty) return required ? 'Enter the ZIP code where the item is.' : undefined;
  if (!isValidZip(loc.zip)) return 'Enter a 5-digit ZIP code.';
  if (!loc.city.trim()) return 'Enter a city.';
  if (!isValidState(loc.state)) return 'Enter a 2-letter state (e.g. CA).';
  return undefined;
}

const zipCache = new Map<string, { city: string; state: string } | null>();

// Free public ZIP lookup (only the ZIP is sent). Returns null if unknown or offline.
export async function lookupZip(zip: string): Promise<{ city: string; state: string } | null> {
  if (!isValidZip(zip)) return null;
  if (zipCache.has(zip)) return zipCache.get(zip)!;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) { zipCache.set(zip, null); return null; }
    const data = await res.json();
    const place = data?.places?.[0];
    const result = place ? { city: place['place name'] as string, state: place['state abbreviation'] as string } : null;
    zipCache.set(zip, result);
    return result;
  } catch {
    return null;
  }
}
