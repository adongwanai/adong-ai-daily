# adong-ai-daily · 阿东的每日 AI 情报账本

线上阅读地址：**[https://adongwanai.github.io/adong-ai-daily/](https://adongwanai.github.io/adong-ai-daily/)**  
RSS 订阅地址：`https://adongwanai.github.io/adong-ai-daily/feed/atom.xml`

---

## 这个站是干嘛的

平时看 AI 新闻有两个挺烦人的地方：一是国内公众号和资讯站高度撞车，同一件事换五个震惊体标题刷屏；二是光看二手编译容易漏掉海外一线建设者在 X、播客、GitHub 和论文库里刚冒出来的真东西。

所以我搭了这个每日早上 09:00 自动更新的轻量账本站：
1. **免登录直连 19 个公开信源**：同时扫 `follow-builders`（X 建设者推文 + 播客）、Hugging Face Daily Papers、arXiv `cs.AI`、OpenAI News、GitHub Trending、Hacker News，以及 9 家主流中文 AI 科技源。
2. **并查集跨源去重**：自动把多家媒体报道的同一件事合并成一条，标出 `🔥 N源共振` 和原帖点赞/Star 数。
3. **带个人判断，不堆套话**：每天置顶 1 段 30 秒主线总结、4 条必读重磅（附一线视角简评）和 4–6 条带事实锚点 `[N001]` 的趋势判断，点角标能直接跳到对应新闻源。
4. **零构建静态网页**：纯原生 HTML / CSS / JS + Python 标准库构建，没有外部字体和第三方 CDN 依赖，国内直连秒开，支持白宣 / 暖纸 / 黑曜三种阅读主题、往期按日切换与全库检索。

---

## 本地运行或 Fork 搭你自己的日报站

如果你想基于这套代码搭一个自己关注方向（比如纯具身机器人、纯 AI 编程或前端）的日报站，不需要装任何第三方 `pip` 包，Python 3.10+ 标准库即可跑通：

```bash
git clone https://github.com/adongwanai/adong-ai-daily.git
cd adong-ai-daily

# 1. 修改站点名、作者信息与你关注的关键词方向（focus.topics）
vim site.config.json

# 2. 并发拉取多源动态并生成去重候选池
python3 scripts/collect_sources.py --config site.config.json --date "$(TZ=Asia/Shanghai date +%Y-%m-%d)" --out out/candidates.json

# 3. 将策展后的 curated.json 合并入库并编译静态站 + Atom RSS
python3 scripts/build_site.py --ingest-candidates out/candidates.json --ingest-curated out/curated.json
python3 scripts/validate.py

# 4. 本地预览
python3 -m http.server 8080 --directory site
```

推送到 GitHub 后，在仓库 `Settings -> Pages -> Source` 选择 **GitHub Actions**，每次 `main` 分支更新都会自动部署上线。

如果你想在本地 Claude Code / Codex / Antigravity 里直接用交互式 Skill 跑日报，可以安装配套 Skill 仓库里的同名模块：[adongwanai/adong-skills](https://github.com/adongwanai/adong-skills)。

---

## 关于我

我是 **阿东（Adong）**，平时主要折腾 AI Agent、RSI（递归自我改进）、Vibe Coding 与工程落地：

- **HF 每日论文深读账本站**：[adongwanai.github.io/hf-daily-papers](https://adongwanai.github.io/hf-daily-papers/)
- **Follow RSI 实证追踪库**：[adongwanai.github.io/follow-rsi](https://adongwanai.github.io/follow-rsi/)
- **AI Agent 学习与面试指南**：[github.com/adongwanai/AgentGuide](https://github.com/adongwanai/AgentGuide)
- **实战 Agent Skills 合集**：[github.com/adongwanai/adong-skills](https://github.com/adongwanai/adong-skills)
- **小红书 / 微信公众号**：全网同名 **阿东玩AI**

## License

[MIT License](./LICENSE)
