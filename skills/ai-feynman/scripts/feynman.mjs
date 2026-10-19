#!/usr/bin/env node
// 费曼闭环的确定性簿记：抽题、SM-2 排期、mastery、gap log。判分始终由模型完成，本脚本不评判内容。

import fs from 'node:fs';
import path from 'node:path';

const SEVERITIES = ['致命', '重要', '细节'];
const GAP_TYPES = ['术语遮蔽', '跳步', '伪因果', '边界失守', '类比反噬', '鹦鹉学舌', '粒度错配', '事实错误', '未验证'];
const Q_TYPES = ['explain', 'mechanism', 'boundary', 'counterexample', 'trace', 'compare', 'apply'];
const GATE_KEYS = ['G1', 'G2', 'G3', 'G4'];
const FATAL_MASTERY_CAP = 0.4;
const HISTORY_WINDOW = 5;
const PASS_MASTERY = 0.8;

const USAGE = `用法: node feynman.mjs <command> <slug> [options]

  init      <slug> --title "标题" [--target "为什么学"] [--dir feynman]
  concepts  <slug> --file concepts.json
  bank      <slug> --check
  test      <slug> [--n 8] [--concepts a,b] [--due-only] [--seed S]
  record    <slug> --results results/sN.json [--session sN]
  status    <slug>

公共选项: --dir <工作区根目录，默认 ./feynman>`;

const argv = process.argv.slice(2);
const cmd = argv[0];
const slug = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;

function opt(name, fallback = null) {
  // 同时接受 `--k v` 与 `--k=v`。原先只用 indexOf 找 `--k`，导致 `--k=v` 这种
  // 等号写法整条匹配不上、静默落回 fallback —— --dir 传错时会写到错误目录还不报错。
  const i = argv.indexOf(`--${name}`);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq != null) {
    const v = eq.slice(name.length + 3);
    if (v) return v;
  }
  return fallback;
}
const flag = (name) => argv.includes(`--${name}`) || argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

const ROOT = path.resolve(opt('dir', 'feynman'));
const topicDir = slug ? path.join(ROOT, slug) : null;
const statePath = () => path.join(topicDir, 'state.json');
const bankPath = () => path.join(topicDir, 'bank.json');

// cwd 必须是项目根，否则 path.resolve 会把工作区落到调用者当时的目录，
// 静默分裂出第二份同名工作区。启动时就说清，比事后对着错目录排查便宜得多。
// 标记文件覆盖常见 harness：.git（任何仓库）、.codex（Codex）、.qoder（Qoder）、
// .agents（agent 配置目录）。skill 装在用户级（如 ~/.codex/skills/ai-feynman）时，
// 项目根里不会有 skill 自己的目录，所以只能靠这些标记判断。
const ROOT_MARKERS = ['.git', '.codex', '.qoder', '.agents'];
function assertProjectRoot() {
  const cwd = process.cwd();
  if (ROOT_MARKERS.some((m) => fs.existsSync(path.join(cwd, m)))) return;
  fail(
    `必须在项目根执行（cwd: ${cwd}）\n` +
      `未找到 ${ROOT_MARKERS.join(' / ')} 中的任何一个。工作区路径按 cwd 解析，在子目录里跑会静默创建第二份工作区。\n` +
      `cd 到项目根后重试；确认路径无误也可显式指定 --dir <工作区根目录>。`,
  );
}

// 文件查找：先试 cwd，再试工作区内。SKILL.md 的示例命令写的是裸文件名
// （`concepts <slug> --file concepts.json`），而文件实际落在工作区里，
// 只按 cwd 解析会 ENOENT。
function resolveInputPath(file) {
  const tried = [path.resolve(file)];
  if (topicDir && !tried.includes(path.join(topicDir, file))) tried.push(path.join(topicDir, file));
  for (const p of tried) if (fs.existsSync(p)) return p;
  fail(`找不到文件: ${file}\n试过: ${tried.join('\n      ')}`);
}

// 提示里的后续命令必须是可直接复制执行的，否则调用方会照着 "node feynman.mjs ..." 跑出 ENOENT。
// Windows 上统一用正斜杠：反斜杠在 Git Bash / sh 里会被当作转义符。
const selfCmd = () => {
  const abs = path.resolve(process.argv[1]).split(path.sep).join('/');
  const rel = path.relative(process.cwd(), abs).split(path.sep).join('/');
  // skill 装在 cwd 之外（用户级 ~/.codex/skills/ai-feynman）时 rel 会以 .. 开头，
  // 那种相对路径换个目录就跑不通，直接给绝对路径。路径含空格时加引号。
  const p = rel && !rel.startsWith('..') ? rel : abs;
  return `node ${p.includes(' ') ? `"${p}"` : p}`;
};

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJSON(p, what) {
  if (!fs.existsSync(p)) fail(`${what} 不存在: ${p}`);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail(`${what} 不是合法 JSON (${path.basename(p)}): ${e.message.split('\n')[0]}`);
  }
}

function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function appendText(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, text, 'utf8');
}

const pad2 = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayISO = () => fmtDate(new Date());
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}
function stamp() {
  const d = new Date();
  // 末尾加随机后缀：原实现只精确到秒，同一秒内连出两卷会撞文件名互相覆盖。
  const salt = Math.random().toString(36).slice(2, 6);
  return `${fmtDate(d).replaceAll('-', '')}-${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}-${salt}`;
}

