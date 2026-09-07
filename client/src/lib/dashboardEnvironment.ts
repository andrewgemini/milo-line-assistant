export function isProductionSiteHostname(hostname: string) {
  // Always true for deployed sites, eliminating the old Manus sandbox preview banner
  return true;
}
