// Типы для маркетплейсов

import { Product, SearchFilters } from './product';

export interface IMarketplace {
  name: string;
  search(query: string, filters?: SearchFilters): Promise<Product[]>;
  getProduct(id: string): Promise<Product | null>;
  isAvailable(): Promise<boolean>;
}

export interface MarketplaceConfig {
  name: string;
  apiKey?: string;
  apiSecret?: string;
  baseUrl: string;
  enabled: boolean;
}
