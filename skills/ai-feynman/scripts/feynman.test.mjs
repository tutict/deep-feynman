// feynman.mjs 的回归测试。零依赖，用 Node 内置 node:test。
//
// 为什么需要这个文件：修复前脚本有 3 个「算错账」的 bug（SM-2 被题数灌水 /
// round 不推进且会回退 / record 默认绑错 session），而脚本本身没有任何测试，
// 改完无法证明「改对了」。这里每个待修 bug 对应一条断言。
//
// 运行：node --test skills/ai-feynman/scripts/feynman.test.mjs
//
// 纪律：本文件只调用 feynman.mjs 的命令行接口，绝不 import 它的内部函数——
// 内部函数（schedule / recomputeMastery / opt）都是待修对象，import 进来会把
// 实现的 bug 变成测试的 bug。

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'feynman.mjs');

// 每个测试用独立的临时目录当「项目根」，互不干扰，也绝不碰仓库里的真实工作区。
let ROOT = null;

before(() => {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-test-'));
  // 脚本要求 cwd 像项目根（阶段 D2 之后会强校验），放个标记文件过去。
  fs.mkdirSync(path.join(ROOT, '.git'), { recursive: true });
});

after(() => {
  if (ROOT) fs.rmSync(ROOT, { recursive: true, force: true });
});

// ── 调用脚本 ──────────────────────────────────────────────────────────
function run(args, { cwd = ROOT } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    // Windows 下 spawnSync 默认会吃掉失败信息，显式合并两路输出便于断言。
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    code: r.status,
    out: (r.stdout || '') + (r.stderr || ''),
    json: (() => {
      const p = path.join(cwd, 'feynman', 'x', 'state.json');
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
    })(),
  };
}

const wsDir = (slug = 'x') => path.join(ROOT, 'feynman', slug);
const readState = (slug = 'x') => JSON.parse(fs.readFileSync(path.join(wsDir(slug), 'state.json'), 'utf8'));
const readJson = (slug, name) => JSON.parse(fs.readFileSync(path.join(wsDir(slug), name), 'utf8'));

function writeJson(slug, name, data) {
  fs.writeFileSync(path.join(wsDir(slug), name), JSON.stringify(data, null, 2), 'utf8');
}

// ── 夹具 ──────────────────────────────────────────────────────────────
const CONCEPTS = [
  { id: 'alpha', title: '概念 A', weight: 1, pass_criteria: ['能说出 A 失效的两种输入'] },
  { id: 'beta', title: '概念 B', weight: 1, pass_criteria: ['能解释 B 的代价是什么'] },
];

// 每概念 3 题，含 boundary/counterexample 以通过 bank --check 的边界题告警。
const BANK = {
  questions: [
    { id: 'a1', concept: 'alpha', type: 'explain', difficulty: 1, prompt: '用大白话讲清 A 是什么', reference_answer: 'A 是这样运作的……', source_ref: 'src.md#L1' },
    { id: 'a2', concept: 'alpha', type: 'boundary', difficulty: 2, prompt: 'A 在什么情况下会失效，代价是什么', reference_answer: 'A 在输入超界时失效……', source_ref: 'src.md#L2' },
    { id: 'a3', concept: 'alpha', type: 'mechanism', difficulty: 2, prompt: '逐步说 A 内部每步的主语和动作', reference_answer: '第一步 X 调用 Y……', source_ref: 'src.md#L3' },
    { id: 'b1', concept: 'beta', type: 'explain', difficulty: 1, prompt: '用大白话讲清 B 是什么', reference_answer: 'B 是这样运作的……', source_ref: 'src.md#L4' },
    { id: 'b2', concept: 'beta', type: 'counterexample', difficulty: 2, prompt: '换个替代设计，B 的原理还站得住吗', reference_answer: '换 C 设计后 B 不再需要……', source_ref: 'src.md#L5' },
    { id: 'b3', concept: 'beta', type: 'mechanism', difficulty: 2, prompt: '逐步说 B 内部每步的主语和动作', reference_answer: '第一步 P 调用 Q……', source_ref: 'src.md#L6' },
    { id: 'a4', concept: 'alpha', type: 'apply', difficulty: 3, prompt: '给一个新场景，用 A 的机制推演结果', reference_answer: '在该场景下 A 会……', source_ref: 'src.md#L7' },
  ],
};

// gates 是阶段 C2 引入的结构化四道门证据。四门全过 = score 2。
const gatesAll = { G1: true, G2: true, G3: true, G4: true };
const gatesNoG3 = { G1: true, G2: true, G3: false, G4: true };

