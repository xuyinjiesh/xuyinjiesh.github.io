/*
 * 站点内容：个人资料 + 意图回复 + 关键词彩蛋。
 * 改这一文件就能换全部文案，不用动逻辑。
 *
 * 身份信息（名字 / 邮箱 / GitHub 用户名）不在这里写死，统一来自 js/identity.js：
 * 想换邮箱或名字，只改 js/identity.local.js 一处。
 */
(function () {
  'use strict';

  var ID = window.IDENTITY || {};
  var GITHUB_URL = ID.github ? 'https://github.com/' + ID.github : '';

  window.SITE = {
    // 口令解锁：源码里只放口令的 SHA-256 哈希，口令本身永远不要提交进仓库。
    // 生成口令（自己保存好，分享给朋友就是钥匙）：
    //   openssl rand -hex 24
    // 计算哈希（把输出填到下面）：
    //   echo -n '你的口令' | sha256sum
    // 访客通过 https://你的域名/?key=口令 或直接在聊天框输入口令解锁。
    secret: {
      sha256: 'REPLACE_WITH_SHA256_OF_YOUR_KEY',
      unlocksTheme: 'birthday'   // 解锁后切换到的隐藏主题
    },

    // 「私信小纸条」：访客在聊天里写留言，经 Web3Forms 转发成邮件到站主邮箱。
    // accessKey 来自身份层（本地 js/identity.local.js，线上 CI 注入），不进 git 历史；
    // 没配密钥就整个功能隐身——既不显示入口，也不会让人白写一通。
    // 逻辑在 js/note.js，这里只放文案和参数。
    note: {
      enabled: !!ID.web3formsKey,
      endpoint: 'https://api.web3forms.com/submit',
      accessKey: ID.web3formsKey || '',
      subject: '【小纸条】来自个人主页的新留言',
      fromName: '个人主页 · 小纸条',
      maxLength: 500,
      cooldownMs: 60 * 1000,      // 同一浏览器两次投递的最短间隔
      quickReply: '写张小纸条',    // 常驻快捷回复里的入口名，留空则不显示
      intro: '这张纸条只发给站主看，不会公开显示；不想留名字和邮箱也可以直接写。'
    },

    profile: {
      name: ID.name,
      // 「你是谁」：逐条冒出的自述
      bio: [
        '我是 ' + ID.name + '，一名开发者。',
        '白天写代码，晚上也写代码——区别是晚上写的不一定有工资。',
        '喜欢把好玩的东西搬到网上，这个主页就是其中之一。'
      ],
      // 「最近在忙什么」
      now: [
        '最近在折腾这个聊天式主页，顺便学点新东西。',
        '如果你想看实时的动态，我的 GitHub 比这里勤快。'
      ],
      // 「看看作品」
      projects: [
        { title: '聊天式个人主页', desc: '就是你现在看到的这个。', link: GITHUB_URL + '/' + ID.github + '.github.io', tag: 'Web' },
        { title: 'cargo-hole', desc: 'cargo-hole 是一种基于 SDD 思想的 Rust 开发方式，由人写架构和原子化的规约，LLM 负责实现，可支持缓存。', link: GITHUB_URL + '/cargo-hole', tag: 'Rust' },
        { title: 'replaced-agenda', desc: '一个每日观察 AI 取代人类各行各业进程的静态站点', link: GITHUB_URL + '/replaced-agenda', tag: 'Web' },
        // locked: true 的项目只有口令解锁后的访客才能看到
        { title: '保密项目', desc: '只有拿到暗号的朋友能看到这一条。', link: GITHUB_URL, tag: '???', locked: true }
      ],
      // 「联系方式」：只在 identity 里确实配了值时才出现，避免渲染出空条目
      contacts: [
        GITHUB_URL && { label: 'GitHub', value: 'github.com/' + ID.github, href: GITHUB_URL },
        ID.email && { label: '邮箱', value: ID.email, href: 'mailto:' + ID.email }
        // { label: '博客', value: ID.github + '.github.io', href: 'https://' + ID.github + '.github.io' }
      ].filter(Boolean)
    },

    // 「随便聊聊」兜底闲扯
    smalltalk: [
      '你今天过得怎么样？',
      '据说多和陌生人聊天会变开心，试试看？',
      '我这里没有新鲜事，但你有的话可以讲给我听。',
      '闲着的话，不妨点「看看作品」。'
    ],

    // 关键词彩蛋：keys 命中任意一个即触发；themeOnly 限定主题下才触发
    keywords: [
      {
        keys: ['红包', 'hongbao', '发财'],
        themeOnly: 'spring-festival',
        hongbao: true,
        reply: ['🧧 赛博红包拿好：祝你新年头发茂盛、bug 全无、想做的事都能成！']
      },
      {
        keys: ['拜年', '新年好', '新年快乐'],
        themeOnly: 'spring-festival',
        reply: [
          '给你拜年啦！🎊',
          '祝你新的一年：代码一次跑通，需求永不改稿，工资节节高。'
        ]
      },
      {
        keys: ['加班'],
        reply: ['别提那两个字，我们聊点开心的。', '加班是暂时的，摸鱼是永恒的。']
      },
      {
        keys: ['测试', 'test'],
        reply: ['收到，测试通过 ✅', '哔——信号良好，这位访客你好。']
      },
      {
        keys: ['生日快乐'],
        themeOnly: 'birthday',
        reply: ['谢谢！🎂 愿望分你一个：愿你也被这个世界温柔以待。']
      },
      {
        keys: ['中秋', '月饼', '月亮'],
        themeOnly: 'mid-autumn',
        reply: ['抬头看看月亮吧，我们看的是同一颗。🌕']
      },
      {
        // 音效素材署名（CC BY 4.0 要求）
        keys: ['音效', '音乐', '致谢', 'credit'],
        reply: ['雨声音效：<a href="https://freesound.org/people/InspectorJ/sounds/346642/" target="_blank" rel="noopener">"Rain on Windows, Interior, A.wav"</a> by InspectorJ (www.jshaw.co.uk)，来自 Freesound.org（CC BY 4.0）。']
      },
      {
        keys: ['占卜', '算卦', '起卦', '六爻', '占一卦', '摇一卦', '摇卦', '卜一卦'],
        intent: 'liuyao'
      },
      {
        keys: ['爬塔', '爬个塔', '杀戮尖塔', '尖塔', '打牌', '卡牌', 'spire'],
        intent: 'spire'
      },
      {
        keys: ['纸条', '小纸条', '留言', '私信', 'note', 'message'],
        intent: 'note'
      },
      {
        keys: ['你是谁', '介绍', '关于你'],
        intent: 'who'
      },
      {
        keys: ['作品', '项目', '做过什么', 'project'],
        intent: 'projects'
      },
      {
        keys: ['联系', '邮箱', 'email', 'github', '微信'],
        intent: 'contact'
      },
      {
        keys: ['忙什么', '最近', '动态'],
        intent: 'now'
      },
      {
        keys: ['你好', 'hi', 'hello', '在吗', '在么'],
        reply: ['在呢在呢。👋', '你好呀！']
      }
    ],

    // 什么都不匹配时的兜底
    fallback: [
      '嗯……这个我接不住，换个话题？',
      '我还在学习中，暂时只会聊上面那几件事。😅',
      '这句话我记下了，等我变聪明了再回答你。',
      '不如试试下面的快捷回复？'
    ]
  };
})();