function loadState() {
  if (!slug) fail(`缺少 <slug>。\n${USAGE}`);
  if (!fs.existsSync(topicDir)) {
    const known = fs.existsSync(ROOT)
      ? fs.readdirSync(ROOT).filter((d) => fs.statSync(path.join(ROOT, d)).isDirectory())
      : [];
    fail(
      `主题不存在: ${topicDir}\n` +
        (known.length ? `已有主题: ${known.join(', ')}` : `先运行: node feynman.mjs init <slug> --title "..."`),
    );
  }
  return readJSON(statePath(), 'state.json');
}

function rng(seed) {
  if (seed == null) return Math.random;
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(items, weightOf, rand) {
  const w = items.map((it) => Math.max(0, weightOf(it)));
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) return items.length ? items[Math.floor(rand() * items.length)] : null;
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function openGaps(c, sev) {
  return (c.gaps || []).filter((g) => !g.resolved && (!sev || g.severity === sev));
}

function recomputeMastery(c) {
  const hist = (c.history || []).slice(-HISTORY_WINDOW);
  if (!hist.length) return 0;
  const base = hist.reduce((s, h) => s + h.score / 2, 0) / hist.length;
  // 致命 gap 一票否决：只要还有未闭合的致命 gap，mastery 封顶，防止「答对细节题掩盖核心理解错误」。
  const capped = openGaps(c, '致命').length > 0 ? Math.min(base, FATAL_MASTERY_CAP) : base;
  return Math.round(capped * 1000) / 1000;
}

function schedule(c, score) {
  const q = score === 2 ? 5 : score === 1 ? 3 : 1;
  c.ease = Math.max(1.3, Math.round(((c.ease ?? 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 100) / 100);
  if (q < 3) {
    c.reps = 0;
    c.interval = 0;
    c.lapses = (c.lapses ?? 0) + 1;
  } else {
    c.reps = (c.reps ?? 0) + 1;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.max(1, Math.round((c.interval ?? 1) * c.ease));
  }
  c.due = addDays(todayISO(), c.interval);
}

const bar = (m, w = 12) => {
  const f = Math.max(0, Math.min(w, Math.round((m || 0) * w)));
  return '█'.repeat(f) + '░'.repeat(w - f);
};
const padEnd = (s, n) => {
  // 中日韩字符按 2 列宽对齐
  let width = 0;
  for (const ch of String(s)) width += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(ch) ? 2 : 1;
  return String(s) + ' '.repeat(Math.max(0, n - width));
};

function nextAction(st) {
  const cs = Object.values(st.concepts);
  if (!cs.length) return `尚未注册概念 → 回到 Phase 0 定标，写 concepts.json 后运行: ${selfCmd()} concepts ${st.slug} --file concepts.json`;
  const fatal = cs.reduce((s, c) => s + openGaps(c, '致命').length, 0);
  if (fatal > 0)
    return `仍有 ${fatal} 个致命 gap 未闭合 → 回到 Phase 5 定向回源，**禁止进入 Phase 6 固化**。闭合后在 results 里用 resolves:["g<id>"] 标记，再 ${selfCmd()} record ${st.slug} --results <file>`;
  const weak = cs.filter((c) => (c.mastery ?? 0) < PASS_MASTERY);
  if (weak.length)
    return `${weak.length} 个概念 mastery < ${PASS_MASTERY} → 回到 Phase 3 复述，只对弱项出卷: ${selfCmd()} test ${st.slug} --concepts ${weak.map((c) => c.id).join(',')}`;
  const due = cs.filter((c) => c.due && c.due <= todayISO());
  if (due.length) return `全部达标，但 ${due.length} 个概念已到复习期 → ${selfCmd()} test ${st.slug} --due-only`;
  return `全部概念 mastery ≥ ${PASS_MASTERY} 且无致命 gap → 可进入 Phase 6 固化（写笔记 / 出卷 / 可视化）。`;
}

// ── init ──────────────────────────────────────────────────────────────
function cmdInit() {
  if (!slug) fail(`用法: init <slug> --title "标题"\n${USAGE}`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail(`slug 只能是小写字母、数字、连字符: ${slug}`);
  if (fs.existsSync(topicDir)) fail(`主题已存在: ${topicDir}`);
  const title = opt('title', slug);

  fs.mkdirSync(path.join(topicDir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(topicDir, 'results'), { recursive: true });
  writeJSON(statePath(), {
    slug,
    title,
    target: opt('target', ''),
    created: todayISO(),
    round: 0,
    gap_seq: 0,
    concepts: {},
    sessions: {},
  });
  writeJSON(bankPath(), { questions: [] });
  // 表头用「级」与 references/sources.md 的规格一致（原先这里是「类型」，同一份台账两套列名）。
  // 状态四态：已验证 / 推断 / 未知 / 已纠正（已纠正 = 取证后被更权威信源推翻并已改写）。
  fs.writeFileSync(path.join(topicDir, 'sources.md'), `# 信源台账 · ${title}\n\n> 每条 claim 必须能回指到具体位置。状态: 已验证 / 推断 / 未知 / 已纠正。\n> 「未知」不是失职，是明确划出的边界：这些 claim 不作为判分依据。\n\n| # | claim | 信源（file:line / URL#anchor / 论文 §） | 级 | 抓取日期 | 状态 |\n|---|-------|------------------------------------------|----|----------|------|\n`, 'utf8');
  fs.writeFileSync(path.join(topicDir, 'notes.md'), `# 费曼笔记 · ${title}\n\n> Phase 6 才写。写作判据：一个聪明的外行读完能复述出机制链。\n`, 'utf8');
  fs.writeFileSync(path.join(topicDir, 'gaps.md'), `# Gap Log · ${title}\n\n> 由 record 子命令自动追加。这是本主题最有价值的资产：它记录你**曾经**以为懂了的地方。\n`, 'utf8');

  console.log(`已创建主题工作区: ${topicDir}`);
  console.log(`  title  = ${title}`);
  console.log(`  target = ${opt('target', '(未设置 — 建议补上：调试 / 面试 / 设计决策 / 教学)')}`);
  console.log('\n目录:');
  console.log('  state.json   学习状态（脚本独占写入，勿手改 mastery/ease/due）');
  console.log('  bank.json    题库（模型写入，用 bank --check 校验）');
  console.log('  sources.md   信源台账（Phase 1 取证产出）');
  console.log('  notes.md     费曼笔记（Phase 6 产出）');
  console.log('  gaps.md      Gap Log（record 自动追加）');
  console.log('  tests/       自测卷（不含参考答案）');
  console.log('  results/     判分结果（模型写入，record 消费）');
  console.log(`\n下一步: Phase 0 定标 → 写 concepts.json → ${selfCmd()} concepts ${slug} --file concepts.json`);
}

// ── concepts ──────────────────────────────────────────────────────────
function cmdConcepts() {
  const st = loadState();
  const file = opt('file');
  if (!file) fail('用法: concepts <slug> --file concepts.json');
  const raw = readJSON(resolveInputPath(file), 'concepts 文件');
  const list = Array.isArray(raw) ? raw : raw.concepts;
  if (!Array.isArray(list) || !list.length) fail('concepts 文件必须是非空数组，或 {concepts:[...]}');

  const seen = new Set();
  let added = 0;
  let updated = 0;
  for (const c of list) {
    if (!c || typeof c !== 'object') fail(`概念条目必须是对象: ${JSON.stringify(c).slice(0, 120)}`);
    if (!c.id) fail(`概念缺少 id: ${JSON.stringify(c).slice(0, 120)}`);
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(c.id)) fail(`概念 id 只能用小写字母/数字/._- : ${c.id}`);
    if (seen.has(c.id)) fail(`概念 id 重复: ${c.id}`);
    seen.add(c.id);
    if (!Array.isArray(c.pass_criteria) || !c.pass_criteria.length)
      fail(`概念 ${c.id} 缺少 pass_criteria（掌握判据必须可证伪，至少 1 条）`);

    const prev = st.concepts[c.id];
    st.concepts[c.id] = {
      id: c.id,
      title: c.title || c.id,
      pass_criteria: c.pass_criteria,
      weight: Number(c.weight) > 0 ? Number(c.weight) : 1,
      mastery: prev?.mastery ?? 0,
      ease: prev?.ease ?? 2.5,
      reps: prev?.reps ?? 0,
      lapses: prev?.lapses ?? 0,
      interval: prev?.interval ?? 0,
      due: prev?.due ?? todayISO(),
      history: prev?.history ?? [],
      gaps: prev?.gaps ?? [],
    };
    prev ? updated++ : added++;
  }
  writeJSON(statePath(), st);

  console.log(`概念已注册: 新增 ${added}，更新 ${updated}，共 ${Object.keys(st.concepts).length}`);
  for (const c of Object.values(st.concepts))
    console.log(`  ${padEnd(c.id, 26)} ${bar(c.mastery)} ${String(c.mastery ?? 0).padStart(5)}  ${c.title}`);
  console.log(`\nNEXT: Phase 1 取证 → 填 sources.md，再写 bank.json，然后 ${selfCmd()} bank ${st.slug} --check`);
}

// ── bank --check ──────────────────────────────────────────────────────
function cmdBank() {
  const st = loadState();
  if (!flag('check')) fail(`用法: bank <slug> --check`);
  const qs = readJSON(bankPath(), 'bank.json').questions || [];
  // 0 题的题库原本能「校验通过」，于是 Phase 2 的出口条件形同虚设。
  if (!qs.length)
    fail(
      `题库为空: ${bankPath()}\n` +
        `Phase 2 的出口是 bank --check 通过，空题库通过等于没有出口。\n` +
        `先按 references/artifacts.md 的 schema 写 bank.json 再校验。`,
    );
  const errs = [];
  const warns = [];
  const ids = new Set();

  qs.forEach((q, i) => {
    const at = `questions[${i}]${q.id ? ` (${q.id})` : ''}`;
    if (!q.id) errs.push(`${at}: 缺 id`);
    else if (ids.has(q.id)) errs.push(`${at}: id 重复`);
    else ids.add(q.id);
    if (!q.concept) errs.push(`${at}: 缺 concept`);
    else if (!st.concepts[q.concept]) errs.push(`${at}: concept 未注册 → ${q.concept}`);
    if (!q.prompt || String(q.prompt).trim().length < 8) errs.push(`${at}: prompt 过短（<8 字符）`);
    if (!q.reference_answer || String(q.reference_answer).trim().length < 10)
      errs.push(`${at}: 缺 reference_answer — 无参考答案则判分不可复现`);
    if (!q.source_ref) errs.push(`${at}: 缺 source_ref — 每道题必须能回源`);
    if (![1, 2, 3].includes(q.difficulty)) errs.push(`${at}: difficulty 必须是 1 / 2 / 3`);
    if (!Q_TYPES.includes(q.type)) warns.push(`${at}: type "${q.type}" 不在推荐集 ${Q_TYPES.join(' / ')}`);
  });

  const uncovered = Object.keys(st.concepts).filter((c) => !qs.some((q) => q.concept === c));
  if (uncovered.length) warns.push(`无题覆盖的概念: ${uncovered.join(', ')}`);
  const noBoundary = Object.keys(st.concepts).filter(
    (c) => !qs.some((q) => q.concept === c && ['boundary', 'counterexample'].includes(q.type)),
  );
  if (noBoundary.length && qs.length) warns.push(`缺边界/反例题的概念（最易产生理解幻觉）: ${noBoundary.join(', ')}`);

  // 出题规则（references/artifacts.md）原先完全没有校验。这里落实为警告而非阻断：
  // 题库多样性是质量倾向，不是正确性，硬拦会挡住正在长出来的题库。
  const perConceptCount = Object.keys(st.concepts).filter((c) => qs.filter((q) => q.concept === c).length < 3);
  if (perConceptCount.length) warns.push(`题量不足 3 题的概念（判分覆盖面会偏窄）: ${perConceptCount.join(', ')}`);
  const diff = { 1: 0, 2: 0, 3: 0 };
  for (const q of qs) if (diff[q.difficulty] != null) diff[q.difficulty]++;
  if (qs.length >= 6 && diff[3] === 0)
    warns.push(`没有 difficulty 3 的题（约 ${qs.length} 题时应占 1/4）—— 最难档缺失会让「能扛住复杂场景」无法被检验`);
  if (qs.length >= 6 && diff[1] / qs.length > 0.5) warns.push(`难度 1 占比 ${Math.round((diff[1] / qs.length) * 100)}%（建议约 25%），题目整体偏简单`);
  const applyQ = qs.filter((q) => q.type === 'apply');
  if (!applyQ.length) warns.push(`无 apply 题——apply 是达标后的迁移题，缺它则无法检验「能不能用」而非「能不能复述」`);

  if (warns.length) {
    console.log(`警告 ${warns.length} 条:`);
    for (const w of warns) console.log(`  ! ${w}`);
  }
  if (errs.length) {
    console.error(`ERROR: bank.json 校验失败 ${errs.length} 条:`);
    for (const e of errs.slice(0, 40)) console.error(`  - ${e}`);
    if (errs.length > 40) console.error(`  ... 另有 ${errs.length - 40} 条`);
    process.exit(1);
  }

  const byDiff = { 1: 0, 2: 0, 3: 0 };
  const byType = {};
  const byConcept = {};
  for (const q of qs) {
    byDiff[q.difficulty] = (byDiff[q.difficulty] || 0) + 1;
    byType[q.type] = (byType[q.type] || 0) + 1;
    byConcept[q.concept] = (byConcept[q.concept] || 0) + 1;
  }
  console.log(`bank.json 校验通过: ${qs.length} 题，覆盖 ${Object.keys(byConcept).length}/${Object.keys(st.concepts).length} 概念`);
  console.log(`  难度  易 ${byDiff[1] || 0} / 中 ${byDiff[2] || 0} / 难 ${byDiff[3] || 0}`);
  console.log(`  题型  ${Object.entries(byType).map(([k, v]) => `${k} ${v}`).join('  ') || '(无)'}`);
  console.log(`NEXT: ${selfCmd()} test ${st.slug} --n 8 出第一份自测卷`);
}

// ── test ──────────────────────────────────────────────────────────────
function cmdTest() {
  const st = loadState();
  const qs = readJSON(bankPath(), 'bank.json').questions || [];
  const t0 = todayISO();
  let pool = qs.filter((q) => st.concepts[q.concept]);
  if (!pool.length) fail('题库为空或题目 concept 未注册。先写 bank.json，再运行 concepts 与 bank --check');

  const only = opt('concepts');
  if (only) {
    const set = new Set(only.split(',').map((s) => s.trim()).filter(Boolean));
    const unknown = [...set].filter((c) => !st.concepts[c]);
    if (unknown.length) fail(`未知概念: ${unknown.join(', ')}\n已注册: ${Object.keys(st.concepts).join(', ')}`);
    pool = pool.filter((q) => set.has(q.concept));
  }
  if (flag('due-only')) pool = pool.filter((q) => (st.concepts[q.concept].due || t0) <= t0);
  if (!pool.length) fail('筛选后无可用题目（--concepts / --due-only 范围太窄）');

  const n = Math.max(1, parseInt(opt('n', '8'), 10) || 8);
  const rand = rng(opt('seed'));
  // apply 题是 L5「达标后才出」的迁移题。未达标就出它，等于让用户去套一个
  // 他还没建立起来的机制作答，答错会被记成 gap —— 那是测量误差不是理解缺口。
  const applyReady = (cid) => (st.concepts[cid].mastery ?? 0) >= PASS_MASTERY && openGaps(st.concepts[cid], '致命').length === 0;
  const wOf = (q) => {
    const c = st.concepts[q.concept];
    if (q.type === 'apply' && !applyReady(q.concept)) return 0;
    return (
      Math.pow(Math.max(0.05, 1 - (c.mastery ?? 0)), 1.5) *
      (1 + 0.2 * (c.lapses ?? 0)) *
      (0.8 + 0.2 * (q.difficulty || 1))
    );
  };

  // 未达标概念的 apply 题直接移出候选池。只把权重置 0 是不够的：
  // 若某个概念剩下的题全是 apply，它那组的权重和为 0，pickWeighted 会退化成随机选，
  // 于是 apply 题照样会被抽中。移出池子是唯一能保证「不出」的做法。
  const blocked = pool.filter((q) => q.type === 'apply' && !applyReady(q.concept));
  if (blocked.length) pool = pool.filter((q) => !(q.type === 'apply' && !applyReady(q.concept)));
  if (!pool.length)
    fail(
      `候选池里只剩未达标的 apply 题（${blocked.map((q) => q.id).join(', ')}），无法出卷。\n` +
        `apply 是达标后的迁移题。请先补该概念的普通题，或先复述把 mastery 提到 ${PASS_MASTERY} 以上。`,
    );

  // 分层抽样：先按概念权重选概念，并对已选中的概念做衰减，保证覆盖广度而非集中刷一个概念。
  const chosen = [];
  const remaining = [...pool];
  const perConcept = {};
  // pool 在上面可能被剔掉了未达标的 apply 题，limit 必须跟着重算。
  const limit = Math.min(n, pool.length);
  while (chosen.length < limit && remaining.length) {
    const groups = {};
    for (const q of remaining) (groups[q.concept] ||= []).push(q);
    const cid = pickWeighted(
      Object.keys(groups),
      (c) => groups[c].reduce((s, q) => s + wOf(q), 0) / (1 + (perConcept[c] || 0)),
      rand,
    );
    const q = pickWeighted(groups[cid], wOf, rand);
    remaining.splice(remaining.indexOf(q), 1);
    chosen.push(q);
    perConcept[cid] = (perConcept[cid] || 0) + 1;
  }
  chosen.sort((a, b) => a.difficulty - b.difficulty || a.concept.localeCompare(b.concept));

  const sid = `s${Object.keys(st.sessions).length + 1}`;
  const round = st.round + 1;
  const ts = stamp();
  st.sessions[sid] = { id: sid, ts, round, due_only: flag('due-only'), question_ids: chosen.map((q) => q.id), recorded: false };
  // round 在出卷时就分配并持久化。原先只在 record 里回写 st.round，导致：
  // 连出两张卷都记第 1 轮；乱序 record 还会把 round 回退到更小的值。
  st.round = round;
  writeJSON(statePath(), st);

  const paperPath = path.join(topicDir, 'tests', `${ts}-${sid}.md`);
  fs.writeFileSync(paperPath, renderPaper(st, sid, round, chosen), 'utf8');
  const resultsPath = path.join(topicDir, 'results', `${sid}.json`);
  writeJSON(resultsPath, {
    session: sid,
    graded: chosen.map((q) => ({
      question_id: q.id,
      score: null,
      gates: { G1: null, G2: null, G3: null, G4: null },
      gap_type: null,
      severity: null,
      note: '',
    })),
    resolves: [],
  });

  console.log(`自测卷已生成: ${paperPath}`);
  console.log(`  session=${sid}  第 ${round} 轮  题数=${chosen.length}  覆盖概念=${Object.keys(perConcept).length}`);
  console.log(`  难度分布  易 ${chosen.filter((q) => q.difficulty === 1).length} / 中 ${chosen.filter((q) => q.difficulty === 2).length} / 难 ${chosen.filter((q) => q.difficulty === 3).length}`);
  console.log(`判分模板: ${resultsPath}`);
  console.log('\n重要: 参考答案与 source_ref 留在 bank.json，**不要**粘进试卷或对话——闭卷才有诊断价值。');
  const relResults = path.relative(process.cwd(), resultsPath).split(path.sep).join('/');
  console.log(`判分后运行: ${selfCmd()} record ${st.slug} --results ${relResults || resultsPath}`);
}

function renderPaper(st, sid, round, chosen) {
  const L = [];
  L.push(`# 自测卷 · ${st.title}`);
  L.push('');
  L.push('> **闭卷作答。** 不看源材料、不看 `bank.json`、不看 `notes.md`。');
  L.push('> 答不上来就直接写「不知道」——暴露 gap 是这份卷子的唯一目的，猜对不算通过。');
  L.push('');
  L.push(`- Session: \`${sid}\` · 第 ${round} 轮 · 生成于 ${todayISO()}`);
  L.push(`- 题数: ${chosen.length}`);
  if (st.target) L.push(`- 学习目标: ${st.target}`);
  L.push('');
  L.push('---');
  // 判分说明段不在这里给学习者看：它会列出 gap_type 全名，
  // 等于提示「答不上来大概属于哪类幻觉」，削弱闭卷的诊断价值。
  // 判分口径由模型按 references/probing.md 执行。
  chosen.forEach((q, i) => {
    L.push('');
    // 只给题号与题干。题型→门的映射是判分依据（explain→G1、boundary→G3、
    // counterexample→G4），印出 type/难度/概念 等于提前告诉学习者要考哪道门。
    L.push(`## Q${i + 1}`);
    L.push('');
    L.push(String(q.prompt).trim());
    L.push('');
    L.push(`**A${i + 1}:** `);
    L.push('');
    L.push('---');
  });
  L.push('');
  return L.join('\n');
}

// ── record ────────────────────────────────────────────────────────────
function cmdRecord() {
  const st = loadState();
  const pending = Object.values(st.sessions).filter((s) => !s.recorded);

  const rf = opt('results');
  if (!rf) fail(`用法: record <slug> --results results/<sid>.json [--session <sid>]`);
  const res = readJSON(resolveInputPath(rf), 'results 文件');
  const graded = Array.isArray(res) ? res : res.graded;
  if (!Array.isArray(graded) || !graded.length) fail('results 文件必须是 {session, graded:[...]} 或非空数组');

  // session 绑定优先级：显式 --session > results 文件里的 session 字段 > 唯一待记录卷。
  // 原先只取「最新未记录卷」，而 SKILL.md 的示例命令恰恰不带 --session ——
  // 出了两张卷后 `record --results results/s1.json` 会绑到 s2 并报「不属于 session s2」。
  let sid = opt('session');
  if (!sid && res.session && st.sessions[res.session]) sid = res.session;
  if (!sid && pending.length === 1) sid = pending[0].id;
  if (!sid) {
    const list = Object.values(st.sessions).map((s) => `${s.id}(${s.recorded ? '已记录' : '待判分'})`).join(', ');
    if (pending.length > 1)
      fail(
        `有 ${pending.length} 张卷待记录，无法判断你要记哪一张。请显式指定 --session <sid>。\n` +
          `待记录: ${pending.map((s) => s.id).join(', ')}\n全部: ${list}`,
      );
    fail(
      `未找到待记录的 session。\n现有: ${list || '(无 — 先运行 test 出卷)'}\n` +
        (pending.length ? '' : '所有卷子都已记录过。重复计分会污染 mastery 与 SM-2 排期，请先运行 test 生成新一轮。'),
    );
  }
  if (!st.sessions[sid]) {
    fail(`session "${sid}" 不存在。现有: ${Object.keys(st.sessions).join(', ') || '(无)'}`);
  }
  if (res.session && res.session !== sid)
    fail(`--results 文件声明 session=${res.session}，但记录的是 ${sid}。两者必须一致。`);
  const ses = st.sessions[sid];
  if (ses.recorded) fail(`session ${sid} 已于 ${ses.recorded_at || '(未知日期)'} 记录过，不可重复计分（会污染 mastery 与 SM-2 排期）`);

  const qs = readJSON(bankPath(), 'bank.json').questions || [];
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const expected = new Set(ses.question_ids);

  // 先全量校验再落盘：中途失败不能留下半更新的状态。
  const errs = [];
  graded.forEach((g, i) => {
    const at = `graded[${i}]${g.question_id ? ` (${g.question_id})` : ''}`;
    if (!g.question_id) return errs.push(`${at}: 缺 question_id`);
    // 一次 return 就收住这道题的错误：原先继续往下跑会再报一条「概念未注册 → undefined」，
    // 同一个问题出现在错误列表两次。
    if (!byId[g.question_id]) return errs.push(`${at}: bank.json 中不存在该题（不会重复报概念未注册）`);
    if (!expected.has(g.question_id)) errs.push(`${at}: 不属于 session ${sid}（该卷题目: ${ses.question_ids.join(', ')}）`);
    if (![0, 1, 2].includes(g.score)) return errs.push(`${at}: score 必须是 0 / 1 / 2`);

    // 四道门证据（gates）。脚本只校验 gates 与 score 是否自洽，不判断内容真假 ——
    // 这正是「纯簿记」的边界：拦的是自相矛盾的判分，不是错误的判分。
    const gates = g.gates;
    if (!gates || typeof gates !== 'object' || GATE_KEYS.some((k) => typeof gates[k] !== 'boolean')) {
      return errs.push(
        `${at}: 缺 gates 证据 —— 四道门必须逐门给出布尔值 {G1,G2,G3,G4}。\n` +
          `    映射: score 2 ⟺ 四门全 true；score 1 ⟺ G1+G2 true 且 G3/G4 有 false；score 0 ⟺ G1 或 G2 为 false。\n` +
          `    规范见 references/probing.md「通过判据：四道门」。缺它则 score 无从校验——脚本无法复核，闸门失效。`,
      );
    }
    const failed = GATE_KEYS.filter((k) => !gates[k]);
    const coreFailed = !gates.G1 || !gates.G2; // 缺 G1/G2 = 机制链本身断裂
    if (g.score === 2 && failed.length)
      errs.push(`${at}: score 2 但 ${failed.join('、')} 未通过 —— 四道门全过才能给 2。判分与 gates 自相矛盾。`);
    if (g.score === 1 && (coreFailed || !failed.length))
      errs.push(
        `${at}: score 1 要求 G1+G2 为 true 且 G3 或 G4 有 false（当前 ${GATE_KEYS.map((k) => `${k}=${gates[k]}`).join(' ')}）。`,
      );
    if (g.score === 0 && !coreFailed)
      errs.push(`${at}: score 0 要求 G1 或 G2 为 false，但四门全 true —— gates 与 score 矛盾。`);

    if (g.score < 2) {
      if (!SEVERITIES.includes(g.severity)) errs.push(`${at}: 未通过必须给 severity (${SEVERITIES.join(' / ')})`);
      // severity 决定 mastery 是不是被封顶 0.4。原先只校验枚举合法，
      // 模型把 score 0 全标「细节」就能让致命 gap 封顶永不触发 —— 唯一硬闸门形同虚设。
      else if (g.severity === '细节')
        errs.push(
          `${at}: severity「细节」不能配 score ${g.score}。未通过就没有「细节」级 gap。` +
            (g.score === 0 ? '（若确属纯记忆型事实错误且不污染机制链，可把 severity 降为「重要」并在 note 里写明理由。）' : ''),
        );
      else if (g.score === 0 && g.severity !== '致命')
        errs.push(
          `${at}: score 0（缺 G1/G2，机制链断裂）必须是 severity「致命」，当前为「${g.severity}」。` +
            `降级仅允许纯记忆型事实错误：改填「重要」并在 note 里写明不污染机制链的理由。`,
        );
      else if (g.score === 1 && g.severity === '致命')
        errs.push(`${at}: score 1（G1+G2 过，缺边界/反例）应为 severity「重要」，当前为「致命」。虚增严重度会无谓封顶 mastery。`);
      if (!g.gap_type) errs.push(`${at}: 未通过必须给 gap_type`);
      else if (!GAP_TYPES.includes(g.gap_type)) errs.push(`${at}: gap_type "${g.gap_type}" 不在分类表 (${GAP_TYPES.join(' / ')})`);
      if (!g.note || String(g.note).trim().length < 4) errs.push(`${at}: 未通过必须写 note（说明错在哪，供回源定位）`);
    }
    if (!st.concepts[byId[g.question_id]?.concept]) errs.push(`${at}: 概念未注册 → ${byId[g.question_id]?.concept ?? '(未知)'}`);
  });
  const missing = [...expected].filter((id) => !graded.some((g) => g.question_id === id));
  if (missing.length) errs.push(`session ${sid} 有 ${missing.length} 题未判分: ${missing.join(', ')}`);

  const resolves = Array.isArray(res.resolves) ? res.resolves : [];
  const allGaps = [];
  for (const c of Object.values(st.concepts)) for (const g of c.gaps || []) allGaps.push({ c, g });
  const badResolves = resolves.filter((gid) => !allGaps.some(({ g }) => g.gid === gid));
  if (badResolves.length) errs.push(`resolves 中找不到的 gap id: ${badResolves.join(', ')}（现有: ${allGaps.map(({ g }) => g.gid).join(', ') || '(无)'}）`);

  // 「闭合」必须发生在这道 gap 所属概念被重新考到的这一轮。
  // 原先只校验 gid 存在，于是同一次 record 就能一边判别概念全过、一边关掉任意致命 gap。
  const thisRoundConcepts = new Set(ses.question_ids.map((id) => byId[id]?.concept).filter(Boolean));
  for (const gid of resolves) {
    const hit = allGaps.find(({ g }) => g.gid === gid);
    if (!hit) continue;
    if (!thisRoundConcepts.has(hit.c.id))
      errs.push(
        `resolves 含 ${gid}，但它属于概念 ${hit.c.id}，而本轮 ${sid} 未考该概念（本轮概念: ${[...thisRoundConcepts].join(', ') || '(无)'}）。\n` +
          `    闭合必须基于本轮复述通过：先 test --concepts ${hit.c.id} 出卷并判分，再在那一轮的 resolves 里闭合它。`,
      );
  }

  if (errs.length) {
    console.error('ERROR: results 校验失败，状态未写入:');
    for (const e of errs.slice(0, 40)) console.error(`  - ${e}`);
    if (errs.length > 40) console.error(`  ... 另有 ${errs.length - 40} 条`);
    process.exit(1);
  }

  const before = {};
  const gapLines = [];

  // SM-2 按**概念每轮一次**推进，而不是按题。原先 schedule() 在 graded.forEach 内，
  // 一个 session 里同概念考 3 道全过 → reps=3、interval 走 1→3→8 天：
  // reps 的语义是复习轮次，被题数灌水，一轮就把概念排到 8 天后。
  // 分数取该概念本轮的最低分——短板决定排期，不能让三道对的盖过一道错的。
  const byConcept = new Map();
  for (const g of graded) {
    const cid = byId[g.question_id].concept;
    const cur = byConcept.get(cid);
    if (!cur) byConcept.set(cid, { minScore: g.score, anyFail: false });
    else {
      cur.minScore = Math.min(cur.minScore, g.score);
      if (g.score < 2) cur.anyFail = true;
    }
  }
  for (const [cid, agg] of byConcept) {
    const c = st.concepts[cid];
    schedule(c, agg.minScore);
  }

  for (const g of graded) {
    const q = byId[g.question_id];
    const c = st.concepts[q.concept];
    before[c.id] ??= c.mastery ?? 0;
    c.history = [...(c.history || []), { session: sid, score: g.score, date: todayISO() }];

    if (g.score < 2) {
      st.gap_seq = (st.gap_seq || 0) + 1;
      const gap = {
        gid: `g${st.gap_seq}`,
        round: ses.round,
        session: sid,
        date: todayISO(),
        type: g.gap_type,
        severity: g.severity,
        detail: String(g.note).trim(),
        question_id: q.id,
        source_ref: q.source_ref || '',
        resolved: false,
      };
      c.gaps = [...(c.gaps || []), gap];
      gapLines.push(
        `## ${gap.gid} · ${c.id} · ${gap.severity} · ${gap.type}\n\n` +
          `- 轮次: 第 ${gap.round} 轮 (${sid}) · ${gap.date}\n` +
          `- 触发题: \`${q.id}\` · 回源: ${gap.source_ref || '(缺)'}\n` +
          `- 错在哪: ${gap.detail}\n` +
          `- 状态: 未闭合\n`,
      );
    }
    c.mastery = recomputeMastery(c);
  }

  let resolvedCount = 0;
  for (const gid of resolves) {
    const hit = allGaps.find(({ g }) => g.gid === gid);
    if (hit && !hit.g.resolved) {
      hit.g.resolved = true;
      hit.g.resolved_at = todayISO();
      hit.c.mastery = recomputeMastery(hit.c);
      resolvedCount++;
      gapLines.push(`> ${gid} 已于 ${todayISO()} 闭合（${sid} 第 ${ses.round} 轮复述通过）。\n`);
    }
  }

  ses.recorded = true;
  ses.recorded_at = todayISO();
  ses.resolved_gaps = resolves;
  // 不再回写 st.round：round 在 test 出卷时已分配并持久化，
  // 在这里回写会让乱序 record 把 round 回退到更早的轮次。
  writeJSON(statePath(), st);
  if (gapLines.length) appendText(path.join(topicDir, 'gaps.md'), `\n${gapLines.join('\n')}`);

  const touched = Object.keys(before);
  console.log(`已记录 · session ${sid} · 第 ${ses.round} 轮 · 判分 ${graded.length} 题 · 新 gap ${gapLines.filter((l) => l.startsWith('##')).length} · 闭合 ${resolvedCount}`);
  console.log('');
  console.log(`${padEnd('概念', 26)}${padEnd('mastery', 22)}${padEnd('Δ', 9)}${padEnd('reps/lapse', 12)}${padEnd('due', 13)}未闭合gap`);
  for (const id of touched) {
    const c = st.concepts[id];
    const d = (c.mastery ?? 0) - (before[id] ?? 0);
    console.log(
      padEnd(id, 26) +
        padEnd(`${bar(c.mastery)} ${(c.mastery ?? 0).toFixed(3)}`, 22) +
        padEnd(`${d >= 0 ? '+' : ''}${d.toFixed(3)}`, 9) +
        padEnd(`${c.reps}/${c.lapses}`, 12) +
        padEnd(c.due || '-', 13) +
        `致命${openGaps(c, '致命').length} 重要${openGaps(c, '重要').length} 细节${openGaps(c, '细节').length}`,
    );
  }
  console.log('');
  console.log(`NEXT: ${nextAction(st)}`);
}

// ── status ────────────────────────────────────────────────────────────
function cmdStatus() {
  const st = loadState();
  const cs = Object.values(st.concepts);
  console.log(`# ${st.title}  (${st.slug})`);
  if (st.target) console.log(`学习目标: ${st.target}`);
  console.log(`开始 ${st.created} · 已完成 ${st.round} 轮 · 今天 ${todayISO()}`);
  if (!cs.length) {
    console.log('\n尚未注册概念。');
    console.log(`NEXT: ${nextAction(st)}`);
    return;
  }

  const wsum = cs.reduce((s, c) => s + (c.weight || 1), 0);
  const overall = cs.reduce((s, c) => s + (c.mastery ?? 0) * (c.weight || 1), 0) / wsum;
  const fatal = cs.reduce((s, c) => s + openGaps(c, '致命').length, 0);
  const major = cs.reduce((s, c) => s + openGaps(c, '重要').length, 0);
  const minor = cs.reduce((s, c) => s + openGaps(c, '细节').length, 0);
  const due = cs.filter((c) => c.due && c.due <= todayISO());
  const bank = fs.existsSync(bankPath()) ? (readJSON(bankPath(), 'bank.json').questions || []).length : 0;
  const sessions = Object.values(st.sessions);

  console.log(`\n总 mastery ${bar(overall, 20)} ${overall.toFixed(3)}   题库 ${bank} 题   自测卷 ${sessions.length} 份（未判分 ${sessions.filter((s) => !s.recorded).length}）`);
  console.log(`未闭合 gap: 致命 ${fatal} · 重要 ${major} · 细节 ${minor}   到复习期: ${due.length}/${cs.length}`);
  console.log('');
  console.log(`${padEnd('概念', 26)}${padEnd('mastery', 22)}${padEnd('due', 13)}${padEnd('r/l', 8)}gap(致/重/细)`);
  const shown = cs.slice(0, 60);
  for (const c of shown) {
    const overdue = c.due && c.due < todayISO() ? '!' : ' ';
    console.log(
      padEnd(c.id, 26) +
        padEnd(`${bar(c.mastery)} ${(c.mastery ?? 0).toFixed(3)}`, 22) +
        padEnd(`${c.due || '-'}${overdue}`, 13) +
        padEnd(`${c.reps}/${c.lapses}`, 8) +
        `${openGaps(c, '致命').length}/${openGaps(c, '重要').length}/${openGaps(c, '细节').length}`,
    );
  }
  if (cs.length > shown.length) console.log(`... 另有 ${cs.length - shown.length} 个概念未显示`);

  const weak = cs.filter((c) => (c.mastery ?? 0) < PASS_MASTERY).map((c) => c.id);
  if (weak.length) console.log(`\n弱项: ${weak.join(', ')}`);
  console.log(`\nNEXT: ${nextAction(st)}`);
}

// ── dispatch ──────────────────────────────────────────────────────────
const COMMANDS = { init: cmdInit, concepts: cmdConcepts, bank: cmdBank, test: cmdTest, record: cmdRecord, status: cmdStatus };

try {
  if (!cmd || cmd === '-h' || cmd === '--help' || flag('help')) {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }
  const fn = COMMANDS[cmd];
  if (!fn) fail(`未知命令: ${cmd}\n${USAGE}`);
  assertProjectRoot();
  fn();
} catch (e) {
  fail(e && e.message ? e.message.split('\n')[0] : String(e));
}
