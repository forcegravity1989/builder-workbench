# 改仓 — 和 Workbench 怎么配合

主提示词的纪律照守。这里只补被管仓里看不见的落点。

## 改动落在哪

改动留在 Workbench 已打开的工作目录，先用 `git rev-parse --show-toplevel` 和 `git branch --show-current` 核对。
业务 Issue 使用 `<仓>/.bw/worktrees/issue-<号>`、分支 `bw/issue-<号>`；资产盘点使用已打开的常驻工作树、分支 `bw/ops-audit`，不另开业务树。
已接回的旧平级业务树继续使用。不碰人的主检出。

提交 + 开 MR 后把地址打屏。没产出就停,不空提交、空 MR。

## 干完推到「待评审」

提完 MR 后按 `issue-state.md` 改此 Issue 的状态标签,不要关 issue、不要 merge。

- CodeHub：先读回这个 Issue 的全部标签，只移除 `bw:status:*` 并加入 `bw:status:inreview`，保留其余标签。将结果按逗号连接，作为完整集合传给 `codehub-cli issue update <iid> -p <path> -H <host> --labels "<完整标签集合>"`，写后读回核对。`--labels` 按全量替换处理，不能只传状态标签。
- GitHub:`gh issue edit <n> --remove-label bw:status:inprogress --add-label bw:status:inreview`

## 不是改仓的事

贴 issue 评论、打/摘标签、挂里程碑:直接在远端做,不必为此开 MR。
权限不够就说出来;该贴的评论、该打的标签照做。推到待评审的那一下标签就走这条,不必另开 MR。
