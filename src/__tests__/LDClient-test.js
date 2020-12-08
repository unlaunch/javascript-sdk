import * as LDClient from '../index';
import * as messages from '../messages';
import * as utils from '../utils';

import semverCompare from 'semver-compare';
import { eventSink, promisifySingle, sleepAsync, withCloseable, AsyncQueue } from 'launchdarkly-js-test-helpers';

import { respond, respondJson } from './mockHttp';
import * as stubPlatform from './stubPlatform';
import { makeBootstrap, numericUser, stringifiedNumericUser } from './testUtils';

describe('LDClient', () => {
  const envName = 'UNKNOWN_ENVIRONMENT_ID';
  const user = { key: 'user' };
  let platform;

  beforeEach(() => {
    platform = stubPlatform.defaults();
  });

  async function withServers(asyncCallback) {
    const pollServer = platform.testing.http.newServer();
    const eventsServer = platform.testing.http.newServer();
    pollServer.byDefault(respondJson({}));
    eventsServer.byDefault(respond(202));
    const baseConfig = { baseUrl: pollServer.url, eventsUrl: eventsServer.url };
    return await asyncCallback(baseConfig, pollServer, eventsServer);
  }

  async function withClient(user, extraConfig, asyncCallback) {
    const client = platform.testing.makeClient(envName, user, { diagnosticOptOut: true, ...extraConfig });
    return await withCloseable(client, asyncCallback);
  }

  async function withDiagnosticsEnabledClient(user, extraConfig, asyncCallback) {
    const client = platform.testing.makeClient(envName, user, { ...extraConfig });
    return await withCloseable(client, asyncCallback);
  }

  it('should exist', () => {
    expect(LDClient).toBeDefined();
  });

  describe('initialization', () => {
    it('triggers "ready" event', async () => {
      await withServers(async baseConfig => {
        await withClient(user, baseConfig, async client => {
          const gotReady = eventSink(client, 'ready');
          await gotReady.take();

          expect(platform.testing.logger.output.info).toEqual([messages.clientInitialized()]);
        });
      });
    });

    it('triggers "initialized" event', async () => {
      await withServers(async baseConfig => {
        await withClient(user, baseConfig, async client => {
          const gotInited = eventSink(client, 'initialized');
          await gotInited.take();
        });
      });
    });

    it('resolves waitForInitialization promise', async () => {
      await withServers(async baseConfig => {
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();
        });
      });
    });

    it('resolves waitUntilReady promise', async () => {
      await withServers(async baseConfig => {
        await withClient(user, baseConfig, async client => {
          await client.waitUntilReady();
        });
      });
    });

    it('fetches flag settings if bootstrap is not provided (without reasons)', async () => {
      const flags = { flagKey: { value: true } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          const req = await pollServer.nextRequest();
          expect(req.path).toMatch(/sdk\/eval/);
          expect(req.path).not.toMatch(/withReasons=true/);
        });
      });
    });

    it('fetches flag settings if bootstrap is not provided (with reasons)', async () => {
      const flags = { flagKey: { value: true, variation: 1, reason: { kind: 'OFF' } } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, { ...baseConfig, evaluationReasons: true }, async client => {
          await client.waitForInitialization();

          const req = await pollServer.nextRequest();
          expect(req.path).toMatch(/sdk\/eval/);
          expect(req.path).toMatch(/withReasons=true/);
        });
      });
    });

    it('should contain package version', () => {
      const version = LDClient.version;
      // All client bundles above 1.0.7 should contain package version
      const result = semverCompare(version, '1.0.6');
      expect(result).toEqual(1);
    });

    async function verifyCustomHeader(sendLDHeaders, shouldGetHeaders) {
      await withServers(async (baseConfig, pollServer) => {
        await withClient(user, { ...baseConfig, sendLDHeaders }, async client => {
          await client.waitForInitialization();
          const request = await pollServer.nextRequest();
          expect(request.headers['x-launchdarkly-user-agent']).toEqual(
            shouldGetHeaders ? utils.getLDUserAgentString(platform) : undefined
          );
        });
      });
    }

    it('sends custom header by default', () => verifyCustomHeader(undefined, true));

    it('sends custom header if sendLDHeaders is true', () => verifyCustomHeader(true, true));

    it('does not send custom header if sendLDHeaders is false', () => verifyCustomHeader(undefined, true));

    it('sanitizes the user', async () => {
      await withServers(async baseConfig => {
        await withClient(numericUser, baseConfig, async client => {
          await client.waitForInitialization();
          expect(client.getUser()).toEqual(stringifiedNumericUser);
        });
      });
    });

    it('provides a persistent key for an anonymous user with no key', async () => {
      const anonUser = { anonymous: true, country: 'US' };
      await withServers(async baseConfig => {
        let generatedUser;
        await withClient(anonUser, baseConfig, async client0 => {
          await client0.waitForInitialization();

          generatedUser = client0.getUser();
          expect(generatedUser.key).toEqual(expect.anything());
          expect(generatedUser).toMatchObject(anonUser);
        });
        await withClient(anonUser, baseConfig, async client1 => {
          await client1.waitForInitialization();

          const newUser1 = client1.getUser();
          expect(newUser1).toEqual(generatedUser);
        });
      });
    });

    it('provides a key for an anonymous user with no key, even if local storage is unavailable', async () => {
      platform.localStorage = null;
      const anonUser = { anonymous: true, country: 'US' };

      await withServers(async baseConfig => {
        let generatedUser;
        await withClient(anonUser, baseConfig, async client0 => {
          await client0.waitForInitialization();

          generatedUser = client0.getUser();
          expect(generatedUser.key).toEqual(expect.anything());
          expect(generatedUser).toMatchObject(anonUser);
        });
        await sleepAsync(100); // so that the time-based UUID algorithm will produce a different result below
        await withClient(anonUser, baseConfig, async client1 => {
          await client1.waitForInitialization();

          const newUser1 = client1.getUser();
          expect(newUser1.key).toEqual(expect.anything());
          expect(newUser1.key).not.toEqual(generatedUser.key);
          expect(newUser1).toMatchObject(anonUser);
        });
      });
    });
  });

  describe('failed initialization', () => {
    function doErrorTests(expectedMessage, doWithClientAsyncFn) {
      async function runTest(asyncTest) {
        try {
          await doWithClientAsyncFn(asyncTest);
        } finally {
          // sleep briefly so any unhandled promise rejections will show up in this test, instead of
          // in a later test
          await sleepAsync(2);
        }
      }

      it('rejects waitForInitialization promise', async () => {
        await runTest(async client => {
          await expect(client.waitForInitialization()).rejects.toThrow();
        });
      });

      it('resolves waitUntilReady promise', async () => {
        await runTest(async client => {
          await client.waitUntilReady();
        });
      });

      it('emits "error" event', async () => {
        await runTest(async client => {
          const gotError = eventSink(client, 'error');
          const err = await gotError.take();
          expect(err.message).toEqual(expectedMessage);
        });
      });

      it('emits "failed" event', async () => {
        await runTest(async client => {
          const gotFailed = eventSink(client, 'failed');
          const err = await gotFailed.take();
          expect(err.message).toEqual(expectedMessage);
        });
      });

      it('emits "ready" event', async () => {
        await runTest(async client => {
          const gotReady = eventSink(client, 'ready');
          await gotReady.take();
        });
      });

      it('returns default values', async () => {
        await runTest(async client => {
          await client.waitUntilReady();
          expect(client.variation('flag-key', 1)).toEqual(1);
        });
      });
    }

    describe('environment key not specified', () => {
      doErrorTests(
        messages.environmentNotSpecified(),
        async callback => await withCloseable(platform.testing.makeClient('', user), callback)
      );
    });

    describe('invalid environment key (404 error)', () => {
      doErrorTests(messages.environmentNotFound(), async callback => {
        await withServers(async (baseConfig, pollServer) => {
          pollServer.byDefault(respond(404));
          await withClient(user, baseConfig, callback);
        });
      });
    });

    describe('HTTP error other than 404 on initial poll', () => {
      doErrorTests(messages.errorFetchingFlags(503), async callback => {
        await withServers(async (baseConfig, pollServer) => {
          pollServer.byDefault(respond(503));
          await withClient(user, baseConfig, callback);
        });
      });
    });
  });

  describe('initialization with bootstrap object', () => {
    it('should not fetch flag settings', async () => {
      await withServers(async (baseConfig, pollServer) => {
        await withClient(user, { ...baseConfig, bootstrap: {} }, async client => {
          await client.waitForInitialization();

          expect(pollServer.requests.length()).toEqual(0);
        });
      });
    });

    it('makes flags available immediately before ready event', async () => {
      await withServers(async baseConfig => {
        const initData = makeBootstrap({ foo: { value: 'bar', version: 1 } });
        await withClient(user, { ...baseConfig, bootstrap: initData }, async client => {
          expect(client.variation('foo')).toEqual('bar');
        });
      });
    });

    it('logs warning when bootstrap object uses old format', async () => {
      const initData = { foo: 'bar' };
      await withClient(user, { bootstrap: initData, sendEvents: false }, async client => {
        await client.waitForInitialization();

        expect(platform.testing.logger.output.warn).toEqual([messages.bootstrapOldFormat()]);
      });
    });

    it('does not log warning when bootstrap object uses new format', async () => {
      const initData = makeBootstrap({ foo: { value: 'bar', version: 1 } });
      await withClient(user, { bootstrap: initData, sendEvents: false }, async client => {
        await client.waitForInitialization();

        expect(platform.testing.logger.output.warn).toEqual([]);
        expect(client.variation('foo')).toEqual('bar');
      });
    });
  });

  describe('variation', () => {
    it('returns value for an existing flag - from bootstrap', async () => {
      const config = {
        bootstrap: makeBootstrap({ foo: { value: 'bar', version: 1 } }),
        sendEvents: false,
      };
      await withClient(user, config, async client => {
        await client.waitForInitialization();

        expect(client.variation('foo')).toEqual('bar');
      });
    });

    it('returns value for an existing flag - from bootstrap with old format', async () => {
      const config = {
        bootstrap: makeBootstrap({ foo: { value: 'bar', version: 1 } }),
        sendEvents: false,
      };
      await withClient(user, config, async client => {
        await client.waitForInitialization();

        expect(client.variation('foo')).toEqual('bar');
      });
    });

    it('returns value for an existing flag - from polling', async () => {
      const flags = { 'enable-foo': { value: true, version: 1, variation: 2 } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variation('enable-foo', 1)).toEqual(true);
        });
      });
    });

    it('returns default value for flag that had null value', async () => {
      const flags = { 'enable-foo': { value: null, version: 1, variation: 2 } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variation('foo', 'default')).toEqual('default');
        });
      });
    });

    it('returns default value for unknown flag', async () => {
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson({}));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variation('foo', 'default')).toEqual('default');
        });
      });
    });
  });

  describe('variationDetail', () => {
    const reason = { kind: 'FALLTHROUGH' };
    it('returns details for an existing flag - from bootstrap', async () => {
      const config = {
        bootstrap: makeBootstrap({ foo: { value: 'bar', version: 1, variation: 2, reason: reason } }),
      };
      await withClient(user, config, async client => {
        await client.waitForInitialization();

        expect(client.variationDetail('foo')).toEqual({ value: 'bar', variationIndex: 2, reason: reason });
      });
    });

    it('returns details for an existing flag - from bootstrap with old format', async () => {
      const config = { bootstrap: { foo: 'bar' } };
      await withClient(user, config, async client => {
        await client.waitForInitialization();

        expect(client.variationDetail('foo')).toEqual({ value: 'bar', variationIndex: null, reason: null });
      });
    });

    it('returns details for an existing flag - from polling', async () => {
      const flags = { foo: { value: 'bar', version: 1, variation: 2, reason: reason } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variationDetail('foo', 'default')).toEqual({ value: 'bar', variationIndex: 2, reason: reason });
        });
      });
    });

    it('returns default value for flag that had null value', async () => {
      const flags = { foo: { value: null, version: 1 } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variationDetail('foo', 'default')).toEqual({
            value: 'default',
            variationIndex: null,
            reason: null,
          });
        });
      });
    });

    it('returns default value and error for unknown flag', async () => {
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson({}));
        await withClient(user, baseConfig, async client => {
          expect(client.variationDetail('foo', 'default')).toEqual({
            value: 'default',
            variationIndex: null,
            reason: { kind: 'ERROR', errorKind: 'FLAG_NOT_FOUND' },
          });
        });
      });
    });
  });

  describe('allFlags', () => {
    it('returns flag values', async () => {
      const flags = { key1: { value: 'value1' }, key2: { value: 'value2' } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.allFlags()).toEqual({ key1: 'value1', key2: 'value2' });
        });
      });
    });

    it('returns empty map if client is not initialized', async () => {
      const flags = { key1: { value: 'value1' }, key2: { value: 'value2' } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags));
        await withClient(user, baseConfig, async client => {
          expect(client.allFlags()).toEqual({});
        });
      });
    });
  });

  describe('identify', () => {
    it('does not set user until the flag config has been updated', async () => {
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson({}));
        await withClient(user, baseConfig, async client => {
          const signal = new AsyncQueue();
          const user2 = { key: 'user2' };
          await client.waitForInitialization();

          // Make the server wait until signaled to return the next response
          pollServer.byDefault((req, res) => {
            signal.take().then(() => {
              respondJson({})(req, res);
            });
          });

          const identifyPromise = client.identify(user2);
          await sleepAsync(100); // sleep to jump some async ticks
          expect(client.getUser()).toEqual(user);

          signal.add();
          await identifyPromise;

          expect(client.getUser()).toEqual(user2);
        });
      });
    });

    it('updates flag values when the user changes', async () => {
      const flags0 = { 'enable-foo': { value: false } };
      const flags1 = { 'enable-foo': { value: true } };
      const user1 = { key: 'user1' };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags0));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variation('enable-foo')).toBe(false);

          pollServer.byDefault(respondJson(flags1));

          const newFlagsMap = await client.identify(user1);

          expect(client.variation('enable-foo')).toBe(true);

          expect(newFlagsMap).toEqual({ 'enable-foo': true });
        });
      });
    });

    it('returns an error and does not update flags when identify is called with invalid user', async () => {
      const flags0 = { 'enable-foo': { value: false } };
      const flags1 = { 'enable-foo': { value: true } };
      await withServers(async (baseConfig, pollServer) => {
        pollServer.byDefault(respondJson(flags0));
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          expect(client.variation('enable-foo')).toBe(false);
          expect(pollServer.requests.length()).toEqual(1);

          pollServer.byDefault(respondJson(flags1));

          await expect(client.identify(null)).rejects.toThrow();

          expect(client.variation('enable-foo')).toBe(false);
          expect(pollServer.requests.length()).toEqual(1);

          const userWithNoKey = { country: 'US' };
          await expect(client.identify(userWithNoKey)).rejects.toThrow();

          expect(client.variation('enable-foo')).toBe(false);
          expect(pollServer.requests.length()).toEqual(1);
        });
      });
    });

    it('provides a persistent key for an anonymous user with no key', async () => {
      await withServers(async baseConfig => {
        await withClient(user, baseConfig, async client => {
          await client.waitForInitialization();

          const anonUser = { anonymous: true, country: 'US' };
          await client.identify(anonUser);

          const newUser = client.getUser();
          expect(newUser.key).toEqual(expect.anything());
          expect(newUser).toMatchObject(anonUser);
        });
      });
    });
  });

  describe('initializing with stateProvider', () => {
    it('immediately uses initial state if available, and does not make an HTTP request', async () => {
      const user = { key: 'user' };
      const state = {
        environment: 'env',
        user: user,
        flags: { flagkey: { value: 'value' } },
      };
      const sp = stubPlatform.mockStateProvider(state);

      await withServers(async (baseConfig, pollServer) => {
        await withClient(null, { ...baseConfig, stateProvider: sp }, async client => {
          await client.waitForInitialization();

          expect(client.variation('flagkey')).toEqual('value');
          expect(pollServer.requests.length()).toEqual(0);
        });
      });
    });

    it('defers initialization if initial state not available, and does not make an HTTP request', async () => {
      const sp = stubPlatform.mockStateProvider(null);

      await withServers(async (baseConfig, pollServer) => {
        await withClient(null, { ...baseConfig, stateProvider: sp }, async () => {
          expect(pollServer.requests.length()).toEqual(0);
        });
      });
    });

    it('finishes initialization on receiving init event', async () => {
      const user = { key: 'user' };
      const state = {
        environment: 'env',
        user: user,
        flags: { flagkey: { value: 'value' } },
      };
      const sp = stubPlatform.mockStateProvider(null);

      await withClient(null, { stateProvider: sp, sendEvents: false }, async client => {
        sp.emit('init', state);

        await client.waitForInitialization();
        expect(client.variation('flagkey')).toEqual('value');
      });
    });

    it('updates flags on receiving update event', async () => {
      const user = { key: 'user' };
      const state0 = {
        environment: 'env',
        user: user,
        flags: { flagkey: { value: 'value0' } },
      };
      const sp = stubPlatform.mockStateProvider(state0);

      await withClient(null, { stateProvider: sp, sendEvents: false }, async client => {
        await client.waitForInitialization();

        expect(client.variation('flagkey')).toEqual('value0');

        const state1 = {
          flags: { flagkey: { value: 'value1' } },
        };

        const gotChange = eventSink(client, 'change:flagkey');

        sp.emit('update', state1);

        const args = await gotChange.take();
        expect(args).toEqual(['value1', 'value0']);
      });
    });

    it('disables identify()', async () => {
      const user = { key: 'user' };
      const user1 = { key: 'user1' };
      const state = { environment: 'env', user: user, flags: { flagkey: { value: 'value' } } };
      const sp = stubPlatform.mockStateProvider(state);

      await withServers(async (baseConfig, pollServer) => {
        await withClient(null, { ...baseConfig, stateProvider: sp }, async client => {
          sp.emit('init', state);

          await client.waitForInitialization();
          const newFlags = await client.identify(user1);

          expect(newFlags).toEqual({ flagkey: 'value' });
          expect(pollServer.requests.length()).toEqual(0);
          expect(platform.testing.logger.output.warn).toEqual([messages.identifyDisabled()]);
        });
      });
    });

    it('copies data from state provider to avoid unintentional object-sharing', async () => {
      const user = { key: 'user' };
      const state = {
        environment: 'env',
        user: user,
        flags: { flagkey: { value: 'value' } },
      };
      const sp = stubPlatform.mockStateProvider(null);

      await withClient(null, { stateProvider: sp, sendEvents: false }, async client => {
        sp.emit('init', state);

        await client.waitForInitialization();
        expect(client.variation('flagkey')).toEqual('value');

        state.flags.flagkey = { value: 'secondValue' };
        expect(client.variation('flagkey')).toEqual('value');

        sp.emit('update', state);
        expect(client.variation('flagkey')).toEqual('secondValue');

        state.flags.flagkey = { value: 'thirdValue' };
        expect(client.variation('flagkey')).toEqual('secondValue');
      });
    });
  });

  describe('close()', () => {
    it('flushes events', async () => {
      await withServers(async (baseConfig, pollServer, eventsServer) => {
        await withClient(user, { ...baseConfig, flushInterval: 100000 }, async client => {
          await client.waitForInitialization();
        });

        expect(eventsServer.requests.length()).toEqual(1);
        const req = await eventsServer.nextRequest();
        const data = JSON.parse(req.body);
        expect(data.length).toEqual(1);
        expect(data[0].kind).toEqual('identify');
      });
    });

    it('does nothing if called twice', async () => {
      await withServers(async (baseConfig, pollServer, eventsServer) => {
        await withClient(user, { ...baseConfig, flushInterval: 100000 }, async client => {
          await client.waitForInitialization();

          await client.close();

          expect(eventsServer.requests.length()).toEqual(1);

          await client.close();

          expect(eventsServer.requests.length()).toEqual(1);
        });
      });
    });

    it('is not rejected if flush fails', async () => {
      await withServers(async (baseConfig, pollServer, eventsServer) => {
        eventsServer.byDefault(respond(404));
        await withClient(user, { ...baseConfig, flushInterval: 100000 }, async client => {
          await client.waitForInitialization();

          await client.close(); // shouldn't throw or have an unhandled rejection
        });
      });
    });

    it('can take a callback instead of returning a promise', async () => {
      await withServers(async (baseConfig, pollServer, eventsServer) => {
        await withClient(user, { ...baseConfig }, async client => {
          await client.waitForInitialization();

          await promisifySingle(client.close)();

          expect(eventsServer.requests.length()).toEqual(1);
        });
      });
    });
  });

  describe('diagnostic events', () => {
    // Note, the default configuration provided by withClient() sets { diagnosticOptOut: true } so that the
    // diagnostic events won't interfere with the rest of the tests in this file. In this test group, we will
    // deliberately enable diagnostic events. The details of DiagnosticManager's behavior are covered by
    // diagnosticEvents-test.js, so here we're just verifying that the client starts up the DiagnosticsManager
    // and gives it the right eventsUrl.

    it('sends diagnostic init event if not opted out', async () => {
      await withServers(async (baseConfig, pollServer, eventsServer) => {
        await withDiagnosticsEnabledClient(user, baseConfig, async client => {
          await client.waitForInitialization();
          await client.flush();

          // We can't be sure which will be posted first, the regular events or the diagnostic event
          const requests = [];
          const req1 = await eventsServer.requests.take();
          requests.push({ path: req1.path, data: JSON.parse(req1.body) });
          const req2 = await eventsServer.requests.take();
          requests.push({ path: req2.path, data: JSON.parse(req2.body) });

          expect(requests).toContainEqual({
            path: '/events/bulk/' + envName,
            data: expect.arrayContaining([expect.objectContaining({ kind: 'identify' })]),
          });

          expect(requests).toContainEqual({
            path: '/events/diagnostic/' + envName,
            data: expect.objectContaining({ kind: 'diagnostic-init' }),
          });
        });
      });
    });
  });
});
