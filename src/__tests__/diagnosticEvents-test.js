import { baseOptionDefs } from '../configuration';
import { DiagnosticId, DiagnosticsAccumulator, DiagnosticsManager } from '../diagnosticEvents';

import { sleepAsync } from 'launchdarkly-js-test-helpers';

import * as stubPlatform from './stubPlatform';
import { MockEventSender } from './testUtils';

// These tests cover the logic in diagnosticEvents.js. Some of the statistics in diagnostic events come from
// other SDK components; the tests for those components will verify that they generate the right values.

describe('DiagnosticId', () => {
  it('creates unique IDs', () => {
    const id1 = DiagnosticId('key');
    const id2 = DiagnosticId('key');
    expect(id1.diagnosticId).not.toEqual(id2.diagnosticId);
  });

  it('uses only last 6 characters of key', () => {
    const id = DiagnosticId('0123456789abcdef');
    expect(id.sdkKeySuffix).toEqual('abcdef');
  });
});

describe('DiagnosticsAccumulator', () => {
  it('sets initial properties', () => {
    const acc = DiagnosticsAccumulator(1000);
    expect(acc.getProps()).toEqual({
      dataSinceDate: 1000,
      droppedEvents: 0,
      eventsInLastBatch: 0,
      streamInits: [],
    });
  });

  it('increments dropped events', () => {
    const acc = DiagnosticsAccumulator(1000);
    acc.incrementDroppedEvents();
    acc.incrementDroppedEvents();
    expect(acc.getProps().droppedEvents).toEqual(2);
  });

  it('sets event count', () => {
    const acc = DiagnosticsAccumulator(1000);
    acc.setEventsInLastBatch(99);
    expect(acc.getProps().eventsInLastBatch).toEqual(99);
  });

  it('records successful stream init', () => {
    const acc = DiagnosticsAccumulator(1000);
    acc.recordStreamInit(1001, false, 500);
    expect(acc.getProps().streamInits).toEqual([{ timestamp: 1001, failed: false, durationMillis: 500 }]);
  });

  it('records failed stream init', () => {
    const acc = DiagnosticsAccumulator(1000);
    acc.recordStreamInit(1001, true, 500);
    expect(acc.getProps().streamInits).toEqual([{ timestamp: 1001, failed: true, durationMillis: 500 }]);
  });

  it('resets properties', () => {
    const acc = DiagnosticsAccumulator(1000);
    acc.incrementDroppedEvents();
    acc.setEventsInLastBatch(99);
    acc.recordStreamInit(1001, false, 500);
    acc.reset(1002);
    expect(acc.getProps()).toEqual({
      dataSinceDate: 1002,
      droppedEvents: 0,
      eventsInLastBatch: 0,
      streamInits: [],
    });
  });
});

