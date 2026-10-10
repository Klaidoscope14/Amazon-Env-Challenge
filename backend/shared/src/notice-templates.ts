import { AQIStatus, Audience, Recommendation } from "./types.js";

/*
 * Reviewed, deterministic notice wording for each CPCB band, in English and
 * Hindi. These are the source of truth for alert text: an AI draft may only
 * rephrase them (see the notices service) and falls back to them on any error.
 * Wording is advisory and deliberately avoids medical instructions.
 */

type Band = Exclude<AQIStatus, "Unavailable">;

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
    en: "Air quality is good. Outdoor activities can continue as planned.",
    hi: "वायु गुणवत्ता अच्छी है। बाहरी गतिविधियाँ योजना के अनुसार जारी रह सकती हैं।",
  },
  Satisfactory: {
    en: "Air quality is satisfactory. Students and staff with asthma or other breathing conditions should avoid prolonged strenuous activity outdoors.",
    hi: "वायु गुणवत्ता संतोषजनक है। अस्थमा या साँस की तकलीफ़ वाले विद्यार्थी और कर्मचारी बाहर लंबे समय तक ज़ोरदार गतिविधि से बचें।",
  },
  Moderate: {
    en: "Outdoor activities are under review and prolonged outdoor events may be moved indoors. Anyone with breathing difficulties should limit time outdoors.",
    hi: "बाहरी गतिविधियों की समीक्षा की जा रही है और लंबे बाहरी कार्यक्रम भवन के अंदर कराए जा सकते हैं। साँस की तकलीफ़ वाले लोग बाहर कम समय बिताएँ।",
  },
  Poor: {
    en: "Prolonged outdoor activities are suspended today. Please keep windows closed during peak pollution hours and limit time outdoors.",
    hi: "आज लंबे समय तक चलने वाली बाहरी गतिविधियाँ स्थगित हैं। प्रदूषण के चरम समय में खिड़कियाँ बंद रखें और बाहर कम समय बिताएँ।",
  },
  "Very Poor": {
    en: "All outdoor activities are cancelled today and classes will continue indoors. Students with asthma or breathing conditions should follow their doctor's advice.",
    hi: "आज सभी बाहरी गतिविधियाँ रद्द हैं और कक्षाएँ भवन के अंदर जारी रहेंगी। अस्थमा या साँस की तकलीफ़ वाले विद्यार्थी अपने डॉक्टर की सलाह का पालन करें।",
  },
  Severe: {
    en: "The emergency air-quality protocol is in effect. All outdoor activities are cancelled and the campus may close early. Please watch for further instructions from the administration.",
    hi: "आपातकालीन वायु-गुणवत्ता प्रोटोकॉल लागू है। सभी बाहरी गतिविधियाँ रद्द हैं और परिसर जल्दी बंद हो सकता है। कृपया प्रशासन के अगले निर्देशों पर ध्यान दें।",
  },
};

const GREETINGS: Record<Audience, { en: string; hi: string }> = {
  all: { en: "Dear students, staff and parents,", hi: "प्रिय विद्यार्थियों, कर्मचारियों और अभिभावकों," },
  students: { en: "Dear students,", hi: "प्रिय विद्यार्थियों," },
  staff: { en: "Dear staff members,", hi: "प्रिय कर्मचारियों," },
  parents: { en: "Dear parents,", hi: "प्रिय अभिभावकों," },
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "All (students, staff & parents)",
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
  /** Issuing institution for the sign-off; generic "Campus" when absent. */
  institution?: string;
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
  const institution = place.institution?.trim();
  const signOffEn = institution ? `${institution} Administration` : "Campus Administration";
  const signOffHi = institution ? `${institution} प्रशासन` : "परिसर प्रशासन";

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
