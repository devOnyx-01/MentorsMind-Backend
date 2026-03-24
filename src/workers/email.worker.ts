import { Worker, Job } from 'bullmq';
import {
  redisConnection,
  CONCURRENCY,
  QUEUE_NAMES,
} from '../queues/queue.config';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger.utils';
import type { EmailJobData } from '../queues/email.queue';

const emailService = new EmailService();

async function processEmailJob(job: Job<EmailJobData>): Promise<void> {
  const { jobType: _jobType, ...emailRequest } = job.data;
  logger.info('Processing email job', {
    jobId: job.id,
    to: emailRequest.to,
    subject: emailRequest.subject,
  });

  const result = await emailService.sendEmail(emailRequest);

  if (!result.success) {
    throw new Error(result.error || 'Email send failed');
  }

  logger.info('Email job completed', {
    jobId: job.id,
    messageId: result.messageId,
  });
}

export const emailWorker = new Worker<EmailJobData>(
  QUEUE_NAMES.EMAIL,
  processEmailJob,
  {
    connection: redisConnection,
    concurrency: CONCURRENCY.EMAIL,
  },
);

emailWorker.on('completed', (job) => {
  logger.info('Email job completed', { jobId: job.id });
});

emailWorker.on('failed', (job, err) => {
  logger.error('Email job failed', {
    jobId: job?.id,
    attempt: job?.attemptsMade,
    error: err.message,
    data: job?.data,
  });
});

emailWorker.on('error', (err) => {
  logger.error('Email worker error', { error: err.message });
});
