import pool from "../config/database";
import { EncryptionUtil } from "../utils/encryption.utils";
import { logger } from "../utils/logger.utils";

const ROTATION_BATCH_SIZE = 100;

interface EncryptedUserRow {
  id: string;
  phone_number_encrypted: string | null;
  date_of_birth_encrypted: string | null;
  government_id_number_encrypted: string | null;
  bank_account_details_encrypted: string | null;
  pii_encryption_version: string | null;
}

export const keyRotationJob = {
  async run(): Promise<{ scanned: number; rotated: number; targetVersion: string }> {
    const targetVersion = await EncryptionUtil.getCurrentKeyVersion();
    let rotated = 0;
    let scanned = 0;
    let hasMore = true;

    while (hasMore) {
      const { rows } = await pool.query<EncryptedUserRow>(
        `SELECT id, phone_number_encrypted, date_of_birth_encrypted,
                government_id_number_encrypted, bank_account_details_encrypted,
                pii_encryption_version
           FROM users
          WHERE (
                  phone_number_encrypted IS NOT NULL
               OR date_of_birth_encrypted IS NOT NULL
               OR government_id_number_encrypted IS NOT NULL
               OR bank_account_details_encrypted IS NOT NULL
                )
            AND COALESCE(pii_encryption_version, '') != $1
          ORDER BY updated_at ASC NULLS LAST, id ASC
          LIMIT $2`,
        [targetVersion, ROTATION_BATCH_SIZE],
      );

      hasMore = rows.length === ROTATION_BATCH_SIZE;
      scanned += rows.length;

      for (const row of rows) {
        await pool.query(
          `UPDATE users
              SET phone_number_encrypted = $2,
                  date_of_birth_encrypted = $3,
                  government_id_number_encrypted = $4,
                  bank_account_details_encrypted = $5,
                  pii_encryption_version = $6,
                  updated_at = NOW()
            WHERE id = $1`,
          [
            row.id,
            await EncryptionUtil.rotateEncryptedValue(row.phone_number_encrypted),
            await EncryptionUtil.rotateEncryptedValue(row.date_of_birth_encrypted),
            await EncryptionUtil.rotateEncryptedValue(
              row.government_id_number_encrypted,
            ),
            await EncryptionUtil.rotateEncryptedValue(
              row.bank_account_details_encrypted,
            ),
            targetVersion,
          ],
        );
        rotated += 1;
      }
    }

    logger.info("PII encryption rotation completed", {
      scanned,
      rotated,
      targetVersion,
    });

    return {
      scanned,
      rotated,
      targetVersion,
    };
  },
};
