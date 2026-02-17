"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cacheService_1 = __importDefault(require("../../services/cache/cacheService"));
// Мокаем Redis
jest.mock('../../config/redis', () => ({
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    flushAll: jest.fn(),
}));
const redis_1 = __importDefault(require("../../config/redis"));
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
            await cacheService_1.default.cacheSearchResults(query, filters, sort, results, 'popular');
            expect(redis_1.default.setEx).toHaveBeenCalledWith(expect.any(String), 900, // 15 минут для popular
            expect.any(String));
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
            redis_1.default.get.mockResolvedValueOnce(JSON.stringify(mockResults));
            const result = await cacheService_1.default.getCachedSearchResults('laptop', {}, 'smart');
            expect(result).toEqual(mockResults);
        });
        it('should return null if cache miss', async () => {
            redis_1.default.get.mockResolvedValueOnce(null);
            const result = await cacheService_1.default.getCachedSearchResults('laptop', {}, 'smart');
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
            await cacheService_1.default.cacheProduct('test-1', product);
            expect(redis_1.default.setEx).toHaveBeenCalledWith('product:test-1', 3600, // 1 час
            expect.any(String));
        });
    });
});
