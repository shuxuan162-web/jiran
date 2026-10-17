// City of Elmina map frame. Positions and area outlines are approximate (areas.verified = false)
// until a teammate checks them against the SDP masterplan.
export const ELMINA_CENTER: [number, number] = [3.18, 101.5];
export const ELMINA_BOUNDS: [[number, number], [number, number]] = [[3.13, 101.46], [3.225, 101.535]];
export const DEFAULT_ZOOM = 14;

// Map provider: Leaflet (leafletjs.com) with CARTO Voyager raster tiles built on OpenStreetMap data.
// Neither needs an API key. Attribution must stay visible on the map.
export const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
export const MAP_PROVIDER_LABEL = "Leaflet 1.9 · OpenStreetMap / CARTO tiles (no key needed)";

export function insideElmina(lat: number, lng: number) {
  const [[s, w], [n, e]] = ELMINA_BOUNDS;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}

/** Colour per section, from the brand tokens: homes warm, parks green, centre amber. */
export function areaColor(kind: string, slug: string): { fill: string; line: string } {
  if (kind === "park") return { fill: "#CFE8C9", line: "#1F7A5C" };
  if (kind === "commercial" || kind === "business") return { fill: "#FEF2D2", line: "#B7791F" };
  const warm: Record<string, { fill: string; line: string }> = {
    "elmina-green": { fill: "#E0F1E9", line: "#1F7A5C" },
    "elmina-valley": { fill: "#FDE9DD", line: "#C2410C" },
    "elmina-east": { fill: "#FBE4E3", line: "#D71920" },
    "denai-alam": { fill: "#E2EEF8", line: "#1F5A93" },
    "bukit-subang": { fill: "#EEE7F7", line: "#5B3B8C" },
  };
  return warm[slug] ?? { fill: "#FDE9DD", line: "#C2410C" };
}

/** Rounds a coordinate the way public positions are shown (3 decimals is about 110 m). */
export const roundCoord = (x: number, decimals = 3) => Math.round(x * 10 ** decimals) / 10 ** decimals;

/** Distance in metres between two points (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
