export function isProductionSiteHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized || normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return false;
  if (normalized.endsWith(".manus.computer") || normalized.endsWith(".local")) return false;
  return normalized === "miloassist-suwp6bg2.manus.space" || normalized.endsWith(".vercel.app");
}
