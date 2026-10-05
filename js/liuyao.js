/*
 * 六爻起卦与排盘（纯逻辑，无 DOM 依赖）。
 * - 铜钱摇卦：三枚一掷，字=3 背=2，合 6/7/8/9 → 老阴×/少阳/少阴/老阳○，六掷成卦（自下而上）。
 * - 装卦：纳甲、六亲（以本宫五行为我）、六神（日干起）、世应（京房八宫次序推）、伏神。
 * - 四柱：日柱以 1949-10-01（甲子日）为锚精确推；年月柱按节气划分，
 *   节气用寿星公式近似（2000–2099），交节当日可能差一天，排盘末尾有提示。
 * 只起卦排盘、附卦辞基本含义，不断吉凶——细断交给 AI。
 */
(function () {
  'use strict';

  var STEMS = '甲乙丙丁戊己庚辛壬癸';
  var BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
  var BRANCH_WX = {
    子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火',
    午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水'
  };

  // 八卦：次序 乾兑离震巽坎艮坤；bits 自下而上（1=阳）；inner/outer 为纳甲（配初爻→三爻）
  var TRIGRAMS = [
    { name: '乾', sym: '☰', bits: [1, 1, 1], wx: '金', inner: ['甲子', '甲寅', '甲辰'], outer: ['壬午', '壬申', '壬戌'] },
    { name: '兑', sym: '☱', bits: [1, 1, 0], wx: '金', inner: ['丁巳', '丁卯', '丁丑'], outer: ['丁亥', '丁酉', '丁未'] },
    { name: '离', sym: '☲', bits: [1, 0, 1], wx: '火', inner: ['己卯', '己丑', '己亥'], outer: ['己酉', '己未', '己巳'] },
    { name: '震', sym: '☳', bits: [1, 0, 0], wx: '木', inner: ['庚子', '庚寅', '庚辰'], outer: ['庚午', '庚申', '庚戌'] },
    { name: '巽', sym: '☴', bits: [0, 1, 1], wx: '木', inner: ['辛丑', '辛亥', '辛酉'], outer: ['辛未', '辛巳', '辛卯'] },
    { name: '坎', sym: '☵', bits: [0, 1, 0], wx: '水', inner: ['戊寅', '戊辰', '戊午'], outer: ['戊申', '戊戌', '戊子'] },
    { name: '艮', sym: '☶', bits: [0, 0, 1], wx: '土', inner: ['丙辰', '丙午', '丙申'], outer: ['丙戌', '丙子', '丙寅'] },
    { name: '坤', sym: '☷', bits: [0, 0, 0], wx: '土', inner: ['乙未', '乙巳', '乙卯'], outer: ['癸丑', '癸亥', '癸酉'] }
  ];

  var GODS = ['青龙', '朱雀', '勾陈', '螣蛇', '白虎', '玄武'];
  var GOD_START = { 甲: 0, 乙: 0, 丙: 1, 丁: 1, 戊: 2, 己: 3, 庚: 4, 辛: 4, 壬: 5, 癸: 5 };
  var SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生者
  var KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };     // 我克者
  var GONG_STEP = ['本宫', '一世', '二世', '三世', '四世', '五世', '游魂', '归魂'];

  // 六十四卦：HEX[上卦][下卦]，{ n: 卦名, c: 卦辞, b: 简释 }
  var HEX = [
    [ // 上乾
      { n: '乾为天', c: '元，亨，利，贞。', b: '刚健中正，自强不息；盛极防骄，见好要收。' },
      { n: '天泽履', c: '履虎尾，不咥人，亨。', b: '如履虎尾，谨慎守礼，可化险为夷。' },
      { n: '天火同人', c: '同人于野，亨。利涉大川，利君子贞。', b: '与人同心合作，宜公不宜私。' },
      { n: '天雷无妄', c: '元，亨，利，贞。其匪正有眚，不利有攸往。', b: '守本分、不妄动则吉；轻举妄动招灾。' },
      { n: '天风姤', c: '女壮，勿用取女。', b: '阴柔渐长，防微杜渐，勿为表象所惑。' },
      { n: '天水讼', c: '有孚窒惕，中吉，终凶。利见大人，不利涉大川。', b: '争执之象，宜和解退让，见好即收。' },
      { n: '天山遁', c: '亨，小利贞。', b: '时势不利，急流勇退，保全为上。' },
      { n: '天地否', c: '否之匪人，不利君子贞，大往小来。', b: '闭塞不通之时，守静待变，勿强出头。' }
    ],
    [ // 上兑
      { n: '泽天夬', c: '扬于王庭，孚号，有厉。告自邑，不利即戎，利有攸往。', b: '当断则断，果决除弊，但忌孤注硬拼。' },
      { n: '兑为泽', c: '亨，利，贞。', b: '和悦相感，宜沟通分享，以柔得人。' },
      { n: '泽火革', c: '巳日乃孚，元亨，利贞，悔亡。', b: '变革之时，顺天应人，去旧布新。' },
      { n: '泽雷随', c: '元，亨，利，贞，无咎。', b: '随时顺势，择善而从，忌固执己见。' },
      { n: '泽风大过', c: '栋桡，利有攸往，亨。', b: '负重过载的非常时刻，需非常之举，亦防倾覆。' },
      { n: '泽水困', c: '亨，贞，大人吉，无咎，有言不信。', b: '身处困境，守志不移，少说多做。' },
      { n: '泽山咸', c: '亨，利，贞，取女吉。', b: '两情相感，以诚动人；婚恋、合作皆吉。' },
      { n: '泽地萃', c: '亨。王假有庙，利见大人，亨，利贞。用大牲吉，利有攸往。', b: '聚集汇合，宜聚众成事，防乐极生悲。' }
    ],
    [ // 上离
      { n: '火天大有', c: '元亨。', b: '丰盛富有之时，宜谦以处盈、惠及他人。' },
      { n: '火泽睽', c: '小事吉。', b: '乖背离异，求同存异；大事缓图，小事可为。' },
      { n: '离为火', c: '利贞，亨。畜牝牛，吉。', b: '依附光明正道，柔顺持中方吉。' },
      { n: '火雷噬嗑', c: '亨。利用狱。', b: '前路有梗，须果断排除障碍、明正法度。' },
      { n: '火风鼎', c: '元吉，亨。', b: '鼎新之象，宜革新立制、广纳贤才。' },
      { n: '火水未济', c: '亨。小狐汔济，濡其尾，无攸利。', b: '事将成未成，慎终如始，防功亏一篑。' },
      { n: '火山旅', c: '小亨，旅贞吉。', b: '在外为客，谦逊谨慎，不可久留一地。' },
      { n: '火地晋', c: '康侯用锡马蕃庶，昼日三接。', b: '旭日东升，进取有为，易得赏识提携。' }
    ],
    [ // 上震
      { n: '雷天大壮', c: '利贞。', b: '强盛之时更要守正，忌恃强冒进。' },
      { n: '雷泽归妹', c: '征凶，无攸利。', b: '名分不正、急于求成则凶，宜缓不宜急。' },
      { n: '雷火丰', c: '亨，王假之，勿忧，宜日中。', b: '盛大丰满，宜把握当下，防盛极而衰。' },
      { n: '震为雷', c: '亨。震来虩虩，笑言哑哑。震惊百里，不丧匕鬯。', b: '惊雷动荡，临危不乱，戒惧反得亨通。' },
      { n: '雷风恒', c: '亨，无咎，利贞，利有攸往。', b: '恒久之道贵在有常，忌朝三暮四。' },
      { n: '雷水解', c: '利西南，无所往，其来复吉。有攸往，夙吉。', b: '险难消解，宜速断善后、宽以待人。' },
      { n: '雷山小过', c: '亨，利贞。可小事，不可大事。飞鸟遗之音，不宜上，宜下，大吉。', b: '小有逾越，可为小事不可为大事，宜低不宜高。' },
      { n: '雷地豫', c: '利建侯行师。', b: '安乐之时宜未雨绸缪，忌沉溺享乐。' }
    ],
    [ // 上巽
      { n: '风天小畜', c: '亨。密云不雨，自我西郊。', b: '积蓄未足、时机未到，宜耐心等待。' },
      { n: '风泽中孚', c: '豚鱼吉，利涉大川，利贞。', b: '诚信感物，心中有信，可渡难关。' },
      { n: '风火家人', c: '利女贞。', b: '正家之道，各安其分，内和则外顺。' },
      { n: '风雷益', c: '利有攸往，利涉大川。', b: '损上益下之时，宜积极进取，大有可为。' },
      { n: '巽为风', c: '小亨，利有攸往，利见大人。', b: '谦逊如风，柔顺渗透，小事可成。' },
      { n: '风水涣', c: '亨。王假有庙，利涉大川，利贞。', b: '涣散之时，先聚人心、解内散。' },
      { n: '风山渐', c: '女归吉，利贞。', b: '循序渐进，欲速不达；婚嫁、合作皆吉。' },
      { n: '风地观', c: '盥而不荐，有孚颙若。', b: '观仰省察，宜多看少动，以德感人。' }
    ],
    [ // 上坎
      { n: '水天需', c: '有孚，光亨，贞吉。利涉大川。', b: '云上于天，耐心等待，养精蓄锐。' },
      { n: '水泽节', c: '亨。苦节不可贞。', b: '节制有度，宜自我约束，过苦则难持久。' },
      { n: '水火既济', c: '亨小，利贞。初吉终乱。', b: '事已成济，守成为要，防初吉终乱。' },
      { n: '水雷屯', c: '元，亨，利，贞。勿用有攸往，利建侯。', b: '万事开头难，宜扎根蓄力、广结善缘。' },
      { n: '水风井', c: '改邑不改井，无丧无得，往来井井。汔至，亦未繘井，羸其瓶，凶。', b: '井养不穷，修身积德、惠及他人，防功败垂成。' },
      { n: '坎为水', c: '有孚，维心亨，行有尚。', b: '险陷重重，以诚心和坚持脱险。' },
      { n: '水山蹇', c: '利西南，不利东北。利见大人，贞吉。', b: '前有险阻，宜退守求助，勿孤身硬闯。' },
      { n: '水地比', c: '吉。原筮元永贞，无咎。不宁方来，后夫凶。', b: '亲比依附，宜及早归附，迟疑有咎。' }
    ],
    [ // 上艮
      { n: '山天大畜', c: '利贞，不家食吉，利涉大川。', b: '大有积蓄，养精蓄锐，可担大任。' },
      { n: '山泽损', c: '有孚，元吉，无咎，可贞，利有攸往。曷之用？二簋可用享。', b: '有舍才有得，诚心减损反得吉。' },
      { n: '山火贲', c: '亨。小利有攸往。', b: '文饰之美，可修外表，更要重修内涵。' },
      { n: '山雷颐', c: '贞吉。观颐，自求口实。', b: '颐养之道，慎言语、节饮食，自食其力。' },
      { n: '山风蛊', c: '元亨，利涉大川。先甲三日，后甲三日。', b: '积弊已久，宜整顿革新，先理内务。' },
      { n: '山水蒙', c: '亨。匪我求童蒙，童蒙求我。初筮告，再三渎，渎则不告。利贞。', b: '启蒙发昧，宜诚心求教，忌一而再地问。' },
      { n: '艮为山', c: '艮其背，不获其身，行其庭，不见其人，无咎。', b: '当止则止，静以修身，妄动有咎。' },
      { n: '山地剥', c: '不利有攸往。', b: '阴盛剥阳，顺势退守，不宜有所往。' }
    ],
    [ // 上坤
      { n: '地天泰', c: '小往大来，吉亨。', b: '天地交泰，通顺之时，仍须居安思危。' },
      { n: '地泽临', c: '元，亨，利，贞。至于八月有凶。', b: '居高临下，宽厚待人；盛时防衰。' },
      { n: '地火明夷', c: '利艰贞。', b: '光明入地，宜晦藏守正，外柔顺而内文明。' },
      { n: '地雷复', c: '亨。出入无疾，朋来无咎。反复其道，七日来复，利有攸往。', b: '一阳来复，转机初现，顺势回复。' },
      { n: '地风升', c: '元亨，用见大人，勿恤，南征吉。', b: '柔以时升，积小成大，宜进取求贤。' },
      { n: '地水师', c: '贞，丈人吉，无咎。', b: '兴师动众之象，宜纪律严明、用老成持重之人。' },
      { n: '地山谦', c: '亨，君子有终。', b: '谦谦君子，卑以自牧，善始善终。' },
      { n: '坤为地', c: '元亨，利牝马之贞。君子有攸往，先迷后得主，利。西南得朋，东北丧朋。安贞吉。', b: '厚德载物，柔顺包容；跟随明主则吉，争先则迷。' }
    ]
  ];

  // ---- 摇卦 ----
  var TOSS_INFO = {
    6: { name: '老阴', yang: false, moving: true, mark: '×' },
    7: { name: '少阳', yang: true, moving: false, mark: '' },
    8: { name: '少阴', yang: false, moving: false, mark: '' },
    9: { name: '老阳', yang: true, moving: true, mark: '○' }
  };

  function toss() {
    var coins = [0, 0, 0].map(function () { return Math.random() < 0.5 ? 3 : 2; }); // 字=3 背=2
    var sum = coins[0] + coins[1] + coins[2];
    var info = TOSS_INFO[sum];
    return {
      coins: coins, sum: sum,
      name: info.name, yang: info.yang, moving: info.moving, mark: info.mark
    };
  }

  // ---- 干支 ----
  var DAY_ANCHOR = Date.UTC(1949, 9, 1); // 1949-10-01 为甲子日
  function dayGanzhi(date) {
    var d = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    var idx = Math.round((d - DAY_ANCHOR) / 86400000) % 60;
    return idx < 0 ? idx + 60 : idx;
  }

  // 节气近似（寿星公式，2000–2099）：交节日 = ⌊Y×0.2422+C⌋ − ⌊(Y−1)/4⌋
  function termDay(year, C) {
    var Y = year % 100;
    return Math.floor(Y * 0.2422 + C) - Math.floor((Y - 1) / 4);
  }
  // 十二「节」：[月, C, 月建地支序号]（寅月起立春；C 取 21 世纪寿星公式常数）
  var TERMS = [
    [1, 5.4055, 1], [2, 3.87, 2], [3, 5.63, 3], [4, 4.81, 4],
    [5, 5.52, 5], [6, 5.678, 6], [7, 7.108, 7], [8, 7.5, 8],
    [9, 7.646, 9], [10, 8.318, 10], [11, 7.438, 11], [12, 7.18, 0]
  ];

  function monthBranch(date) {
    var y = date.getFullYear(), t = date.getTime(), best = null;
    function consider(year, monthIdx, C, branch) {
      var d = new Date(year, monthIdx, termDay(year, C)).getTime();
      if (d <= t && (!best || d > best.d)) best = { d: d, branch: branch };
    }
    TERMS.forEach(function (term) { consider(y, term[0] - 1, term[1], term[2]); });
    consider(y - 1, 11, 7.18, 0); // 上年大雪兜底（1 月初）
    return best.branch;
  }

  function pillars(date) {
    var y = date.getFullYear();
    // 年柱以立春为界
    var beforeLichun = date.getTime() < new Date(y, 1, termDay(y, 3.87)).getTime();
    var gy = beforeLichun ? y - 1 : y;
    var yearIdx = ((gy - 4) % 60 + 60) % 60;

    var mBranch = monthBranch(date);
    var yearStem = yearIdx % 10;
    var mStemStart = [2, 4, 6, 8, 0][yearStem % 5]; // 甲己丙寅、乙庚戊寅、丙辛庚寅、丁壬壬寅、戊癸甲寅
    var mStem = (mStemStart + ((mBranch - 2 + 12) % 12)) % 10;

    var dayIdx = dayGanzhi(date);
    var dayStem = dayIdx % 10;
    var hBranch = Math.floor(((date.getHours() + 1) % 24) / 2);
    var hStemStart = [0, 2, 4, 6, 8][dayStem % 5]; // 甲己甲子、乙庚丙子、丙辛戊子、丁壬庚子、戊癸壬子
    var hStem = (hStemStart + hBranch) % 10;

    var kongBase = (dayIdx - (dayIdx % 10)) % 12; // 旬空：旬首地支后第 10、11 位
    return {
      year: STEMS[yearStem] + BRANCHES[yearIdx % 12],
      month: STEMS[mStem] + BRANCHES[mBranch],
      day: STEMS[dayStem] + BRANCHES[dayIdx % 12],
      dayStem: STEMS[dayStem],
      hour: STEMS[hStem] + BRANCHES[hBranch],
      kong: BRANCHES[(kongBase + 10) % 12] + BRANCHES[(kongBase + 11) % 12]
    };
  }

  // ---- 装卦 ----
  function eq(a, b) {
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function trigramOf(bits3) {
    for (var g = 0; g < 8; g++) if (eq(TRIGRAMS[g].bits, bits3)) return g;
    return -1;
  }

  // 京房八宫：纯卦世在六，逐爻变至五世，游魂返四，归魂返内卦
  function findGong(lines) {
    for (var g = 0; g < 8; g++) {
      var cur = TRIGRAMS[g].bits.concat(TRIGRAMS[g].bits);
      if (eq(cur, lines)) return { gong: g, step: 0, shi: 6 };
      var flips = [[1], [2], [3], [4], [5], [4], [1, 2, 3]];
      var shis = [1, 2, 3, 4, 5, 4, 3];
      for (var s = 0; s < flips.length; s++) {
        flips[s].forEach(function (ln) { cur[ln - 1] = 1 - cur[ln - 1]; });
        if (eq(cur, lines)) return { gong: g, step: s + 1, shi: shis[s] };
      }
    }
    return null;
  }

  function qinOf(gongWx, branchWx) {
    if (gongWx === branchWx) return '兄弟';
    if (SHENG[gongWx] === branchWx) return '子孙';
    if (SHENG[branchWx] === gongWx) return '父母';
    if (KE[gongWx] === branchWx) return '妻财';
    return '官鬼';
  }

  function lineGZ(lower, upper, i) { // i: 1–6
    return i <= 3 ? TRIGRAMS[lower].inner[i - 1] : TRIGRAMS[upper].outer[i - 4];
  }

  function dressLines(lines, gongWx, godStart, shi) {
    var lower = trigramOf(lines.slice(0, 3)), upper = trigramOf(lines.slice(3, 6));
    var ying = shi > 3 ? shi - 3 : shi + 3;
    var yao = [];
    for (var i = 1; i <= 6; i++) {
      var gz = lineGZ(lower, upper, i);
      var wx = BRANCH_WX[gz[1]];
      yao.push({
        gz: gz, wx: wx,
        qin: qinOf(gongWx, wx),
        god: GODS[(godStart + i - 1) % 6],
        yang: lines[i - 1] === 1,
        shi: shi === i, ying: ying === i
      });
    }
    return yao;
  }

  // 起卦：tosses 为 6 次摇卦结果（初爻在前），question 可空，date 为起卦时间
  function build(tosses, question, date) {
    var lines = tosses.map(function (t) { return t.yang ? 1 : 0; });
    var moving = tosses.map(function (t) { return t.moving; });
    var hasMoving = moving.indexOf(true) !== -1;
    var blines = lines.map(function (l, i) { return moving[i] ? 1 - l : l; });

    var benG = findGong(lines);
    var lower = trigramOf(lines.slice(0, 3)), upper = trigramOf(lines.slice(3, 6));
    var gongWx = TRIGRAMS[benG.gong].wx;
    var p = pillars(date);

    var yao = dressLines(lines, gongWx, GOD_START[p.dayStem], benG.shi);
    yao.forEach(function (y2, i) { y2.moving = moving[i]; });

    var ben = {
      hex: HEX[upper][lower], gong: benG, gongWx: gongWx,
      lower: lower, upper: upper, yao: yao
    };

    // 变卦（六亲仍从本宫五行论）
    var bian = null;
    if (hasMoving) {
      var bLower = trigramOf(blines.slice(0, 3)), bUpper = trigramOf(blines.slice(3, 6));
      var bG = findGong(blines);
      bian = {
        hex: HEX[bUpper][bLower], gong: bG,
        yao: dressLines(blines, gongWx, GOD_START[p.dayStem], bG.shi)
      };
    }

    // 伏神：本卦缺失的六亲，到本宫纯卦里找，伏在同爻位之下
    var present = {};
    yao.forEach(function (y2) { present[y2.qin] = true; });
    var pureYao = dressLines(TRIGRAMS[benG.gong].bits.concat(TRIGRAMS[benG.gong].bits),
      gongWx, GOD_START[p.dayStem], benG.shi);
    var fushen = [];
    ['父母', '兄弟', '官鬼', '妻财', '子孙'].forEach(function (q) {
      if (present[q]) return;
      for (var i = 0; i < 6; i++) {
        if (pureYao[i].qin === q) {
          fushen.push({ qin: q, gz: pureYao[i].gz, wx: pureYao[i].wx, under: i + 1 });
          break;
        }
      }
    });

    return { question: question, date: date, tosses: tosses, pillars: p, ben: ben, bian: bian, fushen: fushen };
  }

  // ---- 摇卦过程展示（未成的爻位留空，顶部为上爻）----
  function progress(tosses) {
    var rows = [];
    for (var i = 6; i >= 1; i--) {
      var t = tosses[i - 1];
      rows.push(t ? (t.yang ? '▅▅▅▅▅' : '▅▅　▅▅') + (t.moving ? ' ' + t.mark : '') : '· · · · ·');
    }
    return rows.join('\n');
  }

  // ---- 排盘文本（给用户复制给 AI 细断）----
  function fmtDate(d) {
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
      p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  function format(c) {
    var L = [];
    var p = c.pillars, ben = c.ben, bian = c.bian;
    L.push('【六爻排盘 · 铜钱摇卦】');
    L.push('所问：' + (c.question || '（未说明）'));
    L.push('起卦：' + fmtDate(c.date));
    L.push('四柱：' + p.year + '年 ' + p.month + '月 ' + p.day + '日 ' + p.hour + '时（旬空：' + p.kong + '）');
    L.push('');
    var gongLabel = TRIGRAMS[ben.gong.gong].name + '宫' +
      (ben.gong.step === 0 ? '' : ' · ' + GONG_STEP[ben.gong.step]) + '（五行属' + ben.gongWx + '）';
    L.push('本卦：' + ben.hex.n + '（' + gongLabel + '）  ' +
      TRIGRAMS[ben.upper].sym + TRIGRAMS[ben.upper].name + '上 ' +
      TRIGRAMS[ben.lower].sym + TRIGRAMS[ben.lower].name + '下');
    var movingIdx = [];
    ben.yao.forEach(function (y, i) { if (y.moving) movingIdx.push(i + 1); });
    L.push(bian ? '变卦：' + bian.hex.n + '（动爻：' +
      movingIdx.map(function (n) { return ['初', '二', '三', '四', '五', '上'][n - 1] + '爻'; }).join('、') + '）'
      : '六爻安静，无动爻');
    L.push('');
    L.push('六神　　本卦　　　　　　　　' + (bian ? '变卦' : ''));
    for (var i = 6; i >= 1; i--) {
      var y = ben.yao[i - 1];
      var line = y.god + '　' + y.qin + y.gz + y.wx + ' ' +
        (y.yang ? '▅▅▅▅▅' : '▅▅　▅▅') +
        (y.shi ? ' 世' : '') + (y.ying ? ' 应' : '') +
        (y.moving ? ' ' + c.tosses[i - 1].mark : '');
      if (bian && y.moving) {
        var by = bian.yao[i - 1];
        line += ' → ' + by.qin + by.gz + by.wx + ' ' + (by.yang ? '▅▅▅▅▅' : '▅▅　▅▅');
      }
      L.push(line);
    }
    if (c.fushen.length) {
      L.push('');
      L.push('伏神：' + c.fushen.map(function (f) {
        return f.qin + f.gz + f.wx + '（伏于' + ['初', '二', '三', '四', '五', '上'][f.under - 1] + '爻之下）';
      }).join('；'));
    }
    L.push('');
    L.push('卦辞：《' + ben.hex.n + '》' + ben.hex.c);
    if (bian) L.push('之卦：《' + bian.hex.n + '》' + bian.hex.c);
    L.push('');
    L.push('注：月建、年柱按节气近似公式划分，交节当日请以专业排盘为准。');
    return L.join('\n');
  }

  window.LiuYao = { toss: toss, build: build, progress: progress, format: format };
})();
