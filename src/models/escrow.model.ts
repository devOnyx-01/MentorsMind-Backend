import pool from '../config/database';

export type EscrowStatus = 
  | 'pending' 
  | 'funded' 
  | 'released' 
  | 'disputed' 
  | 'resolved' 
  | 'refunded' 
  | 'cancelled';

export interface EscrowRecord {
  id: string;
  learner_id: string;
  mentor_id: string;
  amount: string;
  currency: string;
  status: EscrowStatus;
  stellar_tx_hash: string | null;
  dispute_id: string | null;
  description: string | null;
  created_at: Date;
  updated_at: Date;
  released_at: Date | null;
  refunded_at: Date | null;
}

export const EscrowModel = {
  async initializeTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS escrows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        learner_id UUID NOT NULL REFERENCES users(id),
        mentor_id UUID NOT NULL REFERENCES users(id),
        amount DECIMAL(20, 7) NOT NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'XLM',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        stellar_tx_hash VARCHAR(64),
        dispute_id UUID REFERENCES disputes(id),
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        released_at TIMESTAMP WITH TIME ZONE,
        refunded_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT check_amount_positive CHECK (amount > 0),
        CONSTRAINT check_different_users CHECK (learner_id != mentor_id)
      );

      CREATE INDEX IF NOT EXISTS idx_escrows_learner_id ON escrows(learner_id);
      CREATE INDEX IF NOT EXISTS idx_escrows_mentor_id ON escrows(mentor_id);
      CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
      CREATE INDEX IF NOT EXISTS idx_escrows_created_at ON escrows(created_at);
    `;
    await pool.query(query);
  },

  async create(data: {
    learnerId: string;
    mentorId: string;
    amount: string;
    currency: string;
    description?: string;
  }): Promise<EscrowRecord> {
    const { rows } = await pool.query<EscrowRecord>(
      `INSERT INTO escrows (learner_id, mentor_id, amount, currency, description, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [data.learnerId, data.mentorId, data.amount, data.currency, data.description || null]
    );
    return rows[0];
  },

  async findById(id: string): Promise<EscrowRecord | null> {
    const { rows } = await pool.query<EscrowRecord>(
      `SELECT * FROM escrows WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByUserId(userId: string, limit = 50, offset = 0): Promise<EscrowRecord[]> {
    const { rows } = await pool.query<EscrowRecord>(
      `SELECT * FROM escrows 
       WHERE learner_id = $1 OR mentor_id = $1
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  },

  async updateStatus(
    id: string, 
    status: EscrowStatus, 
    additionalFields?: Partial<Pick<EscrowRecord, 'stellar_tx_hash' | 'dispute_id' | 'released_at' | 'refunded_at'>>
  ): Promise<EscrowRecord | null> {
    const fields: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: any[] = [id, status];
    let paramIndex = 3;

    if (additionalFields?.stellar_tx_hash !== undefined) {
      fields.push(`stellar_tx_hash = $${paramIndex++}`);
      values.push(additionalFields.stellar_tx_hash);
    }
    if (additionalFields?.dispute_id !== undefined) {
      fields.push(`dispute_id = $${paramIndex++}`);
      values.push(additionalFields.dispute_id);
    }
    if (additionalFields?.released_at !== undefined) {
      fields.push(`released_at = $${paramIndex++}`);
      values.push(additionalFields.released_at);
    }
    if (additionalFields?.refunded_at !== undefined) {
      fields.push(`refunded_at = $${paramIndex++}`);
      values.push(additionalFields.refunded_at);
    }

    const { rows } = await pool.query<EscrowRecord>(
      `UPDATE escrows SET ${fields.join(', ')} WHERE id = $1 RETURNING *`,
      values
    );
    return rows[0] || null;
  },

  async countByStatus(status: EscrowStatus): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM escrows WHERE status = $1`,
      [status]
    );
    return parseInt(rows[0].count, 10);
  },

  async getTotalVolume(): Promise<{ total_volume: string; count: number }> {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_volume, COUNT(*) as count 
       FROM escrows WHERE status IN ('released', 'completed')`
    );
    return {
      total_volume: rows[0].total_volume,
      count: parseInt(rows[0].count, 10),
    };
  },
};
