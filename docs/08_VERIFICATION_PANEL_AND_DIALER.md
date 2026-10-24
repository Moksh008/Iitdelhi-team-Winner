# Verification panel and dialer

The alert panel opens from a typed-text alert or from the overlay's "Details &
nearby help". It shows the rule-based advice, the cues heard, an optional
on-device AI note, the place mentioned in the call, up to five OpenStreetMap
places per category with straight-line distances, and a verify-before-payment
reminder.

Phone links use `tel:` and require an explicit user tap. They open the normal
device dialer; the app does not place calls automatically. A missing phone is
shown as unavailable. A public listing is never labelled incident-confirmed.

Each place has a "Find phone number" link that opens a public map search in
the browser; OSM-listed numbers are labelled as volunteer data, not verified.
