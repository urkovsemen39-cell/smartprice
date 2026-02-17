// Общие типы для товаров

export interface Product {
  id: string;
  name: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviewCount: number;
  image: string;
  url: string;
  marketplace: string;
  deliveryDays: number;
  deliveryCost: number;
  inStock: boolean;
  smartScore?: number;
}

export interface ProductDetails extends Product {
  description: string;
  specifications: Record<string, string>;
  images: string[];
  seller: string;
}

export interface SearchFilters {
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  marketplaces?: string[];
  freeDelivery?: boolean;
  inStockOnly?: boolean;
}

export type SortOption = 'smart' | 'price_asc' | 'price_desc' | 'rating' | 'delivery';

export interface SearchParams {
  query: string;
  filters?: SearchFilters;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

export interface SearchResponse {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
}
