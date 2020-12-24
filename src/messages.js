import * as errors from './errors';

function errorString(err) {
  if (err && err.message) {
    return err.message;
  }
  if (typeof err === 'string' || err instanceof String) {
    return err;
  }
  return JSON.stringify(err);
}

export const clientInitialized = function() {
  return 'Unlaunch client initialized';
};

const docLink =
  ' Please see https://docs.unlaunch.io/docs/sdks/ for instructions on SDK initialization.';

export const clientNotReady = function() {
  return 'Unlaunch client is not ready';
};

export const eventCapacityExceeded = function() {
  return 'Exceeded event queue capacity. Increase capacity to avoid dropping events.';
};

export const eventWithoutUser = function() {
  return 'See docs at https://docs.unlaunch.io/docs/sdks/';
};

export const invalidContentType = function(contentType) {
  return 'Expected application/json content type but got "' + contentType + '"';
};

export const invalidKey = function() {
  return 'Event key must be a string';
};

export const localStorageUnavailable = function() {
  return 'localStorage is unavailable';
};

export const localStorageUnavailableForUserId = function() {
  return 'localStorage is unavailable, so anonymous user ID cannot be cached';
};

export const networkError = e => 'network error' + (e ? ' (' + e + ')' : '');

export const unknownCustomEventKey = function(key) {
  return 'Custom event "' + key + '" does not exist';
};

export const environmentNotFound = function() {
  return 'Environment not found. Double check that you specified a valid environment/client-side ID.' + docLink;
};

export const environmentNotSpecified = function() {
  return 'No environment/client-side ID was specified.' + docLink;
};

export const errorFetchingFlags = function(err) {
  return 'Error fetching flag settings: ' + errorString(err);
};

export const userNotSpecified = function() {
  return 'No user specified.' + docLink;
};

export const invalidUser = function() {
  return 'Invalid user specified.' + docLink;
};

export const deprecated = function(oldName, newName) {
  if (newName) {
    return '"' + oldName + '" is deprecated, please use "' + newName + '"';
  }
  return '"' + oldName + '" is deprecated';
};

export const httpErrorMessage = function(status, context, retryMessage) {
  return (
    'Received error ' +
    status +
    (status === 401 ? ' (invalid SDK key)' : '') +
    ' for ' +
    context +
    ' - ' +
    (errors.isHttpErrorRecoverable(status) ? retryMessage : 'giving up permanently')
  );
};

export const httpUnavailable = function() {
  return 'Cannot make HTTP requests in this environment.' + docLink;
};

export const unknownOption = name => 'Ignoring unknown config option "' + name + '"';

export const wrongOptionType = (name, expectedType, actualType) =>
  'Config option "' + name + '" should be of type ' + expectedType + ', got ' + actualType + ', using default value';

export const wrongOptionTypeBoolean = (name, actualType) =>
  'Config option "' + name + '" should be a boolean, got ' + actualType + ', converting to boolean';

export const optionBelowMinimum = (name, value, minimum) =>
  'Config option "' + name + '" was set to ' + value + ', changing to minimum value of ' + minimum;

export const debugEnqueueingEvent = function(kind) {
  return 'enqueueing "' + kind + '" event';
};

export const debugPostingEvents = function(count) {
  return 'sending ' + count + ' events';
};


