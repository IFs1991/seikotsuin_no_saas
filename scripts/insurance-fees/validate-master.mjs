#!/usr/bin/env node
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    moduleResolution: 'node',
  },
});

const { main } = require('./validate-master.ts');

try {
  await Promise.resolve(main(process.argv.slice(2)));
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'insurance:validate-master failed'
  );
  process.exitCode = 1;
}
