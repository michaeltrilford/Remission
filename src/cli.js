#!/usr/bin/env node

import { main } from "./remission.js";

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
