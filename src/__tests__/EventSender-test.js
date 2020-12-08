import EventSender from '../EventSender';
import * as utils from '../utils';

import * as base64 from 'base64-js';

import { respond, networkError } from './mockHttp';
import * as stubPlatform from './stubPlatform';

// These tests verify that EventSender executes the expected HTTP requests to deliver events. Since
// the js-sdk-common package uses an abstraction of HTTP requests, these tests do not use HTTP but
// rather use a test implementation of our HTTP abstraction; the individual platform-specific SDKs
// are responsible for verifying that their own implementations of the same HTTP abstraction work
// correctly with real networking.

describe('EventSender', () => {
  let platform;
  const envId = 'env';

  beforeEach(() => {
    platform = stubPlatform.defaults();
  });

  function fakeImageCreator() {
    const ret = function(url) {
      ret.urls.push(url);
    };
    ret.urls = [];
    return ret;
  }

  function base64URLDecode(str) {
    let s = str;
    while (s.length % 4 !== 0) {
      s = s + '=';
    }
    s = s.replace(/_/g, '/').replace(/-/g, '+');
    const decodedBytes = base64.toByteArray(s);
    const decodedStr = String.fromCharCode.apply(String, decodedBytes);
    return decodeURIComponent(escape(decodedStr));
  }

  function decodeOutputFromUrl(url, baseUrl) {
    const prefix = baseUrl + '/a/' + envId + '.gif?d=';
    if (!url.startsWith(prefix)) {
      throw 'URL "' + url + '" did not have expected prefix "' + prefix + '"';
    }
    return JSON.parse(base64URLDecode(url.substring(prefix.length)));
  }

  describe('using image endpoint when CORS is not available', () => {
    it('should encode events in a single chunk if they fit', async () => {
      const server = platform.testing.http.newServer();
      const imageCreator = fakeImageCreator();
      const platformWithoutCors = { ...platform, httpAllowsPost: () => false, httpFallbackPing: imageCreator };
      const sender = EventSender(platformWithoutCors, envId);
      const event1 = { kind: 'identify', key: 'userKey1' };
      const event2 = { kind: 'identify', key: 'userKey2' };
      const events = [event1, event2];

      await sender.sendEvents(events, server.url);

      const urls = imageCreator.urls;
      expect(urls.length).toEqual(1);
      expect(decodeOutputFromUrl(urls[0], server.url)).toEqual(events);

      expect(server.requests.length()).toEqual(0);
    });

    it('should send events in multiple chunks if necessary', async () => {
      const server = platform.testing.http.newServer();
      const imageCreator = fakeImageCreator();
      const platformWithoutCors = { ...platform, httpAllowsPost: () => false, httpFallbackPing: imageCreator };
      const sender = EventSender(platformWithoutCors, envId);
      const events = [];
      for (let i = 0; i < 80; i++) {
        events.push({ kind: 'identify', key: 'thisIsALongUserKey' + i });
      }

      await sender.sendEvents(events, server.url);

      const urls = imageCreator.urls;
      expect(urls.length).toEqual(3);
      expect(decodeOutputFromUrl(urls[0], server.url)).toEqual(events.slice(0, 31));
      expect(decodeOutputFromUrl(urls[1], server.url)).toEqual(events.slice(31, 61));
      expect(decodeOutputFromUrl(urls[2], server.url)).toEqual(events.slice(61, 80));

      expect(server.requests.length()).toEqual(0);
    });
  });

  describe('using POST when CORS is available', () => {
    it('should send all events in request body', async () => {
      const server = platform.testing.http.newServer();
      server.byDefault(respond(202));
      const sender = EventSender(platform, envId);
      const events = [];
      for (let i = 0; i < 80; i++) {
        events.push({ kind: 'identify', key: 'thisIsALongUserKey' + i });
      }
      await sender.sendEvents(events, server.url + '/endpoint');

      const r = await server.nextRequest();
      expect(r.path).toEqual('/endpoint');
      expect(r.method).toEqual('post');
      expect(JSON.parse(r.body)).toEqual(events);
    });

    it('should send custom user-agent header', async () => {
      const options = { sendLDHeaders: true };
      const server = platform.testing.http.newServer();
      server.byDefault(respond(202));
      const sender = EventSender(platform, envId, options);
      const event = { kind: 'identify', key: 'userKey' };
      await sender.sendEvents([event], server.url);

      const r = await server.nextRequest();
      expect(r.headers['x-launchdarkly-user-agent']).toEqual(utils.getLDUserAgentString(platform));
      expect(r.headers['x-launchdarkly-wrapper']).toBeUndefined();
    });

    it('should send unique payload IDs', async () => {
      const options = { sendLDHeaders: true };
      const server = platform.testing.http.newServer();
      server.byDefault(respond(202));
      const sender = EventSender(platform, envId, options);
      const event = { kind: 'identify', key: 'userKey' };
      await sender.sendEvents([event], server.url, false);
      await sender.sendEvents([event], server.url, false); // deliberately repeated

      const r0 = await server.nextRequest();
      const r1 = await server.nextRequest();
      const id0 = r0.headers['x-launchdarkly-payload-id'];
      const id1 = r1.headers['x-launchdarkly-payload-id'];
      expect(id0).toBeTruthy();
      expect(id1).toBeTruthy();
      expect(id0).not.toEqual(id1);
    });

    it('should send wrapper info if present', async () => {
      const options = { sendLDHeaders: true, wrapperName: 'FakeSDK' };
      const server = platform.testing.http.newServer();
      server.byDefault(respond(202));
      const sender = EventSender(platform, envId, options);
      const event = { kind: 'identify', key: 'userKey' };
      await sender.sendEvents([event], server.url);

      const r = await server.nextRequest();
      expect(r.headers['x-launchdarkly-user-agent']).toEqual(utils.getLDUserAgentString(platform));
      expect(r.headers['x-launchdarkly-wrapper']).toEqual('FakeSDK');
    });

    describe('retry on recoverable HTTP error', () => {
      const retryableStatuses = [400, 408, 429, 500, 503];
      for (const i in retryableStatuses) {
        const status = retryableStatuses[i];
        it('status ' + status, async () => {
          const server = platform.testing.http.newServer();
          let n = 0;
          server.byDefault((req, res) => {
            n++;
            respond(n >= 2 ? 200 : status)(req, res);
          });
          const sender = EventSender(platform, envId);
          const event = { kind: 'false', key: 'userKey' };
          await sender.sendEvents([event], server.url, false);

          expect(server.requests.length()).toEqual(2);
          const r0 = await server.nextRequest();
          const r1 = await server.nextRequest();
          expect(JSON.parse(r0.body)).toEqual([event]);
          expect(JSON.parse(r1.body)).toEqual([event]);
          const id0 = r0.headers['x-launchdarkly-payload-id'];
          expect(id0).toBeTruthy();
          expect(r1.headers['x-launchdarkly-payload-id']).toEqual(id0);
        });
      }
    });

    it('should not retry more than once', async () => {
      const server = platform.testing.http.newServer();
      let n = 0;
      server.byDefault((req, res) => {
        n++;
        respond(n >= 3 ? 200 : 503)(req, res);
      });
      const sender = EventSender(platform, envId);
      const event = { kind: 'false', key: 'userKey' };
      await sender.sendEvents([event], server.url);

      expect(server.requests.length()).toEqual(2);
    });

    it('should not retry on error 401', async () => {
      const server = platform.testing.http.newServer();
      server.byDefault(respond(401));
      const sender = EventSender(platform, envId);
      const event = { kind: 'false', key: 'userKey' };
      await sender.sendEvents([event], server.url);

      expect(server.requests.length()).toEqual(1);
    });

    it('should retry on I/O error', async () => {
      const server = platform.testing.http.newServer();
      let n = 0;
      server.byDefault((req, res) => {
        n++;
        if (n >= 2) {
          respond(200)(req, res);
        } else {
          networkError()(req, res);
        }
      });
      const sender = EventSender(platform, envId);
      const event = { kind: 'false', key: 'userKey' };
      await sender.sendEvents([event], server.url);

      expect(server.requests.length()).toEqual(2);
      await server.nextRequest();
      const r1 = await server.nextRequest();
      expect(JSON.parse(r1.body)).toEqual([event]);
    });
  });

  describe('When HTTP requests are not available at all', () => {
    it('should silently discard events', async () => {
      const server = platform.testing.http.newServer();
      const sender = EventSender(stubPlatform.withoutHttp(), server.url, envId);
      const event = { kind: 'false', key: 'userKey' };
      await sender.sendEvents([event], server.url);

      expect(server.requests.length()).toEqual(0);
    });
  });
});
