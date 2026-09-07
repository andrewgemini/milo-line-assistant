import { describe, expect, it } from "vitest";
import { getSchedulerSessionToken } from "../routers";
import { COOKIE_NAME } from "../../shared/const";

describe("scheduler session token extraction", () => {
  it("prefers the OAuth session cookie", () => {
    expect(getSchedulerSessionToken({ cookie: `${COOKIE_NAME}=cookie-token`, authorization: "Bearer header-token" })).toBe("cookie-token");
  });

  it("uses a bearer token when iframe or privacy settings block cookies", () => {
    expect(getSchedulerSessionToken({ authorization: "Bearer header-token" })).toBe("header-token");
  });
});
