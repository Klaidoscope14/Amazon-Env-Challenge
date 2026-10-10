import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Public Notice",
  description: "The latest air-quality advisory shared for an area, in English and Hindi.",
};

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
