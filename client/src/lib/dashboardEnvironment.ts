export function isProductionSiteHostname(hostname: string) {
  return hostname === "manus.space" || hostname.endsWith(".manus.space");
}
