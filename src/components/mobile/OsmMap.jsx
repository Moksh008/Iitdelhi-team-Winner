import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Standard OSM tile server: free for light use with attribution
// (https://operations.osmfoundation.org/policies/tiles/). Tiles need internet.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';

/** Interactive map of the search centre and up to five places. */
export default function OsmMap({ center, places, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const [tilesFailing, setTilesFailing] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    // No animations: screens can be hidden mid-animation, which breaks Leaflet.
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false });
    const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION });
    let errors = 0;
    tiles.on('tileerror', () => {
      errors += 1;
      if (errors >= 4) setTilesFailing(true);
    });
    tiles.on('tileload', () => setTilesFailing(false));
    tiles.addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // Screens stay mounted while hidden; redraw when the map becomes visible again.
    const resize = new ResizeObserver(() => {
      if (mapRef.current && containerRef.current?.offsetWidth) map.invalidateSize({ animate: false });
    });
    resize.observe(containerRef.current);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !center) return;
    layer.clearLayers();
    const points = [[center.lat, center.lon]];
    L.circleMarker([center.lat, center.lon], { radius: 8, color: '#1d4ed8', weight: 3, fillOpacity: 0.35 })
      .bindTooltip(center.label || 'Search location')
      .addTo(layer);
    places.forEach((place, index) => {
      points.push([place.lat, place.lon]);
      L.circleMarker([place.lat, place.lon], {
        radius: place.id === selectedId ? 9 : 7,
        color: place.id === selectedId ? '#b45309' : '#c62828',
        weight: 2,
        fillOpacity: 0.8,
      })
        .bindTooltip(`${index + 1}. ${place.name}`)
        .on('click', () => onSelect?.(place.id))
        .addTo(layer);
    });
    if (points.length > 1) {
      map.fitBounds(points, { padding: [24, 24], maxZoom: 16, animate: false });
    } else {
      map.setView(points[0], 14, { animate: false });
    }
    // The map may be created inside a container that was just shown.
    const timer = window.setTimeout(() => {
      if (mapRef.current === map && containerRef.current?.offsetWidth) map.invalidateSize({ animate: false });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [center, places, selectedId, onSelect]);

  return (
    <div className="nearby">
      <div ref={containerRef} className="map" role="region" aria-label="Map of nearby places" />
      {tilesFailing && (
        <p className="notice warning" role="status">
          Map tiles could not be loaded (they need internet). The list below still works.
        </p>
      )}
    </div>
  );
}
