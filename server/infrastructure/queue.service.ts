import createDebug from 'debug'

import type { RuntimeValue } from '../../types/json'

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

interface QueueExecutorContext {
  signal: AbortSignal
}

export class JobCancelledError extends Error {
  readonly code = 'JOB_CANCELLED'

  constructor() {
    super('JOB_CANCELLED')
    this.name = 'JobCancelledError'
  }
}

export function isJobCancelledError<T>(
  error: T,
): error is T & JobCancelledError {
  return (
    error instanceof Error && 'code' in error && error.code === 'JOB_CANCELLED'
  )
}

type QueueExecutor<
  TParams extends RuntimeValue = RuntimeValue,
  TResult extends RuntimeValue = RuntimeValue,
> = (
  params: TParams,
  context: QueueExecutorContext,
) => TResult | Promise<TResult>

interface QueueJob<
  TParams extends RuntimeValue = RuntimeValue,
  TResult extends RuntimeValue = RuntimeValue,
> {
  id: string
  type: JobType
  maxAge: number
  priority: number
  addedTime: Date
  status: (typeof JobStatus)[keyof typeof JobStatus]
  params: TParams
  successListeners: Array<(result: TResult) => void>
  failureListeners: Array<(error: RuntimeValue) => void>
  abortController: AbortController
  cancel?: () => void
}

interface QueueOptions {
  concurrency?: number
  aging?: boolean
  maxAge?: number
}

interface ProcessOptions<TResult extends RuntimeValue> {
  priority?: number
  maxAge?: number
  onSuccess?: (result: TResult) => void
  onFailure?: (error: RuntimeValue) => void
  signal?: AbortSignal
}

interface ProcessRequest<
  TResult extends RuntimeValue,
  TParams extends RuntimeValue,
> {
  id: string
  type: JobType
  jobParams: TParams
  options?: ProcessOptions<TResult>
}

type ProcessArguments<
  TResult extends RuntimeValue,
  TParams extends RuntimeValue,
> =
  | [request: ProcessRequest<TResult, TParams>]
  | [
      id: string,
      type: JobType,
      jobParams: TParams,
      options?: ProcessOptions<TResult>,
    ]

function toProcessRequest<
  TResult extends RuntimeValue,
  TParams extends RuntimeValue,
