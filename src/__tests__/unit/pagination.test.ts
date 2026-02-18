/**
 * Unit Tests for Pagination Utility
 */

import Pagination from '../../utils/pagination';

describe('Pagination', () => {
  describe('parseParams', () => {
    it('should use default values when no params provided', () => {
      const result = Pagination.parseParams({});
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should parse valid page and limit', () => {
      const result = Pagination.parseParams({ page: '2', limit: '50' });
      
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(50);
    });

    it('should enforce maximum limit', () => {
      const result = Pagination.parseParams({ limit: '200' });
      
      expect(result.limit).toBe(100); // MAX_LIMIT
    });

    it('should enforce minimum page', () => {
      const result = Pagination.parseParams({ page: '-1' });
      
      expect(result.page).toBe(1);
    });

    it('should handle invalid inputs', () => {
      const result = Pagination.parseParams({ page: 'invalid', limit: 'invalid' });
      
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });

  describe('createResult', () => {
    it('should create correct pagination result', () => {
      const data = [1, 2, 3, 4, 5];
      const result = Pagination.createResult(data, 100, 1, 20);
      
      expect(result.data).toEqual(data);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.totalPages).toBe(5);
      expect(result.pagination.hasNext).toBe(true);
      expect(result.pagination.hasPrev).toBe(false);
    });

    it('should handle last page correctly', () => {
      const data = [1, 2, 3];
      const result = Pagination.createResult(data, 23, 2, 20);
      
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(true);
    });

    it('should handle single page', () => {
      const data = [1, 2, 3];
      const result = Pagination.createResult(data, 3, 1, 20);
      
      expect(result.pagination.totalPages).toBe(1);
      expect(result.pagination.hasNext).toBe(false);
      expect(result.pagination.hasPrev).toBe(false);
    });
  });

  describe('getSQLParams', () => {
    it('should calculate correct SQL params', () => {
      const result = Pagination.getSQLParams(1, 20);
      
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should calculate offset for page 2', () => {
      const result = Pagination.getSQLParams(2, 20);
      
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(20);
    });

    it('should calculate offset for page 3 with custom limit', () => {
      const result = Pagination.getSQLParams(3, 50);
      
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });
  });
});
