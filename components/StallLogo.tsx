/** A stall's company logo, or nothing when the team has not added one. */
export default function StallLogo({ number, version, name, size = 48, className }: { number: number; version: string | null; name: string; size?: number; className?: string }) {
  if (!version) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`stall-logo${className ? ` ${className}` : ''}`}
      src={`/api/logo/${number}?v=${version}`}
      alt={`${name} logo`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
      decoding="async"
    />
  );
}
