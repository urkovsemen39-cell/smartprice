import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // Ramp up to 20 users
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '1m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
    http_req_failed: ['rate<0.01'], // Error rate < 1%
    errors: ['rate<0.1'], // Custom error rate < 10%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export default function () {
  // Test health endpoint
  let res = http.get(`${BASE_URL}/health`);
  check(res, {
    'health check status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);

  // Test search endpoint
  res = http.get(`${BASE_URL}/api/v1/search?query=laptop&limit=10`);
  check(res, {
    'search status is 200': (r) => r.status === 200,
    'search has products': (r) => JSON.parse(r.body).products !== undefined,
  }) || errorRate.add(1);

  sleep(1);

  // Test suggestions endpoint
  res = http.get(`${BASE_URL}/api/v1/suggestions?query=lap`);
  check(res, {
    'suggestions status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  sleep(1);
}
