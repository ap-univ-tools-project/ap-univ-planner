const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = [
  fs.readFileSync(path.join(root, 'data.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'script.js'), 'utf8'),
  `
  this.__testApi = {
    getDynamicCategory,
    resolveCourseCategory,
    collectSlotHighlightParts,
    validateAndNormalizePlanData,
    validateCatalogDiffData,
    courseExistsInCatalog
  };
  `
].join('\n');

const fakeElements = new Map();
function makeElement(id) {
  return {
    id,
    value: id === 'my-course-select' ? '1' : '',
    textContent: '',
    innerHTML: '',
    classList: { add(){}, remove(){}, toggle(){} },
    style: {},
    children: [],
    appendChild(){},
    insertBefore(){},
    remove(){},
    addEventListener(){},
    focus(){},
    options: []
  };
}

const context = {
  console,
  alert() {},
  confirm() { return true; },
  prompt(_, fallback) { return fallback; },
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  Blob: function Blob() {},
  FileReader: function FileReader() {},
  document: {
    getElementById(id) {
      if (!fakeElements.has(id)) fakeElements.set(id, makeElement(id));
      return fakeElements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    createElement(tag) { return makeElement(tag); },
    body: makeElement('body'),
    head: { appendChild() {} }
  },
  window: {
    addEventListener() {},
    onload: null
  }
};
context.global = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'ap-univ-planner-test-context.js' });

const api = context.__testApi;

function keys(slotId, term, mode, major) {
  return api.collectSlotHighlightParts(slotId, term, mode, major).map(part => part.key);
}

// カテゴリ解決: 同名科目は所属コース基準で自専攻扱いを優先する。
assert.strictEqual(api.getDynamicCategory('情報システム特論', '1'), 'rel');
assert.strictEqual(api.getDynamicCategory('情報システム特論', '2'), 'rel');
assert.strictEqual(api.getDynamicCategory('情報システム特論', '3'), 'rel');
assert.strictEqual(api.getDynamicCategory('高信頼情報システム特論', '1'), 'other-rel');
assert.strictEqual(api.getDynamicCategory('高信頼情報システム特論', '2'), 'rel');
assert.strictEqual(api.getDynamicCategory('高信頼情報システム特論', '3'), 'rel');

// ハイライト: 情報システム専攻・前期集中講義は自関連 + 他関連を共存表示する。
assert.strictEqual(JSON.stringify(keys('c-intensive', 'z', 'all', '1')), JSON.stringify(['my-rel', 'ext-rel']));
assert.strictEqual(JSON.stringify(keys('c-intensive', 'z', 'my-major', '1')), JSON.stringify(['my-rel']));
assert.strictEqual(JSON.stringify(keys('c-intensive', 'z', 'off', '1')), JSON.stringify([]));

// 通常枠: 情報システム専攻・前期火3は自専攻 + 他専攻候補が共存する。
assert(keys('c-2-3', 'z', 'all', '1').includes('my-adv'));
assert(keys('c-2-3', 'z', 'all', '1').includes('ext-adv'));
assert(!keys('c-2-3', 'z', 'my-major', '1').includes('ext-adv'));

// インポート: 旧形式でも読み込め、カテゴリは現在の所属基準で補正される。
const oldPlan = {
  myCourse: '1',
  state: {
    activeTab: 'm1z',
    m1z: { 'c-intensive': [{ name: '情報システム特論', cat: 'other-rel', unit: '2' }] },
    m1k: {},
    m2z: {},
    m2k: {}
  }
};
const normalized = api.validateAndNormalizePlanData(oldPlan);
assert.strictEqual(JSON.stringify(normalized.errors), JSON.stringify([]));
assert.strictEqual(normalized.normalizedState.m1z['c-intensive'][0].cat, 'rel');

// カタログ拡張: 正常系と異常系。
const validDiff = api.validateCatalogDiffData({
  coreCourses: [{ name: 'テスト科目', schedule: '前期月1', sem: 'z', day: 1, period: 1 }],
  majorMasters: { '1': { adv: [], rel: [] } }
});
assert.strictEqual(JSON.stringify(validDiff.errors), JSON.stringify([]));

const invalidDiff = api.validateCatalogDiffData({
  coreCourses: [{ name: '壊れた科目', schedule: '前期月1', sem: 'x', day: 9, period: 1 }]
});
assert(invalidDiff.errors.length >= 2);

console.log('All AP-Univ-Planner Phase 2 logic tests passed.');
