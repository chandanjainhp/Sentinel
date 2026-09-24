/*
  Overnight event query helpers for Argus (industrial project events).
*/

import Event from '../models/event.model.js';

function getDayRange(nightDate) {
  const start = new Date(nightDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(nightDate);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function formatTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toISOString();
}

/**
 * All overnight industrial events for Argus.
 * @param {Date|string} nightDate
 * @returns {Promise<array>}
 */
export const getOvernightAlerts = async (nightDate) => {
  try {
    const { start, end } = getDayRange(nightDate);
    const dateStr =
      typeof nightDate === 'string'
        ? nightDate.slice(0, 10)
        : start.toISOString().split('T')[0];

    const events = await Event.find({
      $or: [
        { nightDate: dateStr },
        { timestamp: { $gte: start, $lte: end } },
      ],
    }).sort({ timestamp: 1 });

    console.log(
      `[LogsTool] getOvernightAlerts nightDate=${dateStr} count=${events.length}`
    );

    return events.map((event) => {
      const wp = event.projectContext?.workPackageId || 'unknown-WP';
      const asset = event.projectContext?.assetId;
      const ctx = asset ? `${wp} / ${asset}` : wp;
      let rawSummary = '';
      switch (event.type) {
        case 'equipment_anomaly':
          rawSummary = `Equipment anomaly on ${ctx}`;
          if (event.rawData?.signal) rawSummary += `: ${event.rawData.signal}`;
          break;
        case 'scada_alarm':
          rawSummary = `SCADA alarm on ${ctx}`;
          if (event.rawData?.alarmCode) rawSummary += `: ${event.rawData.alarmCode}`;
          break;
        case 'supply_delay':
          rawSummary = `Supply delay for ${ctx}`;
          if (event.rawData?.material) rawSummary += ` (${event.rawData.material})`;
          break;
        case 'safety_incident':
          rawSummary = `Safety incident on ${ctx}`;
          if (event.rawData?.note) rawSummary += `: ${event.rawData.note}`;
          break;
        default:
          rawSummary = `${event.type} on ${ctx}`;
      }

      return {
        id: event._id.toString(),
        type: event.type,
        workPackageId: wp,
        assetId: asset || null,
        time: formatTime(event.timestamp),
        severity: event.severity || 'uncertain',
        rawSummary,
      };
    });
  } catch (error) {
    console.error(`[LogsTool] Error in getOvernightAlerts:`, error.message);
    return [];
  }
};

export default { getOvernightAlerts };
