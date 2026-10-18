#!/usr/bin/env node
'use strict';

/*
 * Parol uchun bcrypt hash yaratadi (.env dagi ADMIN_PASSWORD_HASH uchun).
 *
 *   npm run hash-password
 *
 * Parol ekranda ko'rinmaydi. Natijani .env fayliga nusxalang.
 */

const readline = require('readline');
const bcrypt = require('bcryptjs');

const COST = 12;

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => {
      if (!muted) rl.output.write(s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readPiped() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
}

async function main() {
  let password;
  if (process.argv[2]) {
    password = process.argv[2];
    console.warn("Diqqat: parol buyruqlar tarixida qolishi mumkin. Argumentsiz ishga tushirish xavfsizroq.");
  } else if (!process.stdin.isTTY) {
    password = await readPiped();
  } else {
    password = await ask('Yangi parol: ');
    const again = await ask('Parolni takrorlang: ');
    if (password !== again) {
      console.error('Parollar bir xil emas.');
      process.exit(1);
    }
  }

  if (!password || password.length < 8 || password.length > 128) {
    console.error("Parol 8–128 belgidan iborat bo'lishi kerak.");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, COST);
  console.log('\n.env fayliga shu qatorni yozing:\n');
  console.log(`ADMIN_PASSWORD_HASH='${hash}'`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
