import { Request, Response } from "express";
import bookingsService from "../services/bookings.service";
import videoSessionService from "../services/videoSession.service";

export const getMeetingLink = async (req: Request, res: Response) => {
  const booking = await bookingsService.getBookingById(req.params.id);

  return res.json({
    meeting_url: booking.meeting_url,
  });
};

export const videoWebhook = async (req: Request, res: Response) => {
  const { event, room } = req.body;

  const booking = await bookingsService.findByRoom(room.name);

  if (!booking) return res.sendStatus(404);

  if (event === "session.started") {
    await bookingsService.updateBooking(booking.id, {
      status: "in_progress",
    });
  }

  if (event === "session.ended") {
    await bookingsService.updateBooking(booking.id, {
      status: "completed",
    });
  }

  res.sendStatus(200);
};

export const regenerateMeetingLink = async (req: Request, res: Response) => {
  const booking = await bookingsService.getBookingById(req.params.id);

  const room = await videoSessionService.createRoom(booking);

  await bookingsService.updateBooking(booking.id, {
    meeting_url: room.url,
  });

  return res.json({
    meeting_url: room.url,
  });
};
