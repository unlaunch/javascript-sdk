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
  return 'LaunchDarkly client initialized';
};

const docLink =
  ' Please see https://docs.launchdarkly.com/docs/js-sdk-reference#section-initializing-the-client for instructions on SDK initialization.';

export const clientNotReady = function() {
  return 'LaunchDarkly client is not ready';
};

export const eventCapacityExceeded = function() {
  return 'Exceeded event queue capacity. Increase capacity to avoid dropping events.';
};

export const eventWithoutUser = function() {
  return 'Be sure to call `identify` in the LaunchDarkly client: https://docs.launchdarkly.com/docs/js-sdk-reference#section-analytics-events';
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

export const bootstrapOldFormat = function() {
  return (
    'LaunchDarkly client was initialized with bootstrap data that did not include flag metadata. ' +
    'Events may not be sent correctly.' +
    docLink
  );
};

export const bootstrapInvalid = function() {
  return 'LaunchDarkly bootstrap data is not available because the back end could not read the flags.';
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

export const identifyDisabled = function() {
  return 'identify() has no effect here; it must be called on the main client instance';
};

export const streamClosing = function() {
  return 'Closing stream connection';
};

export const streamConnecting = function(url) {
  return 'Opening stream connection to ' + url;
};

export const streamError = function(err, streamReconnectDelay) {
  return (
    'Error on stream connection: ' +
    errorString(err) +
    ', will continue retrying every ' +
    streamReconnectDelay +
    ' milliseconds.'
  );
};

export const unknownOption = name => 'Ignoring unknown config option "' + name + '"';

export const wrongOptionType = (name, expectedType, actualType) =>
  'Config option "' + name + '" should be of type ' + expectedType + ', got ' + actualType + ', using default value';

export const wrongOptionTypeBoolean = (name, actualType) =>
  'Config option "' + name + '" should be a boolean, got ' + actualType + ', converting to boolean';

export const optionBelowMinimum = (name, value, minimum) =>
  'Config option "' + name + '" was set to ' + value + ', changing to minimum value of ' + minimum;

export const debugPolling = function(url) {
  return 'polling for feature flags at ' + url;
};

export const debugStreamPing = function() {
  return 'received ping message from stream';
};

export const debugStreamPut = function() {
  return 'received streaming update for all flags';
};

export const debugStreamPatch = function(key) {
  return 'received streaming update for flag "' + key + '"';
};

export const debugStreamPatchIgnored = function(key) {
  return 'received streaming update for flag "' + key + '" but ignored due to version check';
};

export const debugStreamDelete = function(key) {
  return 'received streaming deletion for flag "' + key + '"';
};

export const debugStreamDeleteIgnored = function(key) {
  return 'received streaming deletion for flag "' + key + '" but ignored due to version check';
};

export const debugEnqueueingEvent = function(kind) {
  return 'enqueueing "' + kind + '" event';
};

export const debugPostingEvents = function(count) {
  return 'sending ' + count + ' events';
};

export const debugPostingDiagnosticEvent = function(event) {
  return 'sending diagnostic event (' + event.kind + ')';
};
