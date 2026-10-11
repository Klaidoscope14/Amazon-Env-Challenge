import { AQIStatus, Audience, LegacyAudience, Recommendation } from "./types.js";

/*
 * Reviewed, deterministic notice wording for each CPCB band, in English and
 * Hindi. These are the source of truth for alert text: an AI draft may only
 * rephrase them (see the notices service) and falls back to them on any error.
 * Wording is advisory and deliberately avoids medical instructions.
 */

export type Band = Exclude<AQIStatus, "Unavailable">;

const STATUS_HI: Record<Band, string> = {
  Good: "अच्छा",
  Satisfactory: "संतोषजनक",
  Moderate: "मध्यम",
  Poor: "खराब",
  "Very Poor": "बहुत खराब",
  Severe: "गंभीर",
};

const ACTIONS: Record<Band, { en: string; hi: string }> = {
  Good: {
    en: "Air quality is good. It is a fine time for outdoor activities.",
    hi: "वायु गुणवत्ता अच्छी है। बाहरी गतिविधियों के लिए यह अच्छा समय है।",
  },
  Satisfactory: {
    en: "Air quality is acceptable. People with asthma or other breathing conditions should avoid prolonged strenuous activity outdoors.",
    hi: "वायु गुणवत्ता ठीक है। अस्थमा या साँस की तकलीफ़ वाले लोग बाहर लंबे समय तक ज़ोरदार गतिविधि से बचें।",
  },
  Moderate: {
    en: "Children, older adults and anyone with breathing difficulties should limit prolonged time outdoors. Consider moving long outdoor plans indoors.",
    hi: "बच्चे, बुज़ुर्ग और साँस की तकलीफ़ वाले लोग बाहर लंबे समय तक न रहें। लंबी बाहरी योजनाओं को घर के अंदर करने पर विचार करें।",
  },
  Poor: {
    en: "Please avoid prolonged outdoor activity today, keep windows closed during peak pollution hours and limit time outdoors.",
    hi: "कृपया आज लंबे समय तक बाहरी गतिविधि से बचें, प्रदूषण के चरम समय में खिड़कियाँ बंद रखें और बाहर कम समय बिताएँ।",
  },
  "Very Poor": {
    en: "Please avoid outdoor activities today and stay indoors where possible. Anyone with asthma or breathing conditions should follow their doctor's advice.",
    hi: "कृपया आज बाहरी गतिविधियों से बचें और जहाँ तक हो सके घर के अंदर रहें। अस्थमा या साँस की तकलीफ़ वाले लोग अपने डॉक्टर की सलाह का पालन करें।",
  },
  Severe: {
    en: "Air quality is severe. Please stay indoors as much as possible, avoid all outdoor exercise and follow official advisories from local authorities.",
    hi: "वायु गुणवत्ता गंभीर है। कृपया जितना हो सके घर के अंदर रहें, बाहर हर तरह के व्यायाम से बचें और स्थानीय प्रशासन की आधिकारिक सलाह का पालन करें।",
  },
};

/** Hindi name of a CPCB category. */
export function statusHi(status: Band): string {
  return STATUS_HI[status];
}

/** The reviewed Hindi advice for a CPCB category (as used in notices). */
export function adviceHi(status: Band): string {
  return ACTIONS[status].hi;
}

const GREETINGS: Record<Audience, { en: string; hi: string }> = {
  all: { en: "Dear all,", hi: "सभी को नमस्कार," },
  family: { en: "Dear family,", hi: "प्रिय परिवारजनों," },
  neighbours: { en: "Dear neighbours,", hi: "प्रिय पड़ोसियों," },
  group: { en: "Dear friends,", hi: "प्रिय साथियों," },
};

export const AUDIENCES = Object.keys(GREETINGS) as [Audience, ...Audience[]];

export const AUDIENCE_LABELS: Record<Audience | LegacyAudience, string> = {
  all: "Everyone",
  family: "My family",
  neighbours: "My neighbourhood / society",
  group: "My team / group",
  // Older alerts
  students: "Students",
  staff: "Staff",
  parents: "Parents",
};

export function isAudience(value: unknown): value is Audience {
  return typeof value === "string" && Object.hasOwn(GREETINGS, value);
}

const POLLUTANT_NAMES: Record<string, string> = {
  pm25: "PM2.5",
  "pm2.5": "PM2.5",
  pm10: "PM10",
  no2: "NO2",
  so2: "SO2",
  o3: "O3",
  ozone: "O3",
  co: "CO",
  nh3: "NH3",
};

export function pollutantName(key: string): string {
  return POLLUTANT_NAMES[key.toLowerCase()] ?? key;
}

/** "16:30" in India Standard Time; used in both languages. */
export function formatIstTime(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface NoticePlace {
  /** Area display name, e.g. "Delhi area", "Pune" or a station name. */
  areaName: string;
  areaKind?: "station" | "city" | "geo";
  /** Set when the reading is a CPCB station measurement. */
  measuredStation?: string;
  /** Name of the person sharing the notice, used as the sign-off. */
  senderName?: string;
}

/** Where the reading applies, phrased for each language. */
export function describePlace(place: NoticePlace): { en: string; hi: string; keep: string } {
  if (place.measuredStation) {
    return {
      en: `at the nearest monitoring station (${place.measuredStation})`,
      hi: `निकटतम निगरानी स्टेशन (${place.measuredStation}) पर`,
      keep: place.measuredStation,
    };
  }
  if (place.areaKind === "geo") {
    const base = place.areaName.replace(/ area$/, "");
    return { en: `for the ${place.areaName}`, hi: `${base} क्षेत्र में`, keep: place.areaName };
  }
  return { en: `for ${place.areaName}`, hi: `${place.areaName} में`, keep: place.areaName };
}

/**
 * Builds the reviewed English + Hindi notice for a recommendation. Returns
 * null when there is no usable reading (status "Unavailable").
 */
export function buildTemplateNotice(
  recommendation: Recommendation,
  place: NoticePlace,
  audience: Audience
): { en: string; hi: string } | null {
  if (recommendation.status === "Unavailable") return null;
  const band = recommendation.status;
  const { aqi, dominantPollutant, timestamp } = recommendation.evidence;
  const time = formatIstTime(timestamp);
  const pollutant = pollutantName(dominantPollutant);
  const greeting = GREETINGS[audience];
  const action = ACTIONS[band];
  const sender = place.senderName?.trim();
  const signOffEn = sender ? `${sender} (via VayuSaathi)` : "VayuSaathi";
  const signOffHi = sender ? `${sender} (वायुसाथी द्वारा)` : "वायुसाथी";

  const where = describePlace(place);

  // Letter layout: greeting, body and sign-off on separate lines.
  const en =
    `${greeting.en}\n\nThe Air Quality Index (AQI) ${where.en}` +
    ` is ${aqi} (${band})${time ? ` as of ${time} IST` : ""}, mainly due to ${pollutant}. ${action.en}` +
    `\n\n— ${signOffEn}`;

  const hi =
    `${greeting.hi}\n\n${time ? `${time} बजे ` : ""}${where.hi} वायु गुणवत्ता` +
    ` सूचकांक (AQI) ${aqi} (${STATUS_HI[band]}) है, जिसका मुख्य कारण ${pollutant} है। ${action.hi}` +
    `\n\n— ${signOffHi}`;

  return { en, hi };
}
