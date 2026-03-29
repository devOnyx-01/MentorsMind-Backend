import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import pool from '../config/database';
import { SocketService } from './socket.service';
import { MessagingService } from './messaging.service';
import { logger } from '../utils/logger.utils';

const DAILY_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_DOC_TYPES = ['application/pdf'];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const DOC_MAX_BYTES = 20 * 1024 * 1024;   // 20 MB

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

export interface AttachmentRecord {
  id: string;
  message_id: string;
  conversation_id: string;
  uploader_id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_key: string;
  storage_bucket: string;
  scan_status: 'pending' | 'clean' | 'infected' | 'error';
  scanned_at: Date | null;
  created_at: Date;
  signed_url?: string;
}

export const AttachmentService = {
  /**
   * Validate file type and size.
   * Returns an error string or null if valid.
   */
  validateFile(mimeType: string, fileSize: number): string | null {
    if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      if (fileSize > IMAGE_MAX_BYTES) return 'Image exceeds 10 MB limit';
      return null;
    }
    if (ALLOWED_DOC_TYPES.includes(mimeType)) {
      if (fileSize > DOC_MAX_BYTES) return 'Document exceeds 20 MB limit';
      return null;
    }
    return `Unsupported file type: ${mimeType}. Allowed: JPEG, PNG, WebP, PDF`;
  },

  /**
   * Atomically check and increment the daily upload quota.
   * Returns false if the quota would be exceeded.
   */
  async checkAndUpdateQuota(userId: string, fileSize: number): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ bytes_used: string }>(
        `INSERT INTO user_upload_quotas (user_id, quota_date, bytes_used)
         VALUES ($1, CURRENT_DATE, $2)
         ON CONFLICT (user_id, quota_date) DO UPDATE
           SET bytes_used = user_upload_quotas.bytes_used + $2
         RETURNING bytes_used`,
        [userId, fileSize],
      );

      const newTotal = parseInt(rows[0].bytes_used, 10);

      if (newTotal > DAILY_QUOTA_BYTES) {
        // Roll back the increment — quota exceeded
        await client.query(
          `UPDATE user_upload_quotas
           SET bytes_used = bytes_used - $1
           WHERE user_id = $2 AND quota_date = CURRENT_DATE`,
          [fileSize, userId],
        );
        await client.query('COMMIT');
        return false;
      }

      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Persist a file to local disk (swap body for S3/GCS SDK in production).
   */
  async storeFile(
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<{ storageKey: string; bucket: string }> {
    const ext = path.extname(originalName) || '';
    const storageKey = `${crypto.randomUUID()}${ext}`;
    const bucket = 'attachments';
    const destDir = path.join(UPLOAD_DIR, bucket);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    fs.writeFileSync(path.join(destDir, storageKey), fileBuffer);
    logger.debug('AttachmentService: file stored', { storageKey });

    return { storageKey, bucket };
  },

  /**
   * Virus scan stub — replace with ClamAV or cloud equivalent.
   * Detects the EICAR test string as a placeholder.
   */
  async scanFile(fileBuffer: Buffer): Promise<'clean' | 'infected' | 'error'> {
    try {
      const eicar =
        'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
      if (fileBuffer.toString('ascii').includes(eicar)) return 'infected';
      return 'clean';
    } catch {
      return 'error';
    }
  },

  /**
   * Generate a signed URL valid for 1 hour.
   * Uses HMAC-SHA256 to sign storage key + expiry timestamp.
   */
  generateSignedUrl(storageKey: string, bucket: string): string {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'secret')
      .update(`${storageKey}:${expiresAt}`)
      .digest('hex');
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/v1/files/${bucket}/${storageKey}?expires=${expiresAt}&token=${token}`;
  },

  /**
   * Upload a file attachment to a conversation.
   * Validates → checks quota → scans → stores → creates message → saves metadata.
   */
  async uploadAttachment(
    conversationId: string,
    uploaderId: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<{ attachment: AttachmentRecord; message: any } | null> {
    const validationError = this.validateFile(mimeType, fileBuffer.length);
    if (validationError) throw new Error(validationError);

    const withinQuota = await this.checkAndUpdateQuota(uploaderId, fileBuffer.length);
    if (!withinQuota) throw new Error('Daily upload quota exceeded (50 MB/day)');

    const scanResult = await this.scanFile(fileBuffer);
    if (scanResult === 'infected') throw new Error('File rejected: virus detected');

    const { storageKey, bucket } = await this.storeFile(fileBuffer, originalName);

    // Create a message whose body is the file name
    const message = await MessagingService.sendMessage(
      conversationId,
      uploaderId,
      `📎 ${originalName}`,
    );

    if (!message) {
      // Clean up orphaned file
      const filePath = path.join(UPLOAD_DIR, bucket, storageKey);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return null;
    }

    const { rows } = await pool.query<AttachmentRecord>(
      `INSERT INTO message_attachments
         (message_id, conversation_id, uploader_id, file_name, file_size,
          mime_type, storage_key, storage_bucket, scan_status, scanned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        message.id,
        conversationId,
        uploaderId,
        originalName,
        fileBuffer.length,
        mimeType,
        storageKey,
        bucket,
        scanResult,
      ],
    );

    const attachment = rows[0];
    attachment.signed_url = this.generateSignedUrl(storageKey, bucket);

    // Emit attachment notification to recipient
    const conv = await MessagingService.getConversation(conversationId, uploaderId);
    if (conv) {
      const recipientId =
        conv.participant_one_id === uploaderId
          ? conv.participant_two_id
          : conv.participant_one_id;

      SocketService.emitToUser(recipientId, 'message:new', {
        conversationId,
        message,
        attachment: {
          id: attachment.id,
          file_name: attachment.file_name,
          file_size: attachment.file_size,
          mime_type: attachment.mime_type,
          signed_url: attachment.signed_url,
        },
      });
    }

    return { attachment, message };
  },

  /**
   * Delete attachment files from storage when the parent message is deleted.
   */
  async deleteAttachmentsByMessage(messageId: string): Promise<void> {
    const { rows } = await pool.query<AttachmentRecord>(
      `SELECT * FROM message_attachments WHERE message_id = $1`,
      [messageId],
    );

    for (const att of rows) {
      const filePath = path.join(UPLOAD_DIR, att.storage_bucket, att.storage_key);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          logger.warn('AttachmentService: failed to delete file', {
            storageKey: att.storage_key,
            err,
          });
        }
      }
    }

    await pool.query(`DELETE FROM message_attachments WHERE message_id = $1`, [messageId]);
  },
};
