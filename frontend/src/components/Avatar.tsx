/** A profile photo, or the person's initials when there is none. */
export default function Avatar({ name, src, size = 32 }: { name: string; src?: string; size?: number }) {
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?";
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- small data URL, no optimisation needed
    return <img src={src} alt="" style={style} className="shrink-0 rounded-full object-cover border border-border" />;
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.max(11, size * 0.38) }}
      className="shrink-0 inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 font-semibold"
    >
      {initials}
    </span>
  );
}
