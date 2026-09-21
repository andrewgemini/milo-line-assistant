import { describe, expect, it } from "vitest";
import main from "./richmenu-main.json";
import more from "./richmenu-more.json";
function validate(config: any) {
  expect(config.size).toEqual({ width: 2500, height: 1686 });
  expect(config.areas.length).toBeGreaterThanOrEqual(5);
  for (const area of config.areas) {
    expect(area.bounds.x).toBeGreaterThanOrEqual(0); expect(area.bounds.y).toBeGreaterThanOrEqual(0);
    expect(area.bounds.width).toBeGreaterThan(0); expect(area.bounds.height).toBeGreaterThan(0);
    expect(area.bounds.x + area.bounds.width).toBeLessThanOrEqual(2500);
    expect(area.bounds.y + area.bounds.height).toBeLessThanOrEqual(1686);
  }
  for (let i=0;i<config.areas.length;i++) for(let j=i+1;j<config.areas.length;j++){
    const a=config.areas[i].bounds,b=config.areas[j].bounds;
    const overlap=a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    expect(overlap).toBe(false);
  }
}
describe("Milo 2-layer LINE Rich Menu",()=>{
 it("validates main menu",()=>{validate(main);expect(main.areas.map((a:any)=>a.action.type)).toContain("richmenuswitch");expect(main.areas.map((a:any)=>a.action.text)).toEqual(["จดบันทึก","วิเคราะห์","งบประมาณ","รายการ","รายการเตือน","สวัสดีไมโล"]);});
 it("validates more menu",()=>{validate(more);expect(more.areas.filter((a:any)=>a.action.type==="message").map((a:any)=>a.action.text)).toEqual(["หมวดหมู่","ดูปฏิทิน","ตั้งค่า","ช่วยเหลือ"]);expect(more.areas.filter((a:any)=>a.action.type==="richmenuswitch")).toHaveLength(2);});
 it("uses supported parser commands for every message action",()=>{for(const config of [main,more]) for(const area of config.areas.filter((a:any)=>a.action.type==="message")) expect(parseMiloCommand(area.action.text).type).not.toBe("unknown");});
});