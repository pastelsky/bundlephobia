const log = require('debug')('bp:queue')

const Job = {
  status: {
    READY: Symbol('ready'),
    PROCESSING: Symbol('processing'),
  },

  priority: {
    LOW: 5,
    MEDIUM: 10,
    HIGH: 20,
  },
}

/**
 * A simple promise based throttle queue with support
 * for priorities, concurrency control, job de-duplication,
 * and more.
 */
class Queue {
  constructor(options) {
    this.jobs = []
    this.options = {
      concurrency: 1,
      aging: true,
      maxAge: Number.POSITIVE_INFINITY,
      ...options,
    }
    this.executorMap = {}
  }

  /**
   * Set a function (async or sync) that
   * executes the jobs sent to the queue.
   * The handler will be passed a params object.
   * @param jobType
   * @param handler
   */
  addExecutor(jobType, handler) {
    this.executorMap[jobType] = handler
  }

  hasJob(id, type) {
    return this.jobs.some(job => job.id === id && type === job.type)
  }

  getRunningJobs() {
    return this.jobs.filter(job => job.status === Job.status.PROCESSING)
  }

  getReadyJobs() {
    return this.jobs.filter(job => job.status === Job.status.READY)
  }

  /**
   * Remove "ready" jobs from the queue that have
   * lived past their max age. Removed jobs have
   * their failure listeners notified of the same.
   */
  pruneQueue() {
    this.getReadyJobs().forEach(job => {
      const { addedTime, maxAge, failureListeners } = job
      const isJobExpired = (addedTime.getTime() + maxAge) * 1000 < Date.now()

      if (isJobExpired) {
        failureListeners.forEach(listener => {
          listener({
            code: 'JOB_EXPIRED',
            message:
              "This job's age exceeded it's specified maxAge, and was dropped",
          })
        })
      }
    })
  }

  /**
   * Get the next "ready" job from the queue
   * to be executed. The next ready job depends on -
   * 1) Priority: higher priority always executes first
   * 2) Time Added: if priorities are equal, the older
   * job executes first.
   */
  getNextJobToRun() {
    return this.jobs
      .filter(job => job.status === Job.status.READY)
      .sort((jobA, jobB) => {
        const priorityDiff = jobB.priority - jobA.priority
        if (priorityDiff) {
          return jobB.priority - jobA.priority
        }
        return jobA.addedTime.getTime() - jobB.addedTime.getTime()
      })
      .shift()
  }

  /**
   * Increments the priorites of "ready" jobs
   * in the queue to prevent starvation of lower
   * priority jobs.
   */
  ageJobs() {
    this.jobs
      .filter(job => job.status === Job.status.READY)
      .forEach(job => {
        job.priority += 1
      })
    log(
      'after aging, job queue is... %o',
      this.jobs.map(({ id, type, priority }) => ({ id, type, priority }))
    )
  }

  removeJob(id, type) {
    this.jobs = this.jobs.filter(job => job.id !== id && job.type !== type)
  }

  /**
   * Clear the queue of all "ready" jobs. Jobs
   * in execution are not terminate prematurely.
   * Jobs being terminated have their failure listeners notified.
   */
  clear() {
    this.jobs
      .filter(job => job.status === Job.status.READY)
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

  setJobToProcessing(id, type) {
    this.jobs.forEach(job => {
      if (job.id === id && job.type === type) {
        job.status = Job.status.PROCESSING
      }
    })
  }

  /**
   * Executes the next job in queue iff
   * they haven't expired and concurrency
   * limit is not already achieved.
   */
  executeNextJobIfPossible() {
    if (!this.getReadyJobs().length) {
      log('all done. job queue is empty')
      return
    }

    if (this.getRunningJobs().length < this.options.concurrency) {
      if (this.options.aging) {
        this.ageJobs()
      }
      this.pruneQueue()
      this.executeNextJob()
    } else {
      log('waiting... all workers ain quere are occupied')
    }
  }

  executeNextJob() {
    const nextJob = this.getNextJobToRun()
    log('executing job ... %o', {
      id: nextJob.id,
      type: nextJob.type,
      priority: nextJob.priority,
    })

    this.setJobToProcessing(nextJob.id, nextJob.type)
    const callResult = this.executorMap[nextJob.type].call(this, nextJob.params)

    Promise.resolve(callResult)
      .then(result => {
        log('job %s was a success, removing it', nextJob.id, nextJob.type)
        nextJob.successListeners.forEach(listener => {
          listener.call(this, result)
        })

        this.removeJob(nextJob.id, nextJob.type)
        this.executeNextJobIfPossible()
      })
      .catch(err => {
        log('job %s was a failure, removing it', nextJob.id, nextJob.type)
        nextJob.failureListeners.forEach(listener => {
          listener.call(this, err)
        })

        this.removeJob(nextJob.id, nextJob.type)
        this.executeNextJobIfPossible()
      })
  }

  addListenersToJob(id, type, { resolve, reject }) {
    this.jobs.forEach(job => {
      if (job.id === id && job.type === type) {
        job.successListeners.push(resolve)
        job.failureListeners.push(reject)
      }
    })
  }

  /**
   *
   * @param id
   * @param type
   * @param jobParams
   * @param options
   * @return {Promise<any>}
   */
  process(id, type, jobParams, options = {}) {
    log('added new job %s %s %o %o', type, id, jobParams, options)
    const {
      priority = Job.priority.LOW,
      maxAge = this.options.maxAge,
      onSuccess = () => {},
      onFailure = () => {},
    } = options
    this.pruneQueue()

    return new Promise((resolve, reject) => {
      // If a job with the given id already exists,
      // just add the success / failure callbacks to
      // that existing job (dedup)
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
        status: Job.status.READY,
        params: jobParams,
        successListeners: [resolve, onSuccess],
        failureListeners: [reject, onFailure],
      })

      this.executeNextJobIfPossible()
    })
  }
}

Queue.priority = Job.priority

module.exports = Queue
