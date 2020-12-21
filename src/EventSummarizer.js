export default function EventSummarizer() {
  const es = {};

  let startDate = 0,
    endDate = 0,
    counters = {};

  es.summarizeEvent = function(event) {
    
    if (event.type === 'IMPRESSION') {
      const counterKey =
        event.flagKey + ':' + event.variationKey;
        // ':' +
        // (event.version !== null && event.version !== undefined ? event.version : '');
      const counterVal = counters[counterKey];
      if (counterVal) {
        counterVal.count = counterVal.count + 1;
        counters[counterKey] = counterVal;
      } else {
        counters[counterKey] = {
          count: 1,
          createdTime: event.createdTime,
          type: 'VARIATIONS_COUNT_EVENT',
          sdk: event.sdk,
          sdkVersion: event.sdkVersion,
          flagKey: event.flagKey,
          userId: event.userId,
          variationKey: event.variationKey,
          flagStatus: event.flagStatus,
          evaluationReason: event.evaluationReason,
          machineIp: event.machineIp,
          machineName: event.machineName
          
        };
      }
      // if (startDate === 0 || event.creationDate < startDate) {
      //   startDate = event.creationDate;
      // }
      // if (event.creationDate > endDate) {
      //   endDate = event.creationDate;
      // }
    }
  };

  es.getVariationCountEvents = function() {

    const variationCountEvents = [] 
    const eventsOut = {};
    let empty = true;
    for (const i in counters) {
      const c = counters[i];
      let event = eventsOut[c.flagKey];
      if (!event) {
        // event = {
        //   default: c.default,
        //   counters: [],
        // };
        let variationKey = c.variationKey
       
        event = {
          
          createdTime: c.createdTime,
          type: c.type,
          sdk: c.sdk,
          sdkVersion: c.sdkVersion,
          key: c.flagKey,
          //userId: c.userId,
          //variationKey: c.variationKey,
          flagStatus: c.flagStatus,
          evaluationReason: c.evaluationReason,
          //machineIp: c.machineIp,
         // machineName: c.machineName,
          properties: {}
          
        };
        event.properties[variationKey] = c.count
        eventsOut[c.flagKey] = event;
      }else{
        event.properties[c.variationKey] = c.count
      }
      // if (c.variation !== undefined && c.variation !== null) {
      //   counterOut.variation = c.variation;
      // }
     
      //event.properties.push(varCount);
     // eventsOut.push(event);
      empty = false;
    }
   
    for (const x in eventsOut) {
      variationCountEvents.push(eventsOut[x]);
    }
    return empty
      ? null
      : variationCountEvents;
  };

  es.getSummary = function() {
    const flagsOut = {};
    let empty = true;
    for (const i in counters) {
      const c = counters[i];
      let flag = flagsOut[c.key];
      if (!flag) {
        flag = {
          default: c.default,
          counters: [],
        };
        flagsOut[c.key] = flag;
      }
      const counterOut = {
        value: c.value,
        count: c.count,
      };
      if (c.variation !== undefined && c.variation !== null) {
        counterOut.variation = c.variation;
      }
      if (c.version) {
        counterOut.version = c.version;
      } else {
        counterOut.unknown = true;
      }
      flag.counters.push(counterOut);
      empty = false;
    }
    return empty
      ? null
      : {
          startDate,
          endDate,
          features: flagsOut,
        };
  };

  es.clearSummary = function() {
    startDate = 0;
    endDate = 0;
    counters = {};
  };

  return es;
}
