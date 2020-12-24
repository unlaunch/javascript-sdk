import * as utils from '../utils';

import { AsyncQueue, eventSink, sleepAsync, withCloseable } from 'launchdarkly-js-test-helpers';

import EventSource from './EventSource-mock';
import { respondJson } from './mockHttp';
import * as stubPlatform from './stubPlatform';
import { makeBootstrap } from './testUtils';

// These tests verify the client's optional streaming behavior. The actual implementation of
// the SSE client is provided by the platform-specific SDKs (e.g. the browser SDK uses
// EventSource, other SDKs use the js-eventsource polyfill) so these tests use only a mock
// implementation, verifying that the SDK interacts properly with the stream abstraction.

describe('ULClient streaming', () => {
  const defaultStreamBaseUrl = 'https://clientstream.launchdarkly.com';
  const envName = 'UNKNOWN_ENVIRONMENT_ID';
  const lsKey = 'ul:UNKNOWN_ENVIRONMENT_ID:' + utils.btoa('{"key":"user"}');
  const user = { key: 'user' };
  const encodedUser = 'eyJrZXkiOiJ1c2VyIn0';
  const hash = '012345789abcde';
  let platform;

  beforeEach(() => {
    platform = stubPlatform.defaults();
  });

  async function withClientAndServer(extraConfig, asyncCallback) {
    const server = platform.testing.http.newServer();
    server.byDefault(respondJson({}));
    const config = { ...extraConfig, baseUrl: server.url };
    const client = platform.testing.makeClient(envName, user, config);
    return await withCloseable(client, async () => await asyncCallback(client, server));
  }

  function makeExpectedStreamUrl(base64User, userHash, withReasons) {
    const baseUrl = defaultStreamBaseUrl + '/eval/' + envName + '/' + base64User;
    const queryParams = [];
    if (userHash) {
      queryParams.push('h=' + userHash);
    }
    if (withReasons) {
      queryParams.push('?withReasons=true');
    }
    return baseUrl + (queryParams.length ? '?' + queryParams.join('&') : '');
  }

  describe('streaming/event listening', () => {
    const fullStreamUrlWithUser = makeExpectedStreamUrl(encodedUser);

    async function expectStreamConnecting(url) {
      const stream = await platform.testing.expectStream(url);
      expect(stream.eventSource.readyState === EventSource.CONNECTING);
      return stream;
    }

    function expectNoStreamIsOpen() {
      expect(platform.testing.eventSourcesCreated.length()).toEqual(0);
    }

    it('does not connect to the stream by default', async () => {
      await withClientAndServer({}, async client => {
        await client.waitForInitialization();

        expectNoStreamIsOpen();
      });
    });

    it('connects to the stream if options.streaming is true', async () => {
      await withClientAndServer({ streaming: true }, async client => {
        await client.waitForInitialization();

        await platform.testing.expectStream(fullStreamUrlWithUser);
      });
    });

    describe('setStreaming()', () => {
      it('can connect to the stream', async () => {
        await withClientAndServer({}, async client => {
          await client.waitForInitialization();

          client.setStreaming(true);
          await expectStreamConnecting(fullStreamUrlWithUser);
        });
      });

      it('can disconnect from the stream', async () => {
        await withClientAndServer({}, async client => {
          await client.waitForInitialization();

          client.setStreaming(true);
          const stream = await expectStreamConnecting(fullStreamUrlWithUser);
          client.setStreaming(false);
          expect(stream.eventSource.readyState === EventSource.CLOSED);
        });
      });
    });

    describe('on("change")', () => {
      it('connects to the stream if not otherwise overridden', async () => {
        await withClientAndServer({}, async client => {
          await client.waitForInitialization();
          client.on('change', () => {});

          await expectStreamConnecting(fullStreamUrlWithUser);
        });
      });

      it('also connects if listening for a specific flag', async () => {
        await withClientAndServer({}, async client => {
          await client.waitForInitialization();
          client.on('change:flagkey', () => {});

          await expectStreamConnecting(fullStreamUrlWithUser);
        });
      });

      it('does not connect if some other kind of event was specified', async () => {
        await withClientAndServer({}, async client => {
          await client.waitForInitialization();
          client.on('error', () => {});

          expectNoStreamIsOpen();
        });
      });

      it('does not connect if options.streaming is explicitly set to false', async () => {
        await withClientAndServer({ streaming: false }, async client => {
          await client.waitForInitialization();
          client.on('change', () => {});

          expectNoStreamIsOpen();
        });
      });

      it('does not connect if setStreaming(false) was called', async () => {
        await withClientAndServer({}, async client => {
          await client.waitForInitialization();
          client.setStreaming(false);
          client.on('change', () => {});

          expectNoStreamIsOpen();
        });
      });
    });

    describe('off("change")', () => {
      it('disconnects from the stream if all event listeners are removed', async () => {
        await withClientAndServer({}, async client => {
          const listener1 = () => {};
          const listener2 = () => {};
          await client.waitForInitialization();

          client.on('change', listener1);
          client.on('change:flagKey', listener2);
          client.on('error', () => {});
          const stream = await expectStreamConnecting(fullStreamUrlWithUser);

          client.off('change', listener1);
          expect(stream.eventSource.readyState).toEqual(EventSource.CONNECTING);

          client.off('change:flagKey', listener2);
          expect(stream.eventSource.readyState).toEqual(EventSource.CLOSED);
        });
      });

      it('does not disconnect if setStreaming(true) was called, but still removes event listener', async () => {
        const changes1 = [];
        const changes2 = [];

        await withClientAndServer({}, async client => {
          const listener1 = allValues => changes1.push(allValues);
          const listener2 = newValue => changes2.push(newValue);
          await client.waitForInitialization();

          client.setStreaming(true);

          client.on('change', listener1);
          client.on('change:flagKey', listener2);
          const stream = await expectStreamConnecting(fullStreamUrlWithUser);

          stream.eventSource.mockEmit('put', {
            data: '{"flagKey":{"value":"a","version":1}}',
          });

          expect(changes1).toEqual([{ flagKey: { current: 'a', previous: undefined } }]);
          expect(changes2).toEqual(['a']);

          client.off('change', listener1);
          expect(stream.eventSource.readyState).toEqual(EventSource.CONNECTING);

          stream.eventSource.mockEmit('put', {
            data: '{"flagKey":{"value":"b","version":1}}',
          });

          expect(changes1).toEqual([{ flagKey: { current: 'a', previous: undefined } }]);
          expect(changes2).toEqual(['a', 'b']);

          client.off('change:flagKey', listener2);
          expect(stream.eventSource.readyState).toEqual(EventSource.CONNECTING);

          stream.eventSource.mockEmit('put', {
            data: '{"flagKey":{"value":"c","version":1}}',
          });

          expect(changes1).toEqual([{ flagKey: { current: 'a', previous: undefined } }]);
          expect(changes2).toEqual(['a', 'b']);
        });
      });
    });

    it('passes the secure mode hash in the stream URL if provided', async () => {
      await withClientAndServer({ hash }, async client => {
        await client.waitForInitialization();
        client.on('change:flagKey', () => {});

        await expectStreamConnecting(fullStreamUrlWithUser + '?h=' + hash);
      });
    });

    it('passes withReasons parameter if provided', async () => {
      await withClientAndServer({ evaluationReasons: true }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        await expectStreamConnecting(fullStreamUrlWithUser + '?withReasons=true');
      });
    });

    it('passes secure mode hash and withReasons if provided', async () => {
      await withClientAndServer({ hash, evaluationReasons: true }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        await expectStreamConnecting(fullStreamUrlWithUser + '?h=' + hash + '&withReasons=true');
      });
    });

    it('handles stream ping message by getting flags', async () => {
      await withClientAndServer({}, async (client, server) => {
        server.byDefault(respondJson({ flagKey: { value: true, version: 1 } }));
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('ping');
        await sleepAsync(20); // give response handler a chance to execute

        expect(client.variation('flagKey')).toEqual(true);
      });
    });

    it("poll request triggered by stream ping can't overwrite another user's flags", async () => {
      const otherUser = { key: 'otherUser' };
      const initUserBase64 = utils.base64URLEncode(JSON.stringify(user));
      const otherUserBase64 = utils.base64URLEncode(JSON.stringify(otherUser));

      await withClientAndServer({}, async (client, server) => {
        const reqRespQueue = new AsyncQueue();
        server.byDefault((req, resp) => {
          reqRespQueue.add({ req: req, resp: resp });
        });

        const initPromise = client.waitForInitialization();
        const poll1 = await reqRespQueue.take();
        expect(poll1.req.path).toContain(initUserBase64);
        respondJson({ flagKey: { value: 1 } })(poll1.req, poll1.resp);
        await initPromise;

        // The flag value is now 1, from the initial poll
        expect(client.variation('flagKey')).toEqual(1);

        client.setStreaming(true);
        const stream = await expectStreamConnecting(fullStreamUrlWithUser);

        stream.eventSource.mockEmit('ping');
        const poll2 = await reqRespQueue.take();
        // poll2 is the poll request that was triggered by the ping; don't respond to it yet
        expect(poll2.req.path).toContain(initUserBase64);

        const identifyPromise = client.identify(otherUser);
        const poll3 = await reqRespQueue.take();
        // poll3 is the poll request for the identify
        expect(poll3.req.path).toContain(otherUserBase64);

        // Now let's say poll3 completes first, setting the flag value to 3 for the new user
        respondJson({ flagKey: { value: 3 } })(poll3.req, poll3.resp);

        // And then poll2, which was for the previous user, completes with a flag value of 2
        respondJson({ flagKey: { value: 2 } })(poll2.req, poll2.resp);

        await identifyPromise;

        // The flag value should now be 3, not 2
        expect(client.variation('flagKey')).toEqual(3);
      });
    });

    it('handles stream put message by updating flags', async () => {
      await withClientAndServer({}, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('put', {
          data: '{"flagKey":{"value":true,"version":1}}',
        });

        expect(client.variation('flagKey')).toEqual(true);
      });
    });

    it('updates local storage for put message if using local storage', async () => {
      platform.testing.setLocalStorageImmediately(lsKey, '{"flagKey":false}');

      await withClientAndServer({ bootstrap: 'localstorage' }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('put', {
          data: '{"flagKey":{"value":true,"version":1}}',
        });

        expect(client.variation('flagKey')).toEqual(true);
        const storageData = JSON.parse(platform.testing.getLocalStorageImmediately(lsKey));
        expect(storageData).toMatchObject({ flagKey: { value: true, version: 1 } });
      });
    });

    it('fires global change event when flags are updated from put event', async () => {
      await withClientAndServer({ bootstrap: { flagKey: false } }, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('put', {
          data: '{"flagKey":{"value":true,"version":1}}',
        });

        const changes = await receivedChange.take();
        expect(changes).toEqual({
          flagKey: { current: true, previous: false },
        });
      });
    });

    it('does not fire change event if new and old values are equivalent JSON objects', async () => {
      const config = {
        bootstrap: {
          'will-change': 3,
          'wont-change': { a: 1, b: 2 },
        },
      };
      await withClientAndServer(config, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        const putData = {
          'will-change': { value: 4, version: 2 },
          'wont-change': { value: { b: 2, a: 1 }, version: 2 },
        };
        stream.eventSource.mockEmit('put', { data: JSON.stringify(putData) });

        const changes = await receivedChange.take();
        expect(changes).toEqual({
          'will-change': { current: 4, previous: 3 },
        });
      });
    });

    it('fires individual change event when flags are updated from put event', async () => {
      await withClientAndServer({ bootstrap: { flagKey: false } }, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change:flagKey');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('put', {
          data: '{"flagKey":{"value":true,"version":1}}',
        });

        const args = await receivedChange.take();
        expect(args).toEqual([true, false]);
      });
    });

    it('handles patch message by updating flag', async () => {
      await withClientAndServer({ bootstrap: { flagKey: false } }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', { data: '{"key":"flagKey","value":true,"version":1}' });

        expect(client.variation('flagKey')).toEqual(true);
      });
    });

    it('does not update flag if patch version < flag version', async () => {
      const initData = makeBootstrap({ flagKey: { value: 'a', version: 2 } });
      await withClientAndServer({ bootstrap: initData }, async client => {
        await client.waitForInitialization();

        expect(client.variation('flagKey')).toEqual('a');

        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', { data: '{"key":"flagKey","value":"b","version":1}' });

        expect(client.variation('flagKey')).toEqual('a');
      });
    });

    it('does not update flag if patch version == flag version', async () => {
      const initData = makeBootstrap({ flagKey: { value: 'a', version: 2 } });
      await withClientAndServer({ bootstrap: initData }, async client => {
        await client.waitForInitialization();

        expect(client.variation('flagKey')).toEqual('a');

        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', { data: '{"key":"flagKey","value":"b","version":2}' });

        expect(client.variation('flagKey')).toEqual('a');
      });
    });

    it('updates flag if patch has a version and flag has no version', async () => {
      const initData = makeBootstrap({ flagKey: { value: 'a' } });
      await withClientAndServer({ bootstrap: initData }, async client => {
        await client.waitForInitialization();

        expect(client.variation('flagKey')).toEqual('a');

        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', { data: '{"key":"flagKey","value":"b","version":1}' });

        expect(client.variation('flagKey')).toEqual('b');
      });
    });

    it('updates flag if flag has a version and patch has no version', async () => {
      const initData = makeBootstrap({ flagKey: { value: 'a', version: 2 } });
      await withClientAndServer({ bootstrap: initData }, async client => {
        await client.waitForInitialization();

        expect(client.variation('flagKey')).toEqual('a');

        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', { data: '{"key":"flagKey","value":"b"}' });

        expect(client.variation('flagKey')).toEqual('b');
      });
    });

    it('updates local storage for patch message if using local storage', async () => {
      platform.testing.setLocalStorageImmediately(lsKey, '{"flagKey":false}');

      await withClientAndServer({ bootstrap: 'localstorage' }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('put', {
          data: '{"flagKey":{"value":true,"version":1}}',
        });

        expect(client.variation('flagKey')).toEqual(true);
        const storageData = JSON.parse(platform.testing.getLocalStorageImmediately(lsKey));
        expect(storageData).toMatchObject({ flagKey: { value: true, version: 1 } });
      });
    });

    it('fires global change event when flag is updated from patch event', async () => {
      await withClientAndServer({ bootstrap: { flagKey: false } }, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', {
          data: '{"key":"flagKey","value":true,"version":1}',
        });

        const changes = await receivedChange.take();
        expect(changes).toEqual({
          flagKey: { current: true, previous: false },
        });
      });
    });

    it('fires individual change event when flag is updated from patch event', async () => {
      await withClientAndServer({ bootstrap: { flagKey: false } }, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change:flagKey');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', {
          data: '{"key":"flagKey","value":true,"version":1}',
        });

        const args = await receivedChange.take();
        expect(args).toEqual([true, false]);
      });
    });

    it('fires global change event when flag is newly created from patch event', async () => {
      await withClientAndServer({}, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', {
          data: '{"key":"flagKey","value":true,"version":1}',
        });

        const changes = await receivedChange.take();
        expect(changes).toEqual({
          flagKey: { current: true },
        });
      });
    });

    it('fires individual change event when flag is newly created from patch event', async () => {
      await withClientAndServer({}, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change:flagKey');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('patch', {
          data: '{"key":"flagKey","value":true,"version":1}',
        });

        const args = await receivedChange.take();
        expect(args).toEqual([true, undefined]);
      });
    });

    it('handles delete message by deleting flag', async () => {
      await withClientAndServer({ bootstrap: { flagKey: false } }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('delete', {
          data: '{"key":"flagKey","version":1}',
        });

        expect(client.variation('flagKey')).toBeUndefined();
      });
    });

    it('handles delete message for unknown flag by storing placeholder', async () => {
      await withClientAndServer({}, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('delete', {
          data: '{"key":"mystery","version":3}',
        });

        // The following patch message should be ignored because it has a lower version than the deleted placeholder
        stream.eventSource.mockEmit('patch', {
          data: '{"key":"mystery","value":"yes","version":2}',
        });

        expect(client.variation('mystery')).toBeUndefined();
      });
    });

    it('ignores delete message with lower version', async () => {
      const initData = makeBootstrap({ flagKey: { value: 'yes', version: 3 } });
      await withClientAndServer({ bootstrap: initData }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('delete', {
          data: '{"key":"flagKey","version":2}',
        });

        expect(client.variation('flagKey')).toEqual('yes');
      });
    });

    it('fires global change event when flag is deleted', async () => {
      await withClientAndServer({ bootstrap: { flagKey: true } }, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('delete', {
          data: '{"key":"flagKey","version":1}',
        });

        const changes = await receivedChange.take();
        expect(changes).toEqual({
          flagKey: { previous: true },
        });
      });
    });

    it('fires individual change event when flag is deleted', async () => {
      await withClientAndServer({ bootstrap: { flagKey: true } }, async client => {
        await client.waitForInitialization();

        const receivedChange = eventSink(client, 'change:flagKey');

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('delete', {
          data: '{"key":"flagKey","version":1}',
        });

        const args = await receivedChange.take();
        expect(args).toEqual([undefined, true]);
      });
    });

    it('updates local storage for delete message if using local storage', async () => {
      platform.testing.setLocalStorageImmediately(lsKey, '{"flagKey":false}');

      await withClientAndServer({ bootstrap: 'localstorage' }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        const stream = await expectStreamConnecting(fullStreamUrlWithUser);
        stream.eventSource.mockEmit('delete', {
          data: '{"key":"flagKey","version":1}',
        });

        expect(client.variation('flagKey')).toEqual(undefined);
        const storageData = JSON.parse(platform.testing.getLocalStorageImmediately(lsKey));
        expect(storageData).toMatchObject({ flagKey: { version: 1, deleted: true } });
      });
    });

    it('reconnects to stream if the user changes', async () => {
      const user2 = { key: 'user2' };
      const encodedUser2 = 'eyJrZXkiOiJ1c2VyMiJ9';
      await withClientAndServer({}, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        await expectStreamConnecting(makeExpectedStreamUrl(encodedUser));

        await client.identify(user2);
        await expectStreamConnecting(makeExpectedStreamUrl(encodedUser2));
      });
    });

    it('reconnects to stream with new hash value in secure mode if the user changes', async () => {
      const newUser = { key: 'user2' };
      const newEncodedUser = 'eyJrZXkiOiJ1c2VyMiJ9';
      const newHash = hash + 'xxx';

      await withClientAndServer({ hash }, async client => {
        await client.waitForInitialization();
        client.setStreaming(true);

        await expectStreamConnecting(makeExpectedStreamUrl(encodedUser, hash));

        await client.identify(newUser, newHash);
        await expectStreamConnecting(makeExpectedStreamUrl(newEncodedUser, newHash));
      });
    });
  });
});
