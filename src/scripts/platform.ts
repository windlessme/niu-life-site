/** 'ios' or 'android' on phones and tablets, null elsewhere. */
export function visitorPlatform(): 'ios' | 'android' | null {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}