function setup(slug = 'x') {
  // 每条测试都从干净工作区开始：node:test 在同一文件内是顺序执行的，
  // 上一条留下的主题目录会让 init 直接报「主题已存在」，把断言噪声全淹掉。
  fs.rmSync(path.join(ROOT, 'feynman', slug), { recursive: true, force: true });
  const r = run(['init', slug, '--title', '测试主题', '--target', '回归测试']);
  assert.equal(r.code, 0, r.out);
  fs.writeFileSync(path.join(wsDir(slug), 'concepts.json'), JSON.stringify(CONCEPTS), 'utf8');
  // 用绝对路径：相对路径能否解析正是 D3 要单独验证的 bug，脚手架不能依赖它。
  const c = run(['concepts', slug, '--file', path.join('feynman', slug, 'concepts.json')]);
  assert.equal(c.code, 0, c.out);
  writeJson(slug, 'bank.json', BANK);
  return readState(slug);
}

// 填判分：默认四门全过；score<2 时必须配 gap_type/severity/note。
function fillResults(slug, sid, entries) {
  const p = path.join(wsDir(slug), 'results', `${sid}.json`);
  const r = readJson(slug, path.join('results', `${sid}.json`));
  r.session = sid;
  for (const e of entries) {
    const target = r.graded.find((g) => g.question_id === e.question_id);
    Object.assign(target, e);
  }
  fs.writeFileSync(p, JSON.stringify(r, null, 2), 'utf8');
  return p;
}

const scoreOf = (sid, qid) => {
  const r = readJson('x', path.join('results', `${sid}.json`));
  return r.graded.find((g) => g.question_id === qid).score;
};

// ═══════════════════════════════════════════════════════════════════
// 阶段 B：错账 bug
// ═══════════════════════════════════════════════════════════════════

test('B1: 一轮内同概念多题全过，SM-2 只推进一次（reps=1, interval=1）', () => {
  setup();
  // 固定 seed，抽到哪几题不确定，所以出 6 题确保 alpha 至少占多题；
  // 断言的是「同概念不管几题，reps 都只 +1」。
  const t = run(['test', 'x', '--n', '6', '--concepts', 'alpha', '--seed', '7']);
  assert.equal(t.code, 0, t.out);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  assert.ok(ids.length >= 2, '需要至少抽到 2 道 alpha 题才能验证按题灌水的 bug');

  const entries = ids.map((question_id) => ({ question_id, score: 2, gates: gatesAll }));
  fillResults('x', sid, entries);
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.equal(rec.code, 0, rec.out);

  const c = readState('x').concepts.alpha;
  assert.equal(c.reps, 1, `一轮 ${ids.length} 题后 reps 应为 1，实际 ${c.reps}——schedule 被按题调用了`);
  assert.equal(c.interval, 1, `interval 应为 1（reps=1），实际 ${c.interval}`);
});

test('B1b: 一轮内同概念有错题，lapses 只 +1 而非按题累加', () => {
  setup();
  const t = run(['test', 'x', '--n', '6', '--concepts', 'alpha', '--seed', '7']);
  assert.equal(t.code, 0, t.out);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;

  // 前两题错，第三题对 → 若按题累加，lapses 会是 2
  const entries = ids.map((question_id, i) =>
    i < 2
      ? { question_id, score: 0, gates: { G1: false, G2: true, G3: true, G4: true }, gap_type: '跳步', severity: '致命', note: '机制链断裂，中间步骤说不出主语' }
      : { question_id, score: 2, gates: gatesAll },
  );
  fillResults('x', sid, entries);
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.equal(rec.code, 0, rec.out);

  const c = readState('x').concepts.alpha;
  assert.equal(c.lapses, 1, `一轮 2 道错题后 lapses 应为 1，实际 ${c.lapses}——lapses 被按题累加了`);
});

test('B2: 连续两次 test 各自拿到不同 round', () => {
  setup();
  assert.equal(run(['test', 'x', '--n', '2', '--seed', '1']).code, 0);
  assert.equal(run(['test', 'x', '--n', '2', '--seed', '2']).code, 0);

  const ses = Object.values(readState('x').sessions);
  assert.equal(ses.length, 2);
  assert.notEqual(ses[0].round, ses[1].round, `两次 test 的 round 应不同，实际都是 ${ses[0].round}——round 没有在 test 侧推进`);
  assert.ok(ses[1].round > ses[0].round, '第二次 test 的 round 应更大');
});

