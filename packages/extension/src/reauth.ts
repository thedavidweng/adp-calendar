/** Workforce Now entry URL. A signed-out browser is redirected by ADP to its sign-in page and returned here. The sign-in query is minted per request, so it cannot be hardcoded. */
export const ADP_SIGN_IN_URL = 'https://workforcenow.adp.com/theme/index.html';
// The Position is only in the URL of the iframe this route embeds, so the home page is not enough.
export const ADP_MY_SCHEDULE_URL = `${ADP_SIGN_IN_URL}#/Myself/MyselfTabTimecardsAttendanceSchCategoryMonthlySchedule`;

export const SIGN_IN_NOTIFICATION_ID = 'adp-needs-sign-in';

export function isSignInNotification(notificationId: string): boolean {
  return notificationId === SIGN_IN_NOTIFICATION_ID;
}

/** Open ADP sign-in for the one notification. Other notification ids are ignored. */
export async function openSignInFromNotification(
  notificationId: string,
  deps: {
    createTab(url: string): Promise<number>;
    rememberTab(tabId: number): Promise<void>;
  },
): Promise<boolean> {
  if (!isSignInNotification(notificationId)) {
    return false;
  }
  const tabId = await deps.createTab(ADP_SIGN_IN_URL);
  await deps.rememberTab(tabId);
  return true;
}

/**
 * A Workforce Now page load in the tab opened from the sign-in notification is a forced Sync.
 * The remembered tab is cleared so later loads in that tab follow the normal due check.
 */
export function reauthSyncRequest(
  request: { forced: boolean } | null,
  senderTabId: number | undefined,
  reauthTabId: number | null,
): { forced: boolean; clearReauthTab: boolean } | null {
  if (!request) {
    return null;
  }
  const returned = senderTabId !== undefined && reauthTabId !== null && senderTabId === reauthTabId;
  if (!returned) {
    return { forced: request.forced, clearReauthTab: false };
  }
  return { forced: true, clearReauthTab: true };
}
