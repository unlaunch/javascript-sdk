import * as common from 'launchdarkly-js-sdk-common';
import GoalTracker from './GoalTracker';

const locationWatcherInterval = 300;

export default function GoalManager(clientVars, readyCallback) {
  let goals;
  let goalTracker;

  const ret = {};

  ret.goalKeyExists = key => {
    if (!goals) {
      return true;
    }
    for (let i = 0; i < goals.length; i++) {
      if (goals[i].kind === 'custom' && goals[i].key === key) {
        return true;
      }
    }
    return false;
  };

  function getGoalsPath() {
    return '/sdk/goals/' + clientVars.getEnvironmentId();
  }

  function refreshGoalTracker() {
    if (goalTracker) {
      goalTracker.dispose();
    }
    if (goals && goals.length) {
      goalTracker = GoalTracker(goals, sendGoalEvent);
    }
  }

  function sendGoalEvent(kind, goal) {
    const event = {
      kind: kind,
      key: goal.key,
      data: null,
      url: window.location.href,
      user: clientVars.ident.getUser(),
      creationDate: new Date().getTime(),
    };

    if (kind === 'click') {
      event.selector = goal.selector;
    }

    return clientVars.enqueueEvent(event);
  }

  function watchLocation(interval, callback) {
    let previousUrl = window.location.href;
    let currentUrl;

    function checkUrl() {
      currentUrl = window.location.href;

      if (currentUrl !== previousUrl) {
        previousUrl = currentUrl;
        callback();
      }
    }

    function poll(fn, interval) {
      fn();
      setTimeout(() => {
        poll(fn, interval);
      }, interval);
    }

    poll(checkUrl, interval);

    if (window.history && window.history.pushState) {
      window.addEventListener('popstate', checkUrl);
    } else {
      window.addEventListener('hashchange', checkUrl);
    }
  }

  clientVars.requestor
    .fetchJSON(getGoalsPath())
    .then(g => {
      if (g && g.length > 0) {
        goals = g;
        goalTracker = GoalTracker(goals, sendGoalEvent);
        watchLocation(locationWatcherInterval, refreshGoalTracker);
      }
      readyCallback();
    })
    .catch(err => {
      clientVars.emitter.maybeReportError(
        new common.errors.ULUnexpectedResponseError('Error fetching goals: ' + (err && err.message) ? err.message : err)
      );
      readyCallback();
    });

  return ret;
}
