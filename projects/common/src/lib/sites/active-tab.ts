import browser from 'webextension-polyfill';

const PAGE = /^https?:$/i;

/** Host from a tab URL. Browser pages and empty URLs are ignored. */
export function hostFromTabUrl(url: string | undefined | null): string | null {
  if (!url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!PAGE.test(parsed.protocol) || !parsed.host || parsed.host.includes('/')) {
    return null;
  }
  return parsed.host;
}

/** Active tab in the window that opened the toolbar popup. activeTab allows this. */
export async function activeTabHost(): Promise<string | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return hostFromTabUrl(tabs[0]?.url);
  } catch {
    return null;
  }
}
