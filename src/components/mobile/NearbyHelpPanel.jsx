import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, MapPin, Phone, Search } from 'lucide-react';
import { PLACE_CATEGORIES, MAX_RESULTS, categorySearchUrl, resolvePlace, searchNearby } from '../../services/osmPlaces';

const RADII_KM = [1, 3, 5, 10, 20];

/**
 * Finds hospitals, police, banks etc. near the place mentioned in the call (or a
 * place the user types), using OpenStreetMap. The phone's own location is never used.
 */
export default function NearbyHelpPanel({ initialQuery = '', preferredCategory = 'hospital', autoSearch = false, fallbackQueries = [] }) {
  const [query, setQuery] = useState(initialQuery);
  const [origin, setOrigin] = useState(null);
  const [category, setCategory] = useState(
    PLACE_CATEGORIES.some(item => item.id === preferredCategory) ? preferredCategory : 'hospital'
  );
  const [radiusKm, setRadiusKm] = useState(3);
  const [places, setPlaces] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | locating | searching | done | error
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [retrievedAt, setRetrievedAt] = useState(null);

  const categoryInfo = PLACE_CATEGORIES.find(item => item.id === category);

  const searchSeq = useRef(0);
  const runSearch = useCallback(async (center, categoryId, radius) => {
    const seq = ++searchSeq.current;
    setStatus('searching');
    setMessage('');
    setSelectedId(null);
    // Never show the previous category's places under the new one.
    setPlaces([]);
    try {
      // Nothing mapped within the chosen radius (common for police in smaller
      // towns): widen step by step so the user still gets the nearest help.
      let result = await searchNearby({ lat: center.lat, lon: center.lon, categoryId, radiusKm: radius, locality: center.locality });
      if (seq !== searchSeq.current) return; // a newer search has started
      let usedRadius = radius;
      let widenFailed = false;
      for (const km of RADII_KM.filter(value => value > radius)) {
        if (result.places.length) break;
        try {
          const wider = await searchNearby({ lat: center.lat, lon: center.lon, categoryId, radiusKm: km, locality: center.locality });
          if (seq !== searchSeq.current) return;
          result = wider;
          usedRadius = km;
        } catch {
          // Keep what was found; say the wider search could not run.
          widenFailed = true;
          break;
        }
      }
      setPlaces(result.places);
      setRetrievedAt(result.retrievedAt);
      setStatus('done');
      const label = PLACE_CATEGORIES.find(item => item.id === categoryId)?.label.toLowerCase();
      const notes = [];
      if (result.places.length && usedRadius > radius) {
        notes.push(`No ${label} are mapped within ${radius} km, so these are the nearest within ${usedRadius} km.`);
      }
      if (result.source === 'nominatim' && result.places.length) {
        notes.push('The OpenStreetMap places service was busy, so these results come from the OpenStreetMap search service instead and may be less complete.');
      }
      if (!result.places.length) {
        notes.push(categoryId === 'cybercrime'
          ? 'No cybercrime police station is mapped on OpenStreetMap near here. You can still call the national helpline 1930 or use cybercrime.gov.in.'
          : `No ${label} are mapped on OpenStreetMap within ${usedRadius} km — not every place is on OpenStreetMap. Use the public map search below.`);
        if (widenFailed) notes.push('A wider search could not run right now (the map service is busy) — try again in a minute.');
      }
      setMessage(notes.join(' '));
    } catch (error) {
      if (seq !== searchSeq.current) return;
      setPlaces([]);
      setStatus('error');
      setMessage(error.message);
    }
  }, []);

  useEffect(() => {
    if (origin) runSearch(origin, category, radiusKm);
  }, [origin, category, radiusKm, runSearch]);

  const searchPlace = useCallback(async (text, extraQueries = []) => {
    if (!text.trim()) return;
    setStatus('locating');
    setMessage('');
    try {
      let resolved = await resolvePlace(text);
      // e.g. a misheard landmark name: fall back to the city mentioned in the call.
      for (const extra of extraQueries) {
        if (resolved) break;
        resolved = await resolvePlace(extra);
        if (resolved) resolved = { ...resolved, approximate: true, matchedQuery: resolved.matchedQuery || extra };
      }
      if (!resolved) {
        setStatus('error');
        setMessage(`"${text.trim()}" was not found on OpenStreetMap. Try adding the city name or a nearby landmark.`);
        return;
      }
      setOrigin({ ...resolved, source: 'search', searchedFor: text.trim() });
    } catch (error) {
      setStatus('error');
      setMessage(error.message);
    }
  }, []);

  const handleSearch = (event) => {
    event?.preventDefault();
    searchPlace(query);
  };

  // Search straight away for a place mentioned in the call.
  const autoSearched = useRef(false);
  useEffect(() => {
    if (!autoSearch || autoSearched.current || !initialQuery.trim()) return;
    autoSearched.current = true;
    searchPlace(initialQuery, fallbackQueries.filter(q => q && q.toLowerCase() !== initialQuery.toLowerCase()));
  }, [autoSearch, initialQuery, fallbackQueries, searchPlace]);

  const busy = status === 'locating' || status === 'searching';

  return (
    <div className="nearby" aria-label="Nearby help">
      <form className="inline-form" onSubmit={handleSearch}>
        <label htmlFor="nearby-query" className="sr-only">Place name</label>
        <input
          id="nearby-query"
          className="input"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Area, landmark or city"
          autoComplete="off"
          enterKeyHint="search"
        />
        <button type="submit" id="btn-nearby-search" className="btn btn-primary" disabled={!query.trim() || busy}>
          <Search size={16} /> Search
        </button>
      </form>

      <div className="chip-row" role="tablist" aria-label="Place categories">
        {PLACE_CATEGORIES.map(item => (
          <button
            type="button"
            role="tab"
            key={item.id}
            id={`cat-${item.id}`}
            aria-selected={category === item.id}
            className={`chip-button ${category === item.id ? 'active' : ''}`}
            onClick={(event) => {
              setCategory(item.id);
              // Keep the chosen chip fully visible in the scrolling row.
              event.currentTarget.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: 'smooth' });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="row-between">
        <label htmlFor="nearby-radius" className="muted">Within</label>
        <select id="nearby-radius" className="select compact" value={radiusKm} onChange={event => setRadiusKm(Number(event.target.value))}>
          {RADII_KM.map(km => <option key={km} value={km}>{km} km</option>)}
        </select>
      </div>

      {origin && (
        <div className="place-origin" id="nearby-origin">
          <MapPin size={16} color="var(--primary)" />
          <div>
            <strong>{origin.label}</strong>
            {origin.approximate && (
              <p className="muted">
                “{origin.searchedFor || query.trim()}” is not on OpenStreetMap, so these results are around {origin.matchedQuery} and may be farther away.
              </p>
            )}
          </div>
        </div>
      )}

      {busy && <p className="notice" role="status">{status === 'locating' ? 'Finding the place…' : 'Searching OpenStreetMap…'}</p>}
      {message && <p className={`notice ${status === 'error' ? 'danger' : 'warning'}`} role={status === 'error' ? 'alert' : 'status'} id="nearby-message">{message}</p>}

      {origin && (status === 'error' || (status === 'done' && !places.length)) && (
        <a className="btn btn-ghost" href={categorySearchUrl(categoryInfo.label, origin.locality || origin.matchedQuery || '')} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={14} /> Search {categoryInfo.label.toLowerCase()} on a public map instead
        </a>
      )}

      {places.length > 0 && (
        <div className="place-list" id="place-list">
          {places.map((place, index) => {
            const phone = place.osmPhone ? place.osmPhone.split(/[;,]/)[0].trim() : '';
            return (
              <article className={`place ${selectedId === place.id ? 'selected' : ''}`} key={place.id} onClick={() => setSelectedId(place.id)}>
                <div className="place-index">{index + 1}</div>
                <div className="place-body">
                  <strong>{place.name}</strong>
                  <span>{place.distanceKm} km away · {place.address || 'address not listed'}</span>
                  {phone ? (
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}><Phone size={13} /> {phone} <span className="muted">(listed on OpenStreetMap, not verified)</span></a>
                  ) : (
                    <span className="fine-print">No phone number listed on OpenStreetMap</span>
                  )}
                  <a href={place.searchUrl} target="_blank" rel="noopener noreferrer" className="find-phone">
                    <ExternalLink size={13} /> Find phone number
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {places.length > 0 && (
        <p className="fine-print">
          Up to {MAX_RESULTS} nearest places from OpenStreetMap{retrievedAt ? `, ${new Date(retrievedAt).toLocaleString()}` : ''}.
          "Find phone number" opens a public map search — check the number yourself before calling.
        </p>
      )}

      <p className="fine-print">
        Searching sends only the place name to free OpenStreetMap services — never your conversation or your phone's location. Needs internet.
      </p>
    </div>
  );
}
