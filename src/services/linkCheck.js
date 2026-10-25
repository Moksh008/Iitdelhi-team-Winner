import { SatarkNative, isNativeApp } from '../native/satarkNative';
import { checkDomain, hostOf, isOfficial, isShortener } from '../engine/linkRules';

/**
 * Full check of one link: on Android also against the downloaded threat list
 * and the user's allowed sites. { host, blocked, reason, detail, shortener, official, allowed }.
 */
export async function checkLink(url) {
  const host = hostOf(url);
  if (!host) return { host: null, blocked: false, invalid: true };
  if (isNativeApp) {
    const result = await SatarkNative.checkLink({ url }).catch(() => null);
    if (result?.status === 'ok') return result;
  }
  return { host, ...checkDomain(host), shortener: isShortener(host), official: isOfficial(host), allowed: false };
}
