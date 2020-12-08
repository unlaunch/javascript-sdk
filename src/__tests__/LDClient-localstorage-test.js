import * as messages from '../messages';
import * as utils from '../utils';

import { sleepAsync, withCloseable } from 'launchdarkly-js-test-helpers';

import { respond, respondJson } from './mockHttp';
import * as stubPlatform from './stubPlatform';

// These tests cover the "bootstrap: 'localstorage'" mode. The actual implementation of local storage
// is provided by the platform-specific SDKs; we use a mock implementation here.

describe('LDClient local storage', () => {
  const envName = 'UNKNOWN_ENVIRONMENT_ID';
  const user = { key: 'user' };
  const lsKey = 'ld:' + envName + ':' + utils.btoa(JSON.stringify(user));
  let platform;

  beforeEach(() => {
    platform = stubPlatform.defaults();
  });

  async function withServer(asyncCallback) {
    const server = platform.testing.http.newServer();
    server.byDefault(respondJson({}));
    return await withCloseable(server, asyncCallback);
  }

  async function withClient(user, extraConfig, asyncCallback) {
    // We specify bootstrap: 'localstorage' for all tests in this file
    const config = { baseUrl: 'shouldnt-use-this', bootstrap: 'localstorage', sendEvents: false, ...extraConfig };
    const client = platform.testing.makeClient(envName, user, config);
    return await withCloseable(client, asyncCallback);
  }

  describe('bootstrapping from local storage', () => {
    it('does not try to use local storage if the platform says it is unavailable', async () => {
      platform.localStorage = null;

      await withServer(async server => {
        await withClient(user, { baseUrl: server.url }, async client => {
          await client.waitForInitialization();

          // should see a flag request to the server right away, as if bootstrap was not specified
          expect(server.requests.length()).toEqual(1);

          expect(platform.testing.logger.output.warn).toEqual([messages.localStorageUnavailable()]);
        });
      });
    });

    it('uses cached flags if available and requests flags from server after ready', async () => {
      const json = '{"flag-key": 1}';
      platform.testing.setLocalStorageImmediately(lsKey, json);

      await withServer(async server => {
        // This no-op request handler means that the flags request will simply hang with no
        // response, so we can be sure that we're seeing only the initial flags from local storage.
        server.byDefault(() => {});

        await withClient(user, { baseUrl: server.url }, async client => {
          await client.waitForInitialization();

          expect(client.variation('flag-key')).toEqual(1);

          await sleepAsync(0); // allow any pending async tasks to complete

          expect(server.requests.length()).toEqual(1);
        });
      });
    });

    it('starts with empty flags and requests them from server if there are no cached flags', async () => {
      const flags = { 'flag-key': { value: 1 } };

      await withServer(async server => {
        server.byDefault(respondJson(flags));
        await withClient(user, { baseUrl: server.url }, async client => {
          // don't wait for ready event - verifying that variation() doesn't throw an error if called before ready
          expect(client.variation('flag-key', 0)).toEqual(0);

          // verify that the flags get requested from LD
          await client.waitForInitialization();
          expect(client.variation('flag-key')).toEqual(1);
        });
      });
    });

    it('should handle localStorage.get returning an error', async () => {
      platform.localStorage.get = () => Promise.reject(new Error());
      const flags = { 'enable-foo': { value: true } };

      await withServer(async server => {
        server.byDefault(respondJson(flags));
        await withClient(user, { baseUrl: server.url }, async client => {
          await client.waitForInitialization();
          expect(platform.testing.logger.output.warn).toEqual([messages.localStorageUnavailable()]);
        });
      });
    });

    it('should handle localStorage.set returning an error', async () => {
      platform.localStorage.set = () => Promise.reject(new Error());
      const flags = { 'enable-foo': { value: true } };

      await withServer(async server => {
        server.byDefault(respondJson(flags));
        await withClient(user, { baseUrl: server.url }, async client => {
          await client.waitForInitialization();

          await sleepAsync(0); // allow any pending async tasks to complete

          expect(platform.testing.logger.output.warn).toEqual([messages.localStorageUnavailable()]);
        });
      });
    });

    it('should not update cached settings if there was an error fetching flags', async () => {
      const json = '{"enable-foo": true}';
      platform.testing.setLocalStorageImmediately(lsKey, json);

      await withServer(async server => {
        server.byDefault(respond(503));
        await withClient(user, { baseUrl: server.url }, async client => {
          await client.waitForInitialization();

          await sleepAsync(0); // allow any pending async tasks to complete

          const value = platform.testing.getLocalStorageImmediately(lsKey);
          expect(value).toEqual(json);
        });
      });
    });

    it('should use hash as localStorage key when secure mode is enabled', async () => {
      const hash = 'totallyLegitHash';
      const lsKeyHash = 'ld:UNKNOWN_ENVIRONMENT_ID:' + hash;
      const flags = { 'enable-foo': { value: true } };

      await withServer(async server => {
        server.byDefault(respondJson(flags));
        await withClient(user, { baseUrl: server.url, hash }, async client => {
          await client.waitForInitialization();
          const value = platform.testing.getLocalStorageImmediately(lsKeyHash);
          expect(JSON.parse(value)).toEqual({
            $schema: 1,
            'enable-foo': { value: true },
          });
        });
      });
    });

    it('should clear localStorage when user context is changed', async () => {
      const lsKey2 = 'ld:UNKNOWN_ENVIRONMENT_ID:' + utils.btoa('{"key":"user2"}');
      const flags = { 'enable-foo': { value: true } };
      const user2 = { key: 'user2' };

      await withServer(async server => {
        server.byDefault(respondJson(flags));
        await withClient(user, { baseUrl: server.url }, async client => {
          await client.waitForInitialization();

          await sleepAsync(0); // allow any pending async tasks to complete

          await client.identify(user2);

          const value1 = platform.testing.getLocalStorageImmediately(lsKey);
          expect(value1).not.toEqual(expect.anything());
          const value2 = platform.testing.getLocalStorageImmediately(lsKey2);
          expect(JSON.parse(value2)).toEqual({
            $schema: 1,
            'enable-foo': { value: true },
          });
        });
      });
    });
  });
});
