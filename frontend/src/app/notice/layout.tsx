import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Campus Notice — BreatheSafe Campus",
  description: "Latest air-quality advisory for students, staff and parents, in English and Hindi.",
};

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
