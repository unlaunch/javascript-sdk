import EventProcessor from './EventProcessor';
import EventEmitter from './EventEmitter';
import EventSender from './EventSender';
import InitializationStateTracker from './InitializationState';
import Store from './Store';
import Requestor from './Requestor';
import Identity from './Identity';
import UserValidator from './UserValidator';
import * as configuration from './configuration';
import createConsoleLogger from './consoleLogger';
import * as utils from './utils';
import * as errors from './errors';
import * as messages from './messages';

const changeEvent = 'change';
const internalChangeEvent = 'internal-change';

// This is called by the per-platform initialize functions to create the base client object that we
// may also extend with additional behavior. It returns an object with these properties:
//   client: the actual client object
//   options: the configuration (after any appropriate defaults have been applied)
// If we need to give the platform-specific clients access to any internals here, we should add those
// as properties of the return object, not public properties of the client.
//
// For definitions of the API in the platform object, see stubPlatform.js in the test code.

export function initialize(clientSdkKey, flagKeys, user, specifiedOptions, platform, extraOptionDefs) {
  const logger = createLogger();
  const emitter = EventEmitter(logger);
  const initializationStateTracker = InitializationStateTracker(emitter);
  const options = configuration.validate(specifiedOptions, emitter, extraOptionDefs, logger);
  const sendEvents = options.sendEvents;
  const offline = options.offline;
  let environment = clientSdkKey;
  let hash = options.hash;

  const eventSender = EventSender(platform, environment, options);

  const events =
    options.eventProcessor ||
    EventProcessor(platform, options, environment, null, emitter, eventSender);

  const requestor = Requestor(platform, options, environment);

  const seenRequests = {};
  let flags = {};
  let useLocalStorage;
  let subscribedToChangeEvents;
  let inited = false;
  let closed = false;
  let firstEvent = true;

  // The "stateProvider" object is used in the Electron SDK, to allow one client instance to take partial
  // control of another. If present, it has the following contract:
  // - getInitialState() returns the initial client state if it is already available. The state is an
  //   object whose properties are "environment", "user", and "flags".
  // - on("init", listener) triggers an event when the initial client state becomes available, passing
  //   the state object to the listener.
  // - on("update", listener) triggers an event when flag values change and/or the current user changes.
  //   The parameter is an object that *may* contain "user" and/or "flags".
  // - enqueueEvent(event) accepts an analytics event object and returns true if the stateProvider will
  //   be responsible for delivering it, or false if we still should deliver it ourselves.
  const stateProvider = options.stateProvider;

  //const ident = Identity(null, sendIdentifyEvent);
  const ident = Identity(null, null);
  const userValidator = UserValidator(platform.localStorage, logger);
  let store;
  if (platform.localStorage) {
    store = new Store(platform.localStorage, environment, hash, ident, logger);
  }

  function createLogger() {
    if (specifiedOptions && specifiedOptions.logger) {
      return specifiedOptions.logger;
    }
    return (extraOptionDefs && extraOptionDefs.logger && extraOptionDefs.logger.default) || createConsoleLogger('warn');
  }

  function shouldEnqueueEvent() {
    return sendEvents && !closed && !platform.isDoNotTrack();
  }

  function enqueueEvent(event) {
    if (!environment) {
      // We're in paired mode and haven't been initialized with an environment or user yet
      return;
    }
    if (stateProvider && stateProvider.enqueueEvent && stateProvider.enqueueEvent(event)) {
      return; // it'll be handled elsewhere
    }
    if (!event.user && !event.userId) {
      if (firstEvent) {
        logger.warn(messages.eventWithoutUser());
        firstEvent = false;
      }
      return;
    }
    firstEvent = false;
    if (shouldEnqueueEvent()) {
      //logger.debug(messages.debugEnqueueingEvent(event.kind));
        events.enqueue(event);
    }
  }

  function sendImpressionEvent(key, detail) {
    const user = ident.getUser();
    const now = new Date();
    const value = detail ? detail.value : null;
    // if (!options.allowFrequentDuplicateEvents) {
    //   const cacheKey = JSON.stringify(value) + (user && user.key ? user.key : '') + key; // see below
    //   const cached = seenRequests[cacheKey];
    //   // cache TTL is five minutes
    //   if (cached && now - cached < 300000) {
    //     return;
    //   }
    //   seenRequests[cacheKey] = now;
    // }

    const event = {
      createdTime: now.getTime(),
      type: 'IMPRESSION',
      sdk: 'Javascript',
      sdkVersion: '1.0.0',
      flagKey: key,
      userId: user.identity,
      //value: value,
      variationKey: value,
      flagStatus: detail.status,
      evaluationReason: detail.reason,
      machineIp: 'N/A',
      machineName: 'N/A'
      
    };
    // const flag = flags[key];
    // if (flag) {
    //   event.version = flag.flagVersion ? flag.flagVersion : flag.version;
    //   event.trackEvents = flag.trackEvents;
    //   event.debugEventsUntilDate = flag.debugEventsUntilDate;
    // }
    // if ((includeReason || (flag && flag.trackReason)) && detail) {
    //   event.reason = detail.reason;
    // }

    enqueueEvent(event);
  }
  
  function getUser() {
    return ident.getUser();
  }

  function flush(onDone) {
    return utils.wrapPromiseCallback(sendEvents ? events.flush() : Promise.resolve(), onDone);
  }

  function variation(key) {
    return variationDetailInternal(key, true, false).value;
  }

  function variationDetail(key) {
    return variationDetailInternal(key, true, true);
  }

  function variationDetailInternal(key, sendEvent, includeReasonInEvent) {
    let detail;
    let defaultValue = 'control';
    if(offline){
      detail = { value: defaultValue, variationIndex: null, reason: 'DEFAULT_VALUE_SERVED'};
      return detail;
    }
    
    if (flags && utils.objectHasOwnProperty(flags, key) && flags[key] && !flags[key].deleted) {
      const flag = flags[key];
      detail = getFlagDetail(flag);
      if (flag.result === null || flag.result === undefined) {
          detail.value = defaultValue;
      } 

      if (sendEvent) {
          sendImpressionEvent(key, detail);
      }
      
      return detail;
      
    } else {
      
       logger.error("flag is not initialized. Please add flag key in initialize", key);
       return;
      
    }
  }

  function getFlagDetail(flag) {
    return {
      value: flag.result,
      status: flag.status,
      variationIndex: flag.variation === undefined ? null : flag.variation,
      reason: flag.evaluationReason || null,
    };
    // Note, the logic above ensures that variationIndex and reason will always be null rather than
    // undefined if we don't have values for them. That's just to avoid subtle errors that depend on
    // whether an object was JSON-encoded with null properties omitted or not.
  }

  function variantConfig(flagKey, variationKey, variantConfig = {}) {
    if (!inited) {
        logger.error('client not initialized');
        return undefined;
    } else if(offline){
      console.log('default variantConfig returned in offline mode');
      return variantConfig;
    } else if (!flagKey || flagKey.length === 0) {
        logger.error('flag key is missing');
        return undefined;
    } else if (!variationKey || variationKey.length === 0) {
        logger.error('variation key is missing');
        return undefined;
    }

    let flag = flags[flagKey];
    
    if (flag === undefined) {
        logger.error('flag not found. call variation to load flag from server');
        return undefined;
    } else { 
        let variation = flag.result === variationKey;
        
        if (!variation) {
            logger.error(`Variation key ${variationKey} not found!`);
            return undefined;
        }
        
        return flag.variantConfig
    }
}

  function allFlags() {
    const results = {};

    if (!flags) {
      return results;
    }

    for (const key in flags) {
      if (utils.objectHasOwnProperty(flags, key)) {
        results[key] = variationDetailInternal(key, null, !options.sendEventsOnlyForVariation).value;
      }
    }

    return results;
  }

  // Returns a Promise which will be resolved when we have completely updated the internal flags state,
  // dispatched all change events, and updated local storage if appropriate. This Promise is guaranteed
  // never to have an unhandled rejection.
  function replaceAllFlags(newFlags) {
    const updatedFlags = {};

    if (!newFlags) {
      return Promise.resolve();
    }

    newFlags.forEach(flag => {
        updatedFlags[flag.flagKey] = flag;
      }
    )
    flags = { ...updatedFlags};
   
    if (useLocalStorage && store) {
      return store.saveFlags(flags).catch(() => null); // disregard errors
    } else {
      return Promise.resolve();
    }
    
  }

  function on(event, handler, context) {
    if (isChangeEventKey(event)) {
      subscribedToChangeEvents = true;
      emitter.on(event, handler, context);
    } else {
      emitter.on(...arguments);
    }
  }

  function off(event) {
    emitter.off(...arguments);
    if (isChangeEventKey(event)) {
      let haveListeners = false;
      emitter.getEvents().forEach(key => {
        if (isChangeEventKey(key) && emitter.getEventListenerCount(key) > 0) {
          haveListeners = true;
        }
      });
      if (!haveListeners) {
        subscribedToChangeEvents = false;
      }
    }
  }

  function isChangeEventKey(event) {
    return event === changeEvent || event.substr(0, changeEvent.length + 1) === changeEvent + ':';
  }

  if (typeof options.bootstrap === 'string' && options.bootstrap.toUpperCase() === 'LOCALSTORAGE') {
    if (store) {
      useLocalStorage = true;
    } else {
      logger.warn(messages.localStorageUnavailable());
    }
  }

  if (typeof options.bootstrap === 'object') {
    // Set the flags as soon as possible before we get into any async code, so application code can read
    // them even if the ready event has not yet fired.
    flags = readFlagsFromBootstrap(options.bootstrap);
  }

  if (stateProvider) {
    // The stateProvider option is used in the Electron SDK, to allow a client instance in the main process
    // to control another client instance (i.e. this one) in the renderer process. We can't predict which
    // one will start up first, so the initial state may already be available for us or we may have to wait
    // to receive it.
    const state = stateProvider.getInitialState();
    if (state) {
      initFromStateProvider(state);
    } else {
      stateProvider.on('init', initFromStateProvider);
    }
    stateProvider.on('update', updateFromStateProvider);
  } else {
    finishInit().catch(signalFailedInit);
  }

  function finishInit() {
    if (!clientSdkKey) {
      return Promise.reject(new errors.ULInvalidEnvironmentIdError(messages.environmentNotSpecified()));
    }
    return userValidator.validateUser(user).then(realUser => {
      ident.setUser(realUser);
      if (useLocalStorage) {
        console.log("finishInitWithLocalStorage");
        return finishInitWithLocalStorage(flagKeys);
      } else if(offline){
        flags = {}
        return signalSuccessfulInit();
     } else {
       // return finishInitWithPolling();
       console.log("finishInitWithFlagsResult");
       return finishInitWithFlagsResult(flagKeys);
      }
    });
  }

  function finishInitWithLocalStorage(flagKeys) {
    return store
      .loadFlags()
      .catch(() => null) // treat an error the same as if no flags were available
      .then(storedFlags => {
        if (storedFlags === null || storedFlags === undefined) {
          flags = {};
          return requestor
            .fetchFlagsWithResult(ident.getUser(), flagKeys)
            .then(result => replaceAllFlags(result.data.flags || {}))
            .then(signalSuccessfulInit)
            .catch(err => {
              const initErr = new errors.ULFlagFetchError(messages.errorFetchingFlags(err));
              signalFailedInit(initErr);
            });
        } else {
          // We're reading the flags from local storage. Signal that we're ready,
          // then update localStorage for the next page load. We won't signal changes or update
          // the in-memory flags unless you subscribe for changes
          flags = storedFlags;
          utils.onNextTick(signalSuccessfulInit);
          return requestor
             //.fetchFlagSettings(ident.getUser(), hash)
            .fetchFlagsWithResult(ident.getUser(),flagKeys)
            .then(result => replaceAllFlags(result.data.flags))
            .catch(err => emitter.maybeReportError(err));
        }
      });
  }

  function finishInitWithFlagsResult(flagKeys) {
    return requestor
      .fetchFlagsWithResult(ident.getUser(), flagKeys)
      .then(result => {
        result.data.flags.forEach(
          flag => {
            flags[flag.flagKey] = flag;
          }
        )
        
        // Note, we don't need to call updateSettings here because local storage and change events are not relevant
        signalSuccessfulInit();
      })
      .catch(err => {
        flags = {};
        signalFailedInit(err);
      });
  }

  function initFromStateProvider(state) {
    environment = state.environment;
    ident.setUser(state.user);
    flags = { ...state.flags };
    utils.onNextTick(signalSuccessfulInit);
  }

  function updateFromStateProvider(state) {
    if (state.user) {
      ident.setUser(state.user);
    }
    if (state.flags) {
      replaceAllFlags(state.flags); // don't wait for this Promise to be resolved
    }
  }

  function signalSuccessfulInit() {
    logger.info(messages.clientInitialized());
    inited = true;
    initializationStateTracker.signalSuccess();
  }

  function signalFailedInit(err) {
    initializationStateTracker.signalFailure(err);
  }

  function start() {
    if (sendEvents) {
       events.start();
    }
  }

  function close(onDone) {
    if (closed) {
      return utils.wrapPromiseCallback(Promise.resolve(), onDone);
    }
    const finishClose = () => {
      closed = true;
      flags = {};
    };
    const p = Promise.resolve()
      .then(() => {
        if (sendEvents) {
          events.stop();
          return events.flush();
        }
      })
      .then(finishClose)
      .catch(finishClose);
    return utils.wrapPromiseCallback(p, onDone);
  }

  function getFlagsInternal() {
    // used by Electron integration
    return flags;
  }

  const client = {
    waitForInitialization: () => initializationStateTracker.getInitializationPromise(),
    waitUntilReady: () => initializationStateTracker.getReadyPromise(),
    getUser: getUser,
    variation: variation,
    variationDetail: variationDetail,
    variantConfig: variantConfig,
    on: on,
    off: off,
    flush: flush,
    allFlags: allFlags,
    close: close,
  };

  return {
    client: client, // The client object containing all public methods.
    options: options, // The validated configuration object, including all defaults.
    emitter: emitter, // The event emitter which can be used to log errors or trigger events.
    ident: ident, // The Identity object that manages the current user.
    logger: logger, // The logging abstraction.
    requestor: requestor, // The Requestor object.
    start: start, // Starts the client once the environment is ready.
    enqueueEvent: enqueueEvent, // Puts an analytics event in the queue, if event sending is enabled.
    getFlagsInternal: getFlagsInternal, // Returns flag data structure with all details.
    getEnvironmentId: () => environment, // Gets the environment ID (this may have changed since initialization, if we have a state provider)
    internalChangeEventName: internalChangeEvent, // This event is triggered whenever we have new flag state.
  };
}

export const version = VERSION;
export { createConsoleLogger };
export { errors };
export { messages };
export { utils };
