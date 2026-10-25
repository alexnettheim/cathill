const assert = require('assert');
const fs = require('fs');
const path = require('path');

const rideMarkup = fs.readFileSync(
  path.join(__dirname, 'vendor/auuki/src/index.html'),
  'utf8'
);
const rideModels = fs.readFileSync(
  path.join(__dirname, 'vendor/auuki/src/models/models.js'),
  'utf8'
);

const visibleMetrics = [
  'power',
  'target',
  'interval-time',
  'heart-rate',
  'power-avg',
  'elapsed-time',
  'cadence'
];

for (const metric of visibleMetrics) {
  assert.match(
    rideMarkup,
    new RegExp(`id=["']data-tile--${metric}["']`),
    `Expected ${metric} to remain on the Ride dashboard`
  );
}

const removedMetrics = [
  'speed',
  'slope',
  'distance',
  'smo2',
  'thb',
  'core-body-temperature',
  'skin-temperature'
];

for (const metric of removedMetrics) {
  assert.doesNotMatch(
    rideMarkup,
    new RegExp(`id=["']data-tile--${metric}["']`),
    `Expected ${metric} to be absent from the Ride dashboard`
  );
}

assert.doesNotMatch(
  rideMarkup,
  /<data-tile-switch-group\b/,
  'Expected the alternate metric carousel to be removed'
);

assert.match(rideMarkup, /id=["']sensors-menu-btn["']/, 'Expected a Sensors menu button');
assert.match(rideMarkup, /class=["'][^"']*sensor-alert/, 'Expected a missing-sensor notification dot');
assert.match(rideMarkup, /class=["']connection-switch--label["']>Trainer</, 'Expected Trainer terminology in the sensor menu');
assert.doesNotMatch(rideMarkup, /id=["']workouts-tab-btn["']/, 'Expected the redundant Workouts navigation item to be removed');
assert.match(rideMarkup, /ride-load-status/, 'Expected the loaded-workout message inside the data grid');
assert.match(rideModels, /samples,\s*\n\s*};/, 'Expected completed rides to persist sensor samples');

assert.doesNotMatch(
  rideMarkup,
  /id=["']slope-(?:mode-btn|mode-controls|control-btn)["']/,
  'Expected Slope mode controls to be absent from the Ride dashboard'
);

console.log('Ride dashboard regression tests passed.');
