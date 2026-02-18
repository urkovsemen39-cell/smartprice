import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 100 },   // Normal load
    { duration: '10s', target: 2000 },  // Sudden spike
    { duration: '30s', target: 2000 },  // Stay at spike
    { duration: '10s', target: 100 },   // Return to normal
    { duration: '10s', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'], // 95% < 3s during spike
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/search?query=laptop`);
  check(res, {
    'status is 200 or 429 or 503': (r) => 
      r.status === 200 || r.status === 429 || r.status === 503,
  });
}
