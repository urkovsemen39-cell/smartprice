import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '3m', target: 500 },   // Ramp up to 500 users
    { duration: '2m', target: 1000 },  // Spike to 1000 users
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% < 2s under stress
    http_req_failed: ['rate<0.05'],    // Error rate < 5%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  const responses = http.batch([
    ['GET', `${BASE_URL}/health`],
    ['GET', `${BASE_URL}/api/v1/search?query=test`],
    ['GET', `${BASE_URL}/api/v1/suggestions?query=te`],
  ]);

  responses.forEach((res) => {
    check(res, {
      'status is 200 or 429': (r) => r.status === 200 || r.status === 429,
    });
  });

  sleep(0.5);
}
