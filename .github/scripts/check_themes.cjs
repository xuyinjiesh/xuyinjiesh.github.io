// Run with node .github/scripts/check_themes.cjs (no dependencies).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'js/themes.js'), 'utf8');

function environment(calendar = Intl) {
  const properties = new Map();
  const images = [];
  const document = {
    baseURI: 'https://example.com/personal-site/',
    documentElement: {
      dataset: {}, style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) }
    },
    dispatchEvent() {}
  };
  const location = { search: '', href: document.baseURI };
  const context = {
    window: {}, document, Intl: calendar, URL, URLSearchParams, location,
    history: { replaceState: (_, __, url) => { location.search = new URL(url, document.baseURI).search; } },
    CustomEvent: class { constructor(type, data) { this.type = type; this.detail = data.detail; } },
    Image: class { constructor() { images.push(this); } }
  };
  vm.runInNewContext(source, context);
  return { engine: context.window.ThemeEngine, context, properties, images, document };
}

const { engine, context, properties, images, document } = environment();
const at = value => new Date(value + 'T12:00:00');
// Known lunar dates include the year with a leap sixth month (2025),
// pre-festival spans across New Year's Eve, and a lunar festival in January.
const dates = {
  '2025-01-28': 'spring-festival', '2026-02-17': 'spring-festival',
  '2026-03-03': 'lantern-festival', '2025-05-31': 'dragon-boat',
  '2026-06-19': 'dragon-boat', '2025-08-29': 'qixi', '2026-08-19': 'qixi',
  '2026-09-25': 'mid-autumn', '2026-10-18': 'double-ninth',
  '2027-01-15': 'laba', '2026-02-10': 'little-new-year',
  '2026-11-26': 'thanksgiving', '2026-02-14': 'valentine',
  '2026-03-12': 'arbor-day', '2026-06-01': 'childrens-day',
  '2026-10-31': 'halloween', '2026-03-20': 'chunfen',
  '2026-12-22': 'dongzhi', '2026-12-31': 'new-year'
};
for (const [date, expected] of Object.entries(dates)) assert.equal(engine.resolve(at(date)).id, expected, date);
assert.equal(engine.resolve(new Date(2026, 5, 15, 2)).id, 'night');
assert.equal(engine.resolve(at('2026-06-15')).id, 'summer');

const publicThemes = Object.entries(engine.THEMES).filter(([id]) => id !== 'birthday');
for (const [category, count] of [['term', 24], ['festival', 19], ['daily', 6]]) {
  assert.equal(publicThemes.filter(([, theme]) => theme.category === category).length, count);
}
for (const [id] of Object.entries(engine.THEMES)) {
  const theme = engine.get(id);
  assert.ok(theme.label && theme.caption && theme.greetings.length, id);
  assert.ok(fs.existsSync(path.join(root, theme.wallpaper)), theme.wallpaper);
}

context.location.search = '?theme=qixi&keep=1';
context.location.href += context.location.search;
assert.equal(engine.resolve(at('2026-01-01')).id, 'qixi');
assert.equal(engine.select('yushui').id, 'yushui');
assert.equal(context.location.search, '?keep=1');
assert.equal(engine.select(null).id, engine.resolve(new Date()).id);

// An older image finishing after a newer one must not replace the chosen wallpaper.
engine.apply(engine.get('lichun'));
engine.apply(engine.get('dongzhi'));
images[1].onload();
images[0].onload();
assert.equal(document.documentElement.dataset.theme, 'dongzhi');
assert.equal(properties.get('--wallpaper'), 'url("https://example.com/personal-site/assets/wallpapers/dongzhi.svg")');

const fallback = environment({ DateTimeFormat: function () { throw Error('unsupported calendar'); } });
assert.equal(fallback.engine.resolve(at('2026-02-17')).id, 'spring-festival');
assert.ok(fallback.engine.resolve(at('2040-06-15')));
console.log(`Passed ${Object.keys(dates).length} calendar anchors, 49 public themes, wallpaper race, subdirectory URLs, and calendar fallback.`);
