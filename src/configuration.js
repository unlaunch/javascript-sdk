import * as errors from './errors';
import * as messages from './messages';
import * as utils from './utils';

// baseOptionDefs should contain an entry for each supported configuration option in the common package.
// Each entry can have three properties:
// - "default": the default value if any
// - "type": a type constraint used if the type can't be inferred from the default value). The allowable
//   values are "boolean", "string", "number", "array", "object", "function", or several of these OR'd
//   together with "|" ("function|object").
// - "minimum": minimum value if any for numeric properties
//
// The extraOptionDefs parameter to validate() uses the same format.
export const baseOptionDefs = {
  //baseUrl: { default: 'https://app.launchdarkly.com' },
  // streamUrl: { default: 'https://clientstream.launchdarkly.com' },
  // eventsUrl: { default: 'https://events.launchdarkly.com' },
  baseUrl: { default: 'https://api-qa.unlaunch.io/api/v1' },
  streamUrl: { default: 'https://api-qa.unlaunch.io/api/v1' },
  eventsUrl: { default: 'https://api-qa.unlaunch.io/api/v1' },
  flagKeys: { default: []},
  offline: {default: false},
  sendEvents: { default: true },
  streaming: { type: 'boolean' }, // default for this is undefined, which is different from false
  sendLDHeaders: { default: true },
  inlineUsersInEvents: { default: false },
  allowFrequentDuplicateEvents: { default: false },
  sendEventsOnlyForVariation: { default: false },
  useReport: { default: false },
  evaluationReasons: { default: false },
  eventCapacity: { default: 100, minimum: 1 },
  flushInterval: { default: 2000, minimum: 2000 },
  samplingInterval: { default: 0, minimum: 0 },
  streamReconnectDelay: { default: 1000, minimum: 0 },
  allAttributesPrivate: { default: false },
  privateAttributeNames: { default: [] },
  bootstrap: { type: 'string|object' },
  diagnosticRecordingInterval: { default: 900000, minimum: 2000 },
  diagnosticOptOut: { default: true },
  wrapperName: { type: 'string' },
  wrapperVersion: { type: 'string' },
  stateProvider: { type: 'object' }, // not a public option, used internally
};

export function validate(options, emitter, extraOptionDefs, logger) {
  const optionDefs = utils.extend({ logger: { default: logger } }, baseOptionDefs, extraOptionDefs);

  const deprecatedOptions = {
    // eslint-disable-next-line camelcase
    all_attributes_private: 'allAttributesPrivate',
    // eslint-disable-next-line camelcase
    private_attribute_names: 'privateAttributeNames',
    samplingInterval: null,
  };

  function checkDeprecatedOptions(config) {
    const opts = config;
    Object.keys(deprecatedOptions).forEach(oldName => {
      if (opts[oldName] !== undefined) {
        const newName = deprecatedOptions[oldName];
        logger && logger.warn(messages.deprecated(oldName, newName));
        if (newName) {
          if (opts[newName] === undefined) {
            opts[newName] = opts[oldName];
          }
          delete opts[oldName];
        }
      }
    });
  }

  function applyDefaults(config) {
    // This works differently from utils.extend() in that it *will not* override a default value
    // if the provided value is explicitly set to null. This provides backward compatibility
    // since in the past we only used the provided values if they were truthy.
    const ret = utils.extend({}, config);
    Object.keys(optionDefs).forEach(name => {
      if (ret[name] === undefined || ret[name] === null) {
        ret[name] = optionDefs[name] && optionDefs[name].default;
      }
    });
    return ret;
  }

  function validateTypesAndNames(config) {
    const ret = utils.extend({}, config);
    const typeDescForValue = value => {
      if (value === null) {
        return 'any';
      }
      if (value === undefined) {
        return undefined;
      }
      if (Array.isArray(value)) {
        return 'array';
      }
      const t = typeof value;
      if (t === 'boolean' || t === 'string' || t === 'number' || t === 'function') {
        return t;
      }
      return 'object';
    };
    Object.keys(config).forEach(name => {
      const value = config[name];
      if (value !== null && value !== undefined) {
        const optionDef = optionDefs[name];
        if (optionDef === undefined) {
          reportArgumentError(messages.unknownOption(name));
        } else {
          const expectedType = optionDef.type || typeDescForValue(optionDef.default);
          if (expectedType !== 'any') {
            const allowedTypes = expectedType.split('|');
            const actualType = typeDescForValue(value);
            if (allowedTypes.indexOf(actualType) < 0) {
              if (expectedType === 'boolean') {
                ret[name] = !!value;
                reportArgumentError(messages.wrongOptionTypeBoolean(name, actualType));
              } else {
                reportArgumentError(messages.wrongOptionType(name, expectedType, actualType));
                ret[name] = optionDef.default;
              }
            } else {
              if (actualType === 'number' && optionDef.minimum !== undefined && value < optionDef.minimum) {
                reportArgumentError(messages.optionBelowMinimum(name, value, optionDef.minimum));
                ret[name] = optionDef.minimum;
              }
            }
          }
        }
      }
    });
    return ret;
  }

  function reportArgumentError(message) {
    utils.onNextTick(() => {
      emitter && emitter.maybeReportError(new errors.LDInvalidArgumentError(message));
    });
  }

  let config = utils.extend({}, options || {});

  checkDeprecatedOptions(config);

  config = applyDefaults(config);
  config = validateTypesAndNames(config);

  return config;
}
