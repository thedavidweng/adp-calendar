/** Let the popup start its own Sync, so its progress is visible from the first frame. */
export async function openSyncPopup(action: {
  setPopup(details: { popup: string }): Promise<void>;
  openPopup(): Promise<void>;
}): Promise<void> {
  await action.setPopup({ popup: '/popup.html?sync=1' });
  try {
    await action.openPopup();
  } finally {
    await action.setPopup({ popup: '/popup.html' });
  }
}
