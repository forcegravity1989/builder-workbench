# examples/

vendor 进仓的第三方技能库原样副本,给 buddy 未来打包"默认 workflow"用(见 `docs/convention.md` §4:默认 workflow 应 buddy 打包统一管理)。

```
examples/
└── skill-libraries/   vendor 进仓的官方技能库(MIT,见其 README)
    ├── mattpocock-skills/   默认 build workflow 来源(grill-with-docs → implement → code-review)
    ├── superpowers/
    └── mohit-pm-claude-skills/
```

为什么 vendor:让任何人 clone 后都能真导入这批技能,而不是只有装过对应插件的那台机器才行。详见 [`skill-libraries/README.md`](skill-libraries/README.md)。

> 原 `examples/aihot/`(V3 样板间 DB)与 V3 示例程序已随 V3 删除。这里只剩 vendor 技能库。
