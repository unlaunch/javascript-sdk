const uuidv1 = require('uuid/v1');
// Note that in the diagnostic events spec, these IDs are to be generated with UUID v4. However,
// in JS we were already using v1 for unique user keys, so to avoid bringing in two packages we
// will use v1 here as well.

const { baseOptionDefs } = require('./configuration');
const messages = require('./messages');

function DiagnosticId(sdkKey) {
  const ret = {
    diagnosticId: uuidv1(),
  };
  if (sdkKey) {
    ret.sdkKeySuffix = sdkKey.length > 6 ? sdkKey.substring(sdkKey.length - 6) : sdkKey;
  }
  return ret;
}

// A stateful object holding statistics that will go into diagnostic events.

function DiagnosticsAccumulator(startTime) {
  let dataSinceDate, droppedEvents, eventsInLastBatch, streamInits;

  function reset(time) {
    dataSinceDate = time;
    droppedEvents = 0;
    eventsInLastBatch = 0;
    streamInits = [];
  }

  reset(startTime);

  return {
    getProps: () => ({
      dataSinceDate,
      droppedEvents,
      eventsInLastBatch,
      streamInits,
      // omit deduplicatedUsers for the JS SDKs because they don't deduplicate users
    }),
    setProps: props => {
      dataSinceDate = props.dataSinceDate;
      droppedEvents = props.droppedEvents || 0;
      eventsInLastBatch = props.eventsInLastBatch || 0;
      streamInits = props.streamInits || [];
    },
    incrementDroppedEvents: () => {
      droppedEvents++;
    },
    setEventsInLastBatch: n => {
      eventsInLastBatch = n;
    },
    recordStreamInit: (timestamp, failed, durationMillis) => {
      const info = { timestamp, failed, durationMillis };
      streamInits.push(info);
    },
    reset,
  };
}

// An object that maintains information that will go into diagnostic events, and knows how to format
// those events. It is instantiated by the SDK client, and shared with the event processor.
//
// The JS-based SDKs have two modes for diagnostic events. By default, the behavior is basically the
// same as the server-side SDKs: a "diagnostic-init" event is sent on startup, and then "diagnostic"
// events with operating statistics are sent periodically. However, in a browser environment this is
// undesirable because the page may be reloaded frequently. In that case, setting the property
// "platform.diagnosticUseCombinedEvent" to true enables an alternate mode in which a combination of
// both kinds of event is sent at intervals, relative to the last time this was done (if any) which
// is cached in local storage.

