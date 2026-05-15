/**
 * Plan 6.3 — mock outbreak cluster data for demo / dev use.
 *
 * Real data flows from the PostGIS-backed `/api/v1/outbreak/clusters/3d`
 * endpoint when Tier 6.5 lands HDBSCAN. Until then, this seed lets the
 * OutbreakGlobe + outbreak page render meaningful patterns aligned with
 * known Indian seasonal outbreaks (dengue Jul-Oct, gastroenteritis monsoon,
 * respiratory cluster Jan-Feb).
 *
 * NEVER ship the seed in production analytics — these are fictional. Used
 * only when `NEXT_PUBLIC_OUTBREAK_DEMO_SEED=1` or when the backend hasn't
 * shipped the endpoint yet (returns an empty array).
 */

export type OutbreakKind =
  | 'dengue'
  | 'chikungunya'
  | 'gastroenteritis'
  | 'respiratory'
  | 'hepatitis'
  | 'unclassified';

export interface OutbreakCluster {
  id: string;
  /** Latitude in degrees, India bounds. */
  lat: number;
  /** Longitude in degrees, India bounds. */
  lon: number;
  /** Active case count in the cluster. */
  case_count: number;
  /** Cluster confidence 0..1 (HDBSCAN probability). */
  confidence: number;
  district: string;
  state: string;
  kind: OutbreakKind;
  /** Dominant symptom tokens. */
  dominant_symptoms: string[];
  /** ISO timestamp of first detected case. */
  first_seen_at: string;
}

export const DEMO_CLUSTERS: OutbreakCluster[] = [
  {
    id: 'dem-001',
    lat: 12.9716,
    lon: 77.5946,
    case_count: 23,
    confidence: 0.87,
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    kind: 'dengue',
    dominant_symptoms: ['fever', 'rash', 'joint_pain'],
    first_seen_at: '2026-05-12T07:00:00Z',
  },
  {
    id: 'dem-002',
    lat: 13.0827,
    lon: 80.2707,
    case_count: 18,
    confidence: 0.82,
    district: 'Chennai',
    state: 'Tamil Nadu',
    kind: 'dengue',
    dominant_symptoms: ['fever', 'rash', 'headache'],
    first_seen_at: '2026-05-13T09:30:00Z',
  },
  {
    id: 'dem-003',
    lat: 19.076,
    lon: 72.8777,
    case_count: 31,
    confidence: 0.91,
    district: 'Mumbai',
    state: 'Maharashtra',
    kind: 'gastroenteritis',
    dominant_symptoms: ['fever', 'vomiting', 'diarrhea'],
    first_seen_at: '2026-05-14T05:15:00Z',
  },
  {
    id: 'dem-004',
    lat: 22.5726,
    lon: 88.3639,
    case_count: 14,
    confidence: 0.76,
    district: 'Kolkata',
    state: 'West Bengal',
    kind: 'hepatitis',
    dominant_symptoms: ['jaundice', 'fever', 'fatigue'],
    first_seen_at: '2026-05-13T11:00:00Z',
  },
  {
    id: 'dem-005',
    lat: 28.7041,
    lon: 77.1025,
    case_count: 27,
    confidence: 0.84,
    district: 'New Delhi',
    state: 'Delhi',
    kind: 'respiratory',
    dominant_symptoms: ['cough', 'fever', 'sore_throat'],
    first_seen_at: '2026-05-11T10:45:00Z',
  },
  {
    id: 'dem-006',
    lat: 17.385,
    lon: 78.4867,
    case_count: 16,
    confidence: 0.79,
    district: 'Hyderabad',
    state: 'Telangana',
    kind: 'chikungunya',
    dominant_symptoms: ['fever', 'joint_pain', 'rash'],
    first_seen_at: '2026-05-12T14:00:00Z',
  },
  {
    id: 'dem-007',
    lat: 26.9124,
    lon: 75.7873,
    case_count: 12,
    confidence: 0.71,
    district: 'Jaipur',
    state: 'Rajasthan',
    kind: 'dengue',
    dominant_symptoms: ['fever', 'rash'],
    first_seen_at: '2026-05-14T08:00:00Z',
  },
  {
    id: 'dem-008',
    lat: 9.9312,
    lon: 76.2673,
    case_count: 21,
    confidence: 0.88,
    district: 'Kochi',
    state: 'Kerala',
    kind: 'dengue',
    dominant_symptoms: ['fever', 'rash', 'joint_pain'],
    first_seen_at: '2026-05-13T13:30:00Z',
  },
];

export const KIND_COLOR: Record<OutbreakKind, string> = {
  dengue: '#E24B4A',
  chikungunya: '#F97316',
  gastroenteritis: '#EF9F27',
  respiratory: '#7F77DD',
  hepatitis: '#FCD34D',
  unclassified: '#94A3B8',
};

/**
 * Convert lat/lon (degrees) + radius to a 3D point on a sphere of given radius.
 * Standard spherical → cartesian: phi = colatitude, theta = longitude.
 */
export function latLonToVec3(
  lat: number,
  lon: number,
  radius: number,
): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}
