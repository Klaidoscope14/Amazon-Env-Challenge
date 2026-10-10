import {
  ListSubscriptionsByTopicCommand,
  PublishCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import { Alert } from "../../../../shared/src/types.js";
import { AUDIENCE_LABELS, formatIstTime } from "../../../../shared/src/notice-templates.js";

const sns = new SNSClient({});
const SUBSCRIBER_CACHE_MS = 5 * 60 * 1000;
let subscriberCache: { topicArn: string; confirmed: boolean; at: number } | null = null;

/**
 * True when the topic has at least one confirmed subscription. An unconfirmed
 * email subscription receives nothing, so publishing to it must not be
 * recorded as "email sent".
 */
export async function hasConfirmedSubscriber(topicArn: string): Promise<boolean> {
  if (
    subscriberCache &&
    subscriberCache.topicArn === topicArn &&
    Date.now() - subscriberCache.at < SUBSCRIBER_CACHE_MS
  ) {
    return subscriberCache.confirmed;
  }

  let confirmed = false;
  let nextToken: string | undefined;
  do {
    const page = await sns.send(
      new ListSubscriptionsByTopicCommand({ TopicArn: topicArn, NextToken: nextToken })
    );
    confirmed = (page.Subscriptions ?? []).some((s) =>
      s.SubscriptionArn?.startsWith("arn:")
    );
    nextToken = page.NextToken;
  } while (!confirmed && nextToken);

  subscriberCache = { topicArn, confirmed, at: Date.now() };
  return confirmed;
}

// SNS subjects must be ASCII, single-line and at most 100 characters.
function toSubject(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

export function buildAlertEmail(alert: Alert, noticeUrl: string): { subject: string; message: string } {
  const place = alert.areaName ?? alert.aqiSnapshot?.stationName ?? "your area";
  const status = alert.recommendation?.status ?? "Air quality";
  const snapshot = alert.aqiSnapshot;
  const isDemo = snapshot?.dataMode === "demo";

  const lines = [
    alert.message,
    "",
    ...(alert.messageHi ? [alert.messageHi, ""] : []),
    "----",
    `AQI ${snapshot?.aqi ?? "n/a"} (${status}) - ${snapshot?.stationName ?? "unknown station"}, source: ${snapshot?.source ?? "unknown"}${isDemo ? " (DEMO DATA - not a live reading)" : ""}`,
    `Audience: ${AUDIENCE_LABELS[alert.audience] ?? alert.audience}`,
    `Issued by ${alert.adminName} at ${formatIstTime(alert.createdAt)} IST`,
    ...(noticeUrl ? [`Campus notice: ${noticeUrl}?area=${encodeURIComponent(alert.campus)}`] : []),
    "",
    "Decision support, not medical advice. Follow official CPCB and health-authority guidance.",
  ];

  return {
    subject: toSubject(
      `${isDemo ? "[DEMO] " : ""}BreatheSafe: ${status} air quality - ${place}`
    ),
    message: lines.join("\n"),
  };
}

export async function publishAlertEmail(
  topicArn: string,
  alert: Alert,
  noticeUrl: string
): Promise<boolean> {
  try {
    const { subject, message } = buildAlertEmail(alert, noticeUrl);
    await sns.send(new PublishCommand({ TopicArn: topicArn, Subject: subject, Message: message }));
    return true;
  } catch (err) {
    console.error("SNS publish failed:", err);
    return false;
  }
}
