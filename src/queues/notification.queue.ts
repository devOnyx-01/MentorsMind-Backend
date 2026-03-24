import { Queue, Worker, Job } from 'bullmq';
import config from '../config';
import { EmailService } from '../services/email.service';
import { TemplateEngineService } from '../services/template-engine.service';
imp