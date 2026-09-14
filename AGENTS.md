# Context English - Content Workflow

> 这是个人英语学习项目的开源版本, 用视频和文章学习词汇, 表达和真实语境.

## Project shape

- 纯静态, 无构建无依赖, 双击 `index.html` 即可使用, 必须兼容 `file://`.
- 根目录放共享页面和脚本. 视频放 `videos/<标题> - <作者>/`, 文章放 `articles/<稳定 slug>/`.
- 文章目录包含 `index.html`, `article.js`, `source.md`, `cards.json`, `cards.js` 和 `assets/audio/`.
- 学习状态只存在于当前副本的 `vocabulary.js`. 开源副本从 yellow 状态开始, 不带个人历史记录.

## Adding a YouTube video

1. 先读 `vocabulary.js`. 绿词不提取, 新词默认 yellow.
2. 保留标题和作者, 为每个词条选择视频里的实际词义. 地道短语作为完整短语处理.
3. 每张卡保留 `definition`, `zh`, `sentenceZh`, `sentence`, `match`, 美式 IPA 和目标词音频. `match` 必须是句中实际出现的词形.
4. 复用已有音频, 再补缺少的音频. 使用美式宽式 IPA 和项目规定的符号.
5. 组装卡组, 在首页添加视频, 在 `window.DECKS` 登记目录. 新词加入 `vocabulary.js`, 旧词只追加归属并保留状态.

## Adding an article

1. 读取网页标题, 作者, 日期和正文. 用户贴出的正文优先. 保留小标题, 段落, 列表, 链接和脚注, 去掉网页导航等无关内容.
2. 用稳定 slug 建立文章目录. 原始正文保存为 `source.md`, 阅读数据写入 `article.js`.
3. 沿用视频流程选词和补音标. 文章不要求图片. 为术语, 地道表达, 文化背景和暗喻写短批注.
4. 文章词条加入共享 `vocabulary.js` 和 `window.DECKS`. `Words` 打开文章词表, Quiz 可以练习文章词条.

## Reading behavior

- 悬停只显示单词, 美式 IPA 和英文释义.
- 点击才显示中文释义, 批注, 发音和黄绿标记.
- 悬停预览移开后消失. 点击后的弹窗可操作, 点外部或按 Esc 关闭.
- 弹窗打开时, `Space` 播放发音, `G` 标绿, `Y` 标黄. 输入框和浏览器组合键不被拦截.
- 沿用白底, 衬线字体和简洁单栏排版. 不增加整段翻译, AI 总结或常驻设置.

## Checks

- 检查正文顺序, 标注词形, 词条归一化, 音标, 音频和本地资源.
- 悬停只显示英文, 点击才显示中文. 检查键盘, 手机点按, 阅读位置和脚注往返.
- 状态键保持小写. 不覆盖已有 `lastSeen` / `miss`.
- 通过 `file://` 和本地静态服务器打开验证. 清理临时脚本和临时服务.
