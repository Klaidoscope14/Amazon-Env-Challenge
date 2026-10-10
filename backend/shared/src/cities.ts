/*
 * Approximate centres of major Indian cities. Used to name a user's area
 * ("Delhi area") and as the selectable areas in the area picker.
 */

export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  /** Other names for the same city (used when searching). */
  aliases?: string[];
  /** Approximate urban radius; a point inside it belongs to this city. Default 10 km. */
  radiusKm?: number;
}

export const CITIES: City[] = [
  { id: "delhi", name: "Delhi", state: "Delhi", lat: 28.6139, lon: 77.209, aliases: ["new delhi"], radiusKm: 30 },
  { id: "noida", name: "Noida", state: "Uttar Pradesh", lat: 28.5355, lon: 77.391, aliases: ["greater noida"], radiusKm: 12 },
  { id: "ghaziabad", name: "Ghaziabad", state: "Uttar Pradesh", lat: 28.6692, lon: 77.4538, radiusKm: 12 },
  { id: "gurugram", name: "Gurugram", state: "Haryana", lat: 28.4595, lon: 77.0266, aliases: ["gurgaon"], radiusKm: 14 },
  { id: "faridabad", name: "Faridabad", state: "Haryana", lat: 28.4089, lon: 77.3178, radiusKm: 12 },
  { id: "sonipat", name: "Sonipat", state: "Haryana", lat: 28.9931, lon: 77.0151 },
  { id: "panipat", name: "Panipat", state: "Haryana", lat: 29.3909, lon: 76.9635 },
  { id: "meerut", name: "Meerut", state: "Uttar Pradesh", lat: 28.9845, lon: 77.7064 },
  { id: "chandigarh", name: "Chandigarh", state: "Chandigarh", lat: 30.7333, lon: 76.7794 },
  { id: "ludhiana", name: "Ludhiana", state: "Punjab", lat: 30.901, lon: 75.8573 },
  { id: "amritsar", name: "Amritsar", state: "Punjab", lat: 31.634, lon: 74.8723 },
  { id: "dehradun", name: "Dehradun", state: "Uttarakhand", lat: 30.3165, lon: 78.0322 },
  { id: "shimla", name: "Shimla", state: "Himachal Pradesh", lat: 31.1048, lon: 77.1734 },
  { id: "srinagar", name: "Srinagar", state: "Jammu and Kashmir", lat: 34.0837, lon: 74.7973 },
  { id: "jaipur", name: "Jaipur", state: "Rajasthan", lat: 26.9124, lon: 75.7873, radiusKm: 15 },
  { id: "jodhpur", name: "Jodhpur", state: "Rajasthan", lat: 26.2389, lon: 73.0243 },
  { id: "agra", name: "Agra", state: "Uttar Pradesh", lat: 27.1767, lon: 78.0081 },
  { id: "lucknow", name: "Lucknow", state: "Uttar Pradesh", lat: 26.8467, lon: 80.9462, radiusKm: 15 },
  { id: "kanpur", name: "Kanpur", state: "Uttar Pradesh", lat: 26.4499, lon: 80.3319, radiusKm: 12 },
  { id: "varanasi", name: "Varanasi", state: "Uttar Pradesh", lat: 25.3176, lon: 82.9739 },
  { id: "patna", name: "Patna", state: "Bihar", lat: 25.5941, lon: 85.1376, radiusKm: 12 },
  { id: "gwalior", name: "Gwalior", state: "Madhya Pradesh", lat: 26.2183, lon: 78.1828 },
  { id: "bhopal", name: "Bhopal", state: "Madhya Pradesh", lat: 23.2599, lon: 77.4126, radiusKm: 12 },
  { id: "indore", name: "Indore", state: "Madhya Pradesh", lat: 22.7196, lon: 75.8577, radiusKm: 12 },
  { id: "ahmedabad", name: "Ahmedabad", state: "Gujarat", lat: 23.0225, lon: 72.5714, radiusKm: 18 },
  { id: "surat", name: "Surat", state: "Gujarat", lat: 21.1702, lon: 72.8311, radiusKm: 15 },
  { id: "mumbai", name: "Mumbai", state: "Maharashtra", lat: 19.076, lon: 72.8777, aliases: ["navi mumbai", "thane"], radiusKm: 30 },
  { id: "pune", name: "Pune", state: "Maharashtra", lat: 18.5204, lon: 73.8567, radiusKm: 18 },
  { id: "nagpur", name: "Nagpur", state: "Maharashtra", lat: 21.1458, lon: 79.0882, radiusKm: 15 },
  { id: "raipur", name: "Raipur", state: "Chhattisgarh", lat: 21.2514, lon: 81.6296 },
  { id: "ranchi", name: "Ranchi", state: "Jharkhand", lat: 23.3441, lon: 85.3096 },
  { id: "kolkata", name: "Kolkata", state: "West Bengal", lat: 22.5726, lon: 88.3639, aliases: ["howrah"], radiusKm: 22 },
  { id: "bhubaneswar", name: "Bhubaneswar", state: "Odisha", lat: 20.2961, lon: 85.8245 },
  { id: "guwahati", name: "Guwahati", state: "Assam", lat: 26.1445, lon: 91.7362 },
  { id: "hyderabad", name: "Hyderabad", state: "Telangana", lat: 17.385, lon: 78.4867, radiusKm: 25 },
  { id: "visakhapatnam", name: "Visakhapatnam", state: "Andhra Pradesh", lat: 17.6868, lon: 83.2185 },
  { id: "vijayawada", name: "Vijayawada", state: "Andhra Pradesh", lat: 16.5062, lon: 80.648 },
  { id: "bengaluru", name: "Bengaluru", state: "Karnataka", lat: 12.9716, lon: 77.5946, aliases: ["bangalore"], radiusKm: 25 },
  { id: "mysuru", name: "Mysuru", state: "Karnataka", lat: 12.2958, lon: 76.6394, aliases: ["mysore"] },
  { id: "chennai", name: "Chennai", state: "Tamil Nadu", lat: 13.0827, lon: 80.2707, radiusKm: 22 },
  { id: "coimbatore", name: "Coimbatore", state: "Tamil Nadu", lat: 11.0168, lon: 76.9558 },
  { id: "madurai", name: "Madurai", state: "Tamil Nadu", lat: 9.9252, lon: 78.1198 },
  { id: "kochi", name: "Kochi", state: "Kerala", lat: 9.9312, lon: 76.2673, aliases: ["ernakulam"] },
  { id: "thiruvananthapuram", name: "Thiruvananthapuram", state: "Kerala", lat: 8.5241, lon: 76.9366, aliases: ["trivandrum"] },
];

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Great-circle distance in kilometres. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The city a location belongs to: the one whose urban area it is deepest
 * inside (distance minus radius), so a point on the edge of a large metro
 * isn't attributed to a smaller neighbouring town whose centre is closer.
 */
export function nearestCity(lat: number, lon: number, maxKm: number): { city: City; km: number } | null {
  let best: { city: City; km: number; score: number } | null = null;
  for (const city of CITIES) {
    const km = distanceKm(lat, lon, city.lat, city.lon);
    const score = km - (city.radiusKm ?? 10);
    if (km <= maxKm && (!best || score < best.score)) best = { city, km, score };
  }
  return best ? { city: best.city, km: best.km } : null;
}
