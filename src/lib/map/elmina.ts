// City of Elmina map frame. Positions are approximate (see areas.verified).
export const ELMINA_CENTER: [number, number] = [3.18, 101.5];
export const ELMINA_BOUNDS: [[number, number], [number, number]] = [[3.13, 101.46], [3.225, 101.535]];
export const DEFAULT_ZOOM = 14;

// Free, key-less raster tiles used until the HERE provider lands (phase 3).
export const TILE_URL = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export function insideElmina(lat: number, lng: number) {
  const [[s, w], [n, e]] = ELMINA_BOUNDS;
  return lat >= s && lat <= n && lng >= w && lng <= e;
}
