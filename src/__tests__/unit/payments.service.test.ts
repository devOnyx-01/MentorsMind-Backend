import pool from "../../config/database";
import { BookingModel } from "../../models/booking.model";
import {
  PaymentsService,
  PaymentRecord,
} from "../../services/payments.service";
import { SocketService } from "../../services/socket.service";
import { stellarService } from "../../services/stellar.service";
import type { StellarAccountInfo } from "../../types/stellar.types";

jest.mock("../../config/database");
jest.mock("../../models/booking.model");
jest.mock("../../services/stellar.service");
jest.mock("../../services/socket.service");

const mockPool = pool as unknown as { query: jest.Mock; connect: jest.Mock };
const mockBookingModel = BookingModel as jest.Mocked<typeof BookingModel>;
const mockStellarService = stellarService as jest.Mocked<typeof stellarService>;
const mockSocketService = SocketService as jest.Mocked<typeof SocketService>;

function basePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  const now = new Date();
  return {
    id: "payment-123",
    user_id: "user-123",
    booking_id: "booking-123",
    type: "payment",
    status: "pending",
    amount: "50.0000000",
    currency: "XLM",
    stellar_tx_hash: null,
    from_address: "GABC",
    to_address: "GXYZ",
    platform_fee: "2.5000000",
    description: null,
    error_message: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    completed_at: null,
    ...overrides,
  };
}

const mockAccountInfo = (): StellarAccountInfo => ({
  id: "GFROM",
  sequence: "1",
  balances: [],
  subentryCount: 0,
  lastModifiedLedger: 1,
});