>(args: ProcessArguments<TResult, TParams>): ProcessRequest<TResult, TParams> {
  if (args.length === 1) return args[0]
  const [id, type, jobParams, options] = args

  return { id, type, jobParams, options }
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

  getDiagnostics() {
    let ready = 0
    let running = 0
    let successListeners = 0
    let failureListeners = 0

    for (const job of this.jobs) {
      if (job.status === JobStatus.READY) {
        ready += 1
      } else if (job.status === JobStatus.PROCESSING) {
        running += 1
      }

      successListeners += job.successListeners.length
      failureListeners += job.failureListeners.length
    }

    return {
      total: this.jobs.length,
      ready,
      running,
      successListeners,
      failureListeners,
    }
  }

  addExecutor<TParams extends RuntimeValue, TResult extends RuntimeValue>(
    jobType: JobType,
    handler: QueueExecutor<TParams, TResult>,
  ): void {
    // SAFETY: the queue only stores runtime values and invokes the registered handler with its own params.
    this.executorMap[jobType] = (params, context) =>
      handler(params as TParams, context)
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
      this.jobs.map(({ id, type, priority }) => ({ id, type, priority })),
    )
  }

  removeJob(id: string, type: JobType): void {
    this.jobs = this.jobs.filter(job => job.id !== id || job.type !== type)
  }

  cancelJob(job: QueueJob): void {
    job.abortController.abort()
    job.cancel?.()
  }

  cancel(id: string, type: JobType): void {
    const job = this.jobs.find(
      candidate => candidate.id === id && candidate.type === type,
    )

    if (job) {
      log('cancelling job %s (%s)', id, job.status.toString())

      if (job.status === JobStatus.PROCESSING) {
        this.cancelJob(job)
      }

      job.failureListeners.forEach(listener => {
        listener(new JobCancelledError())
      })

      if (job.status === JobStatus.READY) {
        this.removeJob(id, type)
        this.executeNextJobIfPossible()
      }
    }
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

      const promiseOrValue = handler.call(this, nextJob.params, {
        signal: nextJob.abortController.signal,
      })

      if (promiseOrValue && 'cancel' in Object(promiseOrValue)) {
        // SAFETY: the worker result is inspected only for the optional cancellation method.
        const cancelablePromise = promiseOrValue as Promise<unknown> & {
          cancel?: () => void
        }

        const cancel = cancelablePromise.cancel

        if (
          cancel &&
          Object.prototype.toString.call(cancel) === '[object Function]'
        ) {
          nextJob.cancel = () => {
            log('terminating running task for job %s', nextJob.id)
            cancel.call(cancelablePromise)
          }
        }
      }

      const result = await promiseOrValue
      log('job %s was a success, removing it', nextJob.id, nextJob.type)
      nextJob.successListeners.forEach(listener => {
        listener.call(this, result)
      })
    } catch (error) {
      log('job %s was a failure, removing it', nextJob.id, nextJob.type)
      // SAFETY: JavaScript catch values are one of the RuntimeValue union members.
      const runtimeError = error as RuntimeValue
      nextJob.failureListeners.forEach(listener => {
        listener.call(this, runtimeError)
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
      resolve: (value: RuntimeValue) => void
      reject: (reason?: RuntimeValue) => void
    },
  ): void {
    this.jobs.forEach(job => {
      if (job.id === id && job.type === type) {
        job.successListeners.push(listeners.resolve)
        job.failureListeners.push(listeners.reject)
      }
    })
  }

  process<TResult extends RuntimeValue, TParams extends RuntimeValue>(
    ...args: ProcessArguments<TResult, TParams>
  ): Promise<TResult> {
    const { id, type, jobParams, options = {} } = toProcessRequest(args)
    log('added new job %s %o %o', type, jobParams, options)

    const {
      priority = JobPriority.LOW,
      maxAge = this.options.maxAge,
      onSuccess = () => {},
      onFailure = () => {},
      signal,
    } = options

    this.pruneQueue()

    return new Promise<TResult>((resolve, reject) => {
      let settled = false

      const resolveSubscriber = (result: TResult) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', cancelSubscriber)
        resolve(result)
        onSuccess(result)
      }

      const rejectSubscriber = (error: RuntimeValue) => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', cancelSubscriber)
        reject(error)
        onFailure(error)
      }

      // SAFETY: process results are constrained to the queue's runtime-value domain.
      const successListener = resolveSubscriber as (
        result: RuntimeValue,
      ) => void

      const failureListener = rejectSubscriber

      const cancelSubscriber = () => {
        const job = this.jobs.find(
          queuedJob => queuedJob.id === id && queuedJob.type === type,
        )

        if (!job || settled) return

        job.successListeners = job.successListeners.filter(
          listener => listener !== successListener,
        )
        job.failureListeners = job.failureListeners.filter(
          listener => listener !== failureListener,
        )

        const error = new JobCancelledError()
        rejectSubscriber(error)

        if (job.failureListeners.length === 0) {
          log('cancelling orphaned job %s (%s)', id, job.status.toString())

          if (job.status === JobStatus.PROCESSING) {
            this.cancelJob(job)
          } else {
            this.removeJob(id, type)
            this.executeNextJobIfPossible()
          }
        }
      }

      if (signal?.aborted) {
        rejectSubscriber(new JobCancelledError())

        return
      }

      signal?.addEventListener('abort', cancelSubscriber, { once: true })

      if (this.hasJob(id, type)) {
        log('job id %s already present, adding callbacks', id)

        const existingJob = this.jobs.find(
          queuedJob => queuedJob.id === id && queuedJob.type === type,
        )

        if (existingJob) {
          existingJob.priority = Math.max(existingJob.priority, priority)
        }

        this.addListenersToJob(id, type, {
          // SAFETY: TResult is constrained to the runtime-value domain used by Queue.
          resolve: successListener as (value: RuntimeValue) => void,
          reject: failureListener,
        })

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
        successListeners: [successListener],
        failureListeners: [failureListener],
        abortController: new AbortController(),
      })

      this.executeNextJobIfPossible()
    })
  }
}

export default Queue
