import * as messages from './messages';
import { base64URLEncode, getULHeaders, objectHasOwnProperty } from './utils';

// The underlying event source implementation is abstracted via the platform object, which should
// have these three properties:
// eventSourceFactory(): a function that takes a URL and optional request body and returns an object
//   with the same methods as the regular HTML5 EventSource object. Passing a body parameter means
//   that the request should use REPORT instead of GET.
// eventSourceIsActive(): a function that takes an EventSource-compatible object and returns true if
//   it is in an active state (connected or connecting).
// eventSourceAllowsReport: true if REPORT is supported.

export default function Stream(platform, config, environment, diagnosticsAccumulator) {
  const baseUrl = config.streamUrl;
  const logger = config.logger;
  const stream = {};
  const evalUrlPrefix = baseUrl + '/eval/' + environment;
  const useReport = config.useReport;
  const withReasons = config.evaluationReasons;
  const streamReconnectDelay = config.streamReconnectDelay;
  const headers = getULHeaders(platform, config, environment);
  let firstConnectionErrorLogged = false;
  let es = null;
  let reconnectTimeoutReference = null;
  let connectionAttemptStartTime;
  let user = null;
  let hash = null;
  let handlers = null;

  stream.connect = function(newUser, newHash, newHandlers) {
    user = newUser;
    hash = newHash;
    handlers = {};
    for (const key in newHandlers || {}) {
      handlers[key] = function(e) {
        // Reset the state for logging the first connection error so that the first
        // connection error following a successful connection will once again be logged.
        // We will decorate *all* handlers to do this to keep this abstraction agnostic
        // for different stream implementations.
        firstConnectionErrorLogged = false;
        logConnectionResult(true);
        newHandlers[key] && newHandlers[key](e);
      };
    }
    tryConnect();
  };

  stream.disconnect = function() {
    clearTimeout(reconnectTimeoutReference);
    reconnectTimeoutReference = null;
    closeConnection();
  };

  stream.isConnected = function() {
    return !!(es && platform.eventSourceIsActive && platform.eventSourceIsActive(es));
  };

  function handleError(err) {
    if (!firstConnectionErrorLogged) {
    //  logger.warn(messages.streamError(err, streamReconnectDelay));
      firstConnectionErrorLogged = true;
    }
    logConnectionResult(false);
    closeConnection();
    tryConnect(streamReconnectDelay);
  }

  function tryConnect(delay) {
    if (!reconnectTimeoutReference) {
      if (delay) {
        reconnectTimeoutReference = setTimeout(openConnection, delay);
      } else {
        openConnection();
      }
    }
  }

  function openConnection() {
    reconnectTimeoutReference = null;
    let url;
    let query = '';
    const options = { headers };
    if (platform.eventSourceFactory) {
      if (hash !== null && hash !== undefined) {
        query = 'h=' + hash;
      }
      if (useReport) {
        if (platform.eventSourceAllowsReport) {
          url = evalUrlPrefix;
          options.method = 'REPORT';
          options.headers['Content-Type'] = 'application/json';
          options.body = JSON.stringify(user);
        } else {
          // if we can't do REPORT, fall back to the old ping-based stream
          url = baseUrl + '/ping/' + environment;
          query = '';
        }
      } else {
        url = evalUrlPrefix + '/' + base64URLEncode(JSON.stringify(user));
      }
      if (withReasons) {
        query = query + (query ? '&' : '') + 'withReasons=true';
      }
      url = url + (query ? '?' : '') + query;

      closeConnection();
    //  logger.info(messages.streamConnecting(url));
      logConnectionStarted();

      es = platform.eventSourceFactory(url, options);
      for (const key in handlers) {
        if (objectHasOwnProperty(handlers, key)) {
          es.addEventListener(key, handlers[key]);
        }
      }

      es.onerror = handleError;
    }
  }

  function closeConnection() {
    if (es) {
    //  logger.info(messages.streamClosing());
      es.close();
      es = null;
    }
  }

  function logConnectionStarted() {
    connectionAttemptStartTime = new Date().getTime();
  }

  function logConnectionResult(success) {
    if (connectionAttemptStartTime && diagnosticsAccumulator) {
      diagnosticsAccumulator.recordStreamInit(
        connectionAttemptStartTime,
        !success,
        new Date().getTime() - connectionAttemptStartTime
      );
    }
    connectionAttemptStartTime = null;
  }

  return stream;
}
