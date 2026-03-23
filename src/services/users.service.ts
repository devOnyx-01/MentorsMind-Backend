import pool from '../config/database';

export interface UserRecord {
  id: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublicUserRecord {
  id: string;
  role: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  avatar_url: string | null;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  bio?: string;
}

const PRIVATE_COLUMNS =
  'id, email, role, first_name, last_name, bio, avatar_url, is_active, created_at, updated_at';

const PUBLIC_COLUMNS = 'id, role, first_name, last_name, bio, avatar_url';

export const UsersService = {
  async findById(id: string): Promise<UserRecord | null> {
    const { rows } = await pool.query<UserRecord>(
      `SELECT ${PRIVATE_COLUMNS} FROM users WHERE id = $1 AND is_active = true`,
      [id]
    );
    return rows[0] ?? null;
  },

  async findPublicById(id: string): Promise<PublicUserRecord | null> {
    const { rows } = await pool.query<PublicUserRecord>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 AND is_active = true`,
      [id]
    );
    return rows[0] ?? null;
  },

  async update(id: string, payload: UpdateUserPayload): Promise<UserRecord | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (payload.firstName !== undefined) {
      fields.push(`first_name = $${idx++}`);
      values.push(payload.firstName);
    }
    if (payload.lastName !== undefined) {
      fields.push(`last_name = $${idx++}`);
      values.push(payload.lastName);
    }
    if (payload.bio !== undefined) {
      fields.push(`bio = $${idx++}`);
      values.push(payload.bio);
    }

    if (fields.length === 0) return this.findById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const { rows } = await pool.query<UserRecord>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true
       RETURNING ${PRIVATE_COLUMNS}`,
      values
    );
    return rows[0] ?? null;
  },

  async updateAvatar(id: string, avatarUrl: string): Promise<UserRecord | null> {
    const { rows } = await pool.query<UserRecord>(
      `UPDATE users SET avatar_url = $1, updated_at = NOW()
       WHERE id = $2 AND is_active = true
       RETURNING ${PRIVATE_COLUMNS}`,
      [avatarUrl, id]
    );
    return rows[0] ?? null;
  },

  async deactivate(id: string): Promise<boolean> {
    const { rowCount } = await pool.query(
      `UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 AND is_active = true`,
      [id]
    );
    return (rowCount ?? 0) > 0;
  },
};
