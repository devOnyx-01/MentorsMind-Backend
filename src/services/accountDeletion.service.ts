import crypto from "crypto";
import pool from "../config/database";
import { EmailService } from "./email.service";
import { logger } from "../utils/logger.utils";

const GRACE_PERIOD_DAYS = 30;

interface DeletionRequestRow {
  id: string;
  email: string;
  full_name: string | null;
  deletion_requested_at: Date | null;
  deletion_scheduled_for: Date | null;
  deletion_completed_at: Date | null;
}

async function deleteFromTableIfPresent(
  client: any,
  tableName: string,
  whereColumn: string,
  userId: string,
): Promise<void> {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS present`,
    [tableName],
  );

  if (rows[0]?.present) {
    await client.query(
      `DELETE FROM ${tableName} WHERE ${whereColumn} = $1`,
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
        WHERE id = $1
          AND deletion_completed_at IS NULL
        RETURNING id, email, full_name, deletion_requested_at,
                  deletion_scheduled_for, deletion_completed_at`,
      [userId],
    );

    if (!rows[0]) {
      throw new Error("User not found");
    }

    await Promise.all([
      pool.query(`UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1`, [
        userId,
      ]),
      pool.query(`UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = $1`, [
        userId,
      ]),
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
        WHERE id = $1
          AND deletion_requested_at IS NOT NULL
          AND deletion_completed_at IS NULL
        RETURNING id, email, full_name, deletion_requested_at,
                  deletion_scheduled_for, deletion_completed_at`,
      [userId],
    );

    return rows[0] ?? null;
  },

  async listDeletionRequests(): Promise<DeletionRequestRow[]> {
    const { rows } = await pool.query<DeletionRequestRow>(
      `SELECT id, email, full_name, deletion_requested_at, deletion_scheduled_for,
              deletion_completed_at
         FROM users
        WHERE deletion_requested_at IS NOT NULL
          AND deletion_completed_at IS NULL
        ORDER BY deletion_scheduled_for ASC`,
    );

    return rows;
  },

  async processDueDeletions(): Promise<number> {
    const { rows } = await pool.query<DeletionRequestRow>(
      `SELECT id, email, full_name, deletion_requested_at, deletion_scheduled_for,
              deletion_completed_at
         FROM users
        WHERE deletion_requested_at IS NOT NULL
          AND deletion_completed_at IS NULL
          AND deletion_scheduled_for <= NOW()`,
    );

    for (const row of rows) {
      await this.eraseUser(row);
    }

    return rows.length;
  },

  async eraseUser(row: DeletionRequestRow): Promise<void> {
    const client = await pool.connect();
    const emailToNotify = row.email;
    const anonymizedEmail = `deleted+${crypto
      .createHash("sha256")
      .update(`${row.id}:${row.email}`)
      .digest("hex")
      .slice(0, 24)}@deleted.local`;

    try {
      await client.query("BEGIN");

      await client.query(`DELETE FROM messages WHERE sender_id = $1`, [row.id]);
      await client.query(`DELETE FROM booking_notes WHERE author_id = $1`, [row.id]);
      await client.query(`DELETE FROM push_tokens WHERE user_id = $1`, [row.id]);
      await client.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [row.id]);
      await client.query(`DELETE FROM user_sessions WHERE user_id = $1`, [row.id]);
      await deleteFromTableIfPresent(client, "oauth_tokens", "user_id", row.id);

      await client.query(
        `UPDATE users
            SET full_name = 'Deleted User',
                email = $2,
                avatar_url = NULL,
                bio = NULL,
                username = NULL,
                phone_number_encrypted = NULL,
                date_of_birth_encrypted = NULL,
                government_id_number_encrypted = NULL,
                bank_account_details_encrypted = NULL,
                pii_encryption_version = NULL,
                deletion_completed_at = NOW(),
                deleted_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, anonymizedEmail],
      );

      await client.query(
        `UPDATE transactions
            SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'anonymizedUserId', $1,
                'anonymizedAt', NOW()
              )
          WHERE user_id = $1`,
        [row.id],
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    try {
      const emailService = new EmailService();
      await emailService.sendEmail({
        to: [emailToNotify],
        subject: "Your MentorMinds account has been deleted",
        textContent:
          "Your account deletion request has been completed and your personal data has been erased or anonymized.",
        htmlContent:
          "<p>Your account deletion request has been completed and your personal data has been erased or anonymized.</p>",
      });
    } catch (error) {
      logger.warn("Failed to send deletion confirmation email", {
        userId: row.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  },

  getGracePeriodDays(): number {
    return GRACE_PERIOD_DAYS;
  },
};
