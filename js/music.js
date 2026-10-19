/* 音乐目录：具体录音、许可与主题搭配的唯一数据源。 */
(function () {
  'use strict';
  var BY = 'https://creativecommons.org/licenses/by/4.0/';
  var TRACKS = {
    'spring-festival-original': {
      title: '春节 · 原背景音乐', artist: 'Pixabay（作者未记录）',
      license: 'Pixabay Content License', licenseUrl: 'https://pixabay.com/service/license-summary/',
      source: 'https://cdn.pixabay.com/audio/2026/01/14/audio_3265c1aace.mp3',
      download: 'https://cdn.pixabay.com/audio/2026/01/14/audio_3265c1aace.mp3',
      src: 'https://cdn.pixabay.com/audio/2026/01/14/audio_3265c1aace.mp3',
      remoteOnly: true
    },
    'gymnopedie-1': {
      title: 'Gymnopédie No. 1', composer: 'Erik Satie', artist: 'Kevin MacLeod',
      license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100787',
      download: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Gymnopedie%20No%201.mp3'
    },
    'clair-de-lune': {
      title: 'Clair de lune · 月光', composer: 'Claude Debussy', artist: 'Laurens Goedhart',
      license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
      source: 'https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg',
      download: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg.mp3'
    },
    'bach-prelude': {
      title: 'Prelude in C major · BWV 846', composer: 'Johann Sebastian Bach', artist: 'Kimiko Ishizaka',
      license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      source: 'https://kimikoishizaka.bandcamp.com/album/bach-well-tempered-clavier-book-1',
      download: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b6/Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier%2C_Book_1_-_01_Prelude_No._1_in_C_major%2C_BWV_846.ogg/Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier%2C_Book_1_-_01_Prelude_No._1_in_C_major%2C_BWV_846.ogg.mp3'
    },
    'growing-up': {
      title: 'Growing Up', artist: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://www.scottbuckley.com.au/library/growing-up/',
      download: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2018/05/sb_growingup.mp3'
    },
    'water-lily': {
      title: 'Water Lily', artist: 'Kevin MacLeod', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1400035',
      download: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Water%20Lily.mp3'
    },
    'midsummer-sky': {
      title: 'Midsummer Sky', artist: 'Kevin MacLeod', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100158',
      download: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Midsummer%20Sky.mp3'
    },
    'reverie': {
      title: 'Reverie', artist: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://www.scottbuckley.com.au/library/reverie/',
      download: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2020/03/sb_reverie.mp3'
    },
    'snowfall': {
      title: 'Snowfall', artist: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://www.scottbuckley.com.au/library/snowfall/',
      download: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2018/12/sb_snowfall.mp3'
    },
    'jul': {
      title: 'Jul', artist: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://www.scottbuckley.com.au/library/jul/',
      download: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2020/12/sb_jul.mp3'
    },
    'a-new-year': {
      title: 'A New Year', artist: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://www.scottbuckley.com.au/library/a-new-year/',
      download: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2018/01/sb_anewyear.mp3'
    },
    'childhood': {
      title: 'Childhood', artist: 'Scott Buckley', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://www.scottbuckley.com.au/library/childhood/',
      download: 'https://www.scottbuckley.com.au/library/wp-content/uploads/2019/01/sb_childhood.mp3'
    },
    'eastern-thought': {
      title: 'Eastern Thought', artist: 'Kevin MacLeod', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100682',
      download: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Eastern%20Thought.mp3'
    },
    'meditation-01': {
      title: 'Meditation Impromptu 01', artist: 'Kevin MacLeod', license: 'CC BY 4.0', licenseUrl: BY,
      source: 'https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100163',
      download: 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/Meditation%20Impromptu%2001.mp3'
    }
  };

  // 第一首为主曲，其余为同风格回退。蓝调时刻单独使用 Reverie。
  var THEMES = {
    'default': ['gymnopedie-1', 'meditation-01'],
    spring: ['growing-up', 'bach-prelude'], summer: ['midsummer-sky', 'water-lily'],
    autumn: ['gymnopedie-1', 'meditation-01'], winter: ['snowfall', 'jul'],
    night: ['reverie', 'clair-de-lune', 'meditation-01'],
    lichun: ['growing-up'], yushui: ['water-lily'], jingzhe: ['bach-prelude'],
    chunfen: ['growing-up'], qingming: ['gymnopedie-1'], guyu: ['water-lily'],
    lixia: ['midsummer-sky'], xiaoman: ['water-lily'], mangzhong: ['bach-prelude'],
    xiazhi: ['midsummer-sky'], xiaoshu: ['midsummer-sky'], dashu: ['reverie'],
    liqiu: ['gymnopedie-1'], chushu: ['reverie'], bailu: ['clair-de-lune'],
    qiufen: ['gymnopedie-1'], hanlu: ['meditation-01'], shuangjiang: ['snowfall'],
    lidong: ['snowfall'], xiaoxue: ['snowfall'], daxue: ['snowfall'],
    dongzhi: ['jul'], xiaohan: ['meditation-01'], dahan: ['snowfall'],
    'spring-festival': ['spring-festival-original', 'a-new-year', 'bach-prelude'],
    'little-new-year': ['a-new-year', 'bach-prelude'], 'new-year': ['a-new-year', 'bach-prelude'],
    'lantern-festival': ['clair-de-lune', 'eastern-thought'],
    'dragon-boat': ['midsummer-sky', 'eastern-thought'],
    qixi: ['clair-de-lune', 'reverie'], 'mid-autumn': ['clair-de-lune', 'reverie'],
    'double-ninth': ['gymnopedie-1', 'meditation-01'], laba: ['jul', 'snowfall'],
    'national-day': ['a-new-year', 'bach-prelude'], xmas: ['jul', 'snowfall'],
    valentine: ['reverie', 'clair-de-lune'],
    'womens-day': ['growing-up', 'bach-prelude'], 'arbor-day': ['growing-up', 'bach-prelude'],
    'labor-day': ['midsummer-sky', 'water-lily'],
    'childrens-day': ['childhood', 'growing-up'], birthday: ['childhood', 'growing-up'],
    thanksgiving: ['childhood', 'growing-up'], 'teachers-day': ['bach-prelude', 'growing-up'],
    halloween: ['eastern-thought', 'reverie']
  };

  Object.keys(TRACKS).forEach(function (id) {
    TRACKS[id].id = id;
    TRACKS[id].src = TRACKS[id].src || 'assets/audio/music/' + id + '.mp3';
    Object.freeze(TRACKS[id]);
  });
  Object.keys(THEMES).forEach(function (id) { Object.freeze(THEMES[id]); });
  Object.freeze(TRACKS);
  Object.freeze(THEMES);

  window.MusicLibrary = Object.freeze({
    tracks: TRACKS, themes: THEMES,
    get: function (id) { return TRACKS[id] || null; },
    forTheme: function (id) { return (THEMES[id] || THEMES['default']).map(function (key) { return TRACKS[key]; }); },
    findSource: function (src) {
      var ids = Object.keys(TRACKS);
      for (var i = 0; i < ids.length; i++) {
        var track = TRACKS[ids[i]];
        if (src === track.src || src === track.download) return track;
      }
      return null;
    }
  });
})();