describe('DiagnosticsManager', () => {
  const diagnosticId = DiagnosticId('123456');
  const envId = 'my-environment-id';
  const defaultStartTime = 1000;
  const defaultInterval = 100000;
  const localStorageKey = 'ld:' + envId + ':$diagnostics';
  const sdkData = {
    name: 'js-test',
    version: '0.0.1',
  };
  const platformData = {
    name: 'Positron',
    osArch: 'usrobots',
    osName: 'Robbie',
    osVersion: '1940',
  };
  const defaultConfig = {
    baseUrl: baseOptionDefs.baseUrl.default,
    streamUrl: baseOptionDefs.streamUrl.default,
    eventsUrl: baseOptionDefs.eventsUrl.default,
    eventCapacity: 50,
    fetchGoals: true,
    flushInterval: 1000,
    streamReconnectDelay: 900,
    diagnosticRecordingInterval: defaultInterval,
  };
  const defaultConfigInEvent = {
    allAttributesPrivate: false,
    allowFrequentDuplicateEvents: false,
    bootstrapMode: false,
    customBaseURI: false,
    customEventsURI: false,
    customStreamURI: false,
    diagnosticRecordingIntervalMillis: defaultInterval,
    eventsCapacity: defaultConfig.eventCapacity,
    eventsFlushIntervalMillis: defaultConfig.flushInterval,
    fetchGoalsDisabled: false,
    inlineUsersInEvents: false,
    reconnectTimeMillis: defaultConfig.streamReconnectDelay,
    sendEventsOnlyForVariation: false,
    streamingDisabled: true,
    usingSecureMode: false,
  };
  const expectedStatsForPeriodicEvent1 = {
    droppedEvents: 1,
    eventsInLastBatch: 2,
    streamInits: [{ timestamp: 1001, durationMillis: 100 }, { timestamp: 1002, failed: true, durationMillis: 500 }],
  };
  const expectedStatsForPeriodicEvent2 = {
    droppedEvents: 0,
    eventsInLastBatch: 1,
    streamInits: [{ timestamp: 1003, durationMillis: 99 }],
  };

  async function withManager(extraConfig, overridePlatform, asyncCallback) {
    const platform = overridePlatform || stubPlatform.defaults();
    platform.diagnosticSdkData = sdkData;
    platform.diagnosticPlatformData = platformData;
    const config = { ...defaultConfig, ...extraConfig };
    const acc = DiagnosticsAccumulator(defaultStartTime);
    const sender = MockEventSender();
    const m = DiagnosticsManager(platform, acc, sender, envId, config, diagnosticId);
    try {
      return await asyncCallback(m, acc, sender);
    } finally {
      m.stop();
    }
  }

  function setupStatsForPeriodicEvent1(acc) {
    acc.incrementDroppedEvents();
    acc.setEventsInLastBatch(2);
    acc.recordStreamInit(1001, false, 100);
    acc.recordStreamInit(1002, true, 500);
  }

  function setupStatsForPeriodicEvent2(acc) {
    acc.setEventsInLastBatch(1);
    acc.recordStreamInit(1003, false, 99);
  }

  async function getPostedEvent(sender, config) {
    const posted = await sender.calls.take();
    const baseUrl = { ...defaultConfig, ...config }.eventsUrl;
    expect(posted.url).toEqual(baseUrl + '/events/diagnostic/' + envId);
    return posted.events;
  }

  describe('in default mode', () => {
    it('does not send init event before start()', async () => {
      await withManager({}, null, async (manager, acc, sender) => {
        expect(sender.calls.length()).toEqual(0);
      });
    });

    it('sends init event on start() with default config', async () => {
      await withManager({}, null, async (manager, acc, sender) => {
        manager.start();
        expect(sender.calls.length()).toEqual(1);
        const initEvent = await getPostedEvent(sender);
        expect(initEvent).toEqual({
          kind: 'diagnostic-init',
          creationDate: defaultStartTime,
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: defaultConfigInEvent,
        });
      });
    });

    it('sends init event on start() with custom config', async () => {
      const configAndResultValues = [
        [{ allAttributesPrivate: true }, { allAttributesPrivate: true }],
        [{ allowFrequentDuplicateEvents: true }, { allowFrequentDuplicateEvents: true }],
        [{ bootstrap: {} }, { bootstrapMode: true }],
        [{ baseUrl: 'http://other' }, { customBaseURI: true }],
        [{ eventsUrl: 'http://other' }, { customEventsURI: true }],
        [{ streamUrl: 'http://other' }, { customStreamURI: true }],
        [{ diagnosticRecordingInterval: 99999 }, { diagnosticRecordingIntervalMillis: 99999 }],
        [{ eventCapacity: 222 }, { eventsCapacity: 222 }],
        [{ flushInterval: 2222 }, { eventsFlushIntervalMillis: 2222 }],
        [{ fetchGoals: false }, { fetchGoalsDisabled: true }],
        [{ inlineUsersInEvents: true }, { inlineUsersInEvents: true }],
        [{ streamReconnectDelay: 2222 }, { reconnectTimeMillis: 2222 }],
        [{ sendEventsOnlyForVariation: true }, { sendEventsOnlyForVariation: true }],
        [{ streaming: true }, { streamingDisabled: false }],
        [{ hash: 'x' }, { usingSecureMode: true }],
      ];
      for (const i in configAndResultValues) {
        const configOverrides = configAndResultValues[i][0];
        const expectedConfig = { ...defaultConfigInEvent, ...configAndResultValues[i][1] };
        await withManager(configOverrides, null, async (manager, acc, sender) => {
          manager.start();
          expect(sender.calls.length()).toEqual(1);
          const initEvent = await getPostedEvent(sender, configOverrides);
          expect(initEvent).toEqual({
            kind: 'diagnostic-init',
            creationDate: defaultStartTime,
            id: diagnosticId,
            sdk: sdkData,
            platform: platformData,
            configuration: expectedConfig,
          });
        });
      }
    });

    it('allows client to indicate that streaming is now enabled', async () => {
      await withManager({}, null, async (manager, acc, sender) => {
        manager.setStreaming(true);
        manager.start();
        expect(sender.calls.length()).toEqual(1);
        const initEvent = await getPostedEvent(sender);
        expect(initEvent).toEqual({
          kind: 'diagnostic-init',
          creationDate: defaultStartTime,
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: { ...defaultConfigInEvent, streamingDisabled: false },
        });
      });
    });

    it('sends periodic events', async () => {
      const interval = 100;
      // Note that since we haven't added any special instrumentation to DiagnosticsManager to let the test
      // control the exact timing of the periodic events, this test is assuming that we can do a few simple
      // steps before 100ms elapses.
      await withManager({ diagnosticRecordingInterval: interval }, null, async (manager, acc, sender) => {
        manager.start();
        const initEvent = await getPostedEvent(sender);
        expect(initEvent.kind).toEqual('diagnostic-init');

        setupStatsForPeriodicEvent1(acc);

        const periodic1 = await getPostedEvent(sender);
        expect(periodic1).toMatchObject({
          kind: 'diagnostic',
          dataSinceDate: defaultStartTime,
          id: diagnosticId,
          ...expectedStatsForPeriodicEvent1,
        });
        expect(periodic1.creationDate).toBeGreaterThanOrEqual(defaultStartTime);

        setupStatsForPeriodicEvent2(acc);

        const periodic2 = await getPostedEvent(sender);
        expect(periodic2).toMatchObject({
          kind: 'diagnostic',
          dataSinceDate: periodic1.creationDate,
          id: diagnosticId,
          ...expectedStatsForPeriodicEvent2,
        });
      });
    });
  });

  describe('in combined (browser) mode', () => {
    const interval = 100;
    const expectedConfig = { ...defaultConfigInEvent, diagnosticRecordingIntervalMillis: interval };

    it('does not send event before start()', async () => {
      const overridePlatform = stubPlatform.defaults();
      overridePlatform.diagnosticUseCombinedEvent = true;
      await withManager({}, overridePlatform, async (manager, acc, sender) => {
        expect(sender.calls.length()).toEqual(0);
      });
    });

    it('if local storage has no data, sends event on start(), then sends periodic event', async () => {
      const timeBeforeStart = new Date().getTime();
      const overridePlatform = stubPlatform.defaults();
      overridePlatform.diagnosticUseCombinedEvent = true;
      await withManager({ diagnosticRecordingInterval: interval }, overridePlatform, async (manager, acc, sender) => {
        manager.start();

        const firstEvent = await getPostedEvent(sender);
        expect(firstEvent).toMatchObject({
          kind: 'diagnostic-combined',
          id: diagnosticId,
          dataSinceDate: defaultStartTime,
          sdk: sdkData,
          platform: platformData,
          configuration: expectedConfig,
          droppedEvents: 0,
          eventsInLastBatch: 0,
          streamInits: [],
        });
        expect(firstEvent.creationDate).toBeGreaterThanOrEqual(timeBeforeStart);

        setupStatsForPeriodicEvent1(acc);

        const periodic1 = await getPostedEvent(sender);
        expect(periodic1).toMatchObject({
          kind: 'diagnostic-combined',
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: expectedConfig,
          ...expectedStatsForPeriodicEvent1,
        });
        expect(periodic1.dataSinceDate).toBeGreaterThan(firstEvent.dataSinceDate);
      });
    });

    it('if local storage has non-recent data, sends cached event on start(), then sends periodic event', async () => {
      const timeBeforeStart = new Date().getTime();
      const storedStats = {
        dataSinceDate: timeBeforeStart - interval - 1,
        droppedEvents: 1,
        eventsInLastBatch: 2,
        streamInits: [{ timestamp: 1000, durationMillis: 500 }],
      };
      const overridePlatform = stubPlatform.defaults();
      overridePlatform.diagnosticUseCombinedEvent = true;
      overridePlatform.testing.setLocalStorageImmediately(localStorageKey, JSON.stringify(storedStats));
      await withManager({ diagnosticRecordingInterval: interval }, overridePlatform, async (manager, acc, sender) => {
        const timeBeforeStart = new Date().getTime();
        manager.start();
        await sleepAsync(10); // manager's localstorage logic is async, so allow it to catch up with us

        expect(sender.calls.length()).toEqual(1);
        const firstEvent = await getPostedEvent(sender);
        expect(firstEvent).toMatchObject({
          kind: 'diagnostic-combined',
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: { ...defaultConfigInEvent, diagnosticRecordingIntervalMillis: interval },
          ...storedStats,
        });
        expect(firstEvent.creationDate).toBeGreaterThanOrEqual(timeBeforeStart);

        setupStatsForPeriodicEvent1(acc);

        const periodic1 = await getPostedEvent(sender);
        expect(periodic1).toMatchObject({
          kind: 'diagnostic-combined',
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: expectedConfig,
          ...expectedStatsForPeriodicEvent1,
        });
        expect(periodic1.dataSinceDate).toBeGreaterThan(firstEvent.dataSinceDate);
      });
    });

    it('defers event on start() if event was sent recently', async () => {
      const timeBeforeStart = new Date().getTime();
      const interval = 200;
      const storedStats = {
        dataSinceDate: timeBeforeStart - interval + 100,
        droppedEvents: 1,
        eventsInLastBatch: 2,
        streamInits: [{ timestamp: 1000, durationMillis: 500 }],
      };
      const overridePlatform = stubPlatform.defaults();
      overridePlatform.diagnosticUseCombinedEvent = true;
      overridePlatform.testing.setLocalStorageImmediately(localStorageKey, JSON.stringify(storedStats));
      await withManager({ diagnosticRecordingInterval: interval }, overridePlatform, async (manager, acc, sender) => {
        const timeBeforeStart = new Date().getTime();
        manager.start();
        await sleepAsync(10); // manager's localstorage logic is async, so allow it to catch up with us
        expect(sender.calls.length()).toEqual(0);

        acc.incrementDroppedEvents();
        acc.setEventsInLastBatch(3);
        acc.recordStreamInit(1001, false, 501);

        const firstEvent = await getPostedEvent(sender);
        expect(firstEvent).toMatchObject({
          kind: 'diagnostic-combined',
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: { ...defaultConfigInEvent, diagnosticRecordingIntervalMillis: interval },
          dataSinceDate: storedStats.dataSinceDate,
          droppedEvents: 2,
          eventsInLastBatch: 3,
          streamInits: [{ timestamp: 1000, durationMillis: 500 }, { timestamp: 1001, durationMillis: 501 }],
        });
        expect(firstEvent.creationDate).toBeGreaterThanOrEqual(timeBeforeStart);
      });
    });

    it('continues sending periodic events', async () => {
      // In the previous tests in this group, we always separately verified the first periodic event (after
      // the initial event) because there could be a different code path for scheduling it depending on the
      // initial conditions. But we can assume that the scheduling of the second event does not depend on the
      // initial conditions - it will always be scheduled when the first one gets sent.
      const interval = 100;
      const expectedConfig = { ...defaultConfigInEvent, diagnosticRecordingIntervalMillis: interval };
      const overridePlatform = stubPlatform.defaults();
      overridePlatform.diagnosticUseCombinedEvent = true;
      await withManager({ diagnosticRecordingInterval: interval }, overridePlatform, async (manager, acc, sender) => {
        manager.start();

        const firstEvent = await getPostedEvent(sender);
        expect(firstEvent).toMatchObject({
          kind: 'diagnostic-combined',
          dataSinceDate: defaultStartTime,
        });

        setupStatsForPeriodicEvent1(acc);

        const periodic1 = await getPostedEvent(sender);
        expect(periodic1).toMatchObject({
          kind: 'diagnostic-combined',
          ...expectedStatsForPeriodicEvent1,
        });
        expect(periodic1.dataSinceDate).toBeGreaterThan(firstEvent.dataSinceDate);

        setupStatsForPeriodicEvent2(acc);

        const periodic2 = (await sender.calls.take()).events;
        expect(periodic2).toMatchObject({
          kind: 'diagnostic-combined',
          id: diagnosticId,
          sdk: sdkData,
          platform: platformData,
          configuration: expectedConfig,
          ...expectedStatsForPeriodicEvent2,
        });
        expect(periodic2.dataSinceDate).toBeGreaterThan(periodic1.dataSinceDate);
      });
    });
  });
});
