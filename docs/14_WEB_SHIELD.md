# Web shield (Protect tab)

A local VPN on the phone (`DnsShieldService.kt`). Nothing is sent to a Satark
server; the VPN exists only so Android hands Satark the phone's DNS lookups.

## Scam link blocking

* Only DNS enters the tunnel: the VPN's DNS server is `10.111.222.3` and that
  single address is the only route. All other traffic goes out normally.
* Each lookup is checked by `ScamDomainRules.kt` against
  `shared/scam-domains.json`:
  * `blocked` — known scam domains and their subdomains (demo entry
    `satark-scam-test.in` only, until a vetted feed is added);
  * bank / payment look-alikes — a label names a brand (`sbi`, `hdfc`,
    `paytm`…) and the domain also uses a bait word (`kyc`, `reward`,
    `refund`…), but is not under an `official` domain;
  * `official` domains (e.g. `onlinesbi.sbi`, `hdfcbank.com`, anything under
    `gov.in` / `bank.in`) are never blocked.
* Blocked lookups get a "no such domain" answer; everything else is forwarded
  to the phone's own DNS server (public resolvers only if the phone reports
  none). The user can allow a blocked site from the log.
* Limits: Android's Private DNS set to a specific provider bypasses the
  shield; only one VPN can run at a time; apps with hard-coded IP addresses are
  not seen.

## Screen-sharing lock

* Installed screen-sharing apps (AnyDesk, TeamViewer, RustDesk, AirDroid, Zoho
  Assist, Chrome Remote Desktop…, list in `REMOTE_ACCESS_PACKAGES`) are cut off
  for 30 minutes: the tunnel is rebuilt with all routes for those apps only and
  their packets are dropped, which also ends a session already in progress.
* Starts automatically when live listening raises a scam alert (setting
  "Lock automatically…", on by default, needs the VPN to have been allowed
  once), from the warning page's "Cut off screen-sharing apps", or by hand.
* While locked, scam-link checks for other apps pause; they resume on unlock.

## Per-app network log

* Every lookup (and, while locked, every blocked connection) is logged with
  the app, target, time and decision. The app is found with
  `ConnectivityManager.getConnectionOwnerUid` (`ConnectionTracer.kt`,
  Android 10+; older phones show "Unknown app").
* Kept in app-private storage (`network-log.json`, last 400 entries, repeats
  within a minute merged) and can be cleared.
