import type { MiloCommand } from "./commandParser";
export const RICH_MENU_ARTWORK = {
  "report-year": {
    "file": "report-year.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_41 PM.png"
  },
  "report-day": {
    "file": "report-day.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_55 PM (1).png"
  },
  "report-month": {
    "file": "report-month.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_55 PM (2).png"
  },
  "report-week": {
    "file": "report-week.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_32_56 PM (3).png"
  },
  "analysis": {
    "file": "analysis.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_19 PM (1).png"
  },
  "overview": {
    "file": "overview.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_19 PM (2).png"
  },
  "budget": {
    "file": "budget.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_20 PM (3).png"
  },
  "transactions": {
    "file": "transactions.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_20 PM (4).png"
  },
  "record": {
    "file": "record.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_21 PM (5).png"
  },
  "categories": {
    "file": "categories.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_21 PM (6).png"
  },
  "settings": {
    "file": "settings.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_22 PM (7).png"
  },
  "help": {
    "file": "help.png",
    "source": "ChatGPT Image Sep 12, 2026, 03_33_22 PM (8).png"
  }
} as const;
export type RichMenuArtwork = keyof typeof RICH_MENU_ARTWORK;
export function artworkForCommand(command: MiloCommand): RichMenuArtwork | undefined {
  if (command.type === "financeReport") return ("report-" + command.period) as RichMenuArtwork;
  const keys: Partial<Record<MiloCommand["type"], RichMenuArtwork>> = {
    recordGuide: "record", aiSummary: "analysis", budgetOverview: "budget",
    transactionList: "transactions", categoryList: "categories", settingGuide: "settings",
    help: "help", greeting: "overview", dashboardGuide: "overview",
  };
  return keys[command.type];
}
export function artworkMessages(key: RichMenuArtwork) {
  const base = process.env.MILO_PUBLIC_URL || "https://milo-line-app.vercel.app";
  const url = new URL("/richmenu/" + RICH_MENU_ARTWORK[key].file, base).href;
  return [
    { type: "text", text: "ภาพประกอบตัวอย่าง: ตัวเลข วันที่ และปุ่มภายในภาพเป็นตัวอย่าง ไม่ใช่ยอดบัญชีจริง ดูข้อมูลจริงและคำสั่งที่ใช้งานได้ในข้อความถัดไปครับ" },
    { type: "image", originalContentUrl: url, previewImageUrl: url.replace(/\.png$/, "-preview.jpg") },
  ];
}
