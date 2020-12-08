import * as messages from '../messages';

import { withCloseable, sleepAsync } from 'launchdarkly-js-test-helpers';

import { respond, respondJson } from './mockHttp';
import * as stubPlatform from './stubPlatform';
import { makeBootstrap, numericUser, stringifiedNumericUser } from './testUtils';

// These tests verify that the client generates the appropriate analytics events for various scenarios.
// We use a mock event processor component so that the events are not sent anywhere.
//
// We also use a mock HTTP service in a few tests-- not to simulate an event-recorder instance, since
// we're not testing event delivery here, but to simulate the polling service in cases where the test
// logic involves a flag request. In all other cases we just start the client with bootstrap data.

describe('LDClient events', () => {
  const envName = 'UNKNOWN_ENVIRONMENT_ID';
  const user = { key: 'user' };
  const fakeUrl = 'http://fake';
  let platform;

  beforeEach(() => {
    platform = stubPlatform.defaults();
    platform.testing.setCurrentUrl(fakeUrl);
  });

  function stubEventProcessor() {
    const ep = { events: [] };
    ep.start = function() {};
    ep.flush = function() {};
    ep.stop = function() {};
    ep.enqueue = function(e) {
      ep.events.push(e);
    };
    return ep;
  }

  async function withServer(asyncCallback) {
    const server = platform.testing.http.newServer();
    server.byDefault(respondJson({}));
    return await withCloseable(server, asyncCallback);
  }

  async function withClientAndEventProcessor(user, extraConfig, asyncCallback) {
    const ep = stubEventProcessor();
    const config = Object.assign({ baseUrl: 'shouldnt-use-this', bootstrap: {}, eventProcessor: ep }, extraConfig);
    const client = platform.testing.makeClient(envName, user, config);
    return await withCloseable(client, async () => await asyncCallback(client, ep));
  }

  function expectIdentifyEvent(e, user) {
    expect(e.kind).toEqual('identify');
    expect(e.user).toEqual(user);
  }

  function expectFeatureEvent(e, key, value, variation, version, defaultVal, trackEvents, debugEventsUntilDate) {
    expect(e.kind).toEqual('feature');
    expect(e.key).toEqual(key);
    expect(e.value).toEqual(value);
    expect(e.variation).toEqual(variation);
    expect(e.version).toEqual(version);
    expect(e.default).toEqual(defaultVal);
    expect(e.trackEvents).toEqual(trackEvents);
    expect(e.debugEventsUntilDate).toEqual(debugEventsUntilDate);
  }

  it('sends an identify event at startup', async () => {
    await withClientAndEventProcessor(user, {}, async (client, ep) => {
      await client.waitForInitialization();

      expect(ep.events.length).toEqual(1);
      expectIdentifyEvent(ep.events[0], user);
    });
  });

  it('stringifies user attributes in the identify event at startup', async () => {
    // This just verifies that the event is being sent with the sanitized user, not the user that was passed in
    await withClientAndEventProcessor(numericUser, {}, async (client, ep) => {
      await client.waitForInitialization();

      expect(ep.events.length).toEqual(1);
      expectIdentifyEvent(ep.events[0], stringifiedNumericUser);
    });
  });

  it('sends an identify event when identify() is called', async () => {
    // need a server because it'll do a polling request when we call identify
    await withServer(async server => {
      await withClientAndEventProcessor(user, { baseUrl: server.url }, async (client, ep) => {
        const user1 = { key: 'user1' };
        await client.waitForInitialization();

        expect(ep.events.length).toEqual(1);
        await client.identify(user1);

        expect(ep.events.length).toEqual(2);
        expectIdentifyEvent(ep.events[1], user1);
      });
    });
  });

  it('stringifies user attributes in the identify event when identify() is called', async () => {
    // This just verifies that the event is being sent with the sanitized user, not the user that was passed in
    await withServer(async server => {
      await withClientAndEventProcessor(user, { baseUrl: server.url }, async (client, ep) => {
        await client.waitForInitialization();

        expect(ep.events.length).toEqual(1);
        await client.identify(numericUser);

        expect(ep.events.length).toEqual(2);
        expectIdentifyEvent(ep.events[1], stringifiedNumericUser);
      });
    });
  });

  it('does not send an identify event if doNotTrack is set', async () => {
    platform.testing.setDoNotTrack(true);
    await withServer(async server => {
      await withClientAndEventProcessor(user, { baseUrl: server.url }, async (client, ep) => {
        const user1 = { key: 'user1' };

        await client.waitForInitialization();
        await client.identify(user1);

        expect(ep.events.length).toEqual(0);
      });
    });
  });

  it('sends a feature event for variation()', async () => {
    const initData = makeBootstrap({ foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000 } });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await client.waitForInitialization();

      client.variation('foo', 'x');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'a', 1, 2000, 'x');
    });
  });

  it('sends a feature event with reason for variationDetail()', async () => {
    const initData = makeBootstrap({
      foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000, reason: { kind: 'OFF' } },
    });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await client.waitForInitialization();
      client.variationDetail('foo', 'x');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'a', 1, 2000, 'x');
      expect(ep.events[1].reason).toEqual({ kind: 'OFF' });
    });
  });

  it('does not include reason in event for variation() even if reason is available', async () => {
    const initData = makeBootstrap({
      foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000, reason: { kind: 'OFF' } },
    });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await client.waitForInitialization();
      client.variation('foo', 'x');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'a', 1, 2000, 'x');
      expect(ep.events[1].reason).toBe(undefined);
    });
  });

  it('sends a feature event with reason for variation() if trackReason is set', async () => {
    const initData = makeBootstrap({
      foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000, reason: { kind: 'OFF' }, trackReason: true },
    });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await client.waitForInitialization();
      client.variation('foo', 'x');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'a', 1, 2000, 'x');
      expect(ep.events[1].reason).toEqual({ kind: 'OFF' });
    });
  });

  it('sends a feature event on receiving a new flag value', async () => {
    const oldFlags = { foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000 } };
    const newFlags = { foo: { value: 'b', variation: 2, version: 3, flagVersion: 2001 } };
    const initData = makeBootstrap(oldFlags);
    await withServer(async server => {
      server.byDefault(respondJson(newFlags));
      await withClientAndEventProcessor(user, { baseUrl: server.url, bootstrap: initData }, async (client, ep) => {
        await client.waitForInitialization();

        const user1 = { key: 'user1' };
        await client.identify(user1);

        expect(ep.events.length).toEqual(3);
        expectIdentifyEvent(ep.events[0], user);
        expectIdentifyEvent(ep.events[1], user1);
        expectFeatureEvent(ep.events[2], 'foo', 'b', 2, 2001);
      });
    });
  });

  it('does not send a feature event for a new flag value if sendEventsOnlyForVariation is set', async () => {
    const oldFlags = { foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000 } };
    const newFlags = { foo: { value: 'b', variation: 2, version: 3, flagVersion: 2001 } };
    const initData = makeBootstrap(oldFlags);
    await withServer(async server => {
      server.byDefault(respondJson(newFlags));
      const extraConfig = { sendEventsOnlyForVariation: true, baseUrl: server.url, bootstrap: initData };
      await withClientAndEventProcessor(user, extraConfig, async (client, ep) => {
        await client.waitForInitialization();

        const user1 = { key: 'user1' };
        await client.identify(user1);

        expect(ep.events.length).toEqual(2);
        expectIdentifyEvent(ep.events[0], user);
        expectIdentifyEvent(ep.events[1], user1);
      });
    });
  });

  it('does not send a feature event for a new flag value if there is a state provider', async () => {
    const oldFlags = { foo: { value: 'a', variation: 1, version: 2, flagVersion: 2000 } };
    const newFlags = { foo: { value: 'b', variation: 2, version: 3, flagVersion: 2001 } };
    const sp = stubPlatform.mockStateProvider({ environment: envName, user: user, flags: oldFlags });
    await withServer(async server => {
      server.byDefault(respondJson(newFlags));
      const extraConfig = { stateProvider: sp, baseUrl: server.url };
      await withClientAndEventProcessor(user, extraConfig, async (client, ep) => {
        await client.waitForInitialization();

        sp.emit('update', { flags: newFlags });

        expect(client.variation('foo')).toEqual('b');
        expect(ep.events.length).toEqual(1);
      });
    });
  });

  it('sends feature events for allFlags()', async () => {
    const initData = makeBootstrap({
      foo: { value: 'a', variation: 1, version: 2 },
      bar: { value: 'b', variation: 1, version: 3 },
    });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await client.waitForInitialization();
      client.allFlags();

      expect(ep.events.length).toEqual(3);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'a', 1, 2, null);
      expectFeatureEvent(ep.events[2], 'bar', 'b', 1, 3, null);
    });
  });

  it('does not send feature events for allFlags() if sendEventsOnlyForVariation is set', async () => {
    const initData = makeBootstrap({
      foo: { value: 'a', variation: 1, version: 2 },
      bar: { value: 'b', variation: 1, version: 3 },
    });
    const extraConfig = { sendEventsOnlyForVariation: true, bootstrap: initData };
    await withClientAndEventProcessor(user, extraConfig, async (client, ep) => {
      await client.waitForInitialization();
      client.allFlags();

      expect(ep.events.length).toEqual(1);
      expectIdentifyEvent(ep.events[0], user);
    });
  });

  it('uses "version" instead of "flagVersion" in event if "flagVersion" is absent', async () => {
    const initData = makeBootstrap({ foo: { value: 'a', variation: 1, version: 2 } });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await client.waitForInitialization();
      client.variation('foo', 'x');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'a', 1, 2, 'x');
    });
  });

  it('omits event version if flag does not exist', async () => {
    await withClientAndEventProcessor(user, {}, async (client, ep) => {
      await client.waitForInitialization();
      client.variation('foo', 'x');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      expectFeatureEvent(ep.events[1], 'foo', 'x', null, undefined, 'x');
    });
  });

  it('can get metadata for events from bootstrap object', async () => {
    const initData = makeBootstrap({
      foo: {
        value: 'bar',
        variation: 1,
        version: 2,
        trackEvents: true,
        debugEventsUntilDate: 1000,
      },
    });
    await withClientAndEventProcessor(user, { bootstrap: initData }, async (client, ep) => {
      await withCloseable(client, async () => {
        await client.waitForInitialization();
        client.variation('foo', 'x');

        expect(ep.events.length).toEqual(2);
        expectIdentifyEvent(ep.events[0], user);
        expectFeatureEvent(ep.events[1], 'foo', 'bar', 1, 2, 'x', true, 1000);
      });
    });
  });

  it('sends an event for track()', async () => {
    await withClientAndEventProcessor(user, {}, async (client, ep) => {
      await client.waitForInitialization();
      client.track('eventkey');

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      const trackEvent = ep.events[1];
      expect(trackEvent.kind).toEqual('custom');
      expect(trackEvent.key).toEqual('eventkey');
      expect(trackEvent.user).toEqual(user);
      expect(trackEvent.data).toEqual(undefined);
      expect(trackEvent.url).toEqual(fakeUrl);
    });
  });

  it('sends an event for track() with data', async () => {
    await withClientAndEventProcessor(user, {}, async (client, ep) => {
      const eventData = { thing: 'stuff' };
      await client.waitForInitialization();
      client.track('eventkey', eventData);

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      const trackEvent = ep.events[1];
      expect(trackEvent.kind).toEqual('custom');
      expect(trackEvent.key).toEqual('eventkey');
      expect(trackEvent.user).toEqual(user);
      expect(trackEvent.data).toEqual(eventData);
      expect(trackEvent.url).toEqual(fakeUrl);
    });
  });

  it('sends an event for track() with metric value', async () => {
    await withClientAndEventProcessor(user, {}, async (client, ep) => {
      const eventData = { thing: 'stuff' };
      const metricValue = 1.5;
      await client.waitForInitialization();
      client.track('eventkey', eventData, metricValue);

      expect(ep.events.length).toEqual(2);
      expectIdentifyEvent(ep.events[0], user);
      const trackEvent = ep.events[1];
      expect(trackEvent.kind).toEqual('custom');
      expect(trackEvent.key).toEqual('eventkey');
      expect(trackEvent.user).toEqual(user);
      expect(trackEvent.data).toEqual(eventData);
      expect(trackEvent.metricValue).toEqual(metricValue);
      expect(trackEvent.url).toEqual(fakeUrl);
    });
  });

  it('does not send an event for track() if doNotTrack is set', async () => {
    platform.testing.setDoNotTrack(true);
    await withClientAndEventProcessor(user, {}, async (client, ep) => {
      const eventData = { thing: 'stuff' };
      await client.waitForInitialization();
      client.track('eventkey', eventData);
      expect(ep.events.length).toEqual(0);
    });
  });

  it('does not warn by default when tracking a custom event', async () => {
    await withClientAndEventProcessor(user, {}, async client => {
      await client.waitForInitialization();

      client.track('known');
      expect(platform.testing.logger.output.warn).toEqual([]);
    });
  });

  it('emits an error when tracking a non-string custom event', async () => {
    await withClientAndEventProcessor(user, {}, async client => {
      await client.waitForInitialization();

      const badCustomEventKeys = [123, [], {}, null, undefined];
      badCustomEventKeys.forEach(key => {
        platform.testing.logger.reset();
        client.track(key);
        expect(platform.testing.logger.output.error).toEqual([messages.unknownCustomEventKey(key)]);
      });
    });
  });

  it('should warn about missing user on first event', async () => {
    await withClientAndEventProcessor(null, {}, async client => {
      client.track('eventkey', null);
      expect(platform.testing.logger.output.warn).toEqual([messages.eventWithoutUser()]);
    });
  });

  it('allows stateProvider to take over sending an event', async () => {
    const sp = stubPlatform.mockStateProvider({ environment: envName, user: user, flags: {} });
    const divertedEvents = [];
    sp.enqueueEvent = event => divertedEvents.push(event);

    await withClientAndEventProcessor(user, { stateProvider: sp }, async (client, ep) => {
      await client.waitForInitialization();

      client.track('eventkey');
      expect(ep.events.length).toEqual(0);
      expect(divertedEvents.length).toEqual(1);
      expect(divertedEvents[0].kind).toEqual('custom');
    });
  });

  async function expectDiagnosticEventAndDiscardRegularEvent(server) {
    const req0 = await server.nextRequest();
    const req1 = await server.nextRequest();
    const expectedPath = '/events/diagnostic/' + envName;
    const otherPath = '/events/bulk/' + envName;
    let initEventReq;
    if (req0.path === expectedPath) {
      expect(req1.path).toEqual(otherPath);
      initEventReq = req0;
    } else {
      expect(req0.path).toEqual(otherPath);
      expect(req1.path).toEqual(expectedPath);
      initEventReq = req1;
    }
    return JSON.parse(initEventReq.body);
  }

  async function expectNoMoreRequests(server, timeout) {
    await sleepAsync(timeout);
    expect(server.requests.length()).toEqual(0);
  }

  it('sends diagnostic init event on startup', async () => {
    const server = platform.testing.http.newServer();
    server.byDefault(respond(202));
    await withCloseable(server, async () => {
      const config = {
        baseUrl: 'shouldnt-use-this',
        bootstrap: {},
        eventsUrl: server.url,
      };
      const client = platform.testing.makeClient(envName, user, config);
      await withCloseable(client, async () => {
        await client.waitForInitialization();
        await client.flush();
        const data = await expectDiagnosticEventAndDiscardRegularEvent(server);
        expect(data.kind).toEqual('diagnostic-init');
        expect(data.platform).toEqual(platform.diagnosticPlatformData);
        expect(data.sdk).toEqual(platform.diagnosticSdkData);
        await expectNoMoreRequests(server, 50);
      });
    });
  });

  it('sends diagnostic combined event on startup', async () => {
    const platform1 = stubPlatform.defaults();
    platform1.diagnosticUseCombinedEvent = true;
    const server = platform1.testing.http.newServer();
    server.byDefault(respond(202));
    await withCloseable(server, async () => {
      const config = {
        baseUrl: 'shouldnt-use-this',
        bootstrap: {},
        eventsUrl: server.url,
      };
      const client = platform1.testing.makeClient(envName, user, config);
      await withCloseable(client, async () => {
        await client.waitForInitialization();
        await client.flush();
        const data = await expectDiagnosticEventAndDiscardRegularEvent(server);
        expect(data.kind).toEqual('diagnostic-combined');
        expect(data.platform).toEqual(platform1.diagnosticPlatformData);
        expect(data.sdk).toEqual(platform1.diagnosticSdkData);
        await expectNoMoreRequests(server, 50);
      });
    });
  });

  it('does not send diagnostic init event when opted out', async () => {
    const server = platform.testing.http.newServer();
    server.byDefault(respond(202));
    await withCloseable(server, async () => {
      const config = {
        baseUrl: 'shouldnt-use-this',
        bootstrap: {},
        eventsUrl: server.url,
        diagnosticOptOut: true,
      };
      const client = platform.testing.makeClient(envName, user, config);
      await withCloseable(client, async () => {
        await client.waitForInitialization();
        await client.flush();
        expect(server.requests.length()).toEqual(1);
        const req = await server.nextRequest();
        expect(req.path).toEqual('/events/bulk/' + envName);
        await expectNoMoreRequests(server, 50);
      });
    });
  });
});
