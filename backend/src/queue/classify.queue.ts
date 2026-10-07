import { Queue, type JobsOptions } from 'bullmq'
import { Redis } from 'ioredis'

export const CLASSIFY_QUEUE = 'classify-message'
export const CLASSIFY_ATTEMPTS = 3

export interface ClassifyJob {
  messageId: string
}

/** BullMQ exige maxRetriesPerRequest: null nas conexões. */
export function createQueueConnection(redisUrl: string) {
  return new Redis(redisUrl, { maxRetriesPerRequest: null })
}

export interface ClassifyQueue {
  enqueue(messageId: string): Promise<void>
  close(): Promise<void>
}

export function createClassifyQueue(redisUrl: string): ClassifyQueue {
  const connection = createQueueConnection(redisUrl)
  const queue = new Queue<ClassifyJob>(CLASSIFY_QUEUE, { connection })
  const opts: JobsOptions = {
    attempts: CLASSIFY_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  }
  return {
    async enqueue(messageId) {
      await queue.add('classify', { messageId }, { ...opts, jobId: messageId })
    },
    async close() {
      await queue.close()
      connection.disconnect()
    },
  }
}
