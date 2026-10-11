/*
 * Geography for the dashboard globe: coordinates for the areas the API knows
 * by id, and an orthographic projection about an arbitrary view centre.
 */

/** [latitude, longitude] in degrees. Keys are area ids without the "city-" prefix. */
export const CITY_COORDS: Record<string, [number, number]> = {
  delhi: [28.61, 77.21], noida: [28.54, 77.39], ghaziabad: [28.67, 77.45], gurugram: [28.46, 77.03],
  faridabad: [28.41, 77.31], sonipat: [28.99, 77.02], panipat: [29.39, 76.97], meerut: [28.98, 77.71],
  chandigarh: [30.73, 76.78], ludhiana: [30.9, 75.86], amritsar: [31.63, 74.87], dehradun: [30.32, 78.03],
  shimla: [31.1, 77.17], srinagar: [34.08, 74.8], jaipur: [26.91, 75.79], jodhpur: [26.24, 73.02],
  agra: [27.18, 78.01], lucknow: [26.85, 80.95], kanpur: [26.45, 80.35], varanasi: [25.32, 82.97],
  patna: [25.59, 85.14], gwalior: [26.22, 78.18], bhopal: [23.26, 77.41], indore: [22.72, 75.86],
  ahmedabad: [23.02, 72.57], surat: [21.17, 72.83], mumbai: [19.08, 72.88], pune: [18.52, 73.86],
  nagpur: [21.15, 79.09], raipur: [21.25, 81.63], ranchi: [23.34, 85.31], kolkata: [22.57, 88.36],
  bhubaneswar: [20.3, 85.82], guwahati: [26.14, 91.74], hyderabad: [17.39, 78.49],
  visakhapatnam: [17.69, 83.22], vijayawada: [16.51, 80.65], bengaluru: [12.97, 77.59],
  mysuru: [12.3, 76.64], chennai: [13.08, 80.27], coimbatore: [11.02, 76.96], madurai: [9.93, 78.12],
  kochi: [9.93, 76.27], thiruvananthapuram: [8.52, 76.94],
};

/** Coordinates for an area id ("city-patna", or a "geo-<lat*10>-<lon*10>" grid cell). */
export function coordsForArea(areaId: string): [number, number] | null {
  if (areaId.startsWith("city-")) return CITY_COORDS[areaId.slice(5)] ?? null;
  const geo = areaId.match(/^geo-(\d{2,3})-(\d{2,3})$/);
  return geo ? [Number(geo[1]) / 10, Number(geo[2]) / 10] : null;
}

export interface View {
  /** Latitude and longitude at the centre of the globe, in degrees. */
  lat: number;
  lon: number;
  /** 1 = the whole sphere fits; larger values magnify toward the centre. */
  zoom: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 9;
const RAD = Math.PI / 180;

export interface Projected {
  x: number;
  y: number;
  /** False on the far side of the globe. */
  visible: boolean;
}

/**
 * Orthographic projection about the view centre, for a sphere that is `radius`
 * px across at zoom 1. Returns offsets from the centre of the disc (y down).
 */
export function projector(view: View, radius: number): (lat: number, lon: number) => Projected {
  const p = radius * view.zoom;
  const phi0 = view.lat * RAD;
  const sinP0 = Math.sin(phi0);
  const cosP0 = Math.cos(phi0);
  return (lat, lon) => {
    const phi = lat * RAD;
    const dl = (lon - view.lon) * RAD;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    const cosDl = Math.cos(dl);
    return {
      x: p * cosPhi * Math.sin(dl),
      y: -p * (cosP0 * sinPhi - sinP0 * cosPhi * cosDl),
      visible: sinP0 * sinPhi + cosP0 * cosPhi * cosDl > 0,
    };
  };
}

/** Great-circle distance in km. */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * RAD;
  const dLon = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
