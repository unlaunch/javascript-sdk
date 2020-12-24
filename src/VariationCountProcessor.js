export default function VariationCountProcessor() {
  const vc = {};

  let counters = {};

  vc.incrementVariationCount = function(event) {
    
    if (event.type === 'IMPRESSION') {
      const counterKey = event.flagKey + ':' + event.variationKey;
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
    }
  };

  vc.getVariationCountEvents = function() {

    const variationCountEvents = [] 
    const eventsOut = {};
    let empty = true;
    for (const i in counters) {
      const c = counters[i];
      let event = eventsOut[c.flagKey];
      if (!event) {
        let variationKey = c.variationKey
      
        event = {
          
          createdTime: c.createdTime,
          type: c.type,
          sdk: c.sdk,
          sdkVersion: c.sdkVersion,
          key: c.flagKey,
          flagStatus: c.flagStatus,
          evaluationReason: c.evaluationReason,
          properties: {}
          
        };
        event.properties[variationKey] = c.count
        eventsOut[c.flagKey] = event;
      }else{
        event.properties[c.variationKey] = c.count
      }
    
      empty = false;
    }
   
    for (const x in eventsOut) {
      variationCountEvents.push(eventsOut[x]);
    }
    return empty
      ? null
      : variationCountEvents;
  };

  vc.clearVariationCount = function() {
     counters = {};
  };

  return vc;
}
