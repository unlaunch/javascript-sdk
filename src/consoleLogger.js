// Default implementation of our internal logging interface, which writes messages to the console.
// If no minimum level is specified, all messages will be logged. Setting the level to "none"
// disables all logging.

// Note that the global console variable is not guaranteed to be defined at all times in all
// browsers, so this implementation checks for its existence at the time a message is logged.
// See: https://www.beyondjava.net/console-log-surprises-with-internet-explorer-11-and-edge

export default function createConsoleLogger(level, maybePrefix) {
  const allLevels = ['debug', 'info', 'warn', 'error'];
  let prefix;
  if (maybePrefix !== null && maybePrefix !== undefined) {
    prefix = maybePrefix === '' ? '' : maybePrefix + ' ';
  } else {
    prefix = 'UL: ';
  }
  let minLevelIndex = 0;
  if (level) {
    if (level === 'none') {
      minLevelIndex = 100;
    } else {
      minLevelIndex = allLevels.indexOf(level);
    }
  }

  const logger = {};

  function log(levelIndex, methodName, msg) {
    if (levelIndex >= minLevelIndex && console) {
      const method = console[methodName];
      if (method) {
        const levelName = levelIndex < allLevels.length ? allLevels[levelIndex] : '?';
        method.call(console, prefix + '[' + levelName + '] ' + msg);
      }
    }
  }

  logger.debug = msg => log(0, 'log', msg); // eslint-disable-line no-console
  logger.info = msg => log(1, 'info', msg); // eslint-disable-line no-console
  logger.warn = msg => log(2, 'warn', msg); // eslint-disable-line no-console
  logger.error = msg => log(3, 'error', msg); // eslint-disable-line no-console

  return logger;
}
