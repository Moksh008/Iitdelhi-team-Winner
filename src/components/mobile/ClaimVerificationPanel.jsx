import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  MapPin,
  Phone,
  ShieldCheck,
  Store,
  Building2,
  Pill,
  X
} from 'lucide-react';
import { INDIAN_LANGUAGES } from '../../engine/languages';

export default function ClaimVerificationPanel({ result, isOpen = true, onClose }) {
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [nearbyNotice, setNearbyNotice] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState('hospital');
  const [resultLimit, setResultLimit] = useState(3);
  const apiBaseUrl = import.meta.env.VITE_SATARK_API_BASE_URL || '';
  const [searchError, setSearchError] = useState('');

  const entities = result?.entities || [];
  const location = entities.find(entity => entity.type === 'LOCATION');
  const hospital = entities.find(entity => entity.type === 'HOSPITAL');
  const locationQuery = location?.normalized_text || hospital?.normalized_text;
  const locationLabel = location?.normalized_text || hospital?.normalized_text;
  const preferredCategory = result?.place_category === 'business'
    ? 'shop'
    : result?.place_category;
  const categories = [
    { id: 'hospital', label: 'Hospitals', icon: Building2 },
    { id: 'pharmacy', label: 'Pharmacies', icon: Pill },
    { id: 'shop', label: 'Shops', icon: Store },
    { id: 'police station', label: 'Police / emergency', icon: ShieldCheck }
  ];

  useEffect(() => {
    setActiveCategory(
      ['hospital', 'pharmacy', 'shop', 'police station'].includes(preferredCategory)
        ? preferredCategory
        : 'hospital'
    );
    setResultLimit(3);
  }, [preferredCategory]);

  useEffect(() => {
    if (!isOpen || !locationQuery) {
      setNearbyPlaces([]);
      setNearbyNotice(locationQuery ? '' : 'No location was extracted from the transcript. Nearby search was not run.');
      setResolvedLocation(null);
      return;
    }
    setIsLoading(true);
    setNearbyNotice('');
    setSearchError('');
    setNearbyPlaces([]);
    const endpoint = `${apiBaseUrl.replace(/\/$/, '')}/api/v1/places/search`;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: locationQuery, category: activeCategory, limit: resultLimit }),
      signal: controller.signal
    })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(body?.detail || `Places search failed (HTTP ${response.status})`);
        }
        if (!body || !Array.isArray(body.places)) {
          throw new Error('Places provider returned an unexpected response.');
        }
        setNearbyPlaces(body.places);
        setResolvedLocation(body.resolved_location || null);
        setNearbyNotice(body.notice || (body.places.length ? '' : 'No provider listings found for this category.'));
      })
      .catch(error => {
        if (error.name === 'AbortError') return;
        setNearbyPlaces([]);
        setSearchError(error.message || 'Nearby search failed. Try again or verify through an official source.');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isOpen, locationQuery, activeCategory, resultLimit, apiBaseUrl]);

  if (!result || !isOpen) return null;

  const visibleContacts = result.contacts || [];
  const visiblePlaces = nearbyPlaces;
  const hasMorePlaces = resultLimit < 20 && nearbyPlaces.length >= resultLimit;
  const riskLabel = (result.risk_level || 'caution').replaceAll('_', ' ');
  const retrievedAt = visiblePlaces.find(place => place.retrieved_at)?.retrieved_at;

  return (
    <aside className="claim-verification-panel" aria-live="polite">
      <div className="claim-panel-header">
        <div className="claim-brand">
          <div className="claim-brand-mark"><ShieldCheck size={19} /></div>
          <div>
            <div className="claim-brand-name">SATARK</div>
            <div className="claim-brand-subtitle">Independent claim verification</div>
          </div>
        </div>
        <div className="claim-header-actions">
          <span className={`claim-risk-pill ${riskLabel.replaceAll(' ', '-')}`}>{riskLabel}</span>
          <button className="claim-close-button" onClick={onClose} aria-label="Close warning">
          <X size={18} />
          </button>
        </div>
      </div>

      <div className="claim-danger-banner">
        <div className="claim-danger-icon"><AlertTriangle size={22} /></div>
        <div>
          <strong>VERIFY THIS CLAIM INDEPENDENTLY</strong>
          <span>These indicators are not proof of fraud. Do not send money based only on an urgent claim.</span>
        </div>
      </div>

      {result.transcript_excerpt && (
        <blockquote className="claim-transcript">
          {result.detected_language &&
            <span className="claim-detected-language">
              Detected language: {INDIAN_LANGUAGES[result.detected_language]?.name || result.detected_language}
            </span>}
          “{result.transcript_excerpt}”
        </blockquote>
      )}

      <div className="claim-evidence-list">
        {(result.evidence_indicators || []).map(item => <span key={item}>{item}</span>)}
      </div>

      {locationLabel && <div className="claim-section">
        <div className="claim-section-label"><MapPin size={15} /> Detected location</div>
        <div className="claim-location-card">
          <div>
            <strong>{locationLabel}</strong>
            <span>Extracted from the submitted transcript</span>
            {resolvedLocation && <>
              <strong className="claim-map-match">{resolvedLocation.name}</strong>
              <span>
                Matched by Azure Maps{resolvedLocation.address ? ` · ${resolvedLocation.address}` : ''}
              </span>
            </>}
          </div>
        </div>
      </div>}

      <div className="claim-section">
        <div className="claim-section-heading">
          <div className="claim-section-label"><Phone size={15} /> Nearby places</div>
          <button
            type="button"
            className="claim-show-more"
            disabled={!locationQuery || isLoading || !hasMorePlaces}
            onClick={() => setResultLimit(limit => Math.min(limit + 5, 20))}
          >
            {!hasMorePlaces ? 'No more results' : 'Show more ›'}
          </button>
        </div>
        <div className="claim-category-tabs" role="tablist" aria-label="Nearby place categories">
          {categories.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeCategory === id}
              className={activeCategory === id ? 'active' : ''}
              key={id}
              onClick={() => { setActiveCategory(id); setResultLimit(3); }}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        {isLoading && <div className="claim-notice">Searching provider listings…</div>}

        <div className="claim-contact-list">
          {visibleContacts.map(contact => (
            <div className="claim-contact-card" key={`${contact.name}-${contact.phone}`}>
              <div className="claim-contact-icon"><ShieldCheck size={17} /></div>
              <div className="claim-contact-details">
                <strong>{contact.name}</strong>
                <span>{contact.address}</span>
                <small className="claim-contact-phone">{contact.phone}</small>
                <small className="claim-contact-status">{contact.source} · verify independently</small>
              </div>
              {contact.phone && <a className="claim-call-button" href={`tel:${contact.phone.replace(/\s/g, '')}`} aria-label={`Call ${contact.name}`}>
                <Phone size={16} />
              </a>}
            </div>
          ))}
          {visiblePlaces.map(place => (
            <div className="claim-contact-card" key={`${place.name}-${place.address}`}>
              <div className="claim-contact-icon public"><Store size={17} /></div>
              <div className="claim-contact-details">
                <strong>{place.name}</strong>
                <span>
                  {place.distance_km != null ? `About ${place.distance_km} km · ` : ''}
                  {place.address || 'Address unavailable'}
                </span>
                <small className={place.phone ? 'claim-contact-phone' : 'claim-contact-phone unavailable'}>
                  {place.phone || 'Phone number not published'}
                </small>
                <small className="claim-contact-status">{place.source || 'Provider listing'} · verify independently</small>
              </div>
              {place.phone && (
                <a className="claim-call-button" href={`tel:${place.phone.replace(/\s/g, '')}`} aria-label={`Call ${place.name}`}>
                  <Phone size={16} />
                </a>
              )}
            </div>
          ))}
        </div>

        {!isLoading && visibleContacts.length === 0 && visiblePlaces.length === 0 && !nearbyNotice &&
          <div className="claim-notice">No provider listings found for this category.</div>}
        {nearbyNotice && <div className="claim-notice">{nearbyNotice}</div>}
        {searchError && <div className="claim-notice" role="alert">{searchError}</div>}
        {locationQuery && visiblePlaces.length > 0 &&
          <small className="claim-provider-meta">
            Provider results · {retrievedAt ? `retrieved ${new Date(retrievedAt).toLocaleString()}` : 'retrieval time unavailable'}.
            Listings do not confirm an emergency.
          </small>}
      </div>

      <div className="claim-guidance">
        <ShieldCheck size={17} />
        <span><strong>Verify before sending money.</strong> Contact an independently sourced official service. Nearby listings do not verify the caller’s claim.</span>
      </div>
    </aside>
  );
}
