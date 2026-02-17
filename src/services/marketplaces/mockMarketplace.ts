import { Product, SearchFilters } from '../../types';

// Моковый адаптер для демонстрации работы системы
export class MockMarketplaceAdapter {
  name: string;

  constructor(name: string) {
    this.name = name;
  }

  async search(query: string, filters?: SearchFilters): Promise<Product[]> {
    // Имитация задержки сети
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Генерируем моковые товары
    const count = Math.floor(Math.random() * 5) + 3;
    const products: Product[] = [];

    for (let i = 0; i < count; i++) {
      const basePrice = Math.floor(Math.random() * 50000) + 1000;
      const hasDiscount = Math.random() > 0.6;
      
      products.push({
        id: `${this.name.toLowerCase().replace(/\s/g, '_')}_${Date.now()}_${i}`,
        name: `${query} - ${this.generateProductName()}`,
        price: hasDiscount ? Math.floor(basePrice * 0.85) : basePrice,
        oldPrice: hasDiscount ? basePrice : undefined,
        rating: Math.round((Math.random() * 2 + 3) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 1000) + 10,
        image: `https://via.placeholder.com/300x300?text=${encodeURIComponent(query)}`,
        url: `https://example.com/product/${i}`,
        marketplace: this.name,
        deliveryDays: Math.floor(Math.random() * 7) + 1,
        deliveryCost: Math.random() > 0.5 ? 0 : Math.floor(Math.random() * 500),
        inStock: Math.random() > 0.1,
      });
    }

    return products;
  }

  private generateProductName(): string {
    const adjectives = ['Премиум', 'Новый', 'Улучшенный', 'Профессиональный', 'Компактный'];
    const features = ['с гарантией', 'быстрая доставка', 'хит продаж', 'акция', 'топ выбор'];
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const feat = features[Math.floor(Math.random() * features.length)];
    
    return `${adj} (${feat})`;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
