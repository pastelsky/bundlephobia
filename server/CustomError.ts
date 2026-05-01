export default class CustomError<
  TOriginalError = unknown,
  TExtra = unknown
> extends Error {
  originalError: TOriginalError
  extra: TExtra

  constructor(name: string, originalError: TOriginalError, extra: TExtra) {
    super(name)
    this.name = name
    this.originalError = originalError
    this.extra = extra
    Error.captureStackTrace(this, CustomError)
  }
}
