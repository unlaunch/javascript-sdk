import { sleepAsync, eventSink } from 'launchdarkly-js-test-helpers';

import * as configuration from '../configuration';
import { ULInvalidArgumentError } from '../errors';
import * as messages from '../messages';
import EventEmitter from '../EventEmitter';

import * as stubPlatform from './stubPlatform';

describe('configuration', () => {
  function errorListener() {
    const logger = stubPlatform.logger();
    const emitter = EventEmitter(logger);
    const errorQueue = eventSink(emitter, 'error');
    return {
      emitter,
      logger,
      expectNoErrors: async () => {
        await sleepAsync(0); // errors are dispatched on next tick
        expect(errorQueue.length()).toEqual(0);
        expect(logger.output.error).toEqual([]);
      },
      expectError: async message => {
        await sleepAsync(0);
        expect(errorQueue.length()).toEqual(1);
        if (message) {
          expect(await errorQueue.take()).toEqual(new ULInvalidArgumentError(message));
        } else {
          expect((await errorQueue.take()).constructor.prototype.name).toEqual('LaunchDarklyInvalidArgumentError');
        }
      },
      expectWarningOnly: async message => {
        await sleepAsync(0);
        expect(errorQueue.length()).toEqual(0);
        expect(logger.output.warn).toContain(message);
      },
    };
  }

  async function expectDefault(name) {
    const listener = errorListener();
    const config = configuration.validate({}, listener.emitter, null, listener.logger);
    expect(config[name]).toBe(configuration.baseOptionDefs[name].default);
    await listener.expectNoErrors();
  }

  function checkDeprecated(oldName, newName, value) {
    const desc = newName
      ? 'allows "' + oldName + '" as a deprecated equivalent to "' + newName + '"'
      : 'warns that "' + oldName + '" is deprecated';
    it(desc, async () => {
      const listener = errorListener();
      const config0 = {};
      config0[oldName] = value;
      const config1 = configuration.validate(config0, listener.emitter, null, listener.logger);
      if (newName) {
        expect(config1[newName]).toBe(value);
        expect(config1[oldName]).toBeUndefined();
      } else {
        expect(config1[oldName]).toEqual(value);
      }
      await listener.expectWarningOnly(messages.deprecated(oldName, newName));
    });
  }

  checkDeprecated('all_attributes_private', 'allAttributesPrivate', true);
  checkDeprecated('private_attribute_names', 'privateAttributeNames', ['foo']);
  checkDeprecated('samplingInterval', null, 100);

  function checkBooleanProperty(name) {
    it('enforces boolean type and default for "' + name + '"', async () => {
      await expectDefault(name);

      let listener = errorListener();
      const configIn1 = {};
      configIn1[name] = true;
      const config1 = configuration.validate(configIn1, listener.emitter, null, listener.logger);
      expect(config1[name]).toBe(true);
      await listener.expectNoErrors();

      listener = errorListener();
      const configIn2 = {};
      configIn2[name] = false;
      const config2 = configuration.validate(configIn2, listener.emitter, null, listener.logger);
      expect(config2[name]).toBe(false);
      await listener.expectNoErrors();

      listener = errorListener();
      const configIn3 = {};
      configIn3[name] = 'abc';
      const config3 = configuration.validate(configIn3, listener.emitter, null, listener.logger);
      expect(config3[name]).toBe(true);
      await listener.expectError(messages.wrongOptionTypeBoolean(name, 'string'));

      listener = errorListener();
      const configIn4 = {};
      configIn4[name] = 0;
      const config4 = configuration.validate(configIn4, listener.emitter, null, listener.logger);
      expect(config4[name]).toBe(false);
      await listener.expectError(messages.wrongOptionTypeBoolean(name, 'number'));
    });
  }

  checkBooleanProperty('sendEvents');
  checkBooleanProperty('allAttributesPrivate');
  checkBooleanProperty('sendULHeaders');
  checkBooleanProperty('inlineUsersInEvents');
  checkBooleanProperty('allowFrequentDuplicateEvents');
  checkBooleanProperty('sendEventsOnlyForVariation');
  checkBooleanProperty('useReport');
  checkBooleanProperty('evaluationReasons');
  checkBooleanProperty('diagnosticOptOut');
  checkBooleanProperty('streaming');

  function checkNumericProperty(name, validValue) {
    it('enforces numeric type and default for "' + name + '"', async () => {
      await expectDefault(name);

      let listener = errorListener();
      const configIn1 = {};
      configIn1[name] = validValue;
      const config1 = configuration.validate(configIn1, listener.emitter, null, listener.logger);
      expect(config1[name]).toBe(validValue);
      await listener.expectNoErrors();

      listener = errorListener();
      const configIn2 = {};
      configIn2[name] = 'no';
      const config2 = configuration.validate(configIn2, listener.emitter, null, listener.logger);
      expect(config2[name]).toBe(configuration.baseOptionDefs[name].default);
      await listener.expectError(messages.wrongOptionType(name, 'number', 'string'));
    });
  }

  checkNumericProperty('eventCapacity', 200);
  checkNumericProperty('flushInterval', 3000);
  checkNumericProperty('samplingInterval', 1);
  checkNumericProperty('streamReconnectDelay', 2000);

  function checkMinimumValue(name, minimum) {
    it('disallows value below minimum of ' + minimum + ' for ' + name, async () => {
      const listener = errorListener();
      const configIn = {};
      configIn[name] = minimum - 1;
      const config = configuration.validate(configIn, listener.emitter, null, listener.logger);
      await listener.expectError(messages.optionBelowMinimum(name, minimum - 1, minimum));
      expect(config[name]).toBe(minimum);
    });
  }

  checkMinimumValue('eventCapacity', 1);
  checkMinimumValue('flushInterval', 2000);
  checkMinimumValue('samplingInterval', 0);
  checkMinimumValue('diagnosticRecordingInterval', 2000);

  function checkValidValue(name, goodValue) {
    it('allows value of ' + JSON.stringify(goodValue) + ' for ' + name, async () => {
      const listener = errorListener();
      const configIn = {};
      configIn[name] = goodValue;
      const config = configuration.validate(configIn, listener.emitter, null, listener.logger);
      await listener.expectNoErrors();
      expect(config[name]).toBe(goodValue);
    });
  }

  checkValidValue('bootstrap', 'localstorage');
  checkValidValue('bootstrap', { flag: 'value' });

  it('complains if you set an unknown property', async () => {
    const listener = errorListener();
    const configIn = { unsupportedThing: true };
    const config = configuration.validate(configIn, listener.emitter, null, listener.logger);
    await listener.expectError(messages.unknownOption('unsupportedThing'));
    expect(config.unsupportedThing).toBe(true);
  });

  it('allows platform-specific SDK options whose defaults are specified by the SDK', async () => {
    const listener = errorListener();
    const fn = () => {};
    const platformSpecificOptions = {
      extraBooleanOption: { default: true },
      extraNumericOption: { default: 2 },
      extraNumericOptionWithoutDefault: { type: 'number' },
      extraStringOption: { default: 'yes' },
      extraStringOptionWithoutDefault: { type: 'string' },
      extraFunctionOption: { type: 'function' },
    };
    const configIn = {
      extraBooleanOption: false,
      extraNumericOptionWithoutDefault: 'not a number',
      extraStringOptionWithoutDefault: 'ok',
      extraFunctionOption: fn,
    };
    const config = configuration.validate(configIn, listener.emitter, platformSpecificOptions, listener.logger);
    expect(config.extraBooleanOption).toBe(false);
    expect(config.extraNumericOption).toBe(2);
    expect(config.extraStringOption).toBe('yes');
    expect(config.extraStringOptionWithoutDefault).toBe('ok');
    expect(config.extraFunctionOption).toBe(fn);
    await listener.expectError(messages.wrongOptionType('extraNumericOptionWithoutDefault', 'number', 'string'));
  });
});
