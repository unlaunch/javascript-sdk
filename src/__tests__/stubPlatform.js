import * as ULClient from '../index';
import EventEmitter from '../EventEmitter';

import { AsyncQueue, sleepAsync } from 'launchdarkly-js-test-helpers';

import EventSource from './EventSource-mock';
import { MockHttpState } from './mockHttp';

// This file provides a stub implementation of the internal platform API for use in tests.
//
// The SDK expects the platform object to have the following properties and methods:
//
// httpRequest?: (method, url, headers, body, sync) => requestProperties
//   requestProperties.promise: Promise     // resolves to { status, header: (name) => value, body } or rejects for a network error
//   requestProperties.cancel?: () => void  // provided if it's possible to cancel requests in this implementation
// httpAllowsPost: boolean        // true if we can do cross-origin POST requests
// httpFallbackPing?: (url) => {} // method for doing an HTTP GET without awaiting the result (i.e. browser image mechanism)
// getCurrentUrl: () => string    // returns null if we're not in a browser
// isDoNotTrack: () => boolean
// localStorage: {
//   get: (key: string, callback: (err: Error, data: string) => void) => void
//   set: (key: string, data: string, callback: (err: Error) => void) => void
//   clear: (key: string, callback: (err: Error) => void) => void
// }
// eventSourceFactory?: (url: string, options: object) => EventSource
//   // note that the options are ignored by the browser's built-in EventSource; they only work with polyfills
// eventSourceIsActive?: (es: EventSource) => boolean  // returns true if it's open or connecting
// eventSourceAllowsReport?: boolean  // returns true if we can set { method: 'REPORT' } in the options
// diagnosticSdkData: object  // provides the "sdk" property in diagnostic events
// diagnosticPlatformData: object  // provides the "platform" property in diagnostic events
// diagnosticUseCombinedEvent: boolean  // true if diagnostic events should use the combined model (browser SDK)
// userAgent: string
// version?: string  // the SDK version for the User-Agent header, if that is *not* the same as the version of launchdarkly-js-sdk-common

export function defaults() {
  const localStore = {};
  const mockHttpState = MockHttpState();
  const eventSourcesCreated = new AsyncQueue();
  let currentUrl = null;
  let doNotTrack = false;

  const p = {
    httpRequest: mockHttpState.doRequest,
    diagnosticSdkData: { name: 'stub-sdk' },
    diagnosticPlatformData: { name: 'stub-platform' },
    httpAllowsPost: () => true,
    httpAllowsSync: () => true,
    getCurrentUrl: () => currentUrl,
    isDoNotTrack: () => doNotTrack,
    eventSourceFactory: (url, options) => {
      const es = new EventSource(url);
      es.options = options;
      eventSourcesCreated.add({ eventSource: es, url, options });
      return es;
    },
    eventSourceIsActive: es => es.readyState === EventSource.OPEN || es.readyState === EventSource.CONNECTING,
    localStorage: {
      get: key =>
        new Promise(resolve => {
          resolve(localStore[key]);
        }),
      set: (key, value) =>
        new Promise(resolve => {
          localStore[key] = value;
          resolve();
        }),
      clear: key =>
        new Promise(resolve => {
          delete localStore[key];
          resolve();
        }),
    },
    userAgent: 'stubClient',
    version: '1.2.3',

    // extra methods used for testing
    testing: {
      logger: logger(),

      http: mockHttpState,

      eventSourcesCreated,

      makeClient: (env, user, options = {}) => {
        const config = { logger: p.testing.logger, ...options };
        // We want to simulate what the platform-specific SDKs will do in their own initialization functions.
        // They will call the common package's ULClient.initialize() and receive the clientVars object which
        // contains both the underlying client (in its "client" property) and some internal methods that the
        // platform-specific SDKs can use to do internal stuff. One of those is start(), which they will
        // call after doing any other initialization things they may need to do.
        const clientVars = ULClient.initialize(env, user, config, p);
        clientVars.start();
        return clientVars.client;
      },

      setCurrentUrl: url => {
        currentUrl = url;
      },

      setDoNotTrack: value => {
        doNotTrack = value;
      },

      getLocalStorageImmediately: key => localStore[key],

      setLocalStorageImmediately: (key, value) => {
        localStore[key] = value;
      },

      expectStream: async url => {
        await sleepAsync(0); // in case the stream is created by a deferred task
        expect(eventSourcesCreated.length()).toBeGreaterThanOrEqual(1);
        const created = await eventSourcesCreated.take();
        if (url) {
          expect(created.url).toEqual(url);
        }
        return created;
      },
    },
  };
  return p;
}

export function withoutHttp() {
  const e = defaults();
  delete e.httpRequest;
  return e;
}

export function logger() {
  const logger = {};
  ['debug', 'info', 'warn', 'error'].forEach(level => {
    logger[level] = msg => logger.output[level].push(typeof msg === 'function' ? msg() : msg);
  });
  logger.reset = () => {
    logger.output = { debug: [], info: [], warn: [], error: [] };
  };
  logger.reset();
  return logger;
}

export function mockStateProvider(initialState) {
  const sp = EventEmitter();
  sp.getInitialState = () => initialState;
  return sp;
}
