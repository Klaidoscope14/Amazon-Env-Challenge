import { EmergencyService } from "./types.js";

/** India's national emergency numbers, shown on the SOS screen (served via GET /catalog). */
export const EMERGENCY_SERVICES: EmergencyService[] = [
  { label: "All emergencies", number: "112" },
  { label: "Ambulance", number: "108" },
  { label: "Fire", number: "101" },
  { label: "Women's helpline", number: "1091" },
];
