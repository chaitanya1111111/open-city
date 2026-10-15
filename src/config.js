// Central game settings. Change numbers here to reshape the world.
export const CFG = {
  blocks: 8,          // city is blocks x blocks (8 => ~500m x 500m). Raise to grow the map!
  blockSize: 60,      // metres from road centre to road centre
  roadWidth: 14,
  curbHeight: 0.15,
  laneOffset: 3.4,    // distance of a traffic lane from the road centre
  trafficCount: 36,
  dayLengthSec: 720,  // one full 24h day in real seconds
  startHour: 8.5,
  seed: 2024,
};
