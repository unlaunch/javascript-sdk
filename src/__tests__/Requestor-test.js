/*import Requestor from '../Requestor';
import * as errors from '../errors';
import * as messages from '../messages';
import * as utils from '../utils';

import { fakeNetworkErrorValue, networkError, respond, respondJson } from './mockHttp';
import * as stubPlatform from './stubPlatform';

// These tests verify that Requestor executes the expected HTTP requests to retrieve flags. Since
// the js-sdk-common package uses an abstraction of HTTP requests, these tests do not use HTTP but
// rather use a test implementation of our HTTP abstraction; the individual platform-specific SDKs
// are responsible for verifying that their own implementations of the same HTTP abstraction work
// correctly with real networking.

describe('Requestor', () => {
  const user = { key: 'foo' };
  const encodedUser = 'eyJrZXkiOiJmb28ifQ';
  const env = 'FAKE_ENV';
  const platform = stubPlatform.defaults();

  async function withServer(asyncCallback) {
    const server = platform.testing.http.newServer();
    server.byDefault(respondJson({}));
    const baseConfig = { baseUrl: server.url, logger: stubPlatform.logger() };
    return await asyncCallback(baseConfig, server);
  }

  it('resolves on success', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, baseConfig, env);

      await requestor.fetchFlagSettings({ key: 'user1' }, 'hash1');
      await requestor.fetchFlagSettings({ key: 'user2' }, 'hash2');

      expect(server.requests.length()).toEqual(2);
    });
  });

  it('makes requests with the GET verb if useReport is disabled', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, useReport: false }, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.method).toEqual('get');
    });
  });

  it('makes requests with the REPORT verb with a payload if useReport is enabled', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, useReport: true }, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.method).toEqual('report');
      expect(JSON.parse(req.body)).toEqual(user);
    });
  });

  it('includes environment and user in GET URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, baseConfig, env);

      await requestor.fetchFlagSettings(user, null);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/users/${encodedUser}`);
    });
  });

  it('includes environment, user, and hash in GET URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, baseConfig, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/users/${encodedUser}?h=hash1`);
    });
  });

  it('includes environment, user, and withReasons in GET URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, evaluationReasons: true }, env);

      await requestor.fetchFlagSettings(user, null);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/users/${encodedUser}?withReasons=true`);
    });
  });

  it('includes environment, user, hash, and withReasons in GET URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, evaluationReasons: true }, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/users/${encodedUser}?h=hash1&withReasons=true`);
    });
  });

  it('includes environment in REPORT URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, useReport: true }, env);

      await requestor.fetchFlagSettings(user, null);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/user`);
    });
  });

  it('includes environment and hash in REPORT URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, useReport: true }, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/user?h=hash1`);
    });
  });

  it('includes environment and withReasons in REPORT URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, useReport: true, evaluationReasons: true }, env);

      await requestor.fetchFlagSettings(user, null);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/user?withReasons=true`);
    });
  });

  it('includes environment, hash, and withReasons in REPORT URL', async () => {
    await withServer(async (baseConfig, server) => {
      const requestor = Requestor(platform, { ...baseConfig, useReport: true, evaluationReasons: true }, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.path).toEqual(`/sdk/evalx/${env}/user?h=hash1&withReasons=true`);
    });
  });

  it('sends custom user-agent header in GET mode when sendLDHeaders is true', async () => {
    await withServer(async (baseConfig, server) => {
      const config = { ...baseConfig, sendLDHeaders: true };
      const requestor = Requestor(platform, config, env);

      await requestor.fetchFlagSettings(user);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.headers['x-launchdarkly-user-agent']).toEqual(utils.getLDUserAgentString(platform));
      expect(req.headers['x-launchdarkly-wrapper']).toBeUndefined();
    });
  });

  it('sends wrapper info if specified in GET mode when sendLDHeaders is true', async () => {
    await withServer(async (baseConfig, server) => {
      const config = { ...baseConfig, sendLDHeaders: true, wrapperName: 'FakeSDK' };
      const requestor = Requestor(platform, config, env);

      await requestor.fetchFlagSettings(user);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.headers['x-launchdarkly-user-agent']).toEqual(utils.getLDUserAgentString(platform));
      expect(req.headers['x-launchdarkly-wrapper']).toEqual('FakeSDK');
    });
  });

  it('sends custom user-agent header in REPORT mode when sendLDHeaders is true', async () => {
    await withServer(async (baseConfig, server) => {
      const config = { ...baseConfig, useReport: true, sendLDHeaders: true };
      const requestor = Requestor(platform, config, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.headers['x-launchdarkly-user-agent']).toEqual(utils.getLDUserAgentString(platform));
      expect(req.headers['x-launchdarkly-wrapper']).toBeUndefined();
    });
  });

  it('sends wrapper info if specified in REPORT mode when sendLDHeaders is true', async () => {
    await withServer(async (baseConfig, server) => {
      const config = { ...baseConfig, useReport: true, sendLDHeaders: true, wrapperName: 'FakeSDK' };
      const requestor = Requestor(platform, config, env);

      await requestor.fetchFlagSettings(user, 'hash1');

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.headers['x-launchdarkly-user-agent']).toEqual(utils.getLDUserAgentString(platform));
      expect(req.headers['x-launchdarkly-wrapper']).toEqual('FakeSDK');
    });
  });

  it('does NOT send custom user-agent header when sendLDHeaders is false', async () => {
    await withServer(async (baseConfig, server) => {
      const config = { ...baseConfig, sendLDHeaders: false };
      const requestor = Requestor(platform, config, env);

      await requestor.fetchFlagSettings(user);

      expect(server.requests.length()).toEqual(1);
      const req = await server.requests.take();
      expect(req.headers['x-launchdarkly-user-agent']).toBeUndefined();
      expect(req.headers['x-launchdarkly-wrapper']).toBeUndefined();
    });
  });

  it('returns parsed JSON response on success', async () => {
    const data = { foo: 'bar' };
    await withServer(async (baseConfig, server) => {
      server.byDefault(respondJson(data));
      const requestor = Requestor(platform, baseConfig, env);

      const result = await requestor.fetchFlagSettings(user);
      expect(result).toEqual(data);
    });
  });

  it('allows JSON content type with charset', async () => {
    await withServer(async (baseConfig, server) => {
      server.byDefault(respond(200, { 'content-type': 'application/json; charset=utf-8' }, '{}'));
      const requestor = Requestor(platform, baseConfig, env);

      const result = await requestor.fetchFlagSettings(user);
      expect(result).toEqual({});
    });
  });

  it('allows extra JSON content type header', async () => {
    await withServer(async (baseConfig, server) => {
      // this could happen if a proxy/gateway interpolated its own content-type header; https://github.com/launchdarkly/js-client-sdk/issues/205
      server.byDefault(respond(200, { 'content-type': 'application/json, application/json; charset=utf-8' }, '{}'));
      const requestor = Requestor(platform, baseConfig, env);

      const result = await requestor.fetchFlagSettings(user);
      expect(result).toEqual({});
    });
  });

  it('returns error for non-JSON content type', async () => {
    await withServer(async (baseConfig, server) => {
      server.byDefault(respond(200, { 'content-type': 'text/plain' }, 'sorry'));
      const requestor = Requestor(platform, baseConfig, env);

      const err = new errors.LDFlagFetchError(messages.invalidContentType('text/plain'));
      await expect(requestor.fetchFlagSettings(user)).rejects.toThrow(err);
    });
  });

  it('returns error for unspecified content type', async () => {
    await withServer(async (baseConfig, server) => {
      server.byDefault(respond(200, {}, ''));
      const requestor = Requestor(platform, baseConfig, env);

      const err = new errors.LDFlagFetchError(messages.invalidContentType(''));
      await expect(requestor.fetchFlagSettings(user)).rejects.toThrow(err);
    });
  });

  it('signals specific error for 404 response', async () => {
    await withServer(async (baseConfig, server) => {
      server.byDefault(respond(404));
      const requestor = Requestor(platform, baseConfig, env);

      const err = new errors.LDInvalidEnvironmentIdError(messages.environmentNotFound());
      await expect(requestor.fetchFlagSettings(user)).rejects.toThrow(err);
    });
  });

  it('signals general error for non-404 error status', async () => {
    await withServer(async (baseConfig, server) => {
      server.byDefault(respond(500));
      const requestor = Requestor(platform, baseConfig, env);

      const err = new errors.LDFlagFetchError(messages.errorFetchingFlags('500'));
      await expect(requestor.fetchFlagSettings(user)).rejects.toThrow(err);
    });
  });

  it('signals general error for network error', async () => {
    await withServer(async (baseConfig, server) => {
      server.byDefault(networkError());
      const requestor = Requestor(platform, baseConfig, env);

      const err = new errors.LDFlagFetchError(messages.networkError(fakeNetworkErrorValue));
      await expect(requestor.fetchFlagSettings(user)).rejects.toThrow(err);
    });
  });

  it('coalesces multiple requests so all callers get the latest result', async () => {
    await withServer(async (baseConfig, server) => {
      let n = 0;
      server.byDefault((req, res) => {
        n++;
        respondJson({ value: n })(req, res);
      });

      const requestor = Requestor(platform, baseConfig, env);

      const r1 = requestor.fetchFlagSettings(user);
      const r2 = requestor.fetchFlagSettings(user);

      const result1 = await r1;
      const result2 = await r2;

      expect(result1).toEqual({ value: 2 });
      expect(result2).toEqual({ value: 2 });

      expect(server.requests.length()).toEqual(2);
    });
  });

  describe('When HTTP requests are not available at all', () => {
    it('fails on fetchFlagSettings', async () => {
      await withServer(async (baseConfig, server) => {
        const requestor = Requestor(stubPlatform.withoutHttp(), baseConfig, env);
        await expect(requestor.fetchFlagSettings(user, null)).rejects.toThrow(messages.httpUnavailable());
        expect(server.requests.length()).toEqual(0);
      });
    });
  });
});
*/