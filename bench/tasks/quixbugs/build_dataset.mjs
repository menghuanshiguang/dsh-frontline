import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const Q = process.env.QUIX ?? '/data/user/0/com.dsharnessmobile.shell/files/home/tmp/gh/QuixBugs';
const list = process.env.QUIX_LIST ?? `${Q}/../quix-list.txt`;
const names = readFileSync(list, 'utf8').trim().split('\n');
const tasks = names.map((name) => ({
  name,
  buggy: readFileSync(join(Q, 'python_programs', `${name}.py`), 'utf8'),
  tests: readFileSync(join(Q, 'json_testcases', `${name}.json`), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line)),
}));
writeFileSync(new URL('./data/dataset.json', import.meta.url), JSON.stringify(tasks, null, 2));
console.log('tasks', tasks.length, 'cases', tasks.reduce((s, t) => s + t.tests.length, 0));