function DiagnosticsManager(platform, accumulator, eventSender, environmentId, config, diagnosticId) {
  const combinedMode = !!platform.diagnosticUseCombinedEvent;
  const localStorageKey = 'ul:' + environmentId + ':$diagnostics';
  const diagnosticEventsUrl = config.eventsUrl + '/events/diagnostic/' + environmentId;
  const periodicInterval = config.diagnosticRecordingInterval;
  const acc = accumulator;
  const initialEventSamplingInterval = 4; // used only in combined mode - see start()
  let streamingEnabled = !!config.streaming;
  let eventSentTime;
  let periodicTimer;
  const manager = {};

  function makeInitProperties() {
    return {
      sdk: makeSdkData(),
      configuration: makeConfigData(),
      platform: platform.diagnosticPlatformData,
    };
  }

  // Send a diagnostic event and do not wait for completion.
  function sendDiagnosticEvent(event) {
    config.logger && config.logger.debug(messages.debugPostingDiagnosticEvent(event));
    eventSender
      .sendEvents(event, diagnosticEventsUrl, true)
      .then(() => undefined)
      .catch(() => undefined);
  }

  function loadProperties(callback) {
    if (!platform.localStorage) {
      return callback(false); // false indicates that local storage is not available
    }
    platform.localStorage
      .get(localStorageKey)
      .then(data => {
        if (data) {
          try {
            const props = JSON.parse(data);
            acc.setProps(props);
            eventSentTime = props.dataSinceDate;
          } catch (e) {
            // disregard malformed cached data
          }
        }
        callback(true);
      })
      .catch(() => {
        callback(false);
      });
  }

  function saveProperties() {
    if (platform.localStorage) {
      const props = { ...acc.getProps() };
      platform.localStorage.set(localStorageKey, JSON.stringify(props), () => {});
    }
  }

  // Creates the initial event that is sent by the event processor when the SDK starts up. This will not
  // be repeated during the lifetime of the SDK client. In combined mode, we don't send this.
  function createInitEvent() {
    return {
      kind: 'diagnostic-init',
      id: diagnosticId,
      creationDate: acc.getProps().dataSinceDate,
      ...makeInitProperties(),
    };
  }

  // Creates a periodic event containing time-dependent stats, and resets the state of the manager with
  // regard to those stats. In combined mode (browser SDK) this also contains the configuration data.
  function createPeriodicEventAndReset() {
    const currentTime = new Date().getTime();
    let ret = {
      kind: combinedMode ? 'diagnostic-combined' : 'diagnostic',
      id: diagnosticId,
      creationDate: currentTime,
      ...acc.getProps(),
    };
    if (combinedMode) {
      ret = { ...ret, ...makeInitProperties() };
    }
    acc.reset(currentTime);
    return ret;
  }

  function sendPeriodicEvent() {
    sendDiagnosticEvent(createPeriodicEventAndReset());
    periodicTimer = setTimeout(sendPeriodicEvent, periodicInterval);
    eventSentTime = new Date().getTime();
    if (combinedMode) {
      saveProperties();
    }
  }

  function makeSdkData() {
    const sdkData = { ...platform.diagnosticSdkData };
    if (config.wrapperName) {
      sdkData.wrapperName = config.wrapperName;
    }
    if (config.wrapperVersion) {
      sdkData.wrapperVersion = config.wrapperVersion;
    }
    return sdkData;
  }

  function makeConfigData() {
    const configData = {
      customBaseURI: config.baseUrl !== baseOptionDefs.baseUrl.default,
      customStreamURI: config.streamUrl !== baseOptionDefs.streamUrl.default,
      customEventsURI: config.eventsUrl !== baseOptionDefs.eventsUrl.default,
      eventsCapacity: config.eventCapacity,
      eventsFlushIntervalMillis: config.flushInterval,
      reconnectTimeMillis: config.streamReconnectDelay,
      streamingDisabled: !streamingEnabled,
      allAttributesPrivate: !!config.allAttributesPrivate,
      inlineUsersInEvents: !!config.inlineUsersInEvents,
      diagnosticRecordingIntervalMillis: config.diagnosticRecordingInterval,
      // The following extra properties are only provided by client-side JS SDKs:
      usingSecureMode: !!config.hash,
      bootstrapMode: !!config.bootstrap,
      fetchGoalsDisabled: !config.fetchGoals,
      allowFrequentDuplicateEvents: !!config.allowFrequentDuplicateEvents,
      sendEventsOnlyForVariation: !!config.sendEventsOnlyForVariation,
    };
    // Client-side JS SDKs do not have the following properties which other SDKs have:
    // connectTimeoutMillis
    // pollingIntervalMillis
    // samplingInterval
    // socketTimeoutMillis
    // startWaitMillis
    // userKeysCapacity
    // userKeysFlushIntervalMillis
    // usingProxy
    // usingProxyAuthenticator
    // usingRelayDaemon

    return configData;
  }

  // Called when the SDK is starting up. Either send an init event immediately, or, in the alternate
  // mode, check for cached local storage properties and send an event only if we haven't done so
  // recently.
  manager.start = () => {
    if (combinedMode) {
      loadProperties(localStorageAvailable => {
        if (localStorageAvailable) {
          const nextEventTime = (eventSentTime || 0) + periodicInterval;
          const timeNow = new Date().getTime();
          if (timeNow >= nextEventTime) {
            sendPeriodicEvent();
          } else {
            periodicTimer = setTimeout(sendPeriodicEvent, nextEventTime - timeNow);
          }
        } else {
          // We don't have the ability to cache anything in local storage, so we don't know if we
          // recently sent an event before this page load, but we would still prefer not to send one
          // on *every* page load. So, as a rough heuristic, we'll decide semi-randomly.
          if (Math.floor(Math.random() * initialEventSamplingInterval) === 0) {
            sendPeriodicEvent();
          } else {
            periodicTimer = setTimeout(sendPeriodicEvent, periodicInterval);
          }
        }
      });
    } else {
      sendDiagnosticEvent(createInitEvent());
      periodicTimer = setTimeout(sendPeriodicEvent, periodicInterval);
    }
  };

  manager.stop = () => {
    periodicTimer && clearTimeout(periodicTimer);
  };

  // Called when streaming mode is turned on or off dynamically.
  manager.setStreaming = enabled => {
    streamingEnabled = enabled;
  };

  return manager;
}

module.exports = {
  DiagnosticId,
  DiagnosticsAccumulator,
  DiagnosticsManager,
};
