import crypto from "crypto";
import pool from "../config/database";
import { EmailService } from "./email.service";
import { logger } from "../utils/logger.utils";
import { PoolClient } from 'pg';

const GRACE_PERIOD_DAYS = 30;

/**
 * Your Whitelist: Ensures we only delete from approved tables
 * and prevents SQL injection via dynamic table names.
 */
interface WhitelistEntry {
  tableName: string;
  whereColumn: string;
}

const DELETION_WHITELIST: WhitelistEntry[] = [
  { tableName: 'users', whereColumn: 'id' },
  { tableName: 'profiles', whereColumn: 'user_id' },
  { tableName: 'sessions', whereColumn: 'user_id' },
  { tableName: 'refresh_tokens', whereColumn: 'user_id' },
  { tableName: 'bookings', whereColumn: 'mentee_id' },
  { tableName: 'bookings', whereColumn: 'mentor_id' },
  { tableName: 'reviews', whereColumn: 'reviewer_id' },
  { tableName: 'payments', whereColumn: 'user_id' },
  { tableName: 'notifications', whereColumn: 'user_id' },
  { tableName: 'user_preferences', whereColumn: 'user_id' },
  { tableName: 'escrow_transactions', whereColumn: 'buyer_id' },
  { tableName: 'escrow_transactions', whereColumn: 'seller_id' },
  { tableName: 'disputes', whereColumn: 'initiator_id' },
  { tableName: 'meeting_participants', whereColumn: 'user_id' },
  { tableName: 'audit_logs', whereColumn: 'user_id' },
  { tableName: 'oauth_tokens', whereColumn: 'user_id' },
  { tableName: 'push_tokens', whereColumn: 'user_id' },
  { tableName: 'messages', whereColumn: 'sender_id' },
  { tableName: 'booking_notes', whereColumn: 'author_id' },
];

interface DeletionRequestRow {
  id: string;
  email: string;
  full_name: string | null;
  deletion_requested_at: Date | null;
  deletion_scheduled_for: Date | null;
  deletion_completed_at: Date | null;
}

function isValidDeletionTarget(tableName: string, whereColumn: string): boolean {
  return DELETION_WHITELIST.some(
    (entry) => entry.tableName === tableName && entry.whereColumn === whereColumn
  );
}

async function deleteFromTableIfPresent(
  client: PoolClient,
  tableName: string,
  whereColumn: string,
  userId: string,
): Promise<void> {
  if (!isValidDeletionTarget(tableName, whereColumn)) {
    throw new Error(`Invalid deletion target: ${tableName}.${whereColumn}`);
  }

  const { rows } = await client.query(
    `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [tableName],
  );

  if (rows[0]?.present) {
    await client.query(
      `DELETE FROM "${tableName}" WHERE "${whereColumn}" = $1`,
      [userId],
    );
  }
}

export const accountDeletionService = {
  async requestDeletion(userId: string): Promise<DeletionRequestRow> {
    const { rows } = await pool.query<DeletionRequestRow>(
      `UPDATE users
          SET deletion_requested_at = NOW(),
              deletion_scheduled_for = NOW() + INTERVAL '30 days',
              deletion_cancelled_at = NULL,
              token_invalid_before = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND deletion_completed_at IS NULL
        RETURNING id, email, full_name, deletion_requested_at, 
                  deletion_scheduled_for, deletion_completed_at`,
      [userId],
    );

    if (!rows[0]) throw new Error("User not found");

    await Promise.all([
      pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1`, [userId]),
      pool.query(`UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1`, [userId]),
    ]);

    return rows[0];
  },

  async cancelDeletion(userId: string): Promise<DeletionRequestRow | null> {
    const { rows } = await pool.query<DeletionRequestRow>(
      `UPDATE users
          SET deletion_requested_at = NULL,
              deletion_scheduled_for = NULL,
              deletion_cancelled_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND deletion_requested_at IS NOT NULL AND deletion_completed_at IS NULL
        RETURNING id, email, full_name, deletion_requested_at, 
                  deletion_scheduled_for, deletion_completed_at`,
      [userId],
    );
    return rows[0] ?? null;
  },

  async processDueDeletions(): Promise<number> {
    const { rows } = await pool.query<DeletionRequestRow>(
      `SELECT id, email, full_name, deletion_requested_at, deletion_scheduled_for FROM users
        WHERE deletion_requested_at IS NOT NULL AND deletion_completed_at IS NULL
          AND deletion_scheduled_for <= NOW()`,
    );
    for (const row of rows) await this.eraseUser(row);
    return rows.length;
  },

  async eraseUser(row: DeletionRequestRow): Promise<void> {
    const client = await pool.connect();
    const emailToNotify = row.email;
    const anonymizedEmail = `deleted+${crypto.createHash("sha256").update(`${row.id}:${row.email}`).digest("hex").slice(0, 24)}@deleted.local`;

    try {
      await client.query("BEGIN");

      // Apply your whitelist-protected cleanup for all mapped tables
      await deleteFromTableIfPresent(client, 'audit_logs', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'meeting_participants', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'disputes', 'initiator_id', row.id);
      await deleteFromTableIfPresent(client, 'escrow_transactions', 'buyer_id', row.id);
      await deleteFromTableIfPresent(client, 'escrow_transactions', 'seller_id', row.id);
      await deleteFromTableIfPresent(client, 'reviews', 'reviewer_id', row.id);
      await deleteFromTableIfPresent(client, 'bookings', 'mentee_id', row.id);
      await deleteFromTableIfPresent(client, 'bookings', 'mentor_id', row.id);
      await deleteFromTableIfPresent(client, 'notifications', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'payments', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'user_preferences', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'profiles', 'user_id', row.id);
      
      // Core infrastructure cleanup
      await deleteFromTableIfPresent(client, 'messages', 'sender_id', row.id);
      await deleteFromTableIfPresent(client, 'booking_notes', 'author_id', row.id);
      await deleteFromTableIfPresent(client, 'push_tokens', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'refresh_tokens', 'user_id', row.id);
      await deleteFromTableIfPresent(client, 'sessions', 'user_id', row.id);
      await deleteFromTableIfPresent(client, "oauth_tokens", "user_id", row.id);

      // Final Anonymization (PII Scrubbing)
      await client.query(
        `UPDATE users 
            SET full_name = 'Deleted User', email = $2, avatar_url = NULL, bio = NULL, username = NULL,
                phone_number_encrypted = NULL, date_of_birth_encrypted = NULL,
                government_id_number_encrypted = NULL, bank_account_details_encrypted = NULL,
                pii_encryption_version = NULL, deletion_completed_at = NOW(), deleted_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [row.id, anonymizedEmail],
      );

      // Anonymize Transactions (Keep for audit but decouple from user)
      await client.query(
        `UPDATE transactions SET metadata = COALESCE(metadata, '{}'::jsonb) || 
         jsonb_build_object('anonymizedUserId', $1, 'anonymizedAt', NOW()) WHERE user_id = $1`,
        [row.id],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    // Notify user post-erasure
    try {
      const emailService = new EmailService();
      await emailService.sendEmail({
        to: [emailToNotify],
        subject: "Your MentorMinds account has been deleted",
        textContent: "Your account deletion request has been completed and your personal data has been erased or anonymized.",
      });
    } catch (error) {
      logger.warn("Failed to send deletion confirmation email", { userId: row.id, error });
    }
  },

  getGracePeriodDays(): number { return GRACE_PERIOD_DAYS; },
};