describe("PaymentsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("initiatePayment", () => {
    it("crea un pago pendiente", async () => {
      const data = {
        userId: "user-123",
        bookingId: "booking-123",
        amount: "50.0000000",
        currency: "XLM",
        description: "Mentoring session payment",
      };

      mockBookingModel.findById.mockResolvedValue({
        id: data.bookingId,
        mentee_id: data.userId,
        mentor_id: "mentor-1",
        scheduled_at: new Date(),
        duration_minutes: 60,
        topic: "t",
        notes: null,
        status: "pending",
        amount: "50",
        currency: "XLM",
        payment_status: "pending",
        stellar_tx_hash: null,
        transaction_id: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const inserted = basePayment({
        id: "payment-123",
        booking_id: data.bookingId,
      });
      mockPool.query.mockResolvedValue({ rows: [inserted] });

      const result = await PaymentsService.initiatePayment(data);

      expect(result.id).toBe("payment-123");
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO transactions"),
        expect.arrayContaining([data.userId, data.bookingId, data.amount]),
      );
    });

    it("valida que exista la reserva", async () => {
      mockBookingModel.findById.mockResolvedValue(null);

      await expect(
        PaymentsService.initiatePayment({
          userId: "user-123",
          bookingId: "missing",
          amount: "10",
        }),
      ).rejects.toThrow("Booking not found");
    });

    it("valida que el usuario sea el mentee", async () => {
      mockBookingModel.findById.mockResolvedValue({
        id: "booking-123",
        mentee_id: "other",
        mentor_id: "mentor-1",
        scheduled_at: new Date(),
        duration_minutes: 60,
        topic: "t",
        notes: null,
        status: "pending",
        amount: "50",
        currency: "XLM",
        payment_status: "pending",
        stellar_tx_hash: null,
        transaction_id: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        PaymentsService.initiatePayment({
          userId: "user-123",
          bookingId: "booking-123",
          amount: "10",
        }),
      ).rejects.toThrow("Access denied");
    });

    it("rechaza reserva ya pagada", async () => {
      mockBookingModel.findById.mockResolvedValue({
        id: "booking-123",
        mentee_id: "user-123",
        mentor_id: "mentor-1",
        scheduled_at: new Date(),
        duration_minutes: 60,
        topic: "t",
        notes: null,
        status: "pending",
        amount: "50",
        currency: "XLM",
        payment_status: "paid",
        stellar_tx_hash: null,
        transaction_id: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await expect(
        PaymentsService.initiatePayment({
          userId: "user-123",
          bookingId: "booking-123",
          amount: "10",
        }),
      ).rejects.toThrow("Booking is already paid");
    });

    it("propaga error si falla la inserción en base de datos", async () => {
      mockBookingModel.findById.mockResolvedValue({
        id: "booking-123",
        mentee_id: "user-123",
        mentor_id: "mentor-1",
        scheduled_at: new Date(),
        duration_minutes: 60,
        topic: "t",
        notes: null,
        status: "pending",
        amount: "50",
        currency: "XLM",
        payment_status: "pending",
        stellar_tx_hash: null,
        transaction_id: null,
        cancellation_reason: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      mockPool.query.mockRejectedValue(new Error("insert failed"));

      await expect(
        PaymentsService.initiatePayment({
          userId: "user-123",
          bookingId: "booking-123",
          amount: "10",
        }),
      ).rejects.toThrow("insert failed");
    });
  });

  describe("getPaymentById", () => {
    it("devuelve el pago", async () => {
      const payment = basePayment();
      mockPool.query.mockResolvedValue({ rows: [payment] });

      const result = await PaymentsService.getPaymentById(
        "payment-123",
        "user-123",
      );

      expect(result).toEqual(payment);
    });

    it("lanza 404 si no existe", async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await expect(
        PaymentsService.getPaymentById("x", "user-123"),
      ).rejects.toThrow("Payment not found");
    });
  });

  describe("getPaymentStatus", () => {
    it("devuelve estado resumido", async () => {
      const payment = basePayment({
        status: "completed",
        stellar_tx_hash: "hash",
        updated_at: new Date("2020-01-01"),
      });
      jest.spyOn(PaymentsService, "getPaymentById").mockResolvedValue(payment);

      const result = await PaymentsService.getPaymentStatus(
        "payment-123",
        "user-123",
      );

      expect(result).toEqual({
        id: payment.id,
        status: "completed",
        stellarTxHash: "hash",
        updatedAt: payment.updated_at,
      });
    });
  });

  describe("confirmPayment", () => {
    it("confirma pago y notifica por socket", async () => {
      const payment = basePayment({
        status: "pending",
        booking_id: "booking-123",
        from_address: "GFROM",
        completed_at: null,
      });
      const updated = {
        ...payment,
        status: "completed" as const,
        stellar_tx_hash: "hash123",
        completed_at: new Date(),
      };

      jest.spyOn(PaymentsService, "getPaymentById").mockResolvedValue(payment);
      mockStellarService.getAccount.mockResolvedValue(mockAccountInfo());
      mockPool.query
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        });

      const result = await PaymentsService.confirmPayment(
        "payment-123",
        "user-123",
        "hash123",
      );

      expect(result.status).toBe("completed");
      expect(mockSocketService.emitToUser).toHaveBeenCalled();
    });

    it("valida estado: ya completado", async () => {
      jest
        .spyOn(PaymentsService, "getPaymentById")
        .mockResolvedValue(basePayment({ status: "completed" }));

      await expect(
        PaymentsService.confirmPayment("payment-123", "user-123", "hash"),
      ).rejects.toThrow("Payment already confirmed");
    });

    it("valida estado: no se puede confirmar desde failed", async () => {
      jest
        .spyOn(PaymentsService, "getPaymentById")
        .mockResolvedValue(basePayment({ status: "failed" }));

      await expect(
        PaymentsService.confirmPayment("payment-123", "user-123", "hash"),
      ).rejects.toThrow("Cannot confirm payment in failed status");
    });

    it("continúa si Horizon/Stellar falla al verificar cuenta", async () => {
      const payment = basePayment({
        status: "pending",
        booking_id: "b1",
        from_address: "GX",
      });
      const updated = {
        ...payment,
        status: "completed" as const,
        stellar_tx_hash: "h",
        completed_at: new Date(),
      };

      jest.spyOn(PaymentsService, "getPaymentById").mockResolvedValue(payment);
      mockStellarService.getAccount.mockRejectedValue(
        new Error("horizon unavailable"),
      );
      mockPool.query
        .mockResolvedValueOnce({ rows: [updated] })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        });

      const result = await PaymentsService.confirmPayment(
        "payment-123",
        "user-123",
        "h",
      );

      expect(result.status).toBe("completed");
    });

    it("falla si la actualización no devuelve fila", async () => {
      const payment = basePayment({ status: "pending", booking_id: null });
      jest.spyOn(PaymentsService, "getPaymentById").mockResolvedValue(payment);
      mockStellarService.getAccount.mockResolvedValue(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        PaymentsService.confirmPayment("payment-123", "user-123", "hash"),
      ).rejects.toThrow("Failed to confirm payment");
    });
  });

  describe("listUserPayments", () => {
    it("lista paginada y total", async () => {
      const rows = [basePayment({ id: "p1" }), basePayment({ id: "p2" })];
      mockPool.query
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [{ count: "2" }] });

      const result = await PaymentsService.listUserPayments("user-123", {
        page: 1,
        limit: 10,
        status: "completed",
      });

      expect(result.payments).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  describe("getPaymentHistory", () => {
    it("incluye volumen total", async () => {
      jest.spyOn(PaymentsService, "listUserPayments").mockResolvedValue({
        payments: [basePayment()],
        total: 1,
      });
      mockPool.query.mockResolvedValue({
        rows: [{ total_volume: "100.0000000" }],
      });

      const result = await PaymentsService.getPaymentHistory("user-123", {
        page: 1,
        limit: 10,
      });

      expect(result.totalVolume).toBe("100.0000000");
    });
  });

  describe("refundPayment", () => {
    it("ejecuta reembolso en transacción", async () => {
      const payment = basePayment({
        status: "completed",
        booking_id: "booking-123",
      });
      const refunded = { ...payment, status: "refunded" as const };

      jest.spyOn(PaymentsService, "getPaymentById").mockResolvedValue(payment);

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient as never);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [refunded] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const result = await PaymentsService.refundPayment(
        "payment-123",
        "user-123",
        "reason",
      );

      expect(result.status).toBe("refunded");
      expect(mockClient.query).toHaveBeenCalledWith("BEGIN");
      expect(mockClient.query).toHaveBeenCalledWith("COMMIT");
    });

    it("valida que no esté ya reembolsado", async () => {
      jest
        .spyOn(PaymentsService, "getPaymentById")
        .mockResolvedValue(basePayment({ status: "refunded" }));

      await expect(
        PaymentsService.refundPayment("payment-123", "user-123"),
      ).rejects.toThrow("Payment already refunded");
    });

    it("propaga error y hace rollback", async () => {
      jest
        .spyOn(PaymentsService, "getPaymentById")
        .mockResolvedValue(basePayment({ status: "completed" }));

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient as never);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("db error"))
        .mockResolvedValueOnce(undefined);

      await expect(
        PaymentsService.refundPayment("payment-123", "user-123"),
      ).rejects.toThrow("db error");
      expect(mockClient.query).toHaveBeenCalledWith("ROLLBACK");
    });
  });

  describe("handleWebhook", () => {
    it("confirma pago vía webhook", async () => {
      const pending = basePayment({ status: "pending", booking_id: "b1" });
      mockPool.query
        .mockResolvedValueOnce({ rows: [pending] })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          rowCount: 1,
          command: "UPDATE",
          oid: 0,
          fields: [],
        });

      const result = await PaymentsService.handleWebhook({
        type: "payment_received",
        transaction_hash: "hash123",
        to: "GTO",
      });

      expect(result).toEqual({
        processed: true,
        message: "Payment confirmed via webhook",
      });
    });

    it("valida payload sin hash", async () => {
      const result = await PaymentsService.handleWebhook({ type: "x" });
      expect(result).toEqual({
        processed: false,
        message: "No transaction hash provided",
      });
    });

    it("no encuentra pago coincidente", async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await PaymentsService.handleWebhook({
        type: "payment_received",
        transaction_hash: "hash",
      });

      expect(result).toEqual({
        processed: false,
        message: "No matching payment found",
      });
    });
  });
});
