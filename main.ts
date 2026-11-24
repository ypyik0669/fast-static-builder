// Standalone contest driver. No network, process spawning, or other file reads.
import {readFileSync,writeFileSync} from 'node:fs';
import {setFlagsFromString} from 'node:v8';
setFlagsFromString('--no-incremental-marking');
const {run}=await import('./solve.js');
const src=process.env.MAKEFUN_INPUT_DIR || '/input';
const dst=process.env.MAKEFUN_OUTPUT_DIR || '/output';
const cases=JSON.parse(readFileSync(src+'/cases.json','utf8'));
const results=cases.map(c=>run(c.input));
writeFileSync(dst+'/answers.json',JSON.stringify(results));
