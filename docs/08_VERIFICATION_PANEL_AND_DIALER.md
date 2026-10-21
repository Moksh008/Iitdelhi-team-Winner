# Verification panel and dialer

The panel is opened manually from the floating Satark button. It shows the
claim summary, extracted location, nearby returned places, distances when
available, provider status, and a verify-before-payment reminder.

Phone links use `tel:` and require an explicit user tap. They open the normal
device dialer; the app does not place calls automatically. A missing phone is
shown as unavailable. A public listing is never labelled incident-confirmed.

The native overlay currently opens Satark with `Open Satark`; a future native
panel bridge can publish the same dynamic result cards above the call screen.
