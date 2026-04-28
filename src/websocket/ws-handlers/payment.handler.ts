import { SocketService } from '../../services/socket.service';
import { logger } from '../../utils/logger.utils';

export interface PaymentStatusPayload {
  transactionId: string;
  bookingId: string;
  userId: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  amount?: string;
  currency?: string;
}

export interface EscrowUpdatePayload {
  escrowId: string;
  bookingId: string;
  mentorId: string;
  menteeId: string;
  status: string;
  amount?: string;
}

/**
 * Push a payment status update to the relevant user in real-time.
 */
export async function notifyPaymentStatus(
  payload: PaymentStatusPayload,
): Promise<void> {
  const { userId, transactionId, bookingId, status, amount, currency } =
    payload;

  SocketService.emitToUser(userId, 'payment:status', {
    transactionId,
    bookingId,
    status,
    amount,
    currency,
  });

  logger.info('WS payment: status update', { userId, transactionId, status });
}

/**
 * Notify both parties of an escrow state change.
 */
export async function notifyEscrowUpdate(
  payload: EscrowUpdatePayload,
): Promise<void> {
  const { escrowId, bookingId, mentorId, menteeId, status, amount } = payload;

  const data = { escrowId, bookingId, status, amount };

  await Promise.all([
    SocketService.emitToUser(mentorId, 'escrow:update', data),
    SocketService.emitToUser(menteeId, 'escrow:update', data),
  ]);

  logger.info('WS payment: escrow update', { escrowId, status });
}
