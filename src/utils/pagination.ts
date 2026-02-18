/**
 * Pagination Utility
 * Универсальная утилита для пагинации
 */

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export class Pagination {
  static readonly DEFAULT_PAGE = 1;
  static readonly DEFAULT_LIMIT = 20;
  static readonly MAX_LIMIT = 100;

  /**
   * Парсинг параметров пагинации из query
   */
  static parseParams(query: Record<string, unknown>): { page: number; limit: number; offset: number } {
    const pageValue = parseInt(String(query.page || this.DEFAULT_PAGE));
    const limitValue = parseInt(String(query.limit || this.DEFAULT_LIMIT));
    
    const page = isNaN(pageValue) ? this.DEFAULT_PAGE : Math.max(1, pageValue);
    const limit = isNaN(limitValue) ? this.DEFAULT_LIMIT : Math.min(this.MAX_LIMIT, Math.max(1, limitValue));
    const offset = (page - 1) * limit;

    return { page, limit, offset };
  }

  /**
   * Создание результата с пагинацией
   */
  static createResult<T>(
    data: T[],
    total: number,
    page: number,
    limit: number
  ): PaginationResult<T> {
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * SQL LIMIT и OFFSET для PostgreSQL
   */
  static getSQLParams(page: number, limit: number): { limit: number; offset: number } {
    return {
      limit,
      offset: (page - 1) * limit,
    };
  }
}

export default Pagination;
