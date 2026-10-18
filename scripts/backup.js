#!/usr/bin/env node
'use strict';

/*
 * Bazaning zaxira nusxasi: DATA_DIR/backups/tiers-YYYY-MM-DD_HHMM.db.gz
 *   npm run backup
 * Server ishlab turganda ham xavfsiz. Server o'zi ham har kuni avtomatik nusxa oladi.
 */

const { createBackup } = require('../src/backup');
const { db } = require('../src/db');

createBackup()
  .then((file) => {
    console.log(`OK: ${file}`);
    db.close();
  })
  .catch((err) => {
    console.error(`Xato: ${err.message}`);
    process.exit(1);
  });
