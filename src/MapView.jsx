import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(workerUrl);

const ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>';

function baseStyle(theme) {
  const flavor = theme === 'light' ? 'light_all' : 'dark_all';
  return {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map((s) => `https://${s}.basemaps.cartocdn.com/${flavor}/{z}/{x}/{y}@2x.png`),
        tileSize: 256,
        maxzoom: 20,
        attribution: ATTRIBUTION,
      },
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
  };
}

function toGeoJSON(places, notes, types) {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      id: undefined,
      properties: {
        id: p.id,
        color: types[p.type]?.color || '#ffffff',
        status: notes[p.id]?.status || '',
        approx: Boolean(p.approx),
      },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  };
}

function addLayers(map) {
  if (map.getSource('places')) return;
  map.addSource('places', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'places-glow', type: 'circle', source: 'places',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 15, 18],
      'circle-blur': 1,
      'circle-opacity': ['case', ['==', ['get', 'status'], 'done'], 0.15, 0.45],
    },
  });
  map.addLayer({
    id: 'places', type: 'circle', source: 'places',
    paint: {
      'circle-color': ['get', 'color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 15, 8],
      'circle-opacity': ['case', ['==', ['get', 'status'], 'done'], 0.45, 1],
      'circle-stroke-width': ['case', ['==', ['get', 'status'], 'love'], 3, ['get', 'approx'], 2, 1.5],
      'circle-stroke-color': ['case', ['==', ['get', 'status'], 'love'], '#ffd60a', '#0b0b12'],
    },
  });
  map.addLayer({
    id: 'selected-ring', type: 'circle', source: 'selected',
    paint: {
      'circle-color': 'rgba(0,0,0,0)',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 15, 15],
      'circle-stroke-width': 2.5,
      'circle-stroke-color': '#ffffff',
    },
  });
}

export default function MapView({ places, notes, types, theme, selectedId, onSelect, flyKey }) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const dataRef = useRef({ places, notes, types, selectedId });
  dataRef.current = { places, notes, types, selectedId };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  function sync() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    addLayers(map);
    const { places: ps, notes: ns, types: ts, selectedId: sid } = dataRef.current;
    map.getSource('places').setData(toGeoJSON(ps, ns, ts));
    const sel = ps.find((p) => p.id === sid);
    map.getSource('selected').setData({
      type: 'FeatureCollection',
      features: sel ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [sel.lng, sel.lat] } }] : [],
    });
  }

  // Création de la carte
  useEffect(() => {
    const map = new maplibregl.Map({
      container: box.current,
      style: baseStyle(theme),
      center: [114.172, 22.302],
      zoom: 12.2,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    }), 'top-right');
    map.on('style.load', () => { readyRef.current = true; sync(); });
    map.once('load', () => {
      // Cadre initial : tous les lieux du centre-ville (sans les lieux excentrés)
      const core = dataRef.current.places.filter((p) => p.lat < 22.36);
      if (!core.length || dataRef.current.selectedId) return;
      const b = new maplibregl.LngLatBounds();
      core.forEach((p) => b.extend([p.lng, p.lat]));
      const pad = mapPadding();
      map.fitBounds(b, { padding: { top: pad.top + 40, bottom: pad.bottom + 40, left: pad.left + 40, right: pad.right + 60 }, duration: 0, maxZoom: 14 });
    });
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'hover-pop' });
    map.on('mousemove', 'places', (e) => {
      const id = e.features?.[0]?.properties?.id;
      const p = dataRef.current.places.find((x) => x.id === id);
      if (!p) return;
      hover.setLngLat([p.lng, p.lat]).setText(p.name).addTo(map);
    });
    map.on('mouseleave', 'places', () => hover.remove());
    map.on('click', 'places', (e) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onSelectRef.current(id, { fromMap: true });
    });
    map.on('mouseenter', 'places', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'places', () => { map.getCanvas().style.cursor = ''; });
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thème : on change le fond, les calques sont rajoutés au chargement du style
  const firstTheme = useRef(true);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstTheme.current) { firstTheme.current = false; return; }
    readyRef.current = false;
    map.setStyle(baseStyle(theme));
  }, [theme]);

  useEffect(() => { sync(); });

  // Centre la carte sur le lieu choisi depuis la liste
  useEffect(() => {
    const map = mapRef.current;
    const sel = places.find((p) => p.id === selectedId);
    if (!map || !sel || !flyKey) return;
    map.flyTo({ center: [sel.lng, sel.lat], zoom: Math.max(map.getZoom(), 15), speed: 1.4, padding: mapPadding() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey]);

  return <div ref={box} className="map" />;
}

function mapPadding() {
  if (window.matchMedia('(min-width: 900px)').matches) return { left: 400, top: 0, right: 0, bottom: 0 };
  return { bottom: Math.round(window.innerHeight * 0.5), top: 0, left: 0, right: 0 };
}
