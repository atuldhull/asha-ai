'use client';

import { useEffect, useMemo, useRef } from 'react';
import L, { type DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { KIND_COLOR, type OutbreakCluster } from '@/lib/outbreak-mock';

interface OutbreakMap2DProps {
  clusters: OutbreakCluster[];
  selectedId?: string | null;
  onSelect?: (cluster: OutbreakCluster) => void;
  /** Container height in px. */
  height?: number;
  className?: string;
}

const INDIA_CENTER: [number, number] = [22.0, 79.0];
const INITIAL_ZOOM = 5;

/**
 * Plan 6.3 — 2D outbreak map. Leaflet + OpenStreetMap tiles. **No Mapbox
 * token, no Google Maps key.** Pairs with `OutbreakGlobe` so judges can
 * toggle between 3D-cinematic and 2D-clinical views.
 *
 * Markers are sized by case-count (radius 6–18 px) and colored by outbreak
 * kind via the shared `KIND_COLOR` palette so the legend stays consistent
 * across the globe + map.
 *
 * Privacy: clusters are aggregate-only (500m grid-snapped on the backend);
 * the map never renders individual records. Per [DPDP §6](docs/regulatory/).
 */
export function OutbreakMap2D({
  clusters,
  selectedId = null,
  onSelect,
  height = 460,
  className = '',
}: OutbreakMap2DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.CircleMarker>>({});

  // Initialize map once.
  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: INDIA_CENTER,
      zoom: INITIAL_ZOOM,
      scrollWheelZoom: true,
      zoomControl: true,
      attributionControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      // OpenStreetMap attribution is required by their tile-usage policy.
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Sync markers whenever clusters change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove stale markers.
    const stillPresent = new Set(clusters.map((c) => c.id));
    for (const [id, marker] of Object.entries(markersRef.current)) {
      if (!stillPresent.has(id)) {
        marker.remove();
        delete markersRef.current[id];
      }
    }

    for (const c of clusters) {
      const radius = Math.max(6, Math.min(18, 4 + c.case_count * 0.4));
      const color = KIND_COLOR[c.kind];
      const isSelected = c.id === selectedId;

      const existing = markersRef.current[c.id];
      if (existing) {
        existing.setLatLng([c.lat, c.lon]);
        existing.setRadius(radius);
        existing.setStyle({
          color,
          fillColor: color,
          weight: isSelected ? 3 : 1.5,
          fillOpacity: isSelected ? 0.65 : 0.45,
        });
      } else {
        const marker = L.circleMarker([c.lat, c.lon], {
          radius,
          color,
          fillColor: color,
          weight: isSelected ? 3 : 1.5,
          fillOpacity: isSelected ? 0.65 : 0.45,
        });
        marker.bindTooltip(
          `<div style="font-family:system-ui,sans-serif">
            <div style="font-weight:600;font-size:12px;color:#0f172a">${escapeHtml(c.district)}</div>
            <div style="font-size:11px;color:#475569">${c.case_count} cases · ${escapeHtml(c.kind)}</div>
          </div>`,
          { direction: 'top', opacity: 0.95 },
        );
        marker.on('click', () => onSelect?.(c));
        marker.addTo(map);
        markersRef.current[c.id] = marker;
      }
    }
  }, [clusters, selectedId, onSelect]);

  // Pan to the selected cluster.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const cluster = clusters.find((c) => c.id === selectedId);
    if (cluster) {
      map.setView([cluster.lat, cluster.lon], Math.max(map.getZoom(), 7), {
        animate: true,
      });
    }
  }, [selectedId, clusters]);

  // Auto-fit bounds to all clusters on first render after data lands.
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (initialFitDoneRef.current) return;
    if (clusters.length === 0) return;
    const bounds = L.latLngBounds(clusters.map((c) => [c.lat, c.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
    initialFitDoneRef.current = true;
  }, [clusters]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Geographic outbreak cluster map"
      className={`overflow-hidden rounded-2xl border border-slate-800 ${className}`}
      style={{ width: '100%', height }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Suppress unused-import warning when bundlers tree-shake DivIcon.
export type _Unused = DivIcon;
