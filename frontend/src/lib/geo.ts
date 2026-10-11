import type { AreaInfo } from "./types";

/*
 * Geography for the dashboard globe: where an area is, and an orthographic
 * projection about an arbitrary view centre.
 */

/**
 * Coordinates for an area: carried by the area itself (the API includes them),
 * else from the API's list of areas, else decoded from a "geo-<lat*10>-<lon*10>"
 * grid-cell id. (Areas saved by older versions have no coordinates.)
 */
export function coordsForArea(area: AreaInfo, known: AreaInfo[] = []): [number, number] | null {
  if (typeof area.lat === "number" && typeof area.lon === "number") return [area.lat, area.lon];
  const listed = known.find((a) => a.id === area.id);
  if (listed && typeof listed.lat === "number" && typeof listed.lon === "number") return [listed.lat, listed.lon];
  const geo = area.id.match(/^geo-(\d{2,3})-(\d{2,3})$/);
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
