# Azure Maps setup and API

The server reads `AZURE_MAPS_KEY` from the server environment. Do not put the
key in React, Android assets, source control, or an APK. Use a restricted key,
timeouts, rate limits, and monitoring in production.

The API first geocodes the extracted location, then searches nearby POIs and
filters results by calculated distance. A phone is displayed only when the
provider returns one; no number is generated or substituted.

Endpoints used by this project include `/api/v1/nearby-places` and
`/api/v1/transcript-chunk`. See Microsoft's
[Search POI API](https://learn.microsoft.com/en-us/rest/api/maps/search/get-search-poi)
and [Search best practices](https://learn.microsoft.com/en-us/azure/azure-maps/how-to-use-best-practices-for-search).
Listings are public provider data, not incident verification.
