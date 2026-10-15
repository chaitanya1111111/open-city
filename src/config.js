// Central game settings. Change numbers here to reshape the world.
export const CFG = {
  blocks: 12,         // mobile uses 12x12 blocks; desktop adds two blocks per side (~840m x 840m).
  blockSize: 60,      // metres from road centre to road centre
  roadWidth: 14,
  curbHeight: 0.15,
  laneOffset: 3.4,    // distance of a traffic lane from the road centre
  trafficCount: 36,
  pedestrianCount: 20,
  dayLengthSec: 720,  // one full 24h day in real seconds
  startHour: 8.5,
  seed: 2024,
};
