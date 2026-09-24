import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
export function buildLoginTarget(origin: string, oauthPortalUrl?: string, appId?: string, nonce = crypto.randomUUID()) {
  const portal = oauthPortalUrl?.trim();
  const applicationId = appId?.trim();
  if (!portal || !applicationId) {
    return { mode: "local-admin" as const, url: new URL("/dashboard", origin).href };
  }

  const redirectUri = new URL("/api/oauth/callback", origin).href;
  const state = encodeOAuthState({ redirectUri, nonce });
  const url = new URL(`${portal.replace(/\/+$/, "")}/app-auth`);
  url.searchParams.set("appId", applicationId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");
  return { mode: "external-oauth" as const, url: url.href, state, nonce };
}

export const startLogin = () => {
  const target = buildLoginTarget(
    window.location.origin,
    import.meta.env.VITE_OAUTH_PORTAL_URL,
    import.meta.env.VITE_APP_ID,
  );

  if (target.mode === "local-admin") {
    window.location.replace(target.url);
    return;
  }

  document.cookie = `${OAUTH_STATE_COOKIE}=${target.nonce}; Path=/; Max-Age=600; SameSite=None; Secure`;
  window.location.href = target.url;
};
