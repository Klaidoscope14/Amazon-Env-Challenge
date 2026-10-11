import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notices",
  description: "The air right now and the alerts people have posted for an area, in Hindi and English.",
};

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
