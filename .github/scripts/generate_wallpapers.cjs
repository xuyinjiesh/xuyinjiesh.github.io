/* Rebuild the local vector scenery: node .github/scripts/generate_wallpapers.cjs */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const context = { window: {}, Intl };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/themes.js'), 'utf8'), context);
const themes = context.window.ThemeEngine.THEMES;
const output = path.join(root, 'assets/wallpapers');
fs.mkdirSync(output, { recursive: true });

function ellipse(x, y, rx, ry, fill, extra = '') {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
}
function line(x1, y1, x2, y2, color, width = 2, extra = '') {
  return `<path d="M${x1} ${y1}L${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${width}" ${extra}/>`;
}
function flower(x, y, size, color) {
  return `<g transform="translate(${x} ${y})">` + Array.from({ length: 5 }, (_, i) =>
    ellipse(0, -size * .62, size * .36, size * .65, color, `transform="rotate(${i * 72})"`)
  ).join('') + ellipse(0, 0, size * .17, size * .17, '#ffe7b0') + '</g>';
}
function lantern(x, y, size, color) {
  return `<g opacity=".85">${line(x, 0, x, y - size, color, 1, 'opacity=".3"')}
    ${ellipse(x, y, size * .75, size, color)}
    ${ellipse(x, y, size * .43, size, 'none', 'stroke="#fff0ce" stroke-opacity=".45"')}
    ${line(x - size * .35, y - size, x + size * .35, y - size, '#f5d292', 4)}
    ${line(x - size * .35, y + size, x + size * .35, y + size, '#f5d292', 4)}
    ${line(x, y + size, x, y + size * 1.5, color, 3)}</g>`;
}
function motifArt(motif, accent, seed) {
  let art = '';
  if (['flowers', 'plum', 'sprouts', 'willow', 'trees', 'persimmons'].includes(motif)) {
    art += '<g opacity=".75">';
    art += '<path d="M-30 1050Q180 760 105 530M85 660Q210 575 280 400M112 750Q300 730 390 575M1580 1040Q1440 820 1505 660" fill="none" stroke="#182d30" stroke-width="13"/>';
    for (let i = 0; i < 21; i++) {
      const x = 90 + (i * 83 % 295), y = 435 + (i * 67 % 350);
      if (motif === 'flowers' || motif === 'plum') art += flower(x, y, 9 + i % 5, motif === 'plum' ? '#e7a5ad' : '#e9cad0');
      else if (motif === 'persimmons') art += ellipse(x, y, 13, 15, '#e8a268') + line(x, y - 19, x, y - 11, '#455949', 3);
      else art += ellipse(x, y, 21, 7, accent, `transform="rotate(-32 ${x} ${y})" opacity=".65"`);
    }
    if (motif === 'willow') for (let i = 0; i < 12; i++) {
      const x = i * 28;
      art += `<path d="M${x} -10Q${x + 90} 150 ${x + 40} ${280 + i * 15}" fill="none" stroke="${accent}" stroke-width="2" opacity=".4"/>`;
      for (let j = 1; j < 8; j++) art += ellipse(x + 40 + j * 3, j * 44, 4, 13, accent, 'opacity=".45"');
    }
    art += '</g>';
  }
  if (['leaves', 'wheat', 'reeds', 'chrysanthemums'].includes(motif)) {
    for (let i = 0; i < 22; i++) {
      const x = i % 2 ? 15 + i * 13 : 1400 + i * 9, y = 790 + i * 13 % 170;
      art += `<path d="M${x} 1020Q${x - 25} 900 ${x + 18} ${y - 70}" fill="none" stroke="${accent}" stroke-width="2" opacity=".38"/>`;
      if (motif === 'chrysanthemums') art += flower(x + 18, y - 70, 12, accent);
      else for (let j = 0; j < 5; j++) art += ellipse(x + 12 + j * 2, y - 60 + j * 12, 5, 15, accent, `opacity=".5" transform="rotate(35 ${x + 12 + j * 2} ${y - 60 + j * 12})"`);
    }
    if (motif === 'leaves') for (let i = 0; i < 16; i++) {
      const x = 50 + i * 103 % 1550, y = 120 + i * 97 % 680;
      art += `<path d="M-12 0Q-5 -17 13 -3Q7 15 -12 0" fill="${accent}" opacity=".4" transform="translate(${x} ${y}) rotate(${i * 31})"/>`;
    }
  }
  if (motif === 'lanterns') art += lantern(155, 160, 39, '#da7a65') + lantern(330, 93, 25, accent) + lantern(1415, 205, 51, '#d48a6d') + lantern(1530, 105, 29, accent);
  if (motif === 'lotus' || motif === 'boats') {
    for (let i = 0; i < 7; i++) {
      const x = i * 235 + 40, y = 890 + i * 19 % 100;
      art += ellipse(x, y, 65, 11, '#729b83', 'opacity=".45"');
      if (motif === 'lotus') art += flower(x + 18, y - 25, 16, '#e3b8be');
    }
    if (motif === 'boats') art += `<g transform="translate(210 780)" opacity=".8"><path d="M-110 0Q0 55 130 0L100 38H-65Z" fill="${accent}"/><path d="M110 3Q160 -50 170 -12L151 -13L143 15" fill="none" stroke="${accent}" stroke-width="8"/>${line(-50, -15, -15, 60, accent, 4)}${line(10, -15, 45, 60, accent, 4)}</g>`;
  }
  if (motif === 'fireworks') {
    for (const [x, y, radius] of [[210, 240, 100], [1350, 160, 135], [1500, 450, 70]]) {
      for (let i = 0; i < 24; i++) {
        const angle = i * Math.PI / 12;
        art += line((x + Math.cos(angle) * radius * .5).toFixed(1), (y + Math.sin(angle) * radius * .5).toFixed(1), (x + Math.cos(angle) * radius).toFixed(1), (y + Math.sin(angle) * radius).toFixed(1), accent, 2, 'opacity=".45" stroke-linecap="round"');
      }
    }
  }
  if (motif === 'hearts') for (let i = 0; i < 12; i++) art += `<path d="M0 5C-25 -12 -10 -27 0 -14C10 -27 25 -12 0 5Z" fill="${accent}" opacity=".28" transform="translate(${90 + i * 137} ${160 + i * 71 % 590}) scale(${.5 + i % 3 * .25})"/>`;
  if (motif === 'balloons') for (let i = 0; i < 6; i++) {
    const x = i < 3 ? 110 + i * 85 : 1260 + i * 55, y = 150 + i * 113 % 380;
    art += ellipse(x, y, 22, 29, ['#dfb9b0', '#b5d7ce', accent][i % 3], 'opacity=".7"') + `<path d="M${x} ${y + 29}Q${x - 17} ${y + 80} ${x + 3} ${y + 135}" fill="none" stroke="${accent}" opacity=".3"/>`;
  }
  if (motif === 'christmas') for (const [x, y, s] of [[160, 790, 1.4], [1415, 850, 1.7]]) art += `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -230L-55 -130H-35L-85 -50H-55L-115 45H115L55 -50H85L35 -130H55Z" fill="#4b7967" opacity=".85"/><path d="M-55 -50Q0 -5 55 -50M-80 7Q0 50 80 7" fill="none" stroke="${accent}" stroke-width="3"/>${flower(0, -230, 10, '#f0d49b')}</g>`;
  if (motif === 'pumpkins') for (let i = 0; i < 4; i++) {
    const x = i < 2 ? 110 + i * 95 : 1430 + (i - 2) * 80, y = 900 + i * 19 % 80;
    art += ellipse(x, y, 38, 31, '#c48b57', 'opacity=".8"') + `<path d="M${x - 20} ${y - 5}l10 -9l8 12ZM${x + 20} ${y - 5}l-10 -9l-8 12ZM${x - 15} ${y + 8}q15 18 30 0" fill="#413242"/>` + line(x, y - 29, x + 4, y - 44, '#91a17c', 6);
  }
  if (['rain', 'snow', 'stars', 'lights'].includes(motif)) for (let i = 0; i < 75; i++) {
    const x = (i * 197 + seed * 31) % 1600, y = i * 137 % 950;
    if (motif === 'rain') art += line(x, y, x - 9, y + 28, '#c9e4e8', 1, 'opacity=".18"');
    else art += ellipse(x, y, motif === 'lights' ? 3 : 1 + i % 3, motif === 'lights' ? 3 : 1 + i % 3, motif === 'lights' ? accent : '#e8eff5', `opacity="${.15 + i % 4 * .1}"`);
  }
  if (motif === 'birds') for (let i = 0; i < 7; i++) art += `<path d="M-12 3Q-6 -8 0 0Q6 -8 12 3" fill="none" stroke="${accent}" stroke-width="2" opacity=".5" transform="translate(${160 + i * 32} ${170 + Math.abs(i - 3) * 17})"/>`;
  return art;
}

