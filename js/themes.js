/*
 * 主题引擎：按优先级的规则表解析“今天是什么主题”。
 * - 农历节日通过 Intl 中国历匹配；旧日期表作为兼容回退。
 * - 二十四节气用低精度太阳黄经公式离线生成 2025–2035 日期表（SOLAR_TERM_TABLE），
 *   已经过已知锚点校验；到期后需重新生成。
 * - span: [节前预热天数, 节后余韵天数]，相对节日当天的偏移。
 * - 判断使用访客本地时间。
 * - 可用 ?theme=<id> 强制预览某个主题。
 * - 壁纸约定：assets/wallpapers/<主题id>.svg，探活成功才启用（见 apply）。
 */
(function () {
  'use strict';

  // 农历节日的公历日期表（2025–2035）
  var LUNAR_TABLE = {
    'spring-festival': {
      2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26',
      2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11',
      2033: '01-31', 2034: '02-19', 2035: '02-08'
    },
    'mid-autumn': {
      2025: '10-06', 2026: '09-25', 2027: '09-15', 2028: '10-03',
      2029: '09-22', 2030: '09-12', 2031: '10-01', 2032: '09-19',
      2033: '09-08', 2034: '09-27', 2035: '09-16'
    }
  };

  // 二十四节气的公历日期表（2025–2035，按年内先后排序；小寒/大寒在 1 月）
  var SOLAR_TERM_TABLE = {
    'xiaohan':     { 2025: '01-05', 2026: '01-05', 2027: '01-05', 2028: '01-06', 2029: '01-05', 2030: '01-05', 2031: '01-05', 2032: '01-06', 2033: '01-05', 2034: '01-05', 2035: '01-05' }, // 小寒
    'dahan':       { 2025: '01-20', 2026: '01-20', 2027: '01-20', 2028: '01-20', 2029: '01-20', 2030: '01-20', 2031: '01-20', 2032: '01-20', 2033: '01-20', 2034: '01-20', 2035: '01-20' }, // 大寒
    'lichun':      { 2025: '02-03', 2026: '02-04', 2027: '02-04', 2028: '02-04', 2029: '02-03', 2030: '02-04', 2031: '02-04', 2032: '02-04', 2033: '02-03', 2034: '02-04', 2035: '02-04' }, // 立春
    'yushui':      { 2025: '02-18', 2026: '02-18', 2027: '02-19', 2028: '02-19', 2029: '02-18', 2030: '02-18', 2031: '02-19', 2032: '02-19', 2033: '02-18', 2034: '02-18', 2035: '02-19' }, // 雨水
    'jingzhe':     { 2025: '03-05', 2026: '03-05', 2027: '03-06', 2028: '03-05', 2029: '03-05', 2030: '03-05', 2031: '03-06', 2032: '03-05', 2033: '03-05', 2034: '03-05', 2035: '03-06' }, // 惊蛰
    'chunfen':     { 2025: '03-20', 2026: '03-20', 2027: '03-21', 2028: '03-20', 2029: '03-20', 2030: '03-20', 2031: '03-21', 2032: '03-20', 2033: '03-20', 2034: '03-20', 2035: '03-21' }, // 春分
    'qingming':    { 2025: '04-04', 2026: '04-05', 2027: '04-05', 2028: '04-04', 2029: '04-04', 2030: '04-05', 2031: '04-05', 2032: '04-04', 2033: '04-04', 2034: '04-05', 2035: '04-05' }, // 清明
    'guyu':        { 2025: '04-20', 2026: '04-20', 2027: '04-20', 2028: '04-19', 2029: '04-20', 2030: '04-20', 2031: '04-20', 2032: '04-19', 2033: '04-20', 2034: '04-20', 2035: '04-20' }, // 谷雨
    'lixia':       { 2025: '05-05', 2026: '05-05', 2027: '05-06', 2028: '05-05', 2029: '05-05', 2030: '05-05', 2031: '05-06', 2032: '05-05', 2033: '05-05', 2034: '05-05', 2035: '05-05' }, // 立夏
    'xiaoman':     { 2025: '05-21', 2026: '05-21', 2027: '05-21', 2028: '05-20', 2029: '05-21', 2030: '05-21', 2031: '05-21', 2032: '05-20', 2033: '05-21', 2034: '05-21', 2035: '05-21' }, // 小满
    'mangzhong':   { 2025: '06-05', 2026: '06-05', 2027: '06-06', 2028: '06-05', 2029: '06-05', 2030: '06-05', 2031: '06-06', 2032: '06-05', 2033: '06-05', 2034: '06-05', 2035: '06-06' }, // 芒种
    'xiazhi':      { 2025: '06-21', 2026: '06-21', 2027: '06-21', 2028: '06-21', 2029: '06-21', 2030: '06-21', 2031: '06-21', 2032: '06-21', 2033: '06-21', 2034: '06-21', 2035: '06-21' }, // 夏至
    'xiaoshu':     { 2025: '07-07', 2026: '07-07', 2027: '07-07', 2028: '07-06', 2029: '07-07', 2030: '07-07', 2031: '07-07', 2032: '07-06', 2033: '07-07', 2034: '07-07', 2035: '07-07' }, // 小暑
    'dashu':       { 2025: '07-22', 2026: '07-23', 2027: '07-23', 2028: '07-22', 2029: '07-22', 2030: '07-23', 2031: '07-23', 2032: '07-22', 2033: '07-22', 2034: '07-23', 2035: '07-23' }, // 大暑
    'liqiu':       { 2025: '08-07', 2026: '08-07', 2027: '08-08', 2028: '08-07', 2029: '08-07', 2030: '08-07', 2031: '08-08', 2032: '08-07', 2033: '08-07', 2034: '08-07', 2035: '08-07' }, // 立秋
    'chushu':      { 2025: '08-23', 2026: '08-23', 2027: '08-23', 2028: '08-22', 2029: '08-23', 2030: '08-23', 2031: '08-23', 2032: '08-22', 2033: '08-23', 2034: '08-23', 2035: '08-23' }, // 处暑
    'bailu':       { 2025: '09-07', 2026: '09-07', 2027: '09-08', 2028: '09-07', 2029: '09-07', 2030: '09-07', 2031: '09-08', 2032: '09-07', 2033: '09-07', 2034: '09-07', 2035: '09-08' }, // 白露
    'qiufen':      { 2025: '09-23', 2026: '09-23', 2027: '09-23', 2028: '09-22', 2029: '09-23', 2030: '09-23', 2031: '09-23', 2032: '09-22', 2033: '09-23', 2034: '09-23', 2035: '09-23' }, // 秋分
    'hanlu':       { 2025: '10-08', 2026: '10-08', 2027: '10-08', 2028: '10-08', 2029: '10-08', 2030: '10-08', 2031: '10-08', 2032: '10-08', 2033: '10-08', 2034: '10-08', 2035: '10-08' }, // 寒露
    'shuangjiang': { 2025: '10-23', 2026: '10-23', 2027: '10-23', 2028: '10-23', 2029: '10-23', 2030: '10-23', 2031: '10-23', 2032: '10-23', 2033: '10-23', 2034: '10-23', 2035: '10-23' }, // 霜降
    'lidong':      { 2025: '11-07', 2026: '11-07', 2027: '11-07', 2028: '11-07', 2029: '11-07', 2030: '11-07', 2031: '11-07', 2032: '11-07', 2033: '11-07', 2034: '11-07', 2035: '11-07' }, // 立冬
    'xiaoxue':     { 2025: '11-22', 2026: '11-22', 2027: '11-22', 2028: '11-22', 2029: '11-22', 2030: '11-22', 2031: '11-22', 2032: '11-22', 2033: '11-22', 2034: '11-22', 2035: '11-22' }, // 小雪
    'daxue':       { 2025: '12-07', 2026: '12-07', 2027: '12-07', 2028: '12-06', 2029: '12-07', 2030: '12-07', 2031: '12-07', 2032: '12-06', 2033: '12-07', 2034: '12-07', 2035: '12-07' }, // 大雪
    'dongzhi':     { 2025: '12-21', 2026: '12-22', 2027: '12-22', 2028: '12-21', 2029: '12-21', 2030: '12-22', 2031: '12-22', 2032: '12-21', 2033: '12-21', 2034: '12-22', 2035: '12-22' }  // 冬至
  };

  var TERM_ORDER = [
    'xiaohan', 'dahan', 'lichun', 'yushui', 'jingzhe', 'chunfen',
    'qingming', 'guyu', 'lixia', 'xiaoman', 'mangzhong', 'xiazhi',
    'xiaoshu', 'dashu', 'liqiu', 'chushu', 'bailu', 'qiufen',
    'hanlu', 'shuangjiang', 'lidong', 'xiaoxue', 'daxue', 'dongzhi'
  ];

  // 规则表：priority 高者先命中
  // 注意：生日主题不走日期规则（日期即隐私，源码公开可见），
  // 改为口令解锁——见 js/content.js 的 secret 配置。
  var RULES = [
    { id: 'spring-festival', priority: 95,  festival: 'spring-festival', lunar: [1, 1], span: [-1, 2] },
    { id: 'mid-autumn',      priority: 90,  festival: 'mid-autumn', lunar: [8, 15], span: [-1, 1] },
    { id: 'lantern-festival', priority: 89, lunar: [1, 15] },
    { id: 'dragon-boat',     priority: 89, lunar: [5, 5] },
    { id: 'qixi',            priority: 89, lunar: [7, 7] },
    { id: 'double-ninth',    priority: 89, lunar: [9, 9] },
    { id: 'laba',            priority: 89, lunar: [12, 8] },
    { id: 'little-new-year', priority: 89, lunar: [12, 23] },
    { id: 'national-day',    priority: 88,  solar: '10-01', span: [0, 2] },
    { id: 'new-year',        priority: 85,  solar: '01-01', span: [-1, 1] },
    { id: 'xmas',            priority: 80,  solar: '12-25', span: [-1, 1] },
    { id: 'valentine',       priority: 75, solar: '02-14' },
    { id: 'womens-day',      priority: 75, solar: '03-08' },
    { id: 'arbor-day',       priority: 75, solar: '03-12' },
    { id: 'labor-day',       priority: 75, solar: '05-01', span: [0, 2] },
    { id: 'childrens-day',   priority: 75, solar: '06-01' },
    { id: 'teachers-day',    priority: 75, solar: '09-10' },
    { id: 'halloween',       priority: 75, solar: '10-31' },
    { id: 'thanksgiving',    priority: 75, weekday: [11, 4, 4] },
    { id: 'spring',          priority: 24,  months: [3, 4, 5] },
    { id: 'summer',          priority: 23,  months: [6, 7, 8] },
    { id: 'autumn',          priority: 22,  months: [9, 10, 11] },
    { id: 'winter',          priority: 21,  months: [12, 1, 2] },
    { id: 'night',           priority: 30,  hours: [0, 1, 2, 3, 4, 5] }, // 压过季节，但被节日压住
    { id: 'default',         priority: 0 }
  ];

  // 二十四节气：只在节气当天命中，优先级低于节日、高于凌晨与四季
  TERM_ORDER.forEach(function (id) {
    RULES.push({ id: id, priority: 40, term: id, span: [0, 0] });
  });

  var DEFAULT_QUICK = [
    { label: '你是谁', intent: 'who' },
    { label: '看看作品', intent: 'projects' },
    { label: '最近在忙什么', intent: 'now' },
    { label: '占一卦', intent: 'liuyao' },
    { label: '爬个塔', intent: 'spire' },
    { label: '联系方式', intent: 'contact' }
  ];

  var THEMES = {
    'default': {
      vars: {
        '--bg-1': '#2c3e50', '--bg-2': '#0f2027',
        '--accent': '#7fb3d3', '--text': '#eef3f7', '--text-dim': 'rgba(238,243,247,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(127,179,211,.28)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'none' },
      persona: { name: '我', avatar: '👋', status: '在线' },
      typingDelay: [400, 900],
      greetings: [
        '你好呀，欢迎光临。👋',
        '来了？随便逛逛，别客气。',
        '嗨，今天过得怎么样？'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'spring-festival': {
      vars: {
        '--bg-1': '#8c1c13', '--bg-2': '#3d0a06',
        '--accent': '#f5c26b', '--text': '#fdf3e3', '--text-dim': 'rgba(253,243,227,.6)',
        '--bubble-bg': 'rgba(255,255,255,.10)', '--bubble-user-bg': 'rgba(245,194,107,.30)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'lanterns', density: 14 },
      persona: { name: '我', avatar: '🏮', status: '在线拜年' },
      typingDelay: [400, 900],
      greetings: [
        '新年好呀，大过年的也来串门？🧨',
        '过年好！饺子吃了吗？🥟',
        '又一年啦，随便逛逛，别客气~'
      ],
      returnGreetings: [
        '哟，又来拜年啦？🧧',
        '新年新气象，又来啦？'
      ],
      quickReplies: [
        { label: '你是谁', intent: 'who' },
        { label: '看看作品', intent: 'projects' },
        { label: '给我拜个年', intent: 'bainian' },
        { label: '爬个塔', intent: 'spire' },
        { label: '联系方式', intent: 'contact' }
      ]
    },

    'mid-autumn': {
      vars: {
        '--bg-1': '#1b2a4a', '--bg-2': '#0a1020',
        '--accent': '#f0d79b', '--text': '#f2ecdc', '--text-dim': 'rgba(242,236,220,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(240,215,155,.25)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'petals', density: 10 },
      persona: { name: '我', avatar: '🌕', status: '赏月在线' },
      typingDelay: [500, 1000],
      greetings: [
        '中秋快乐，月亮我替你先看了一眼，很圆。🌕',
        '月饼吃了吗？五仁的就算了。',
        '天涯共此时，欢迎。'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'national-day': {
      vars: {
        '--bg-1': '#9e1b1b', '--bg-2': '#2b0606',
        '--accent': '#ffd75e', '--text': '#fff6e6', '--text-dim': 'rgba(255,246,230,.6)',
        '--bubble-bg': 'rgba(255,255,255,.10)', '--bubble-user-bg': 'rgba(255,215,94,.28)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'fireworks', density: 1 },
      persona: { name: '我', avatar: '🎆', status: '假期在线' },
      typingDelay: [400, 900],
      greetings: [
        '国庆快乐！假期愉快呀 🎆',
        '放假了还来看代码，是真爱了。',
        '为祖国庆生，顺便欢迎你来。🇨🇳'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'new-year': {
      vars: {
        '--bg-1': '#12355b', '--bg-2': '#050a14',
        '--accent': '#ffd166', '--text': '#eef4fb', '--text-dim': 'rgba(238,244,251,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(255,209,102,.26)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'fireworks', density: 1 },
      persona: { name: '我', avatar: '🎇', status: '跨年在线' },
      typingDelay: [400, 900],
      greetings: [
        '新年快乐！新的一年，多多关照。🎆',
        '新年好！去年的 flag 倒了几个不重要，今年继续。',
        '新日历翻开第一页，欢迎光临。'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'xmas': {
      vars: {
        '--bg-1': '#0f3d2e', '--bg-2': '#071a13',
        '--accent': '#e63946', '--text': '#f1faee', '--text-dim': 'rgba(241,250,238,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(230,57,70,.30)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'snow', density: 40 },
      persona: { name: '我', avatar: '🎄', status: '在线' },
      typingDelay: [400, 900],
      greetings: [
        'Merry Christmas! 🎄 袜子挂好了吗？',
        '圣诞快乐！礼物没有，代码管够。',
        '叮叮当～欢迎光临。🔔'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'birthday': {
      vars: {
        '--bg-1': '#4a1d6b', '--bg-2': '#170826',
        '--accent': '#ffb3c6', '--text': '#fdf0f5', '--text-dim': 'rgba(253,240,245,.6)',
        '--bubble-bg': 'rgba(255,255,255,.10)', '--bubble-user-bg': 'rgba(255,179,198,.28)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'fireworks', density: 1 },
      persona: { name: '我', avatar: '🎂', status: '今天过生日' },
      typingDelay: [400, 900],
      greetings: [
        '今天是我生日！能撞见这一天，缘分呐。🎂',
        '生日快乐——是我说给自己的，但祝福分你一半。🎉'
      ],
      quickReplies: [
        { label: '生日快乐！', intent: 'birthday-wish' },
        { label: '你是谁', intent: 'who' },
        { label: '看看作品', intent: 'projects' },
        { label: '爬个塔', intent: 'spire' },
        { label: '联系方式', intent: 'contact' }
      ]
    },

    'spring': {
      vars: {
        '--bg-1': '#3d6b4f', '--bg-2': '#12271c',
        '--accent': '#a8e6a3', '--text': '#f0f7ef', '--text-dim': 'rgba(240,247,239,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(168,230,163,.25)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'petals', density: 12 },
      persona: { name: '我', avatar: '🌸', status: '在线' },
      typingDelay: [400, 900],
      greetings: [
        '春天来啦，适合出门，也适合写代码。🌸',
        '春风十里，不如你点进来看一眼。',
        '万物复苏，包括我的待办列表。'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'summer': {
      vars: {
        '--bg-1': '#127369', '--bg-2': '#04202e',
        '--accent': '#ffd166', '--text': '#eefaf7', '--text-dim': 'rgba(238,250,247,.55)',
        '--bubble-bg': 'rgba(255,255,255,.09)', '--bubble-user-bg': 'rgba(255,209,102,.26)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'fireflies', density: 16 },
      persona: { name: '我', avatar: '🍉', status: '在线' },
      typingDelay: [400, 900],
      greetings: [
        '热化了……进来坐坐，这里有空调（并没有）。🍉',
        '夏天快乐！西瓜最中间那一口留给你。',
        '蝉鸣、汽水、写不完的代码，夏天三件套。'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'autumn': {
      vars: {
        '--bg-1': '#6b4226', '--bg-2': '#1e0f06',
        '--accent': '#e0a458', '--text': '#f7efe4', '--text-dim': 'rgba(247,239,228,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(224,164,88,.28)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'leaves', density: 12 },
      persona: { name: '我', avatar: '🍂', status: '在线' },
      typingDelay: [500, 1000],
      greetings: [
        '天凉好个秋。🍂',
        '秋天适合想念，也适合提交 PR。',
        '落叶知秋，欢迎常来。'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'winter': {
      vars: {
        '--bg-1': '#2a3b55', '--bg-2': '#0b1220',
        '--accent': '#a8d8ea', '--text': '#eef5fa', '--text-dim': 'rgba(238,245,250,.55)',
        '--bubble-bg': 'rgba(255,255,255,.08)', '--bubble-user-bg': 'rgba(168,216,234,.25)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'snow', density: 40 },
      persona: { name: '我', avatar: '❄️', status: '在线' },
      typingDelay: [500, 1000],
      greetings: [
        '外面冷吧？进来暖暖。❄️',
        '冬天快乐，注意保暖。',
        '下雪天和热水澡最配，和写代码……也行。'
      ],
      quickReplies: DEFAULT_QUICK
    },

    'night': {
      vars: {
        '--bg-1': '#141a2e', '--bg-2': '#05070f',
        '--accent': '#8e9aaf', '--text': '#dfe4ee', '--text-dim': 'rgba(223,228,238,.45)',
        '--bubble-bg': 'rgba(255,255,255,.06)', '--bubble-user-bg': 'rgba(142,154,175,.22)',
        '--bubble-blur': '18px'
      },
      particles: { type: 'stars', density: 50 },
      persona: { name: '我', avatar: '🌙', status: '睡了，留言吧' },
      typingDelay: [600, 1100],
      greetings: [
        '还没睡呀？我都准备睡了……留言吧，明早回你。🌙',
        '深夜好。安静点，月亮在听。',
        '这个点还没睡的，不是有心事就是在写 bug。'
      ],
      quickReplies: [
        { label: '你是谁', intent: 'who' },
        { label: '看看作品', intent: 'projects' },
        { label: '留个言', intent: 'contact' }
      ]
    }
  };

  // 节日和节气共享聊天能力，各自拥有配色和风景。
  var FESTIVAL_DEFS = {
    'lantern-festival': ['元宵', '一夜鱼龙舞', 'spring', '#662a32', '#211323', '#f8cf89', '🏮', 'lanterns', '花灯初上，月圆人安。元宵快乐，吃碗汤圆再聊。'],
    'dragon-boat': ['端午', '粽香入夏来', 'summer', '#1d655c', '#0a292d', '#c9df9c', '🐉', 'boats', '端午安康。把祝福裹进粽叶，送你一整个夏天的清凉。'],
    'qixi': ['七夕', '星河寄相思', 'summer', '#393565', '#11162e', '#d6b9ed', '✨', 'stars', '七夕快乐。今晚的银河很长，刚好够放下所有想念。'],
    'double-ninth': ['重阳', '登高见远山', 'autumn', '#796044', '#2a2928', '#f1cb84', '🌼', 'chrysanthemums', '今日重阳。登高望远，也记得问候惦念的人。'],
    'laba': ['腊八', '一碗人间暖', 'winter', '#664a40', '#29202a', '#e7c18f', '🥣', 'snow', '过了腊八就是年。喝一碗热粥，把冬日过暖。'],
    'little-new-year': ['小年', '人间迎新岁', 'winter', '#743039', '#2d1725', '#f2bf7d', '🧧', 'lanterns', '小年快乐。扫去旧日的烦恼，留一扇门给新年的好事。'],
    'valentine': ['情人节', '爱意慢慢生长', 'spring', '#754456', '#2e1e35', '#efbdcc', '💌', 'hearts', '情人节快乐。愿你有爱可说，也有人愿意听。'],
    'womens-day': ['妇女节', '自在生长，自有光芒', 'spring', '#59526d', '#272236', '#ddc9f1', '💐', 'flowers', '愿每一位女性都能自由选择、尽情生长。节日快乐。'],
    'arbor-day': ['植树节', '种下一点绿意', 'spring', '#326958', '#102e2c', '#b9dfaa', '🌳', 'trees', '种一棵树，也种下对未来的期待。植树节快乐。'],
    'labor-day': ['劳动节', '把日常过成理想', 'summer', '#3c6572', '#172b3b', '#efce91', '☕', 'sun', '劳动节快乐。辛苦啦，今天让自己好好歇一歇。'],
    'childrens-day': ['儿童节', '快乐不设年龄', 'summer', '#4b6e86', '#1d324e', '#f5d697', '🎈', 'balloons', '六一快乐。大朋友也可以保留一颗好奇的心。'],
    'teachers-day': ['教师节', '一盏灯，照亮远方', 'autumn', '#566457', '#202e30', '#dfcc96', '📖', 'lights', '教师节快乐。谢谢每一位曾点亮我们世界的人。'],
    'halloween': ['万圣夜', '今晚有一点奇妙', 'autumn', '#5c3d66', '#1a1830', '#f4b470', '🎃', 'pumpkins', '万圣夜快乐。不给糖，就留下来聊一会儿。'],
    'thanksgiving': ['感恩节', '把感谢说给你听', 'autumn', '#865c43', '#30252b', '#efc58e', '🍁', 'leaves', '谢谢你来。那些平凡日子里的善意，都值得被记住。']
  };
  Object.keys(FESTIVAL_DEFS).forEach(function (id) {
    var d = FESTIVAL_DEFS[id];
    var base = THEMES[d[2]];
    var vars = Object.assign({}, base.vars, {
      '--bg-1': d[3], '--bg-2': d[4], '--accent': d[5],
      '--bubble-user-bg': 'color-mix(in srgb, ' + d[5] + ' 24%, transparent)'
    });
    var particle = { lanterns: 'lanterns', stars: 'stars', snow: 'snow', leaves: 'leaves',
      hearts: 'petals', flowers: 'petals', chrysanthemums: 'petals' }[d[7]] || 'fireflies';
    THEMES[id] = {
      label: d[0], caption: d[1], category: 'festival', motif: d[7], season: d[2], vars: vars,
      particles: { type: particle, density: particle === 'snow' ? 30 : 16 },
      persona: { name: '我', avatar: d[6], status: d[0] + ' · ' + d[1] },
      greetings: [d[8]], quickReplies: DEFAULT_QUICK
    };
  });

  var BASE_META = {
    'default': ['日常', '留一点时间，随便聊聊', 'mountains'],
    'spring': ['春日', '春风有信，花开有期', 'flowers'],
    'summer': ['夏日', '绿荫深处，听风过夏', 'lotus'],
    'autumn': ['秋日', '山河向晚，人间已秋', 'leaves'],
    'winter': ['冬日', '围一炉暖意，等一场雪', 'snow'],
    'night': ['深夜', '月亮在听，星星也在', 'stars'],
    'spring-festival': ['春节', '灯火可亲，岁岁常安', 'lanterns'],
    'mid-autumn': ['中秋', '一轮月色，万家团圆', 'moon'],
    'national-day': ['国庆', '山河锦绣，万家灯火', 'fireworks'],
    'new-year': ['元旦', '新岁序开，美好将至', 'fireworks'],
    'xmas': ['圣诞', '把愿望，藏进冬夜的星光', 'christmas'],
    'birthday': ['生日', '又一岁，仍有热爱', 'balloons']
  };
  Object.keys(BASE_META).forEach(function (id) {
    var d = BASE_META[id];
    Object.assign(THEMES[id], {
      label: d[0], caption: d[1], motif: d[2],
      category: ['spring-festival', 'mid-autumn', 'national-day', 'new-year', 'xmas', 'birthday'].indexOf(id) >= 0 ? 'festival' : 'daily'
    });
  });

  // 每个节气拥有独立的天色与物候，而非只替换强调色。
  var TERM_SCENES = {
    lichun: ['#42675b', '#172f31', 'sprouts'], yushui: ['#426276', '#1a3041', 'rain'],
    jingzhe: ['#53684b', '#1c3430', 'birds'], chunfen: ['#7b656f', '#343246', 'flowers'],
    qingming: ['#52736d', '#1d3839', 'willow'], guyu: ['#3f7065', '#163a3b', 'rain'],
    lixia: ['#386a62', '#143b3b', 'trees'], xiaoman: ['#6c7951', '#293d37', 'wheat'],
    mangzhong: ['#8a7a49', '#3b4135', 'wheat'], xiazhi: ['#417e83', '#194355', 'sun'],
    xiaoshu: ['#3e7473', '#173c47', 'lotus'], dashu: ['#4f6c82', '#1d354a', 'lotus'],
    liqiu: ['#8a6c51', '#3d3431', 'leaves'], chushu: ['#7b775b', '#343e3b', 'birds'],
    bailu: ['#688084', '#2a3e4a', 'reeds'], qiufen: ['#9a7556', '#443b38', 'leaves'],
    hanlu: ['#696c71', '#2b3542', 'reeds'], shuangjiang: ['#7b6e65', '#343748', 'persimmons'],
    lidong: ['#5a6b7b', '#283446', 'snow'], xiaoxue: ['#697e91', '#2b3d54', 'snow'],
    daxue: ['#8295a7', '#344760', 'snow'], dongzhi: ['#6a6e85', '#2d304b', 'moon'],
    xiaohan: ['#546d86', '#243750', 'snow'], dahan: ['#4c617c', '#202e46', 'plum']
  };

  // 二十四节气主题：以季节主题为基底生成。
  // particles 默认继承季节配置（春花瓣/夏萤火/秋落叶/冬雪），可用 particles 字段覆盖；
  // 壁纸按 assets/wallpapers/<节气id>.svg 约定自动生效。
  var TERM_DEFS = {
    'lichun':      { season: 'spring', accent: '#9fd98f', avatar: '🌱', status: '立春·万物始生',
      greetings: ['今日立春，东风解冻，万物始生。', '冬天算是熬出头了，新年新气象。'] },
    'yushui':      { season: 'spring', accent: '#7fb8d4', avatar: '💧', status: '雨水·润物无声', particles: { type: 'rain', density: 28 },
      greetings: ['今日雨水，春雨贵如油。', '天街小雨润如酥，出门记得带伞。'] },
    'jingzhe':     { season: 'spring', accent: '#c0d860', avatar: '⚡', status: '惊蛰·春雷乍动',
      greetings: ['今日惊蛰，春雷一响，百虫惊醒。', '惊蛰到，人也该跟着春天动起来了。'] },
    'chunfen':     { season: 'spring', accent: '#f0c6d0', avatar: '🌸', status: '春分·昼夜均分',
      greetings: ['今日春分，昼夜一样长。', '春分麦起身，一刻值千金。'] },
    'qingming':    { season: 'spring', accent: '#9db89a', avatar: '🌿', status: '清明·慎终追远', particles: { type: 'rain', density: 20 },
      greetings: ['今日清明。慎终追远，也适合踏青。', '清明时节雨纷纷，出行注意安全。'] },
    'guyu':        { season: 'spring', accent: '#8fc7a8', avatar: '🌾', status: '谷雨·雨生百谷', particles: { type: 'rain', density: 28 },
      greetings: ['今日谷雨，雨生百谷。', '春天最后一个节气了，惜春。'] },
    'lixia':       { season: 'summer', accent: '#7ed491', avatar: '🍃', status: '立夏·万物繁茂',
      greetings: ['今日立夏，夏天正式开场。', '立夏尝新，夏天快乐。'] },
    'xiaoman':     { season: 'summer', accent: '#e6d37a', avatar: '🌾', status: '小满·将满未满',
      greetings: ['今日小满。将满未满，恰是最好的状态。', '小满小满，麦粒渐满。'] },
    'mangzhong':   { season: 'summer', accent: '#d9b84f', avatar: '🚜', status: '芒种·忙收忙种',
      greetings: ['今日芒种，有芒的麦子快收，有芒的稻子可种。', '芒种忙种，一年中最忙的时节。'] },
    'xiazhi':      { season: 'summer', accent: '#ffb84d', avatar: '☀️', status: '夏至·日长之至',
      greetings: ['今日夏至，一年中白天最长的一天。', '夏至到，蝉始鸣。'] },
    'xiaoshu':     { season: 'summer', accent: '#ff9c5b', avatar: '🍉', status: '小暑·热浪初显',
      greetings: ['今日小暑，上蒸下煮的日子开始了。', '小暑不算热，大暑正伏天。'] },
    'dashu':       { season: 'summer', accent: '#ff7a59', avatar: '🧊', status: '大暑·何以消夏',
      greetings: ['今日大暑，一年最热的时候，注意防暑。', '何以消烦暑，端居一院中。'] },
    'liqiu':       { season: 'autumn', accent: '#d98e4a', avatar: '🍁', status: '立秋·一叶知秋',
      greetings: ['今日立秋，一叶落而知天下秋。', '立秋贴秋膘，吃点好的。'] },
    'chushu':      { season: 'autumn', accent: '#c9a86a', avatar: '🌬️', status: '处暑·暑气渐止',
      greetings: ['今日处暑，暑气到此为止。', '处暑出暑，早晚开始凉快了。'] },
    'bailu':       { season: 'autumn', accent: '#d8d8c8', avatar: '💠', status: '白露·露从今夜白',
      greetings: ['今日白露，露从今夜白。', '白露身不露，早晚加件衣。'] },
    'qiufen':      { season: 'autumn', accent: '#e8b06a', avatar: '🍂', status: '秋分·秋意正浓',
      greetings: ['今日秋分，又是昼夜平分的一天。', '秋分至，秋意浓。'] },
    'hanlu':       { season: 'autumn', accent: '#b9a07a', avatar: '🌫️', status: '寒露·露冷将凝',
      greetings: ['今日寒露，露水更凉了。', '寒露惊秋晚，朝看菊渐黄。'] },
    'shuangjiang': { season: 'autumn', accent: '#c8d4e0', avatar: '🍅', status: '霜降·好柿成霜',
      greetings: ['今日霜降，秋天最后一个节气。', '霜降吃柿子——老话讲，冬天不感冒。'] },
    'lidong':      { season: 'winter', accent: '#a8c8e0', avatar: '🥟', status: '立冬·补冬',
      greetings: ['今日立冬，该吃饺子了。', '立冬补冬，补嘴空。'] },
    'xiaoxue':     { season: 'winter', accent: '#bcd6ea', avatar: '🌨️', status: '小雪·初雪将至',
      greetings: ['今日小雪，初雪要来了。', '小雪雪满天，来年必丰年。'] },
    'daxue':       { season: 'winter', accent: '#d0e4f5', avatar: '☃️', status: '大雪·瑞雪丰年',
      greetings: ['今日大雪，瑞雪兆丰年。', '大雪至，仲冬始，注意保暖。'] },
    'dongzhi':     { season: 'winter', accent: '#f0d9a8', avatar: '🍡', status: '冬至·大如年',
      greetings: ['今日冬至，北饺子南汤圆，你吃哪个？', '冬至大如年。从今天起，白天越来越长了。'] },
    'xiaohan':     { season: 'winter', accent: '#9fbcd8', avatar: '🧣', status: '小寒·天渐寒',
      greetings: ['今日小寒，一年中最冷的日子要来了。', '小寒大寒，冻成一团，多穿点。'] },
    'dahan':       { season: 'winter', accent: '#8fb0d0', avatar: '🧨', status: '大寒·岁末迎年',
      greetings: ['今日大寒，二十四节气的最后一站。', '大寒到顶点，日后天渐暖——快过年了。'] }
  };

  Object.keys(TERM_DEFS).forEach(function (id) {
    var d = TERM_DEFS[id];
    var base = THEMES[d.season];
    var vars = {};
    for (var k in base.vars) vars[k] = base.vars[k];
    vars['--accent'] = d.accent;
    vars['--bg-1'] = TERM_SCENES[id][0];
    vars['--bg-2'] = TERM_SCENES[id][1];
    vars['--bubble-user-bg'] = 'color-mix(in srgb, ' + d.accent + ' 24%, transparent)';
    THEMES[id] = {
      label: d.status.split('·')[0], caption: d.status.split('·')[1], category: 'term',
      motif: TERM_SCENES[id][2],
      season: d.season,
      vars: vars,
      particles: d.particles || base.particles,
      persona: { name: '我', avatar: d.avatar, status: d.status },
      typingDelay: base.typingDelay,
      greetings: d.greetings,
      quickReplies: base.quickReplies
    };
  });

  if (window.MusicLibrary) {
    Object.keys(THEMES).forEach(function (id) {
      var tracks = window.MusicLibrary.forTheme(id);
      THEMES[id].music = tracks[0].src;
      THEMES[id].musicTrack = tracks[0];
      THEMES[id].musicFallbacks = tracks.slice(1);
    });
  }

  var DAY_MS = 86400000;
  var selectedTheme = null;
  var wallpaperRequest = 0;
  var lunarCalendar = null;
  try {
    var formatter = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' });
    if (formatter.resolvedOptions().calendar === 'chinese') lunarCalendar = formatter;
  } catch (e) {}

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // 某公历 MM-DD 相对今天的偏移天数（考虑跨年，取最近的一次）
  function solarDiff(date, mmdd) {
    var parts = mmdd.split('-');
    var m = parseInt(parts[0], 10), d = parseInt(parts[1], 10);
    var best = null;
    for (var dy = -1; dy <= 1; dy++) {
      var target = new Date(date.getFullYear() + dy, m - 1, d);
      var diff = Math.round((startOfDay(date) - target) / DAY_MS);
      if (best === null || Math.abs(diff) < Math.abs(best)) best = diff;
    }
    return best;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function matchRule(rule, date) {
    var span = rule.span || [0, 0];
    if (rule.months) {
      return rule.months.indexOf(date.getMonth() + 1) !== -1 ? { dayOffset: 0 } : null;
    }
    if (rule.hours) {
      return rule.hours.indexOf(date.getHours()) !== -1 ? { dayOffset: 0 } : null;
    }
    if (rule.weekday) {
      var w = rule.weekday;
      return date.getMonth() + 1 === w[0] && date.getDay() === w[1] &&
        Math.ceil(date.getDate() / 7) === w[2] ? { dayOffset: 0 } : null;
    }
    if (rule.lunar && lunarCalendar) {
      for (var offset = span[0]; offset <= span[1]; offset++) {
        var candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset, 12);
        var parts = lunarCalendar.formatToParts(candidate);
        var month = parts.filter(function (p) { return p.type === 'month'; })[0];
        var day = parts.filter(function (p) { return p.type === 'day'; })[0];
        // 闰月的 month 带 bis 后缀，不能作为常规节日命中。
        if (month && day && month.value === String(rule.lunar[0]) && day.value === String(rule.lunar[1])) {
          return { dayOffset: offset };
        }
      }
      return null;
    }
    var mmdd = null;
    if (rule.solar) mmdd = rule.solar;
    if (rule.festival) {
      mmdd = LUNAR_TABLE[rule.festival] && LUNAR_TABLE[rule.festival][date.getFullYear()];
      if (!mmdd) return null; // 日期表之外的年份直接跳过
    }
    if (rule.term) {
      mmdd = SOLAR_TERM_TABLE[rule.term] && SOLAR_TERM_TABLE[rule.term][date.getFullYear()];
      if (!mmdd) return null; // 节气表之外的年份直接跳过
    }
    if (!mmdd) return rule.id === 'default' ? { dayOffset: 0 } : null;
    var diff = solarDiff(date, mmdd);
    if (diff >= span[0] && diff <= span[1]) return { dayOffset: diff };
    return null;
  }

  function resolve(date) {
    // ?theme=xxx 预览强制指定
    var forced = new URLSearchParams(location.search).get('theme');
    if (forced && THEMES[forced]) return build(forced, 0);
    if (selectedTheme && THEMES[selectedTheme]) return build(selectedTheme, 0);

    var best = null;
    for (var i = 0; i < RULES.length; i++) {
      var hit = matchRule(RULES[i], date);
      if (hit && (!best || RULES[i].priority > best.rule.priority)) {
        best = { rule: RULES[i], dayOffset: hit.dayOffset };
      }
    }
    return build(best.rule.id, best.dayOffset);
  }

  function build(id, dayOffset) {
    var t = THEMES[id] || THEMES['default'];
    return {
      id: id,
      label: t.label,
      caption: t.caption,
      category: t.category,
      motif: t.motif,
      dayOffset: dayOffset,
      season: t.season || null,
      music: t.music || null,
      musicTrack: t.musicTrack || null,
      musicFallbacks: t.musicFallbacks || [],
      vars: t.vars,
      wallpaper: t.wallpaper !== undefined ? t.wallpaper : 'assets/wallpapers/' + id + '.svg',
      particles: t.particles || { type: 'none' },
      persona: t.persona,
      typingDelay: t.typingDelay || [400, 900],
      greetings: t.greetings,
      returnGreetings: t.returnGreetings || null,
      quickReplies: t.quickReplies || DEFAULT_QUICK
    };
  }

  function get(id) {
    return THEMES[id] ? build(id, 0) : null;
  }

  // 先用 Image 探活：壁纸存在才切换，缺失时保持纯渐变，避免 404 后界面变平
  function loadWallpaper(root, path, request) {
    return new Promise(function (done) {
      if (!path) { done(); return; }
      var img = new Image();
      img.onload = function () {
        // 快速切换时，过期请求不能覆盖当前风景。
        if (request === wallpaperRequest) {
          root.style.setProperty('--wallpaper', 'url("' + new URL(path, document.baseURI).href + '")');
          root.dataset.wallpaper = '';
        }
        done();
      };
      img.onerror = function () { done(); };
      img.src = path;
    });
  }

  function apply(theme) {
    var root = document.documentElement;
    root.dataset.theme = theme.id;
    for (var k in theme.vars) root.style.setProperty(k, theme.vars[k]);
    root.style.removeProperty('--wallpaper');
    delete root.dataset.wallpaper;
    window.__themeReady = loadWallpaper(root, theme.wallpaper, ++wallpaperRequest);
    window.__theme = theme;
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
    return window.__themeReady;
  }

  function select(id) {
    selectedTheme = id && THEMES[id] && id !== 'birthday' ? id : null;
    var url = new URL(location.href);
    url.searchParams.delete('theme');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    return resolve(new Date());
  }

  window.ThemeEngine = { resolve: resolve, apply: apply, THEMES: THEMES, get: get, select: select };
})();
