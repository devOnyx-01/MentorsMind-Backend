import db from '../config/db';
import { CacheService } from './cache.service';
import { CacheKeys, CacheTTL } from '../utils/cache-key.utils';
import { buildSearchQuery } from '../utils/query-builder.utils';

export class SearchService {
  /**
   * Search mentors with caching
   * Results are cached for 60 seconds based on filter parameters
   */
  static async searchMentors(filters: any) {
    const cacheKey = CacheKeys.mentorSearch(filters);

    // Use cache-aside pattern
    const cached = await CacheService.get<any>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Execute search query
    const { query, values } = buildSearchQuery(filters);
    const result = await db.query(query, values);
    const totalCount = result.rows[0]?.total_count || 0;

    const searchResult = {
      mentors: result.rows,
      meta: {
        total: parseInt(totalCount),
        page: parseInt(filters.page) || 1,
        limit: parseInt(filters.limit) || 10,
      },
    };

    // Cache the result for 60 seconds
    await CacheService.set(cacheKey, searchResult, CacheTTL.short);

    return searchResult;
  }
}
