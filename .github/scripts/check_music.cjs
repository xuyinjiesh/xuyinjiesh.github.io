// Catalog / theme / attribution consistency: node .github/scripts/check_music.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const context = { window: {}, Intl };
for (const file of ['js/music.js', 'js/themes.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const library = context.window.MusicLibrary, engine = context.window.ThemeEngine;
const credits = fs.readFileSync(path.join(root, 'assets/audio/CREDITS.md'), 'utf8');
const allowedLicenses = ['CC BY 4.0', 'CC BY 3.0', 'CC0 1.0', 'Pixabay Content License'];
assert.equal(Object.keys(library.tracks).length, 14);
assert.equal(Object.keys(library.themes).length, Object.keys(engine.THEMES).length);
for (const [id, track] of Object.entries(library.tracks)) {
  assert.ok(allowedLicenses.includes(track.license), id);
  assert.ok(track.source.startsWith('https://') && track.download.startsWith('https://'), id);
  assert.equal(library.findSource(track.src), track);
  assert.equal(library.findSource(track.download), track);
  if (track.remoteOnly) {
    assert.equal(track.src, track.download, id + ': original remote source must be preserved');
    assert.ok(track.src.startsWith('https://'), id);
  } else {
    const data = fs.readFileSync(path.join(root, track.src));
    assert.ok(data.length > 10000, id + ': empty recording');
    assert.ok(data.subarray(0, 3).toString() === 'ID3' || (data[0] === 255 && (data[1] & 224) === 224), id + ': invalid MP3 header');
  }
  assert.ok(credits.includes(track.title) && credits.includes(track.artist) && credits.includes(track.source), id + ': missing attribution');
}
for (const id of Object.keys(engine.THEMES)) {
  assert.ok(library.themes[id], id + ': no theme mapping');
  const theme = engine.get(id), tracks = library.forTheme(id);
  assert.equal(theme.music, tracks[0].src, id);
  assert.equal(theme.musicTrack.id, tracks[0].id, id);
  for (const track of theme.musicFallbacks) assert.ok(library.get(track.id), id + ': unknown fallback');
}
for (const [theme, track] of Object.entries({
  lichun: 'growing-up', yushui: 'water-lily', jingzhe: 'bach-prelude',
  qingming: 'gymnopedie-1', xiazhi: 'midsummer-sky', bailu: 'clair-de-lune',
  xiaoxue: 'snowfall', dongzhi: 'jul', 'spring-festival': 'spring-festival-original',
  'childrens-day': 'childhood', halloween: 'eastern-thought', xiaohan: 'meditation-01', night: 'reverie'
})) assert.equal(engine.get(theme).musicTrack.id, track, theme);
assert.ok(fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('js/music.js') < fs.readFileSync(path.join(root, 'index.html'), 'utf8').indexOf('js/themes.js'));
assert.equal(engine.get('spring-festival').music, 'https://cdn.pixabay.com/audio/2026/01/14/audio_3265c1aace.mp3');
console.log('Passed 14 music entries (13 local and the original remote Spring Festival track), 50 themes and attribution.');
