import cacheService from '../../services/cache/cacheService';

// Мокаем Redis
jest.mock('../../config/redis', () => ({
  setEx: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  flushAll: jest.fn(),
}));

import redisClient from '../../config/redis';

describe('CacheService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cacheSearchResults', () => {
    it('should cache search results with correct TTL', async () => {
      const query = 'laptop';
      const filters = { minPrice: 1000 };
      const sort = 'smart';
      const results = {
        products: [],
        total: 0,
        page: 1,
        totalPages: 1,
      };

      await cacheService.cacheSearchResults(query, filters, sort, results, 'popular');

      expect(redisClient.setEx).toHaveBeenCalledWith(
        expect.any(String),
        900, // 15 минут для popular
        expect.any(String)
      );
    });
  });

  describe('getCachedSearchResults', () => {
    it('should return cached results if exists', async () => {
      const mockResults = {
        products: [],
        total: 0,
        page: 1,
        totalPages: 1,
      };

      (redisClient.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockResults));

      const result = await cacheService.getCachedSearchResults('laptop', {}, 'smart');

      expect(result).toEqual(mockResults);
    });

    it('should return null if cache miss', async () => {
      (redisClient.get as jest.Mock).mockResolvedValueOnce(null);

      const result = await cacheService.getCachedSearchResults('laptop', {}, 'smart');

      expect(result).toBeNull();
    });
  });

  describe('cacheProduct', () => {
    it('should cache product with correct TTL', async () => {
      const product = {
        id: 'test-1',
        name: 'Test Product',
        price: 1000,
        rating: 4.5,
        reviewCount: 100,
        image: 'test.jpg',
        url: 'http://test.com',
        marketplace: 'Test',
        deliveryDays: 3,
        deliveryCost: 0,
        inStock: true,
      };

      await cacheService.cacheProduct('test-1', product);

      expect(redisClient.setEx).toHaveBeenCalledWith(
        'product:test-1',
        3600, // 1 час
        expect.any(String)
      );
    });
  });
});
