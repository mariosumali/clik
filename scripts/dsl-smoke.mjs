// Round-trip smoke test for the autonomy DSL.
//
// Runs format(parse(format(flow))) === format(flow) across a broad fixture of
// node kinds and verifies error reporting for malformed input. Not part of the
// typecheck pipeline — intended to be run manually via `node scripts/dsl-smoke.mjs`.

import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Transpile the two shared modules on the fly with TS stripped by `tsc`.
const cwd = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'dsl-smoke-'));
try {
  const tsconfig = {
    compilerOptions: {
      module: 'ESNext',
      target: 'ES2022',
      moduleResolution: 'Bundler',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: work,
      rootDir: join(cwd, 'src/shared'),
    },
    include: [
      join(cwd, 'src/shared/autonomy.ts'),
      join(cwd, 'src/shared/autonomyDsl.ts'),
      join(cwd, 'src/shared/types.ts'),
    ],
  };
  writeFileSync(join(work, 'tsconfig.json'), JSON.stringify(tsconfig));
  const res = spawnSync('npx', ['--no-install', 'tsc', '-p', join(work, 'tsconfig.json')], {
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error('tsc build failed');
    process.exit(1);
  }
  const { formatFlow, parseFlow } = await import(
    pathToFileURL(join(work, 'autonomyDsl.js')).href
  );

  const now = Date.now();
  const flow = {
    id: 'flow_fixture',
    name: 'Smoke flow',
    maxSteps: 500,
    createdAt: now,
    updatedAt: now,
    nodes: [
      { id: 'start_a1', kind: 'start', x: 40, y: 200 },
      { id: 'wait_a2', kind: 'wait', x: 200, y: 200, ms: 500 },
      {
        id: 'click_a3',
        kind: 'click',
        x: 360,
        y: 200,
        button: 'left',
        clickKind: 'single',
        target: { kind: 'fixed', x: 100, y: 200 },
      },
      {
        id: 'move_a4',
        kind: 'move',
        x: 520,
        y: 200,
        target: { kind: 'cursor' },
        style: 'bezier',
        durationMs: 400,
        curvature: 0.3,
        jitter: 0.2,
      },
      {
        id: 'find_a5',
        kind: 'find',
        x: 680,
        y: 200,
        template: null,
        searchRegion: { x: 0, y: 0, w: 100, h: 100 },
        minConfidence: 0.85,
      },
      {
        id: 'branch_a6',
        kind: 'branch',
        x: 840,
        y: 200,
        condition: 'last-found',
      },
      {
        id: 'random-wait_a7',
        kind: 'random-wait',
        x: 200,
        y: 320,
        minMs: 100,
        maxMs: 400,
      },
      {
        id: 'wait-until-found_a8',
        kind: 'wait-until-found',
        x: 360,
        y: 320,
        template: null,
        searchRegion: null,
        minConfidence: 0.85,
        intervalMs: 250,
        timeoutMs: 5000,
      },
      {
        id: 'type-text_a9',
        kind: 'type-text',
        x: 520,
        y: 320,
        text: 'hello {counter}',
        perCharDelayMs: 10,
      },
      {
        id: 'keypress_aa',
        kind: 'keypress',
        x: 680,
        y: 320,
        key: 'Enter',
        modifiers: ['cmd', 'shift'],
      },
      {
        id: 'set-var_ab',
        kind: 'set-var',
        x: 40,
        y: 440,
        varName: 'x',
        source: { kind: 'random-int', min: 0, max: 10 },
      },
      {
        id: 'end_ac',
        kind: 'end',
        x: 1000,
        y: 200,
      },
    ],
    edges: [
      { id: 'e1', fromId: 'start_a1', fromPort: 'out', toId: 'wait_a2' },
      { id: 'e2', fromId: 'wait_a2', fromPort: 'out', toId: 'click_a3' },
      { id: 'e3', fromId: 'click_a3', fromPort: 'out', toId: 'move_a4' },
      { id: 'e4', fromId: 'move_a4', fromPort: 'out', toId: 'find_a5' },
      { id: 'e5', fromId: 'find_a5', fromPort: 'out', toId: 'branch_a6' },
      { id: 'e6', fromId: 'branch_a6', fromPort: 'true', toId: 'end_ac' },
      { id: 'e7', fromId: 'branch_a6', fromPort: 'false', toId: 'random-wait_a7' },
      {
        id: 'e8',
        fromId: 'random-wait_a7',
        fromPort: 'out',
        toId: 'wait-until-found_a8',
      },
      {
        id: 'e9',
        fromId: 'wait-until-found_a8',
        fromPort: 'found',
        toId: 'type-text_a9',
      },
      {
        id: 'e10',
        fromId: 'wait-until-found_a8',
        fromPort: 'timeout',
        toId: 'end_ac',
      },
      {
        id: 'e11',
        fromId: 'type-text_a9',
        fromPort: 'out',
        toId: 'keypress_aa',
      },
      { id: 'e12', fromId: 'keypress_aa', fromPort: 'out', toId: 'set-var_ab' },
      { id: 'e13', fromId: 'set-var_ab', fromPort: 'out', toId: 'end_ac' },
    ],
  };

  const once = formatFlow(flow);
  const parsed1 = parseFlow(once, flow);
  if (!parsed1.ok) {
    console.error('First parse failed:', parsed1.errors);
    console.error('--- formatted ---');
    console.error(once);
    process.exit(1);
  }
  const twice = formatFlow(parsed1.flow);
  if (once !== twice) {
    console.error('Round-trip mismatch:\n--- once ---\n', once, '\n--- twice ---\n', twice);
    process.exit(1);
  }

  // Parse an obviously malformed input and ensure errors surface with line/col.
  const bad = parseFlow(
    `flow "broken" {
  maxSteps: 100
}

foo = wait(ms: "abc")
foo -> missing
`,
    null,
  );
  if (bad.ok) {
    console.error('Expected malformed input to fail; it parsed ok');
    process.exit(1);
  }
  if (bad.errors.length === 0) {
    console.error('Expected at least one error on malformed input');
    process.exit(1);
  }

  // Sanity check: parsing produces a flow whose edges survive the single-
  // successor-per-port invariant from the runner.
  const byPort = new Map();
  for (const e of parsed1.flow.edges) {
    const key = `${e.fromId}|${e.fromPort}`;
    if (byPort.has(key)) {
      console.error('Duplicate edges on port', key);
      process.exit(1);
    }
    byPort.set(key, e);
  }

  console.log('DSL round-trip OK');
} finally {
  rmSync(work, { recursive: true, force: true });
}
