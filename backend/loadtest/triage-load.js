/**
 * ASHA-AI — /triage load test (Plan 4.0)
 *
 * Targets the deployed backend with a sustained 200 RPS for 2 minutes,
 * ramp-up 30 s, ramp-down 30 s. Thresholds:
 *   p95 latency  < 2000 ms
 *   error rate   < 1 %
 *
 * Usage:
 *   k6 run --env API_URL=https://asha-ai-backend-ib9p.onrender.com \
 *          backend/loadtest/triage-load.js
 *
 * Set --env TEST_TOKEN=<Bearer token> if your /triage requires auth.
 * The Plan 1.0 / 3.0 anonymous flow does not — TEST_TOKEN can be empty.
 *
 * Honest numbers > inflated numbers. If thresholds fail, dial the target
 * RPS down via --env TARGET_RPS=50 (default 200).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errors = new Rate('triage_errors');

const TARGET_RPS = Number(__ENV.TARGET_RPS || 200);
const HOLD_MINUTES = Number(__ENV.HOLD_MINUTES || 2);

export const options = {
  stages: [
    { duration: '30s',                target: Math.round(TARGET_RPS / 2) },
    { duration: `${HOLD_MINUTES}m`,   target: TARGET_RPS },
    { duration: '30s',                target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed:   ['rate<0.01'],
    triage_errors:     ['rate<0.01'],
  },
};

// Representative payload mix. Skews mild → most requests are cheap,
// matching the real load profile (most patients aren't ER cases).
const PAYLOADS = [
  { symptoms: 'runny nose mild cough 2 days', age: 30, sex: 'F' },
  { symptoms: 'mild headache for 3 hours', age: 28, sex: 'M' },
  { symptoms: 'chest pain', age: 67, sex: 'M', history: ['diabetes'] },
  { symptoms: 'sudden slurred speech and arm weakness',
    age: 72, sex: 'F', history: ['hypertension'] },
  { symptoms: 'persistent cough for 3 weeks with weight loss',
    age: 55, sex: 'M' },
];

export default function () {
  const apiUrl = __ENV.API_URL || 'http://localhost:8000';
  const token = __ENV.TEST_TOKEN || '';
  const payload = JSON.stringify(PAYLOADS[Math.floor(Math.random() * PAYLOADS.length)]);

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = http.post(`${apiUrl}/api/v1/triage`, payload, { headers });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'has level':  (r) => {
      try { return JSON.parse(r.body).level !== undefined; }
      catch (e) { return false; }
    },
    'has disclaimer': (r) => {
      try { return JSON.parse(r.body).disclaimer.includes('professional medical'); }
      catch (e) { return false; }
    },
  });
  errors.add(!ok);

  // Slight think-time so we don't slam the connection pool.
  sleep(0.5);
}

/**
 * Summary handler — k6 prints this at the end. Save it as JSON for the slide.
 *
 *   k6 run ... --summary-export=loadtest-summary.json
 */
export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    'loadtest-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data) {
  const m = data.metrics;
  const lines = [
    '\n==== ASHA-AI /triage load test ====',
    `Target RPS:            ${TARGET_RPS}`,
    `Hold duration:         ${HOLD_MINUTES} min`,
    `Total requests:        ${m.http_reqs && m.http_reqs.values.count}`,
    `Failed requests:       ${m.http_req_failed && (m.http_req_failed.values.rate * 100).toFixed(2)}%`,
    `Latency p50:           ${m.http_req_duration && m.http_req_duration.values['p(50)']?.toFixed(0)} ms`,
    `Latency p95:           ${m.http_req_duration && m.http_req_duration.values['p(95)']?.toFixed(0)} ms`,
    `Latency p99:           ${m.http_req_duration && m.http_req_duration.values['p(99)']?.toFixed(0)} ms`,
    `Throughput:            ${m.http_reqs && (m.http_reqs.values.rate).toFixed(1)} req/s`,
    '==================================\n',
  ];
  return lines.join('\n');
}
