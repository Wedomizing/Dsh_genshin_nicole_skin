# 素材与参考来源

本项目由 AI 助手 Codex 根据作者需求完成实现、文档编写、素材处理和打包。这里的「AI 制作」指项目制作过程，不代表官方画面或第三方依赖由 AI 原创。

## 背景图片

全部轮播背景取自[原神官方 B 站中文 PV《缄口的金弦》](https://www.bilibili.com/video/BV1cX516vEu8/?p=1)，发布者为「原神」（UID 401742377）。使用的是第一分 P 的时间轴。

当前轮播使用这些时间点的截图：

00:17、00:28、00:40、00:49、00:55、01:02、01:17、01:18、01:30、01:31、01:40、01:44、01:47、01:51。

`assets/nicole-pv-frames/` 保存 1920 × 1080 的原始 PNG；`assets/nicole-pv-clean/` 保存上下各裁掉 108 px 后的 1920 × 864 PNG，以及用于安装包的 WebP。字幕和右上角标识位于裁去的黑边内，画面内部未重绘、修补或调色。WebP 压缩质量为 94。

素材档案保留了最初采集的 15 张，其中 01:26 的一张不再参加轮播，也不进入当前安装包。原始截图与 PNG 母版用于追溯来源和检验裁切，普通使用只需要 `.tgz` 安装包，不需要下载视频。

两份 `manifest.json` 记录取帧时间、裁切矩形及各图片的 SHA-256。运行 `npm run assets:prepare` 可以从原始截图重新生成裁切素材，不会下载视频。总览图上的时间标签仅供核对，不会出现在皮肤里。

## 参考项目

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)：插件注册、客户端加载和卸载生命周期；接入时核对了 `@deepseek-ai/dsh@0.1.2-rc.1`。
- [naniwet/dsh-themes](https://github.com/naniwet/dsh-themes)：客户端 module loader 的接入形式。
- [orxz/deepseek-harness-themes](https://github.com/orxz/deepseek-harness-themes)：`dsh.bundle` 和 `dsh.client` 的包声明。
- [Junt184/dsh-ui-beautify](https://github.com/Junt184/dsh-ui-beautify)：通过原生设置槽位提供背景选项、在浏览器本地保存偏好。
- [Genshin-odette-skin-dsh](https://github.com/lkdx0220/Genshin-odette-skin-dsh)：README 的内容组织参考。

皮肤代码独立实现，未复制这些项目的皮肤代码或美术素材。

## 权利说明

角色、PV 及相关美术素材的权利归米哈游 / HoYoverse 及相应权利人。裁切不会改变其归属。项目的 MIT 许可仅覆盖原创代码，不授予角色图片或视频的使用、再授权和再分发权利。

本项目为非官方同人作品，用于个人学习和非商业换肤，与米哈游、HoYoverse、DeepSeek 没有隶属或授权关系。如需对外分发，请自行确认相关素材的使用许可。