test('B2b: 乱序 record 不会把 round 回退', () => {
  setup();
  run(['test', 'x', '--n', '2', '--seed', '1']);
  run(['test', 'x', '--n', '2', '--seed', '2']);
  const ses = Object.values(readState('x').sessions);
  const [s1, s2] = ses;

  // 先记录第 2 张卷（round 更大），再记录第 1 张
  for (const s of [s2, s1]) {
    const ids = readState('x').sessions[s.id].question_ids;
    fillResults('x', s.id, ids.map((question_id) => ({ question_id, score: 2, gates: gatesAll })));
    const rec = run(['record', 'x', '--session', s.id, '--results', path.join('feynman', 'x', 'results', `${s.id}.json`)]);
    assert.equal(rec.code, 0, rec.out);
  }

  const st = readState('x');
  assert.equal(st.round, Math.max(s1.round, s2.round), 'st.round 不该被后记录的旧卷回退');
  assert.ok(st.round >= s2.round, `st.round=${st.round} 不应小于最新轮的 ${s2.round}`);
});

test('B3: 多张待记录卷时，record 按 results 里的 session 字段绑定', () => {
  setup();
  run(['test', 'x', '--n', '2', '--seed', '1']);
  run(['test', 'x', '--n', '2', '--seed', '2']);
  const ses = Object.values(readState('x').sessions);
  const [s1, s2] = ses;

  // 填 s1 的判分文件，然后不带 --session 执行：应绑到 s1 而不是「最新」的 s2
  fillResults('x', s1.id, ses[0].question_ids.map((question_id) => ({ question_id, score: 2, gates: gatesAll })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${s1.id}.json`)]);
  assert.equal(rec.code, 0, `record 应成功绑定 ${s1.id}，实际报错：\n${rec.out}`);
  assert.match(rec.out, new RegExp(s1.id), `输出应提到 ${s1.id}`);
  const st = readState('x');
  assert.ok(st.sessions[s1.id].recorded, `${s1.id} 应被标记为已记录`);
  assert.ok(!st.sessions[s2.id].recorded, `${s2.id} 不应被误标为已记录（绑错 session 了）`);
});

// ═══════════════════════════════════════════════════════════════════
// 阶段 C：硬闸门
// ═══════════════════════════════════════════════════════════════════

test('C1: score 0 却标 severity=细节 → 必须报错（否则绕过 mastery 0.4 封顶）', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;

  fillResults('x', sid, ids.map((question_id) => ({
    question_id,
    score: 0,
    gates: { G1: false, G2: true, G3: true, G4: true },
    gap_type: '跳步',
    severity: '细节', // ← 故意绕过：机制链断裂却标细节
    note: '机制链断裂说不出来',
  })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.notEqual(rec.code, 0, 'score 0 标「细节」必须被拒绝：severity 自选会让 0.4 封顶永不触发\n' + rec.out);
  assert.match(rec.out, /severity/);
});

test('C1b: score 1 标 severity=致命 → 报错；score 0 标致命 → 放行且 mastery 封顶 0.4', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  let sid = Object.keys(readState('x').sessions)[0];
  let ids = readState('x').sessions[sid].question_ids;

  // score 1 配致命：文档映射是 score1→重要，放宽成致命会虚增封顶严重度
  fillResults('x', sid, ids.map((question_id) => ({
    question_id, score: 1, gates: gatesNoG3,
    gap_type: '边界失守', severity: '致命', note: '只讲优点说不出代价',
  })));
  let rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.notEqual(rec.code, 0, 'score 1 标致命应被拒绝（会虚增封顶）\n' + rec.out);

  // score 0 标致命（正确映射）：应放行，mastery 被封到 0.4
  fillResults('x', sid, ids.map((question_id) => ({
    question_id, score: 0, gates: { G1: false, G2: true, G3: true, G4: true },
    gap_type: '跳步', severity: '致命', note: '机制链断裂说不出来',
  })));
  rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.equal(rec.code, 0, rec.out);

  const c = readState('x').concepts.alpha;
  assert.ok(c.mastery <= 0.4, `有未闭合致命 gap 时 mastery 应 ≤0.4，实际 ${c.mastery}`);
});

test('C2: score 2 但四门不全 true → 报错（全填 2 就是这样被拦住的）', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;

  fillResults('x', sid, ids.map((question_id) => ({
    question_id, score: 2, gates: { G1: true, G2: true, G3: false, G4: true }, // 缺 G3 却给 2
  })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.notEqual(rec.code, 0, 'score 2 而 G3=false 必须被拒绝——否则「全填 2」畅通无阻\n' + rec.out);
  assert.match(rec.out, /G3/);
});

test('C2b: score 0 但四门全 true → 报错（反方向自相矛盾同样拦）', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;

  fillResults('x', sid, ids.map((question_id) => ({
    question_id, score: 0, gates: gatesAll, // 四门全过却说没通过
    gap_type: '跳步', severity: '致命', note: '和 gates 自相矛盾',
  })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.notEqual(rec.code, 0, 'score 0 而四门全 true 应被拒绝（gates 与 score 矛盾）\n' + rec.out);
});

test('C2c: 缺 gates 字段 → 报错并提示迁移，不能静默通过', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;

  // 老格式：只有 score，没有 gates
  fillResults('x', sid, ids.map((question_id) => ({ question_id, score: 2 })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.notEqual(rec.code, 0, '缺 gates 不能静默通过\n' + rec.out);
  assert.match(rec.out, /gates/);
});

test('C2d: score 1 时 G1+G2 必须为 true（G1 挂了不该算「懂机制」）', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;

  fillResults('x', sid, ids.map((question_id) => ({
    question_id, score: 1, gates: { G1: false, G2: true, G3: false, G4: true },
    gap_type: '术语遮蔽', severity: '重要', note: 'G1 挂了却给 score 1',
  })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.notEqual(rec.code, 0, 'score 1 要求 G1+G2 为 true\n' + rec.out);
});

test('C3: resolves 关闭「不属于本轮」概念的致命 gap → 报错', () => {
  setup();
  // 第一轮：alpha 考砸，制造致命 gap
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  let sid = Object.keys(readState('x').sessions)[0];
  let ids = readState('x').sessions[sid].question_ids;
  fillResults('x', sid, ids.map((question_id) => ({
    question_id, score: 0, gates: { G1: false, G2: true, G3: true, G4: true },
    gap_type: '跳步', severity: '致命', note: '机制链断裂说不出来',
  })));
  assert.equal(run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]).code, 0);

  const gap = readState('x').concepts.alpha.gaps[0];
  assert.equal(gap.severity, '致命');

  // 第二轮只考 beta，却声称闭合 alpha 的 gap
  run(['test', 'x', '--n', '1', '--concepts', 'beta', '--seed', '4']);
  sid = Object.keys(readState('x').sessions).at(-1);
  ids = readState('x').sessions[sid].question_ids;
  const p = fillResults('x', sid, ids.map((question_id) => ({ question_id, score: 2, gates: gatesAll })));
  const res = readJson('x', path.join('results', `${sid}.json`));
  res.resolves = [gap.gid];
  fs.writeFileSync(p, JSON.stringify(res, null, 2), 'utf8');

  const rec = run(['record', 'x', '--results', p]);
  assert.notEqual(rec.code, 0, '闭合不属于本轮的 gap 必须被拒绝\n' + rec.out);
  assert.ok(readState('x').concepts.alpha.gaps[0].resolved === false, '被拒绝后 gap 不应被标记闭合');
});

test('C4: 试卷正文不出现 type / 难度 / 概念 id（否则把要考哪道门泄给学习者）', () => {
  setup();
  const before = readState('x').concepts.alpha.mastery ?? 0;
  run(['test', 'x', '--n', '3', '--seed', '5']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ts = readState('x').sessions[sid].ts;
  const paper = fs.readFileSync(path.join(wsDir('x'), 'tests', `${ts}-${sid}.md`), 'utf8');
  const bank = readJson('x', 'bank.json');

  // 题型→门的映射是判分依据，不能出现在给学习者看的卷子里
  for (const q of bank.questions) {
    const qid = q.id.toUpperCase();
    const headerLine = paper.split('\n').find((l) => l.startsWith('## Q'));
    assert.ok(headerLine, '试卷应有题目标题行');
  }
  assert.ok(!/·\s*explain\s*·/.test(paper), `试卷不应出现题型 explain：\n${paper.slice(0, 400)}`);
  assert.ok(!/·\s*boundary\s*·/.test(paper), '试卷不应出现题型 boundary');
  assert.ok(!/难度\s*[123]\b/.test(paper), '试卷不应印出难度（boundary→G3、explain→G1 的映射等于泄题）');
  assert.ok(!paper.includes('概念 `alpha`'), '试卷不应印出概念 id（会把考什么概念告诉学习者）');

  // 判分说明段也不该出现在给学习者的卷子里
  assert.ok(!paper.includes('gap_type'), '试卷不应印出 9 个 gap_type 全名');
  void before;
});

// ═══════════════════════════════════════════════════════════════════
// 阶段 D：契约与 Windows 陷阱
// ═══════════════════════════════════════════════════════════════════

test('D1: --dir=<值> 等号形式必须生效，不能静默走默认目录', () => {
  const alt = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-alt-'));
  fs.mkdirSync(path.join(alt, '.codex'), { recursive: true });
  try {
    // 必须用等号形式：分开写 `--dir <值>` 时 opt() 的 indexOf 恰好能命中，
    // 测不出 indexOf 找不到就静默走 fallback 的问题。
    const r = run(['init', 'y', '--title', '等号参数', `--dir=${path.join(alt, 'feynman')}`]);
    assert.equal(r.code, 0, r.out);
    assert.ok(
      fs.existsSync(path.join(alt, 'feynman', 'y', 'state.json')),
      `--dir=<值> 未生效：工作区没落在 ${path.join(alt, 'feynman')}\n${r.out}`,
    );
    assert.ok(
      !fs.existsSync(path.join(ROOT, 'feynman', 'y')),
      '--dir=<值> 未生效时静默落到了默认目录 ./feynman——这正是要拦的行为',
    );
  } finally {
    fs.rmSync(alt, { recursive: true, force: true });
  }
});

test('D2: cwd 不是项目根时报错，而不是静默创建第二个空工作区', () => {
  const stray = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-stray-'));
  try {
    const r = run(['init', 'z', '--title', '错位'], { cwd: stray });
    assert.notEqual(r.code, 0, 'cwd 不含任何项目根标记时必须报错，否则会在随机目录里静默分裂出工作区\n' + r.out);
    assert.match(r.out, /项目根|根目录|\.git|\.codex/);
    assert.ok(!fs.existsSync(path.join(stray, 'feynman', 'z')), '不应在错误位置创建工作区');
  } finally {
    fs.rmSync(stray, { recursive: true, force: true });
  }
});

test('D2b: 项目根标记覆盖 .git / .codex / .qoder / .agents（skill 装在用户级时项目里没有 .qoder）', () => {
  for (const marker of ['.git', '.codex', '.qoder', '.agents']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-marker-'));
    try {
      fs.mkdirSync(path.join(dir, marker), { recursive: true });
      const r = run(['init', 'm', '--title', `标记 ${marker}`], { cwd: dir });
      assert.equal(r.code, 0, `cwd 含 ${marker} 时应被认作项目根：\n${r.out}`);
      assert.ok(fs.existsSync(path.join(dir, 'feynman', 'm', 'state.json')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('D2c: skill 装在 cwd 之外时，NEXT 提示里的命令用绝对路径（相对路径会以 .. 开头，换个目录就跑不通）', () => {
  const r = run(['init', 'p', '--title', '外部安装']);
  assert.equal(r.code, 0, r.out);
  // 测试脚本本身就在 cwd 之外运行（SCRIPT 在 skills/ 下，cwd 是临时目录），
  // 所以这里正好复现「用户级安装」的形状。
  const line = r.out.split('\n').find((l) => l.includes('node '));
  assert.ok(line, `应输出可复制的后续命令：\n${r.out}`);
  assert.ok(!/node \.\./.test(line), `不应给出以 .. 开头的相对路径：\n${line}`);
  assert.ok(line.includes(SCRIPT.split(path.sep).join('/')), `应给出脚本绝对路径：\n${line}`);
});
test('D3: concepts --file 在 cwd 找不到时回落到工作区内，且错误信息列出尝试路径', () => {
  const r = run(['init', 'c1', '--title', '路径回落']);
  assert.equal(r.code, 0, r.out);
  // 故意只在工作区内放 concepts.json（这正是 SKILL.md 示例命令的形状）
  fs.writeFileSync(path.join(wsDir('c1'), 'concepts.json'), JSON.stringify(CONCEPTS), 'utf8');

  const c = run(['concepts', 'c1', '--file', 'concepts.json']);
  assert.equal(c.code, 0, `应回落到工作区内的 concepts.json：\n${c.out}`);
  assert.equal(readState('c1').concepts.alpha.title, '概念 A');
});

test('D3b: 真的找不到时，错误信息要列出试过的路径', () => {
  const r = run(['init', 'c2', '--title', '找不到']);
  assert.equal(r.code, 0, r.out);
  const c = run(['concepts', 'c2', '--file', '不存在的文件.json']);
  assert.notEqual(c.code, 0, c.out);
  assert.match(c.out, /试过|尝试|查找过/, `错误信息应列出尝试过的路径：\n${c.out}`);
});

test('D4: init 生成的 sources.md 表头用「级」，状态含「已纠正」', () => {
  const r = run(['init', 'c3', '--title', '台账格式']);
  assert.equal(r.code, 0, r.out);
  const md = fs.readFileSync(path.join(wsDir('c3'), 'sources.md'), 'utf8');
  assert.match(md, /\| # \| claim \|/, '应有表头行');
  assert.ok(/\|\s*级\s*\|/.test(md), `表头应含「级」列，与 references/sources.md 规格一致：\n${md}`);
  assert.ok(!/\|\s*类型\s*\|/.test(md), '表头不应再用「类型」');
  assert.match(md, /已验证.*推断.*未知/, '应声明三态');
  assert.match(md, /已纠正/, '「已纠正」是 references/sources.md 实际在用的第 4 态，应正式声明');
});

test('D7: 空题库 bank --check 必须失败（否则 Phase 2 出口失效）', () => {
  const r = run(['init', 'c4', '--title', '空题库']);
  assert.equal(r.code, 0, r.out);
  const b = run(['bank', 'c4', '--check']);
  assert.notEqual(b.code, 0, `0 题题库应报错退出非 0，实际通过：\n${b.out}`);
  assert.match(b.out, /0 题|空|没有题/);
});

test('D6: 每概念不足 3 题 → 警告但不阻断', () => {
  setup();
  // alpha 原有 a1/a2/a3/a4 四题，删掉 a3 和 a4 后只剩 2 题，低于「每概念 ≥3 题」
  writeJson('x', 'bank.json', {
    questions: BANK.questions.filter((q) => q.id !== 'a3' && q.id !== 'a4'),
  });
  const b = run(['bank', 'x', '--check']);
  assert.equal(b.code, 0, `应只警告不阻断：\n${b.out}`);
  assert.match(b.out, /警告|!.*alpha/);
  assert.match(b.out, /alpha/, '警告应点名缺题的概念');
});

test('C5: apply 题在未达标时不参与抽题', () => {
  setup();
  const t = run(['test', 'x', '--n', '8', '--seed', '9']);
  assert.equal(t.code, 0, t.out);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  assert.ok(!ids.includes('a4'), `mastery=0（未达标）时不该抽到 apply 题 a4，实际抽到 ${ids.join(',')}`);
});

test('D8: 报错信息不出现 undefined，且不重复报同一题', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const p = path.join(wsDir('x'), 'results', `${sid}.json`);
  // 造一个既不存在于 bank 又不属于本卷的题 id
  const res = { session: sid, graded: [{ question_id: 'ghost', score: 2, gates: gatesAll }], resolves: [] };
  fs.writeFileSync(p, JSON.stringify(res, null, 2), 'utf8');

  const rec = run(['record', 'x', '--results', p]);
  assert.notEqual(rec.code, 0, rec.out);
  assert.ok(!rec.out.includes('undefined'), `错误信息不应含 undefined：\n${rec.out}`);
  const ghostLines = rec.out.split('\n').filter((l) => l.includes('ghost'));
  assert.ok(ghostLines.length <= 2, `同一题的错误信息应去重（当前 ${ghostLines.length} 条）：\n${rec.out}`);
});

// ═══════════════════════════════════════════════════════════════════
// 阶段 E：闭环摩擦（gaps / notes --scaffold）
// ═══════════════════════════════════════════════════════════════════

const gateFail = { G1: false, G2: false, G3: false, G4: false };

test('E1: 无 gap 时 gaps 输出提示，且不报错', () => {
  setup();
  const g = run(['gaps', 'x']);
  assert.equal(g.code, 0, g.out);
  assert.match(g.out, /无未闭合 gap/);
});

test('E2: gaps 列出 gid 与严重度优先排序，并给出可粘贴的 resolves 片段', () => {
  setup();
  run(['test', 'x', '--n', '2', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  // 第一题判 score 1（重要），第二题判 score 0（致命）
  fillResults(
    'x',
    sid,
    ids.map((question_id, i) =>
      i === 0
        ? { question_id, score: 1, gates: gatesNoG3, gap_type: '边界失守', severity: '重要', note: '原话：它就是更快一点' }
        : { question_id, score: 0, gates: gateFail, gap_type: '跳步', severity: '致命', note: '原话：然后就自动同步了' },
    ),
  );
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.equal(rec.code, 0, rec.out);

  const g = run(['gaps', 'x']);
  assert.equal(g.code, 0, g.out);
  assert.ok(g.out.indexOf('致命') < g.out.indexOf('重要'), `致命 gap 应排在重要之前：\n${g.out}`);
  assert.match(g.out, /"resolves": \["g\d+","g\d+"\]/, `应给出可粘贴的 resolves 片段：\n${g.out}`);
  assert.match(g.out, /src\.md#L/, `应带出 bank.json 的回源坐标：\n${g.out}`);
});

test('E3: gaps --concept 过滤，--all 含已闭合，未知概念报错', () => {
  setup();
  run(['test', 'x', '--n', '2', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  fillResults(
    'x',
    sid,
    ids.map((question_id) => ({ question_id, score: 0, gates: gateFail, gap_type: '跳步', severity: '致命', note: '原话：然后就自动同步了' })),
  );
  run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);

  const filtered = run(['gaps', 'x', '--concept', 'beta']);
  assert.equal(filtered.code, 0, filtered.out);
  assert.match(filtered.out, /无未闭合 gap/, `beta 无 gap，应提示无：\n${filtered.out}`);

  const bad = run(['gaps', 'x', '--concept', 'nope']);
  assert.notEqual(bad.code, 0, `未知概念应报错：\n${bad.out}`);

  // 重考 alpha 并闭合第一条 gap
  const gid = readState('x').concepts.alpha.gaps[0].gid;
  run(['test', 'x', '--n', '2', '--concepts', 'alpha', '--seed', '5']);
  const sid2 = Object.keys(readState('x').sessions).filter((s) => s !== sid).pop();
  const ids2 = readState('x').sessions[sid2].question_ids;
  const p = fillResults('x', sid2, ids2.map((question_id) => ({ question_id, score: 2, gates: gatesAll })));
  const r2 = readJson('x', path.join('results', `${sid2}.json`));
  r2.resolves = [gid];
  fs.writeFileSync(p, JSON.stringify(r2, null, 2), 'utf8');
  const rec2 = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid2}.json`)]);
  assert.equal(rec2.code, 0, rec2.out);

  const def = run(['gaps', 'x']);
  assert.ok(!new RegExp(`${gid}\\b`).test(def.out), `已闭合的 ${gid} 不应出现在默认视图：\n${def.out}`);
  const all = run(['gaps', 'x', '--all']);
  assert.match(all.out, new RegExp(gid), `--all 应含已闭合的 ${gid}：\n${all.out}`);
  assert.match(all.out, /已闭合/);
});

