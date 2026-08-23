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

