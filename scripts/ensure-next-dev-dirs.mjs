#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const nextDir = path.resolve(process.cwd(), '.next');

for (const relativePath of ['static', 'static/chunks', 'cache']) {
  fs.mkdirSync(path.join(nextDir, relativePath), { recursive: true });
}