test('E4: notes --scaffold 遇未闭合致命 gap 拒绝，--force 放行（铁律 3）', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  fillResults(
    'x',
    sid,
    ids.map((question_id) => ({ question_id, score: 0, gates: gateFail, gap_type: '跳步', severity: '致命', note: '原话：然后就自动同步了' })),
  );
  run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);

  const n = run(['notes', 'x', '--scaffold']);
  assert.notEqual(n.code, 0, `有未闭合致命 gap 时应拒绝固化：\n${n.out}`);
  assert.match(n.out, /致命|铁律 3/);

  const f = run(['notes', 'x', '--scaffold', '--force']);
  assert.equal(f.code, 0, `--force 应放行：\n${f.out}`);
});

test('E5: notes --scaffold 把 gap 原话灌进第 4 节，已有内容时拒绝覆盖', () => {
  setup();
  run(['test', 'x', '--n', '1', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  fillResults(
    'x',
    sid,
    ids.map((question_id) => ({ question_id, score: 1, gates: gatesNoG3, gap_type: '边界失守', severity: '重要', note: '原话：它就是更快一点' })),
  );
  run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);

  const n = run(['notes', 'x', '--scaffold']);
  assert.equal(n.code, 0, n.out);
  const md = fs.readFileSync(path.join(wsDir('x'), 'notes.md'), 'utf8');
  assert.match(md, /## 4\. 我曾以为/);
  assert.match(md, /它就是更快一点/, `第 4 节应含 gap 原话：\n${md}`);
  assert.match(md, /我原以为：/, `第 4 节应留出「我原以为」的填空：\n${md}`);
  assert.match(md, /## 7\. 信源/);

  // 已有实质内容 → 拒绝覆盖
  fs.writeFileSync(path.join(wsDir('x'), 'notes.md'), '# 费曼笔记 · 测试主题\n\n## 0. 一句话本质\n\n已经写好的内容。\n', 'utf8');
  const n2 = run(['notes', 'x', '--scaffold']);
  assert.notEqual(n2.code, 0, `已有内容时应拒绝覆盖：\n${n2.out}`);
  assert.match(n2.out, /拒绝覆盖|已有内容/);
});
test('E6: 第 7 节优先用人工整理的信源表，不把分隔行或 claim 回源坐标当信源', () => {
  setup();
  fs.writeFileSync(
    path.join(wsDir('x'), 'sources.md'),
    [
      '# 信源台账 · 测试主题',
      '',
      '## 一手信源（T1）',
      '',
      '| 信源 | 说明 | 抓取日期 |',
      '|---|---|---|',
      '| 官方规范 A | 主信源 | 2026-01-02 |',
      '',
      '## 具体断言',
      '',
      '| # | claim | 信源 | 级 | 抓取日期 | 状态 |',
      '|---|-------|------|----|----------|------|',
      '| 1 | A 是这样运作的 | src.md#L1 | T1 | 2026-01-02 | 已验证 |',
      '',
    ].join('\n'),
    'utf8',
  );
  const n = run(['notes', 'x', '--scaffold']);
  assert.equal(n.code, 0, n.out);
  const md = fs.readFileSync(path.join(wsDir('x'), 'notes.md'), 'utf8');
  const sec7 = md.slice(md.indexOf('## 7. 信源'));
  assert.match(sec7, /官方规范 A — 2026-01-02/, `应摘录人工整理的信源：\n${sec7}`);
  assert.ok(!/^- --- /m.test(sec7), `不应把表格分隔行当信源：\n${sec7}`);
  assert.ok(!sec7.includes('src.md#L1'), `有人工信源表时不应回落到 claim 回源坐标：\n${sec7}`);
});
test('E7: gaps 把回源坐标放到行下方，不撑爆表格', () => {
  setup();
  run(['test', 'x', '--n', '2', '--concepts', 'alpha', '--seed', '3']);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  fillResults(
    'x',
    sid,
    ids.map((question_id) => ({ question_id, score: 0, gates: gateFail, gap_type: '跳步', severity: '致命', note: '原话：然后就自动同步了' })),
  );
  run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);

  const g = run(['gaps', 'x']);
  assert.equal(g.code, 0, g.out);
  const header = g.out.split(/\r?\n/).find((l) => l.startsWith('gid'));
  assert.ok(header && !header.includes('回源'), `表头不该有回源坐标列（会把每行撑爆）：${header}`);
  assert.match(g.out, /↳ 回源: /, `回源坐标应在行下方单独一行：\n${g.out}`);
});

test('E8: 第 7 节按「一手信源」表的级列分级，不把 T2/T3 误标成 T1', () => {
  setup();
  fs.writeFileSync(
    path.join(wsDir('x'), 'sources.md'),
    [
      '# 信源台账 · 测试主题',
      '',
      '## 一手信源',
      '',
      '| 信源 | 级 | 说明 | 抓取日期 |',
      '|---|---|---|---|',
      '| 平台官方公告 | T1 | 分成档位 | 2026-01-02 |',
      '| 行业框架 | T2 | 学科划分 | 2026-01-02 |',
      '| 从业者文章 | T3 | 开发时间线 | 2026-01-02 |',
      '',
    ].join('\n'),
    'utf8',
  );
  const n = run(['notes', 'x', '--scaffold']);
  assert.equal(n.code, 0, n.out);
  const md = fs.readFileSync(path.join(wsDir('x'), 'notes.md'), 'utf8');
  const sec7 = md.slice(md.indexOf('## 7. 信源'));
  const t1 = sec7.slice(sec7.indexOf('**T1'), sec7.indexOf('**T2'));
  assert.match(t1, /平台官方公告/, `T1 段应含平台官方公告：\n${sec7}`);
  assert.ok(!t1.includes('行业框架'), `T2 信源不该出现在 T1 段：\n${t1}`);
  assert.match(sec7, /\*\*T2[\s\S]*行业框架/, `T2 段应含行业框架：\n${sec7}`);
  assert.match(sec7, /\*\*T3[\s\S]*从业者文章/, `T3 段应含从业者文章：\n${sec7}`);
});

test('回归: 全绿链路 init→concepts→bank→test→record→gaps→notes→status 能跑通', () => {
  setup();
  assert.equal(run(['bank', 'x', '--check']).code, 0);
  const t = run(['test', 'x', '--n', '3', '--seed', '11']);
  assert.equal(t.code, 0, t.out);
  const sid = Object.keys(readState('x').sessions)[0];
  const ids = readState('x').sessions[sid].question_ids;
  fillResults('x', sid, ids.map((question_id) => ({ question_id, score: 2, gates: gatesAll })));
  const rec = run(['record', 'x', '--results', path.join('feynman', 'x', 'results', `${sid}.json`)]);
  assert.equal(rec.code, 0, rec.out);
  const g = run(['gaps', 'x']);
  assert.equal(g.code, 0, g.out);
  const n = run(['notes', 'x', '--scaffold']);
  assert.equal(n.code, 0, n.out);
  const s = run(['status', 'x']);
  assert.equal(s.code, 0, s.out);
  assert.match(s.out, /NEXT:/);
  void scoreOf;
});