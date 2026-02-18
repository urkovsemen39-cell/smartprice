import { test, expect } from '@playwright/test';

test.describe('Search API', () => {
  test('should search for products', async ({ request }) => {
    const response = await request.get('/api/v1/search', {
      params: {
        query: 'laptop',
        limit: 10,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('products');
    expect(Array.isArray(data.products)).toBeTruthy();
  });

  test('should get suggestions', async ({ request }) => {
    const response = await request.get('/api/v1/suggestions', {
      params: { query: 'lap' },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('suggestions');
    expect(Array.isArray(data.suggestions)).toBeTruthy();
  });

  test('should handle empty search query', async ({ request }) => {
    const response = await request.get('/api/v1/search', {
      params: { query: '' },
    });

    expect(response.status()).toBe(400);
  });

  test('should respect rate limiting', async ({ request }) => {
    const requests = Array(150).fill(null).map(() =>
      request.get('/api/v1/search', { params: { query: 'test' } })
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.some(r => r.status() === 429);
    expect(rateLimited).toBeTruthy();
  });
});
