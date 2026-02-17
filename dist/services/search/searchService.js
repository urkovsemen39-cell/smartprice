"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchProducts = searchProducts;
const mockMarketplace_1 = require("../marketplaces/mockMarketplace");
const cacheService_1 = __importDefault(require("../cache/cacheService"));
const analyticsService_1 = __importDefault(require("../analytics/analyticsService"));
const marketplaces = [
    new mockMarketplace_1.MockMarketplaceAdapter('Яндекс.Маркет'),
    new mockMarketplace_1.MockMarketplaceAdapter('AliExpress'),
    new mockMarketplace_1.MockMarketplaceAdapter('М.Видео'),
    new mockMarketplace_1.MockMarketplaceAdapter('Citilink'),
    new mockMarketplace_1.MockMarketplaceAdapter('Lamoda'),
    new mockMarketplace_1.MockMarketplaceAdapter('Золотое Яблоко'),
    new mockMarketplace_1.MockMarketplaceAdapter('Леруа Мерлен'),
    new mockMarketplace_1.MockMarketplaceAdapter('Детский мир'),
    new mockMarketplace_1.MockMarketplaceAdapter('Спортмастер'),
    new mockMarketplace_1.MockMarketplaceAdapter('Лабиринт'),
];
async function searchProducts(params, userId) {
    const { query, filters, sort = 'smart', page = 1, limit = 20 } = params;
    try {
        // Проверяем кэш
        const cached = await cacheService_1.default.getCachedSearchResults(query, filters, sort);
        if (cached) {
            await analyticsService_1.default.trackSearch(userId || null, query, filters, cached.total);
            return cached;
        }
        // Параллельный поиск по всем маркетплейсам с таймаутом
        const SEARCH_TIMEOUT = 5000; // 5 секунд максимум
        const searchPromises = marketplaces.map(marketplace => Promise.race([
            marketplace.search(query, filters),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), SEARCH_TIMEOUT))
        ]));
        const results = await Promise.allSettled(searchPromises);
        // Собираем успешные результаты
        let allProducts = [];
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allProducts = allProducts.concat(result.value);
            }
            else {
                console.error(`❌ ${marketplaces[index].name} failed:`, result.reason.message);
            }
        });
        // Применяем фильтры
        let filteredProducts = applyFilters(allProducts, filters);
        // Вычисляем smartScore для каждого товара
        filteredProducts = calculateSmartScores(filteredProducts);
        // Сортируем
        filteredProducts = sortProducts(filteredProducts, sort);
        // Пагинация
        const total = filteredProducts.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
        const response = {
            products: paginatedProducts,
            total,
            page,
            totalPages,
        };
        // Кэшируем результаты с учетом популярности
        const popularity = await analyticsService_1.default.getQueryPopularityCount(query);
        await cacheService_1.default.cacheSearchResults(query, filters, sort, response, popularity);
        // Трекаем поиск
        await analyticsService_1.default.trackSearch(userId || null, query, filters, total);
        return response;
    }
    catch (error) {
        console.error('❌ Search service error:', error);
        throw error;
    }
}
function applyFilters(products, filters) {
    if (!filters)
        return products;
    return products.filter(product => {
        if (filters.minPrice && product.price < filters.minPrice)
            return false;
        if (filters.maxPrice && product.price > filters.maxPrice)
            return false;
        if (filters.minRating && product.rating < filters.minRating)
            return false;
        if (filters.freeDelivery && product.deliveryCost > 0)
            return false;
        if (filters.inStockOnly && !product.inStock)
            return false;
        return true;
    });
}
function calculateSmartScores(products) {
    if (products.length === 0)
        return products;
    const maxPrice = Math.max(...products.map(p => p.price));
    const minPrice = Math.min(...products.map(p => p.price));
    const priceRange = maxPrice - minPrice || 1;
    return products.map(product => {
        const priceScore = 1 - ((product.price - minPrice) / priceRange);
        const ratingScore = product.rating / 5;
        const deliveryScore = Math.max(0, 1 - (product.deliveryDays / 30));
        const smartScore = (priceScore * 0.4 +
            ratingScore * 0.4 +
            deliveryScore * 0.2);
        return {
            ...product,
            smartScore: Math.round(smartScore * 100) / 100,
        };
    });
}
function sortProducts(products, sort) {
    const sorted = [...products];
    switch (sort) {
        case 'price_asc':
            return sorted.sort((a, b) => a.price - b.price);
        case 'price_desc':
            return sorted.sort((a, b) => b.price - a.price);
        case 'rating':
            return sorted.sort((a, b) => b.rating - a.rating);
        case 'delivery':
            return sorted.sort((a, b) => a.deliveryDays - b.deliveryDays);
        case 'smart':
        default:
            return sorted.sort((a, b) => (b.smartScore || 0) - (a.smartScore || 0));
    }
}
