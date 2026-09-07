export type ReminderDraft = {
  title: string;
  time: string;
};

export function normalizedReminderTitle(title: string) {
  return title.trim();
}

export function canSubmitReminderDraft(title: string) {
  return normalizedReminderTitle(title).length > 0;
}

export function clearedReminderDraft(): ReminderDraft {
  return { title: "", time: "" };
}

/** Converts the dashboard's datetime-local input to the intended Asia/Bangkok instant. */
export function reminderDueAtFromBangkokInput(value: string, now = new Date()) {
  if (!value) return new Date(now.getTime() + 3_600_000);
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return new Date(value);
  const [, year, month, day, hour, minute] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 7, Number(minute)));
}
