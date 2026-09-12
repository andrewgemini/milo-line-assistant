import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import app from "./api";
afterEach(() => vi.unstubAllEnvs());
describe("production API entrypoint", () => {
  it("serves health, tRPC and the signed webhook without opening its own listener", async () => {
    vi.stubEnv("LINE_CHANNEL_SECRET","test-secret");
    const server=app.listen(0,"127.0.0.1");
    await new Promise<void>(resolve=>server.once("listening",resolve));
    const base="http://127.0.0.1:"+(server.address() as AddressInfo).port;
    try {
      expect(await (await fetch(base+"/api/health")).json()).toMatchObject({service:"milo"});
      expect((await fetch(base+"/api/trpc/auth.me")).status).toBe(200);
      expect((await fetch(base+"/api/milo/export")).status).toBe(401);
      const body=JSON.stringify({events:[]});
      for(const path of ["/api/line/webhook"]) {
        const invalid=await fetch(base+path,{method:"POST",headers:{"content-type":"application/json"},body});
        expect(invalid.status).toBe(401);
        const valid=await fetch(base+path,{method:"POST",headers:{"content-type":"application/json","x-line-signature":createHmac("sha256","test-secret").update(body).digest("base64")},body});
        expect(valid.status).toBe(200);
        expect(await valid.json()).toEqual({ok:true});
      }
    } finally { await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
  });
});
