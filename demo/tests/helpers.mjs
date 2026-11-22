import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const load = (name) => JSON.parse(readFileSync(join(dataDir, `${name}.json`), 'utf8'));

// 브라우저의 store.state와 같은 모양
export function demoState() {
  const ocr = load('ocr-mock');
  return {
    members: load('members'),
    meds: load('meds'),
    products: load('products'),
    slots: load('slots'),
    presets: load('presets'),
    limits: load('limits'),
    interactions: load('interactions'),
    copy: load('copy'),
    health: load('health'),
    logs: load('logs'),
    guideRules: load('guide-rules'),
    ocr,
    probiotics: ocr['label-probiotics.svg'],
  };
}
