import { SearchParams, SearchResponse, Product } from '../../types';
import { YandexMarketAdapter } from '../marketplaces/yandexMarket';
import { MockMarketplaceAdapter } from '../marketplaces/mockMarketplace';
import { advancedCacheService } from '../cache/advancedCacheService';
import analyticsService from '../analytics/analyticsService';
import logger from '../../utils/logger';

const marketplaces = [
  new MockMarketplaceAdapter('Яндекс.Маркет'),
  new MockMarketplaceAdapter('AliExpress'),
  new MockMarketplaceAdapter('М.Видео'),
  new MockMarketplaceAdapter('Citilink'),
  new MockMarketplaceAdapter('Lamoda'),
  new MockMarketplaceAdapter('Золотое Яблоко'),
  new MockMarketplaceAdapter('Леруа Мерлен'),
  new MockMarketplaceAdapter('Детский мир'),
  new MockMarketplaceAdapter('Спортмастер'),
  new MockMarketplaceAdapter('Лабиринт'),
];

export async function searchProducts(params: SearchParams, userId?: number): Promise<SearchResponse> {
  const { query, filters, sort = 'smart', page = 1, limit = 20 } = params;

  try {
    // Проверяем кэш
    const cached = await advancedCacheService.getCachedSearchResults(query, filters);
    if (cached) {
      await analyticsService.trackSearch(userId || null, query, filters, cached.total);
      return cached;
    }

    // Параллельный поиск по всем маркетплейсам с таймаутом
    const SEARCH_TIMEOUT = 5000; // 5 секунд максимум
    
    const searchPromises = marketplaces.map(marketplace => 
      Promise.race([
        marketplace.search(query, filters),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), SEARCH_TIMEOUT)
        )
      ])
    );

    const results = await Promise.allSettled(searchPromises);

    // Собираем успешные результаты
    let allProducts: Product[] = [];
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allProducts = allProducts.concat(result.value);
      } else {
        logger.error(`${marketplaces[index].name} failed:`, result.reason.message);
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

    const response: SearchResponse = {
      products: paginatedProducts,
      total,
      page,
      totalPages,
    };

    // Кэшируем результаты с учетом популярности
    const popularity = await analyticsService.getQueryPopularityCount(query);
    await advancedCacheService.cacheSearchResults(query, filters, response);

    // Трекаем поиск
    await analyticsService.trackSearch(userId || null, query, filters, total);

    return response;
  } catch (error) {
    logger.error('Search service error:', error);
    throw error;
  }
}

function applyFilters(products: Product[], filters?: SearchParams['filters']): Product[] {
  if (!filters) return products;

  return products.filter(product => {
    if (filters.minPrice && product.price < filters.minPrice) return false;
    if (filters.maxPrice && product.price > filters.maxPrice) return false;
    if (filters.minRating && product.rating < filters.minRating) return false;
    if (filters.freeDelivery && product.deliveryCost > 0) return false;
    if (filters.inStockOnly && !product.inStock) return false;
    return true;
  });
}

function calculateSmartScores(products: Product[]): Product[] {
  if (products.length === 0) return products;

  const maxPrice = Math.max(...products.map(p => p.price));
  const minPrice = Math.min(...products.map(p => p.price));
  const priceRange = maxPrice - minPrice || 1;

  return products.map(product => {
    const priceScore = 1 - ((product.price - minPrice) / priceRange);
    const ratingScore = product.rating / 5;
    const deliveryScore = Math.max(0, 1 - (product.deliveryDays / 30));

    const smartScore = (
      priceScore * 0.4 +
      ratingScore * 0.4 +
      deliveryScore * 0.2
    );

    return {
      ...product,
      smartScore: Math.round(smartScore * 100) / 100,
    };
  });
}

function sortProducts(products: Product[], sort: SearchParams['sort']): Product[] {
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
