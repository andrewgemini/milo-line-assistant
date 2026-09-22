import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

export type CalendarDraft = {
  title: string;
  detail?: string;
  startsAt: Date;
  endsAt: Date;
};

export type CalendarIntent =
  | { type: "create"; data: CalendarDraft }
  | { type: "list" }
  | { type: "cancel"; id: number };

function bangkokParts(date: Date) {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function atBangkok(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

function addBangkokDays(parts: ReturnType<typeof bangkokParts>, days: number) {
  const calendar = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate() };
}

function normalizeYear(raw: number, fallback: number) {
  if (!Number.isFinite(raw)) return fallback;
  if (raw > 2400) return raw - 543;
  if (raw < 100) return 2000 + raw;
  return raw;
}

const THAI_HOURS: Record<string, number> = {
  "หนึ่ง": 1, "สอง": 2, "สาม": 3, "สี่": 4, "ห้า": 5, "หก": 6,
  "เจ็ด": 7, "แปด": 8, "เก้า": 9, "สิบ": 10, "สิบเอ็ด": 11, "สิบสอง": 12,
};

function naturalClock(value: string) {
  const match = value.match(/(ตี|บ่าย|เย็น|ค่ำ)?\s*(\d{1,2}|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด|สิบสอง)\s*(โมง|ทุ่ม|นาฬิกา)?/i);
  if (!match || (!match[1] && !match[3])) return undefined;
  let hour = /^\d+$/.test(match[2]) ? Number(match[2]) : THAI_HOURS[match[2]];
  if (!Number.isFinite(hour)) return undefined;
  if (/ทุ่ม/i.test(match[3] ?? "")) hour = 18 + Math.min(Math.max(hour, 1), 5);
  else if (/บ่าย/i.test(match[1] ?? "") && hour <= 5) hour += 12;
  else if (/เย็น|ค่ำ/i.test(match[1] ?? "") && hour < 12) hour += 12;
  return { hour: Math.min(Math.max(hour, 0), 23), minute: 0 };
}

export function parseCalendarDateTime(value: string, now = new Date()) {
  const current = bangkokParts(now);
  const clock = value.match(/(?:เวลา\s*)?(\d{1,2})(?::|\.)(\d{2})/i);
  const spoken = clock ? undefined : naturalClock(value);
  const hour = Math.min(Math.max(Number(clock?.[1] ?? spoken?.hour ?? 9), 0), 23);
  const minute = Math.min(Math.max(Number(clock?.[2] ?? spoken?.minute ?? 0), 0), 59);

  const iso = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  const thai = value.match(/(?:วันที่\s*)?(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?/);

  let target = { ...current };
  if (/พรุ่งนี้/i.test(value)) target = addBangkokDays(current, 1);
  else if (/วันนี้/i.test(value)) target = current;
  else if (iso) target = { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  else if (thai) {
    const year = normalizeYear(thai[3] ? Number(thai[3]) : current.year, current.year);
    target = { year, month: Number(thai[2]), day: Number(thai[1]) };
  }

  let startsAt = atBangkok(target.year, target.month, target.day, hour, minute);
  if (!/วันนี้|พรุ่งนี้|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/-]\d{1,2}/i.test(value) && startsAt <= now) {
    const tomorrow = addBangkokDays(current, 1);
    startsAt = atBangkok(tomorrow.year, tomorrow.month, tomorrow.day, hour, minute);
  }
  return startsAt;
}

function eventTitle(value: string) {
  return value
    .replace(/(?:วันนี้|พรุ่งนี้)/gi, " ")
    .replace(/(?:วันที่\s*)?\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?/g, " ")
    .replace(/\d{4}-\d{1,2}-\d{1,2}/g, " ")
    .replace(/ถึง\s*\d{1,2}(?::|\.)\d{2}/gi, " ")
    .replace(/(?:เวลา\s*)?\d{1,2}(?::|\.)\d{2}(?:\s*น\.?)?/gi, " ")
    .replace(/(?:ตี|บ่าย|เย็น|ค่ำ)\s*(?:\d{1,2}|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด|สิบสอง)(?:\s*โมง)?|(?:\d{1,2}|หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|สิบเอ็ด|สิบสอง)\s*(?:โมง|ทุ่ม|นาฬิกา)/gi, " ")
    .replace(/(?:นาน\s*)?\d+(?:\.\d+)?\s*(?:ชั่วโมง|ชม\.?|นาที)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eventEnd(value: string, startsAt: Date) {
  const until = value.match(/ถึง\s*(\d{1,2})(?::|\.)(\d{2})/i);
  if (until) {
    const local = bangkokParts(startsAt);
    let endsAt = atBangkok(local.year, local.month, local.day, Number(until[1]), Number(until[2]));
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    return endsAt;
  }
  const duration = value.match(/(?:นาน\s*)?(\d+(?:\.\d+)?)\s*(ชั่วโมง|ชม\.?|นาที)/i);
  if (duration) {
    const multiplier = /นาที/i.test(duration[2]) ? 60_000 : 3_600_000;
    return new Date(startsAt.getTime() + Number(duration[1]) * multiplier);
  }
  return new Date(startsAt.getTime() + 60 * 60 * 1000);
}

export function parseCalendarIntent(text: string, now = new Date()): CalendarIntent | undefined {
  const value = text.trim().replace(/^@?ไมโล\s*/i, "").trim();
  if (/^(?:ดู\s*)?(?:ปฏิทิน|ตารางนัด|นัดหมาย|calendar)$/i.test(value)) return { type: "list" };
  const cancel = value.match(/^(?:ยกเลิก|ลบ)(?:นัด|นัดหมาย|ปฏิทิน)\s*#?(\d+)$/i);
  if (cancel) return { type: "cancel", id: Number(cancel[1]) };

  const create = value.match(/^(?:ลงปฏิทิน|เพิ่มปฏิทิน|สร้างนัด|นัดหมาย|นัด)\s*(.+)$/i);
  if (!create) return undefined;
  const body = create[1].trim();
  if (!body) return undefined;
  const startsAt = parseCalendarDateTime(body, now);
  const title = eventTitle(body) || "นัดหมาย";
  return { type: "create", data: { title: title.slice(0, 255), startsAt, endsAt: eventEnd(body, startsAt) } };
}

function compactUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildGoogleCalendarUrl(event: { title: string; detail?: string | null; startsAt: Date; endsAt: Date }) {
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", event.title);
  url.searchParams.set("dates", `${compactUtc(event.startsAt)}/${compactUtc(event.endsAt)}`);
  url.searchParams.set("ctz", "Asia/Bangkok");
  if (event.detail) url.searchParams.set("details", event.detail);
  return url.toString();
}

function signingSecret() {
  const value = process.env.LINE_CHANNEL_SECRET?.trim() || process.env.CRON_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!value) throw new Error("Calendar signing secret is not configured");
  return value;
}

function calendarSignature(id: number, expires: number) {
  return crypto.createHmac("sha256", signingSecret()).update(`${id}:${expires}`).digest("hex");
}

function safeEqual(left: string, right: string) {
  if (!left || !right) return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildCalendarIcsUrl(id: number, ttlSeconds = 7 * 24 * 60 * 60) {
  const base = process.env.MILO_PUBLIC_URL?.trim() || "https://milo-line-assistant.onrender.com";
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = calendarSignature(id, expires);
  const url = new URL(`/api/milo/calendar/${id}.ics`, base);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", sig);
  return url.toString();
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function calendarEventToIcs(event: { id: number; title: string; detail: string | null; startsAt: Date; endsAt: Date; createdAt: Date }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Milo LINE Assistant//Calendar//TH",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:milo-${event.id}@milo-line-assistant.onrender.com`,
    `DTSTAMP:${compactUtc(event.createdAt)}`,
    `DTSTART:${compactUtc(event.startsAt)}`,
    `DTEND:${compactUtc(event.endsAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    ...(event.detail ? [`DESCRIPTION:${escapeIcs(event.detail)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function registerCalendarExportRoute(app: Express) {
  app.get("/api/milo/calendar/:id.ics", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const expires = Number(req.query.expires);
    const supplied = typeof req.query.sig === "string" ? req.query.sig : "";
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return res.status(401).type("text/plain").send("calendar link expired");
    let expected = "";
    try { expected = calendarSignature(id, expires); } catch { return res.status(503).type("text/plain").send("calendar signing unavailable"); }
    if (!safeEqual(supplied, expected)) return res.status(401).type("text/plain").send("invalid calendar signature");
    const event = await db.getCalendarEventById(id);
    if (!event || event.status !== "active") return res.status(404).type("text/plain").send("calendar event not found");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=\"milo-calendar-${id}.ics\"`);
    return res.status(200).send(calendarEventToIcs(event));
  });
}
