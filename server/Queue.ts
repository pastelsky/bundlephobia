import createDebug from 'debug'

const log = createDebug('bp:queue')

const JobStatus = {
  READY: Symbol('ready'),
  PROCESSING: Symbol('processing'),
} as const

const JobPriority = {
  LOW: 5,
  MEDIUM: 10,
  HIGH: 20,
} as const

type JobType = string

type QueueExecutor<TParams = unknown, TResult = unknown> = (
  params: TParams
) => TResult | Promise<TResult>

interface QueueJob<TParams = unknown, TResult = unknown> {
  id: string
  type: JobType
  maxAge: number
  priority: number
  addedTime: Date
  status: (typeof JobStatus)[keyof typeof JobStatus]
  params: TParams
  successListeners: Array<(result: TResult) => void>
  failureListeners: Array<(error: unknown) => void>
}

interface QueueOptions {
  concurrency?: number
  aging?: boolean
  maxAge?: number
}

interface ProcessOptions<TResult> {
  priority?: number
  maxAge?: number
  onSuccess?: (result: TResult) => void
  onFailure?: (error: unknown) => void
}

class Queue {
  static priority = JobPriority

  private jobs: QueueJob[] = []
  private readonly options: Required<QueueOptions>
  private readonly executorMap: Record<JobType, QueueExecutor> = {}

  constructor(options: QueueOptions = {}) {
    this.options = {
      concurrency: 1,
      aging: true,
      maxAge: Number.POSITIVE_INFINITY,
      ...options,
    }
  }

  addExecutor<TParams, TResult>(
    jobType: JobType,
    handler: QueueExecutor<TParams, TResult>
  ): void {
    this.executorMap[jobType] = handler as QueueExecutor
  }

  hasJob(id: string, type: JobType): boolean {
    return this.jobs.some(job => job.id === id && type === job.type)
  }

  getRunningJobs(): QueueJob[] {
    return this.jobs.filter(job => job.status === JobStatus.PROCESSING)
  }

  getReadyJobs(): QueueJob[] {
    return this.jobs.filter(job => job.status === JobStatus.READY)
  }

  pruneQueue(): void {
    this.getReadyJobs().forEach(job => {
      const isJobExpired =
        job.addedTime.getTime() + job.maxAge * 1000 < Date.now()

      if (isJobExpired) {
        job.failureListeners.forEach(listener => {
          listener({
            code: 'JOB_EXPIRED',
            message:
              "This job's age exceeded its specified maxAge, and was dropped",
          })
        })
      }
    })

    this.jobs = this.jobs.filter(job => {
      return (
        job.status !== JobStatus.READY ||
        job.addedTime.getTime() + job.maxAge * 1000 >= Date.now()
      )
    })
  }

  getNextJobToRun(): QueueJob | undefined {
    return this.jobs
      .filter(job => job.status === JobStatus.READY)
      .sort((jobA, jobB) => {
        const priorityDiff = jobB.priority - jobA.priority
        if (priorityDiff) {
          return priorityDiff
        }
        return jobA.addedTime.getTime() - jobB.addedTime.getTime()
      })
      .shift()
  }

  ageJobs(): void {
    this.jobs
      .filter(job => job.status === JobStatus.READY)
      .forEach(job => {
        job.priority += 1
      })

    log(
      'after aging, job queue is... %o',
      this.jobs.map(({ id, type, priority }) => ({ id, type, priority }))
    )
  }

  removeJob(id: string, type: JobType): void {
    this.jobs = this.jobs.filter(job => job.id !== id || job.type !== type)
  }

  clear(): void {
    this.jobs
      .filter(job => job.status === JobStatus.READY)
      .forEach(job => {
        job.failureListeners.forEach(failureListener => {
          failureListener({
            code: 'QUEUE_CLEARED',
            message: 'This job was terminated since the queue was cleared',
            job,
          })
        })
      })

    this.jobs = []
  }

  setJobToProcessing(id: string, type: JobType): void {
    this.jobs.forEach(job => {
      if (job.id === id && job.type === type) {
        job.status = JobStatus.PROCESSING
      }
    })
  }

  executeNextJobIfPossible(): void {
    if (!this.getReadyJobs().length) {
      log('all done. job queue is empty')
      return
    }

    if (this.getRunningJobs().length < this.options.concurrency) {
      if (this.options.aging) {
        this.ageJobs()
      }
      this.pruneQueue()
      void this.executeNextJob()
    } else {
      log('waiting... all workers in queue are occupied')
    }
  }

  async executeNextJob(): Promise<void> {
    const nextJob = this.getNextJobToRun()
    if (!nextJob) {
      return
    }

    log('executing job ... %o', {
      id: nextJob.id,
      type: nextJob.type,
      priority: nextJob.priority,
    })

    this.setJobToProcessing(nextJob.id, nextJob.type)

    try {
      const handler = this.executorMap[nextJob.type]
      const result = await handler.call(this, nextJob.params)
      log('job %s was a success, removing it', nextJob.id, nextJob.type)
      nextJob.successListeners.forEach(listener => {
        listener.call(this, result)
      })
    } catch (error) {
      log('job %s was a failure, removing it', nextJob.id, nextJob.type)
      nextJob.failureListeners.forEach(listener => {
        listener.call(this, error)
      })
    } finally {
      this.removeJob(nextJob.id, nextJob.type)
      this.executeNextJobIfPossible()
    }
  }

  addListenersToJob(
    id: string,
    type: JobType,
    listeners: {
      resolve: (value: never) => void
      reject: (reason?: unknown) => void
    }
  ): void {
    this.jobs.forEach(job => {
      if (job.id === id && job.type === type) {
        job.successListeners.push(
          listeners.resolve as unknown as (result: unknown) => void
        )
        job.failureListeners.push(listeners.reject)
      }
    })
  }

  process<TResult, TParams>(
    id: string,
    type: JobType,
    jobParams: TParams,
    options: ProcessOptions<TResult> = {}
  ): Promise<TResult> {
    log('added new job %s %o %o', type, jobParams, options)
    const {
      priority = JobPriority.LOW,
      maxAge = this.options.maxAge,
      onSuccess = () => {},
      onFailure = () => {},
    } = options

    this.pruneQueue()

    return new Promise<TResult>((resolve, reject) => {
      if (this.hasJob(id, type)) {
        log('job id %s already present, adding callbacks', id)
        this.addListenersToJob(id, type, { resolve, reject })
        return
      }

      this.jobs.push({
        id,
        type,
        maxAge,
        priority,
        addedTime: new Date(),
        status: JobStatus.READY,
        params: jobParams,
        successListeners: [
          resolve as unknown as (result: unknown) => void,
          onSuccess as (result: unknown) => void,
        ],
        failureListeners: [reject, onFailure],
      })

      this.executeNextJobIfPossible()
    })
  }
}

export default Queue
