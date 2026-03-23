import { Response } from 'express';
import { AuthenticatedRequest } from '../types/api.types';
import { UsersService } from '../services/users.service';
import { ResponseUtil } from '../utils/response.utils';

export const UsersController = {
  /** GET /users/:id */
  async getUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = await UsersService.findById(req.params.id as string);
    if (!user) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.success(res, user, 'User retrieved successfully');
  },

  /** PUT /users/:id */
  async updateUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { firstName, lastName, bio } = req.body;
    const updated = await UsersService.update(req.params.id as string, { firstName, lastName, bio });
    if (!updated) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.success(res, updated, 'User updated successfully');
  },

  /** DELETE /users/:id */
  async deleteUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const deleted = await UsersService.deactivate(req.params.id as string);
    if (!deleted) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.noContent(res);
  },

  /** GET /users/me */
  async getMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = await UsersService.findById(req.user!.id);
    if (!user) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.success(res, user, 'Profile retrieved successfully');
  },

  /** PUT /users/me */
  async updateMe(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { firstName, lastName, bio } = req.body;
    const updated = await UsersService.update(req.user!.id, { firstName, lastName, bio });
    if (!updated) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.success(res, updated, 'Profile updated successfully');
  },

  /** POST /users/avatar */
  async uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<void> {
    const { avatarBase64 } = req.body;
    // Derive a stable key for storage (e.g. future S3 integration uses this as the object key)
    const avatarUrl = avatarBase64; // placeholder: replace with URL after uploading to storage
    const updated = await UsersService.updateAvatar(req.user!.id, avatarUrl);
    if (!updated) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.success(res, { avatarUrl: updated.avatar_url }, 'Avatar updated successfully');
  },

  /** GET /users/:id/public */
  async getPublicUser(req: AuthenticatedRequest, res: Response): Promise<void> {
    const user = await UsersService.findPublicById(req.params.id as string);
    if (!user) {
      ResponseUtil.notFound(res, 'User not found');
      return;
    }
    ResponseUtil.success(res, user, 'Public profile retrieved successfully');
  },
};
