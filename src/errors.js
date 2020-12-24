function createCustomError(name) {
  function CustomError(message, code) {
    Error.captureStackTrace && Error.captureStackTrace(this, this.constructor);
    this.message = message;
    this.code = code;
  }

  CustomError.prototype = new Error();
  CustomError.prototype.name = name;
  CustomError.prototype.constructor = CustomError;

  return CustomError;
}

export const ULUnexpectedResponseError = createCustomError('UnlaunchUnexpectedResponseError');
export const ULInvalidEnvironmentIdError = createCustomError('UnlaunchInvalidEnvironmentIdError');
export const ULInvalidUserError = createCustomError('UnlaunchInvalidUserError');
export const ULInvalidEventKeyError = createCustomError('UnlaunchInvalidEventKeyError');
export const ULInvalidArgumentError = createCustomError('UnlaunchInvalidArgumentError');
export const ULFlagFetchError = createCustomError('UnlaunchFlagFetchError');

export function isHttpErrorRecoverable(status) {
  if (status >= 400 && status < 500) {
    return status === 400 || status === 408 || status === 429;
  }
  return true;
}
