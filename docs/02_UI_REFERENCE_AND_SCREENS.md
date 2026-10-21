# UI reference and screens

The verification card follows the supplied reference: SATARK header, red
accident warning, quoted claim summary, blue detected-location card, nearby
contact cards, green call buttons, and a yellow verify-before-sending reminder.

The web panel is responsive and scrollable for small screens. It initially
appears as a small floating Satark button; tapping it opens the card. Data
shown in contact cards comes from the API response; screenshot numbers are not
used as production data.

The native Android service provides the floating bubble and Start/Pause/Open
controls. Its native panel is currently a compact control panel, not a full
Compose recreation of the web verification card.
