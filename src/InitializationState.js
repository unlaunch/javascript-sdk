// This file provides an abstraction of the client's startup state.
//
// Startup can either succeed or fail exactly once; calling signalSuccess() or signalFailure()
// after that point has no effect.
//
// On success, we fire both an "initialized" event and a "ready" event. Both the waitForInitialization()
// promise and the waitUntilReady() promise are resolved in this case.
//
// On failure, we fire both a "failed" event (with the error as a parameter) and a "ready" event.
// The waitForInitialization() promise is rejected, but the waitUntilReady() promise is resolved.
//
// To complicate things, we must *not* create the waitForInitialization() promise unless it is
// requested, because otherwise failures would cause an *unhandled* rejection which can be a
// serious problem in some environments. So we use a somewhat roundabout system for tracking the
// initialization state and lazily creating this promise.

const readyEvent = 'ready',
  successEvent = 'initialized',
  failureEvent = 'failed';

function InitializationStateTracker(eventEmitter) {
  let succeeded = false,
    failed = false,
    failureValue = null,
    initializationPromise = null;

  const readyPromise = new Promise(resolve => {
    const onReady = () => {
      eventEmitter.off(readyEvent, onReady); // we can't use "once" because it's not available on some JS platforms
      resolve();
    };
    eventEmitter.on(readyEvent, onReady);
  }).catch(() => {}); // this Promise should never be rejected, but the catch handler is a safety measure

  return {
    getInitializationPromise: () => {
      if (initializationPromise) {
        return initializationPromise;
      }
      if (succeeded) {
        return Promise.resolve();
      }
      if (failed) {
        return Promise.reject(failureValue);
      }
      initializationPromise = new Promise((resolve, reject) => {
        const onSuccess = () => {
          eventEmitter.off(successEvent, onSuccess);
          resolve();
        };
        const onFailure = err => {
          eventEmitter.off(failureEvent, onFailure);
          reject(err);
        };
        eventEmitter.on(successEvent, onSuccess);
        eventEmitter.on(failureEvent, onFailure);
      });
      return initializationPromise;
    },

    getReadyPromise: () => readyPromise,

    signalSuccess: () => {
      if (!succeeded && !failed) {
        succeeded = true;
        eventEmitter.emit(successEvent);
        eventEmitter.emit(readyEvent);
      }
    },

    signalFailure: err => {
      if (!succeeded && !failed) {
        failed = true;
        failureValue = err;
        eventEmitter.emit(failureEvent, err);
        eventEmitter.emit(readyEvent);
      }
      eventEmitter.maybeReportError(err); // the "error" event can be emitted more than once, unlike the others
    },
  };
}

module.exports = InitializationStateTracker;
