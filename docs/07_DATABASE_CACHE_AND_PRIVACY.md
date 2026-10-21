# Database, cache, and privacy

The current web implementation does not yet use Room or a durable local
database. It keeps minimal in-memory session state and does not retain raw
audio by default.

The planned Room layer should store only user-approved cached place results,
source and retrieval timestamps, trusted contacts, preferences, and optional
detection history. Cached results must show their age and stale/offline state.

Users must be able to clear local records. Server requests should contain only
the minimum place query needed for lookup. Azure keys remain server-only.
