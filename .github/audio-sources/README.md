# 原版烟火音效

这三段文件是原有的程序合成音效，保留为火星尾音微调的原始底稿，不随网页部署。

运行 `python3 .github/scripts/generate_fireworks.py` 可生成播放素材。脚本仅调整 180 ms 之后的火星尾音，保留原采样率、单声道、时长、开头爆声与峰值；维护时需要 numpy、scipy。
