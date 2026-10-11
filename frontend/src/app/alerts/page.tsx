"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Alerts now live on the Notices page; old links (and their ?area=) go there. */
export default function AlertsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/notice${window.location.search}`);
  }, [router]);
  return <p className="text-sm text-muted">Opening notices…</p>;
}
