const publicUpdateRepository = 'FaxBRz/SFScreen_Forko';
const safeFeedSegment = /^[a-zA-Z0-9._-]+$/;

export const normalizeUpdateFeedUrl = (rawUrl: string): string | undefined => {
  const value = rawUrl.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return undefined;
    return url.href.replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

export const createPublicUpdateFeedUrl = (
  platform: string,
  arch: string,
  version: string,
): string | undefined => {
  if (![platform, arch, version].every((segment) => safeFeedSegment.test(segment))) return undefined;
  return `https://update.electronjs.org/${publicUpdateRepository}/${platform}-${arch}/${version}`;
};
