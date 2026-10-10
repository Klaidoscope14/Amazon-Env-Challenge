export interface CampusInfo {
  id: string;
  nameEn: string;
  nameHi: string;
  city: string;
}

// Single campus for the MVP; add entries here to support more campuses.
const CAMPUSES: Record<string, CampusInfo> = {
  "dtu-delhi": {
    id: "dtu-delhi",
    nameEn: "Delhi Technological University",
    nameHi: "दिल्ली प्रौद्योगिकी विश्वविद्यालय",
    city: "Delhi",
  },
};

export const DEFAULT_CAMPUS_ID = "dtu-delhi";

export function getCampus(id: string): CampusInfo {
  return Object.hasOwn(CAMPUSES, id) ? CAMPUSES[id] : CAMPUSES[DEFAULT_CAMPUS_ID];
}
