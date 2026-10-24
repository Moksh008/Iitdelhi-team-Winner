# Nearby services with OpenStreetMap (free, no API key)

Azure Maps has been removed. Nearby help uses free OpenStreetMap services
directly from the app (`src/services/osmPlaces.js`, `NearbyHelpPanel.jsx`,
`OsmMap.jsx`):

* **Nominatim** turns a typed place into coordinates (India only, one result,
  at most one request per second, no autocomplete, cached for 7 days).
* **Overpass API** finds named places of one category within 1, 3, 5 or 10 km
  (three public instances tried in turn, 12 s timeout each, cached for 24 h).
  When all are unavailable, the app pauses Overpass for 5 minutes and uses
  Nominatim's bounded category search instead, with a note that results may be
  less complete.
* **Leaflet + tile.openstreetmap.org** draws the map with the required
  "© OpenStreetMap contributors" attribution. The list works without the map.
* **GPS** (`@capacitor/geolocation`, coarse) is requested only when the user taps
  "Use my location". Typing a place always works.

**Automatic search from the call:** when an alert opens, `locationExtractor.js`
looks in the transcript for a place (landmarks with "near/at/opposite", Hinglish
"X ke paas/samne", named facilities such as "rajindra hospital", Indian city
names in Roman or Devanagari script). Speech recognition often mishears city
names, so a word close to a known city ("pradyala", "padella") is corrected to
it (Patiala). Satark then searches near that place straight away, falling back
to the city if OpenStreetMap does not know the exact landmark. Only the place
name is sent to Nominatim/Overpass — never the transcript. The detected place is
shown and can be edited. If Overpass is busy, the Nominatim fallback tries a few
specific terms per category (e.g. supermarket, bakery for shops); empty fallback
results are not cached.

Categories: shops & businesses, hospitals & clinics, pharmacies, police,
cybercrime police (mapped names containing "cyber"), banks. Up to five nearest
named results are shown per category with name, category, straight-line
distance and the OSM address when present.

Phone numbers are shown only when OSM has a `phone`/`contact:phone` tag, and are
labelled as volunteer-listed and unverified. Every result also has a **Find
phone number** link to
`https://www.google.com/maps/search/?api=1&query=<encoded "name, locality">`
so the user can look up and verify the number themselves. Satark never invents
a place, address, distance or number and never dials automatically.

Not every place is on OpenStreetMap (for example "Anardana Chowk, Patiala" was
not, as of 2026-10-24). The app then searches the broader area it can find
(e.g. "Patiala") and says so. Public Nominatim/Overpass servers are shared and
rate-limited; they can be slow or briefly unavailable, in which case the app
shows the error and offers a public map search for the category.

See `12_OFFLINE_AI_AND_FREE_SERVICES.md` for the full network-request list.
