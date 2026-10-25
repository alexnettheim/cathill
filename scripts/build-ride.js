#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const auukiRoot = path.join(projectRoot, "vendor/auuki");
const rideOutput = path.join(projectRoot, "dist/ride");
fs.rmSync(rideOutput, { recursive:true, force:true });
execFileSync(path.join(auukiRoot, "node_modules/.bin/parcel"), [
  "build",
  "vendor/auuki/src/index.html",
  "--dist-dir",
  "dist/ride",
  "--public-url",
  "./",
  "--no-cache",
], {
  cwd:projectRoot,
  stdio:"inherit",
});
