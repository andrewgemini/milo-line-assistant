export function hasDashboardDraft(input: { reminderTitle: string; reminderTime: string; isEditingLineLink: boolean; lineUserId: string }) {
  return Boolean(input.reminderTitle.trim() || input.reminderTime || (input.isEditingLineLink && input.lineUserId.trim()));
}

export function environmentSwitchTarget(isProduction: boolean, previewUrl: string, productionUrl: string) {
  return isProduction ? previewUrl : productionUrl;
}
