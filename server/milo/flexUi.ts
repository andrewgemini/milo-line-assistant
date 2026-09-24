export const MILO_COLORS = {
  primary: "#A7F3D0",
  primaryStrong: "#18A979",
  secondary: "#8B6ED6",
  secondaryStrong: "#6546C7",
  accent: "#FECED8",
  accentStrong: "#EC4F85",
  background: "#F0F8FF",
  surface: "#FFFFFF",
  surfaceLavender: "#F4F1FF",
  surfaceMint: "#EAFBF5",
  surfacePink: "#FFF0F5",
  surfaceBlue: "#EEF7FF",
  text: "#2D236B",
  muted: "#7A79A1",
  greenText: "#137A62",
  pinkText: "#D93673",
  blueText: "#337FC5",
  divider: "#E7E6F4",
} as const;

const publicBase = () => (process.env.MILO_PUBLIC_URL || "https://milo-line-assistant.onrender.com").replace(/\/+$/, "");

export function miloMascotUrl() {
  return new URL("/milo-maneki-original.png", publicBase()).href;
}

export function miloProfileUrl() {
  return new URL("/LINE_OA_Profile_Milo_1080x1080.png", publicBase()).href;
}

export function miloBubble(bodyContents: any[], footerContents?: any[]) {
  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      backgroundColor: MILO_COLORS.background,
      contents: bodyContents,
    },
    ...(footerContents?.length ? {
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "14px",
        backgroundColor: MILO_COLORS.background,
        contents: footerContents,
      },
    } : {}),
  };
}

export function miloBrandHeader(title?: string, subtitle?: string) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    alignItems: "center",
    paddingAll: "14px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surface,
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        spacing: "xs",
        contents: [
          { type: "text", text: "Milo", size: "xxl", weight: "bold", color: MILO_COLORS.secondaryStrong },
          { type: "text", text: "ผู้ช่วยจัดการการเงินบน LINE ที่เข้าใจคุณ", size: "xxs", color: MILO_COLORS.muted, wrap: true },
          ...(title ? [{ type: "text", text: title, size: "lg", weight: "bold", color: MILO_COLORS.text, margin: "md", wrap: true }] : []),
          ...(subtitle ? [{ type: "text", text: subtitle, size: "xs", color: MILO_COLORS.muted, wrap: true }] : []),
        ],
      },
      {
        type: "image",
        url: miloMascotUrl(),
        size: "sm",
        aspectRatio: "1:1",
        aspectMode: "cover",
        flex: 0,
      },
    ],
  };
}

export function miloPageHeader(title: string, subtitle?: string) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "md",
    alignItems: "center",
    paddingAll: "14px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surface,
    contents: [
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        spacing: "xs",
        contents: [
          { type: "text", text: title, size: "xxl", weight: "bold", color: MILO_COLORS.text, wrap: true },
          ...(subtitle ? [{ type: "text", text: subtitle, size: "xs", color: MILO_COLORS.muted, wrap: true }] : []),
        ],
      },
      {
        type: "image",
        url: miloMascotUrl(),
        size: "sm",
        aspectRatio: "1:1",
        aspectMode: "cover",
        flex: 0,
      },
    ],
  };
}

export function miloSuccessBanner(message: string) {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    spacing: "md",
    paddingAll: "14px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surfaceMint,
    contents: [
      {
        type: "box",
        layout: "vertical",
        justifyContent: "center",
        alignItems: "center",
        width: "44px",
        height: "44px",
        cornerRadius: "xl",
        backgroundColor: MILO_COLORS.primaryStrong,
        contents: [{ type: "text", text: "✓", size: "xl", weight: "bold", color: "#FFFFFF", align: "center" }],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        spacing: "xs",
        contents: [
          { type: "text", text: "บันทึกสำเร็จ", size: "xl", weight: "bold", color: MILO_COLORS.text },
          { type: "text", text: message, size: "xs", color: MILO_COLORS.muted, wrap: true },
        ],
      },
      {
        type: "image",
        url: miloMascotUrl(),
        size: "xs",
        aspectRatio: "1:1",
        aspectMode: "cover",
        flex: 0,
      },
    ],
  };
}

export function miloWelcomeBubble(text: string) {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    spacing: "sm",
    paddingAll: "14px",
    cornerRadius: "xl",
    backgroundColor: MILO_COLORS.surfaceLavender,
    contents: [
      { type: "text", text, size: "sm", color: MILO_COLORS.text, weight: "bold", wrap: true, flex: 1 },
      { type: "text", text: "♡", size: "xl", color: MILO_COLORS.secondaryStrong, flex: 0 },
    ],
  };
}

export type MiloTone = "mint" | "pink" | "lavender" | "blue";

const TONES: Record<MiloTone, { bg: string; fg: string; icon: string }> = {
  mint: { bg: MILO_COLORS.surfaceMint, fg: MILO_COLORS.greenText, icon: MILO_COLORS.primaryStrong },
  pink: { bg: MILO_COLORS.surfacePink, fg: MILO_COLORS.pinkText, icon: MILO_COLORS.accentStrong },
  lavender: { bg: MILO_COLORS.surfaceLavender, fg: MILO_COLORS.text, icon: MILO_COLORS.secondaryStrong },
  blue: { bg: MILO_COLORS.surfaceBlue, fg: MILO_COLORS.blueText, icon: "#3C9BE8" },
};

export function miloStatCard(label: string, value: string, tone: MiloTone) {
  const t = TONES[tone];
  return {
    type: "box",
    layout: "vertical",
    flex: 1,
    spacing: "xs",
    paddingAll: "12px",
    cornerRadius: "xl",
    backgroundColor: t.bg,
    contents: [
      { type: "text", text: label, size: "xxs", color: t.fg, wrap: true },
      { type: "text", text: value, size: "md", weight: "bold", color: t.fg, wrap: true },
    ],
  };
}

