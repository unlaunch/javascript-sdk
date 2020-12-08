import EventProcessor from '../EventProcessor';
import { DiagnosticsAccumulator } from '../diagnosticEvents';
import * as messages from '../messages';

import * as stubPlatform from './stubPlatform';
import { MockEventSender } from './testUtils';

// These tests verify that the event processor produces the expected event payload data for
// various inputs. The actual delivery of data is done by EventSender, which has its own
// tests; here, we use a mock EventSender.

describe('EventProcessor', () => {
  const user = { key: 'userKey', name: 'Red' };
  const filteredUser = { key: 'userKey', privateAttrs: ['name'] };
  const eventsUrl = '/fake-url';
  const envId = 'env';
  const logger = stubPlatform.logger();
  const defaultConfig = {
    eventsUrl: eventsUrl,
    eventCapacity: 100,
    flushInterval: 2000,
    samplingInterval: 0,
    logger: logger,
  };
  const platform = stubPlatform.defaults();

  async function withProcessorAndSender(config, asyncCallback) {
    const sender = MockEventSender();
    const ep = EventProcessor(platform, config, envId, null, null, sender);
    try {
      return await asyncCallback(ep, sender);
    } finally {
      ep.stop();
    }
  }

  async function withDiagnosticProcessorAndSender(config, asyncCallback) {
    const sender = MockEventSender();
    const diagnosticAccumulator = DiagnosticsAccumulator(1000);
    const ep = EventProcessor(platform, config, envId, diagnosticAccumulator, null, sender);
    try {
      return await asyncCallback(ep, sender, diagnosticAccumulator);
    } finally {
      ep.stop();
    }
  }

  function checkFeatureEvent(e, source, debug, inlineUser) {
    expect(e.kind).toEqual(debug ? 'debug' : 'feature');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.key).toEqual(source.key);
    expect(e.version).toEqual(source.version);
    expect(e.value).toEqual(source.value);
    expect(e.default).toEqual(source.default);
    expect(e.reason).toEqual(source.reason);
    if (inlineUser) {
      expect(e.user).toEqual(inlineUser);
    } else {
      expect(e.userKey).toEqual(source.user.key);
    }
  }

  function checkCustomEvent(e, source, inlineUser) {
    expect(e.kind).toEqual('custom');
    expect(e.creationDate).toEqual(source.creationDate);
    expect(e.key).toEqual(source.key);
    expect(e.data).toEqual(source.data);
    if (inlineUser) {
      expect(e.user).toEqual(inlineUser);
    } else {
      expect(e.userKey).toEqual(source.user.key);
    }
    expect(e.metricValue).toEqual(source.metricValue);
  }

  function checkSummaryEvent(e) {
    expect(e.kind).toEqual('summary');
  }

  it('should enqueue identify event', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const event = { kind: 'identify', creationDate: 1000, key: user.key, user: user };
      ep.enqueue(event);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      expect((await mockEventSender.calls.take()).events).toEqual([event]);
    });
  });

  it('filters user in identify event', async () => {
    const config = { ...defaultConfig, allAttributesPrivate: true };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      const event = { kind: 'identify', creationDate: 1000, key: user.key, user: user };
      ep.enqueue(event);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      expect((await mockEventSender.calls.take()).events).toEqual([
        {
          kind: 'identify',
          creationDate: event.creationDate,
          key: user.key,
          user: filteredUser,
        },
      ]);
    });
  });

  it('queues individual feature event', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const event = {
        kind: 'feature',
        creationDate: 1000,
        key: 'flagkey',
        user: user,
        trackEvents: true,
      };
      ep.enqueue(event);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], event, false);
      checkSummaryEvent(output[1]);
    });
  });

  it('can include inline user in feature event', async () => {
    const config = { ...defaultConfig, inlineUsersInEvents: true };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      const event = {
        kind: 'feature',
        creationDate: 1000,
        key: 'flagkey',
        user: user,
        trackEvents: true,
      };
      ep.enqueue(event);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], event, false, user);
      checkSummaryEvent(output[1]);
    });
  });

  it('can include reason in feature event', async () => {
    const config = { ...defaultConfig, inlineUsersInEvents: true };
    const reason = { kind: 'FALLTHROUGH' };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      const event = {
        kind: 'feature',
        creationDate: 1000,
        key: 'flagkey',
        user: user,
        trackEvents: true,
        reason: reason,
      };
      ep.enqueue(event);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], event, false, user);
      checkSummaryEvent(output[1]);
    });
  });

  it('filters user in feature event', async () => {
    const config = { ...defaultConfig, allAttributesPrivate: true, inlineUsersInEvents: true };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      const event = {
        kind: 'feature',
        creationDate: 1000,
        key: 'flagkey',
        user: user,
        trackEvents: true,
      };
      ep.enqueue(event);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], event, false, filteredUser);
      checkSummaryEvent(output[1]);
    });
  });

  it('sets event kind to debug if event is temporarily in debug mode', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const futureTime = new Date().getTime() + 1000000;
      const e = {
        kind: 'feature',
        creationDate: 1000,
        user: user,
        key: 'flagkey',
        version: 11,
        variation: 1,
        value: 'value',
        trackEvents: false,
        debugEventsUntilDate: futureTime,
      };
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(2);
      checkFeatureEvent(output[0], e, true, user);
      checkSummaryEvent(output[1]);
    });
  });

  it('can both track and debug an event', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const futureTime = new Date().getTime() + 1000000;
      const e = {
        kind: 'feature',
        creationDate: 1000,
        user: user,
        key: 'flagkey',
        version: 11,
        variation: 1,
        value: 'value',
        trackEvents: true,
        debugEventsUntilDate: futureTime,
      };
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(3);
      checkFeatureEvent(output[0], e, false);
      checkFeatureEvent(output[1], e, true, user);
      checkSummaryEvent(output[2]);
    });
  });

  it('expires debug mode based on client time if client time is later than server time', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      // Pick a server time that is somewhat behind the client time
      const serverTime = new Date().getTime() - 20000;
      mockEventSender.setServerTime(serverTime);

      // Send and flush an event we don't care about, just to set the last server time
      ep.enqueue({ kind: 'identify', user: { key: 'otherUser' } });
      await ep.flush();

      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the server time, but in the past compared to the client.
      const debugUntil = serverTime + 1000;
      const e = {
        kind: 'feature',
        creationDate: 1000,
        user: user,
        key: 'flagkey',
        version: 11,
        variation: 1,
        value: 'value',
        trackEvents: false,
        debugEventsUntilDate: debugUntil,
      };
      ep.enqueue(e);

      // Should get a summary event only, not a full feature event
      await ep.flush();
      expect(mockEventSender.calls.length()).toEqual(2);
      await mockEventSender.calls.take();
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      checkSummaryEvent(output[0]);
    });
  });

  it('expires debug mode based on server time if server time is later than client time', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      // Pick a server time that is somewhat ahead of the client time
      const serverTime = new Date().getTime() + 20000;
      mockEventSender.setServerTime(serverTime);

      // Send and flush an event we don't care about, just to set the last server time
      ep.enqueue({ kind: 'identify', user: { key: 'otherUser' } });
      await ep.flush();

      // Now send an event with debug mode on, with a "debug until" time that is further in
      // the future than the client time, but in the past compared to the server.
      const debugUntil = serverTime - 1000;
      const e = {
        kind: 'feature',
        creationDate: 1000,
        user: user,
        key: 'flagkey',
        version: 11,
        variation: 1,
        value: 'value',
        trackEvents: false,
        debugEventsUntilDate: debugUntil,
      };
      ep.enqueue(e);

      // Should get a summary event only, not a full feature event
      await ep.flush();
      expect(mockEventSender.calls.length()).toEqual(2);
      await mockEventSender.calls.take();
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      checkSummaryEvent(output[0]);
    });
  });

  it('summarizes nontracked events', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      function makeEvent(key, date, version, variation, value, defaultVal) {
        return {
          kind: 'feature',
          creationDate: date,
          user: user,
          key: key,
          version: version,
          variation: variation,
          value: value,
          default: defaultVal,
          trackEvents: false,
        };
      }
      const e1 = makeEvent('flagkey1', 1000, 11, 1, 'value1', 'default1');
      const e2 = makeEvent('flagkey2', 2000, 22, 1, 'value2', 'default2');
      ep.enqueue(e1);
      ep.enqueue(e2);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      const se = output[0];
      checkSummaryEvent(se);
      expect(se.startDate).toEqual(1000);
      expect(se.endDate).toEqual(2000);
      expect(se.features).toEqual({
        flagkey1: {
          default: 'default1',
          counters: [{ version: 11, variation: 1, value: 'value1', count: 1 }],
        },
        flagkey2: {
          default: 'default2',
          counters: [{ version: 22, variation: 1, value: 'value2', count: 1 }],
        },
      });
    });
  });

  it('queues custom event', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const e = {
        kind: 'custom',
        creationDate: 1000,
        user: user,
        key: 'eventkey',
        data: { thing: 'stuff' },
        metricValue: 1.5,
      };
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e);
    });
  });

  it('can include inline user in custom event', async () => {
    const config = { ...defaultConfig, inlineUsersInEvents: true };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      const e = {
        kind: 'custom',
        creationDate: 1000,
        user: user,
        key: 'eventkey',
        data: { thing: 'stuff' },
      };
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e, user);
    });
  });

  it('filters user in custom event', async () => {
    const config = { ...defaultConfig, allAttributesPrivate: true, inlineUsersInEvents: true };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      const e = {
        kind: 'custom',
        creationDate: 1000,
        user: user,
        key: 'eventkey',
        data: { thing: 'stuff' },
      };
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e, filteredUser);
    });
  });

  it('enforces event capacity', async () => {
    const config = { ...defaultConfig, eventCapacity: 1, logger: stubPlatform.logger() };
    const e0 = { kind: 'custom', creationDate: 1000, user: user, key: 'key0' };
    const e1 = { kind: 'custom', creationDate: 1001, user: user, key: 'key1' };
    const e2 = { kind: 'custom', creationDate: 1002, user: user, key: 'key2' };
    await withProcessorAndSender(config, async (ep, mockEventSender) => {
      ep.enqueue(e0);
      ep.enqueue(e1);
      ep.enqueue(e2);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      const output = (await mockEventSender.calls.take()).events;
      expect(output.length).toEqual(1);
      checkCustomEvent(output[0], e0);

      expect(config.logger.output.warn).toEqual([messages.eventCapacityExceeded()]); // warning is not repeated for e2
    });
  });

  it('sends nothing if there are no events to flush', async () => {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      await ep.flush();
      expect(mockEventSender.calls.length()).toEqual(0);
    });
  });

  async function verifyUnrecoverableHttpError(status) {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const e = { kind: 'identify', creationDate: 1000, user: user };
      ep.enqueue(e);
      mockEventSender.setStatus(status);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1); // still the one from our first flush
    });
  }

  async function verifyRecoverableHttpError(status) {
    await withProcessorAndSender(defaultConfig, async (ep, mockEventSender) => {
      const e = { kind: 'identify', creationDate: 1000, user: user };
      ep.enqueue(e);
      mockEventSender.setStatus(status);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(1);
      ep.enqueue(e);
      await ep.flush();

      expect(mockEventSender.calls.length()).toEqual(2);
    });
  }

  describe('stops sending events after unrecoverable HTTP error', () => {
    [401, 403, 404].forEach(status => {
      it('status ' + status, async () => await verifyUnrecoverableHttpError(status));
    });
  });

  describe('continues sending events after recoverable HTTP error', () => {
    [408, 429, 500].forEach(status => {
      it('status ' + status, async () => await verifyRecoverableHttpError(status));
    });
  });

  describe('interaction with diagnostic events', () => {
    it('sets eventsInLastBatch on flush', async () => {
      const e0 = { kind: 'custom', creationDate: 1000, user: user, key: 'key0' };
      const e1 = { kind: 'custom', creationDate: 1001, user: user, key: 'key1' };
      await withDiagnosticProcessorAndSender(defaultConfig, async (ep, mockEventSender, diagnosticAccumulator) => {
        expect(diagnosticAccumulator.getProps().eventsInLastBatch).toEqual(0);

        ep.enqueue(e0);
        ep.enqueue(e1);
        await ep.flush();

        expect(mockEventSender.calls.length()).toEqual(1);
        const output = (await mockEventSender.calls.take()).events;
        expect(output.length).toEqual(2);

        expect(diagnosticAccumulator.getProps().eventsInLastBatch).toEqual(2);
      });
    });

    it('increments droppedEvents when capacity is exceeded', async () => {
      const config = { ...defaultConfig, eventCapacity: 1, logger: stubPlatform.logger() };
      const e0 = { kind: 'custom', creationDate: 1000, user: user, key: 'key0' };
      const e1 = { kind: 'custom', creationDate: 1001, user: user, key: 'key1' };
      const e2 = { kind: 'custom', creationDate: 1002, user: user, key: 'key2' };
      await withDiagnosticProcessorAndSender(config, async (ep, mockEventSender, diagnosticAccumulator) => {
        ep.enqueue(e0);
        ep.enqueue(e1);
        ep.enqueue(e2);
        await ep.flush();

        expect(mockEventSender.calls.length()).toEqual(1);
        const output = (await mockEventSender.calls.take()).events;
        expect(output.length).toEqual(1);
        checkCustomEvent(output[0], e0);

        expect(config.logger.output.warn).toEqual([messages.eventCapacityExceeded()]); // warning is not repeated for e2

        expect(diagnosticAccumulator.getProps().droppedEvents).toEqual(2);
      });
    });
  });
});
