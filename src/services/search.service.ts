import db from '../config/db';
import { buildSearchQuery } from '../utils/query-builder.utils';

export class SearchService {
  static async searchMentors(filters: any) {
    const { query, values } = buildSearchQuery(filters);
    const result = await db.query(query, values);
    const totalCount = result.rows[0]?.total_count || 0;
    
    return {
      mentors: result.rows,
      meta: {
        total: parseInt(totalCount),
        page: parseInt(filters.page) || 1,
        limit: parseInt(filters.limit) || 10
      }
    };
  }
}