export function miloSectionTitle(title: string, trailing?: string) {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    margin: "md",
    contents: [
      { type: "text", text: title, size: "lg", weight: "bold", color: MILO_COLORS.text, flex: 1, wrap: true },
      ...(trailing ? [{ type: "text", text: trailing, size: "xs", color: MILO_COLORS.muted, align: "end", wrap: true }] : []),
    ],
  };
}

export function miloMenuTile(label: string, command: string, tone: MiloTone, iconText: string, description?: string) {
  const t = TONES[tone];
  return {
    type: "box",
    layout: "vertical",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    spacing: "sm",
    paddingAll: "12px",
    cornerRadius: "xl",
    backgroundColor: t.bg,
    action: { type: "message", label: label.slice(0, 20), text: command.slice(0, 300) },
    contents: [
      {
        type: "box",
        layout: "vertical",
        justifyContent: "center",
        alignItems: "center",
        width: "40px",
        height: "40px",
        cornerRadius: "xl",
        backgroundColor: t.icon,
        contents: [{ type: "text", text: iconText, size: "sm", weight: "bold", color: "#FFFFFF", align: "center" }],
      },
      { type: "text", text: label, size: "xs", weight: "bold", color: MILO_COLORS.text, wrap: true, align: "center" },
      ...(description ? [{ type: "text", text: description, size: "xxs", color: MILO_COLORS.muted, wrap: true, align: "center" }] : []),
    ],
  };
}

export function miloActionTile(label: string, command: string, tone: MiloTone, iconText: string, description?: string) {
  const t = TONES[tone];
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "center",
    flex: 1,
    spacing: "sm",
    paddingAll: "12px",
    cornerRadius: "xl",
    backgroundColor: t.bg,
    action: { type: "message", label: label.slice(0, 20), text: command.slice(0, 300) },
    contents: [
      {
        type: "box",
        layout: "vertical",
        justifyContent: "center",
        alignItems: "center",
        width: "34px",
        height: "34px",
        cornerRadius: "xl",
        backgroundColor: t.icon,
        contents: [{ type: "text", text: iconText, size: "sm", weight: "bold", color: "#FFFFFF", align: "center" }],
      },
      {
        type: "box",
        layout: "vertical",
        flex: 1,
        contents: [
          { type: "text", text: label, size: "sm", weight: "bold", color: MILO_COLORS.text, wrap: true },
          ...(description ? [{ type: "text", text: description, size: "xxs", color: MILO_COLORS.muted, wrap: true, margin: "xs" }] : []),
        ],
      },
      { type: "text", text: "›", size: "xl", color: MILO_COLORS.muted, flex: 0 },
    ],
  };
}

export function miloTab(label: string, active: boolean, command: string) {
  return {
    type: "box",
    layout: "vertical",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    paddingAll: "10px",
    cornerRadius: "xl",
    backgroundColor: active ? MILO_COLORS.secondaryStrong : MILO_COLORS.surfaceLavender,
    action: { type: "message", label: label.slice(0, 20), text: command.slice(0, 300) },
    contents: [
      { type: "text", text: label, size: "sm", weight: "bold", color: active ? "#FFFFFF" : MILO_COLORS.muted, align: "center" },
    ],
  };
}

export function miloInfoRow(label: string, value: string, tone: MiloTone = "lavender") {
  const t = TONES[tone];
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    alignItems: "center",
    paddingAll: "11px",
    cornerRadius: "lg",
    backgroundColor: t.bg,
    contents: [
      { type: "text", text: label, size: "xs", color: MILO_COLORS.muted, flex: 1, wrap: true },
      { type: "text", text: value, size: "sm", weight: "bold", color: t.fg, align: "end", wrap: true, flex: 1 },
    ],
  };
}

export function miloProgressRow(label: string, amountText: string, ratio: number, tone: MiloTone = "pink") {
  const t = TONES[tone];
  const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
  return {
    type: "box",
    layout: "vertical",
    spacing: "xs",
    paddingAll: "11px",
    cornerRadius: "lg",
    backgroundColor: MILO_COLORS.surface,
    contents: [
      {
        type: "box",
        layout: "horizontal",
        contents: [
          { type: "text", text: label, size: "sm", weight: "bold", color: MILO_COLORS.text, flex: 1, wrap: true },
          { type: "text", text: amountText, size: "sm", weight: "bold", color: t.fg, align: "end" },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        height: "6px",
        cornerRadius: "xl",
        backgroundColor: "#ECEBFA",
        contents: [
          { type: "box", layout: "vertical", width: `${Math.max(pct, 2)}%`, height: "6px", cornerRadius: "xl", backgroundColor: t.icon, contents: [] },
        ],
      },
    ],
  };
}

export function miloPrimaryButton(label: string, command: string) {
  return {
    type: "button",
    style: "primary",
    color: MILO_COLORS.secondaryStrong,
    height: "sm",
    action: { type: "message", label: label.slice(0, 20), text: command.slice(0, 300) },
  };
}

export function miloSecondaryButton(label: string, command: string) {
  return {
    type: "button",
    style: "secondary",
    height: "sm",
    action: { type: "message", label: label.slice(0, 20), text: command.slice(0, 300) },
  };
}

export function miloUriButton(label: string, uri: string) {
  return {
    type: "button",
    style: "primary",
    color: MILO_COLORS.secondaryStrong,
    height: "sm",
    action: { type: "uri", label: label.slice(0, 20), uri },
  };
}
