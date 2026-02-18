import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'TestPassword123!',
    name: 'Test User',
  };

  test('should register a new user', async ({ request }) => {
    const response = await request.post('/api/v1/auth/register', {
      data: testUser,
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('accessToken');
    expect(data).toHaveProperty('user');
    expect(data.user.email).toBe(testUser.email);
  });

  test('should login with valid credentials', async ({ request }) => {
    // First register
    await request.post('/api/v1/auth/register', { data: testUser });

    // Then login
    const response = await request.post('/api/v1/auth/login', {
      data: {
        email: testUser.email,
        password: testUser.password,
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('accessToken');
  });

  test('should fail login with invalid credentials', async ({ request }) => {
    const response = await request.post('/api/v1/auth/login', {
      data: {
        email: 'nonexistent@example.com',
        password: 'wrongpassword',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('should refresh access token', async ({ request }) => {
    // Register and login
    await request.post('/api/v1/auth/register', { data: testUser });
    const loginResponse = await request.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });

    const cookies = loginResponse.headers()['set-cookie'];

    // Refresh token
    const refreshResponse = await request.post('/api/v1/auth/refresh', {
      headers: { Cookie: cookies },
    });

    expect(refreshResponse.ok()).toBeTruthy();
    const data = await refreshResponse.json();
    expect(data).toHaveProperty('accessToken');
  });

  test('should get current user info', async ({ request }) => {
    // Register and login
    await request.post('/api/v1/auth/register', { data: testUser });
    const loginResponse = await request.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });

    const { accessToken } = await loginResponse.json();

    // Get user info
    const response = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.user.email).toBe(testUser.email);
  });

  test('should logout successfully', async ({ request }) => {
    // Register and login
    await request.post('/api/v1/auth/register', { data: testUser });
    const loginResponse = await request.post('/api/v1/auth/login', {
      data: { email: testUser.email, password: testUser.password },
    });

    const { accessToken } = await loginResponse.json();
    const cookies = loginResponse.headers()['set-cookie'];

    // Logout
    const response = await request.post('/api/v1/auth/logout', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Cookie: cookies,
      },
    });

    expect(response.ok()).toBeTruthy();
  });
});
