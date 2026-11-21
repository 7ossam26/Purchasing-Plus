#!/bin/sh
set -eu

node --input-type=module -e '
  import { parseEnv } from "./dist/config/env.js";
  try {
    parseEnv(process.env);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
'
node node_modules/prisma/build/index.js migrate deploy
# server.js completes the transactional bootstrap and seed before listening.
exec node dist/server.js