Object.entries(themes).forEach(([id, theme], index) => {
  const bg1 = theme.vars['--bg-1'], bg2 = theme.vars['--bg-2'], accent = theme.vars['--accent'];
  const shift = index * 17 % 90;
  const isMoon = ['moon', 'stars', 'lanterns', 'christmas', 'pumpkins'].includes(theme.motif);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x2=".35" y2="1"><stop stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
    <linearGradient id="haze" x2="0" y2="1"><stop stop-color="${accent}" stop-opacity=".16"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <pattern id="grain" width="120" height="120" patternUnits="userSpaceOnUse"><circle cx="11" cy="28" r=".7" fill="#fff" opacity=".12"/><circle cx="75" cy="90" r=".6" fill="#fff" opacity=".1"/><circle cx="100" cy="40" r=".5" fill="#000" opacity=".14"/></pattern>
  </defs>
  <path fill="url(#sky)" d="M0 0H1600V1000H0Z"/>
  ${ellipse(340 + shift, 290, 530, 440, 'url(#glow)')}
  ${ellipse(330 + shift, 265, isMoon ? 62 : 83, isMoon ? 62 : 83, accent, `opacity="${isMoon ? '.65' : '.35'}"`)}
  ${isMoon ? ellipse(345 + shift, 252, 62, 62, bg1, 'opacity=".18"') : ''}
  <path d="M0 ${585 + shift}Q100 500 210 555T450 510T700 575T970 495T1230 540T1600 465V1000H0Z" fill="${accent}" opacity=".08"/>
  <path d="M0 730L140 ${550 + shift}L230 645L380 ${480 + shift}L540 680L660 605L830 755L1030 570L1180 660L1380 ${480 + shift}L1600 675V1000H0Z" fill="${bg2}" opacity=".34"/>
  <path d="M0 790Q150 675 310 750T650 740T960 750T1300 680T1600 720V1000H0Z" fill="url(#haze)"/>
  <path d="M0 900Q160 750 310 855T640 860T1000 830T1330 815T1600 790V1000H0Z" fill="${bg2}" opacity=".42"/>
  <path d="M0 905Q400 865 800 910T1600 900M0 945Q400 905 800 950T1600 940M0 975Q400 950 800 980T1600 975" fill="none" stroke="${accent}" stroke-opacity=".1"/>
  ${motifArt(theme.motif, accent, index)}
  <path fill="url(#grain)" d="M0 0H1600V1000H0Z"/>
  </svg>`;
  fs.writeFileSync(path.join(output, `${id}.svg`), svg);
});
console.log(`Generated ${Object.keys(themes).length} SVG wallpapers.`);
