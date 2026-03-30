import { accountDeletionService } from "../services/accountDeletion.service";

export const accountDeletionJob = {
  async run(): Promise<{ processed: number }> {
    const processed = await accountDeletionService.processDueDeletions();
    return { processed };
  },
};
