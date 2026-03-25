import { Request, Response } from 'express';
import { LearnerService } from '../services/learners.service';

export const getLearnerProgress = async (req: Request, res: Response) => {
  try {
    const learnerId = req.user.id; // From auth middleware
    const progress = await LearnerService.getProgress(learnerId);
    return res.status(200).json({ success: true, data: progress });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching progress' });
  }
};

export const updateGoals = async (req: Request, res: Response) => {
  try {
    const learnerId = req.user.id;
    const goal = await LearnerService.updateGoals(learnerId, req.body);
    return res.status(201).json({ success: true, data: goal });
  } catch (error) {
    return res.status(400).json({ success: false, message: 'Invalid goal data' });
  }
};

export const getStats = async (req: Request, res: Response) => {
  try {
    const stats = await LearnerService.getStats(req.user.id);
    return res.status(200).json({ success: true, data: stats });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching stats' });
  }
};
