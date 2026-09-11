# 改仓 — 和 Workbench 怎么配合

主提示词的纪律照守。这里只补被管仓里看不见的落点。

## 改动落在哪

这个 Issue 的工作树:`<仓>/.bw/worktrees/issue-<号>`,分支 `bw/issue-<号>`。
旧平级树 `<仓名>-issue-<号>` 还能用,不搬。不碰人的主检出。

提交 + 开 MR 后把地址打屏。没产出就停,不空提交、空 MR。

## 干完推到「待评审」

提完 MR 后按 `issue-state.md` 改此 Issue 的状态标签,不要关 issue、不要 merge。

- codehub:`codehub-cli issue update <iid> -p <path> -H <host> --labels bw:status:inreview`(只换 `bw:status:*` 槽)
- GitHub:`gh issue edit <n> --remove-label bw:status:inprogress --add-label bw:status:inreview`

## 不是改仓的事

贴 issue 评论、打/摘标签、挂里程碑:直接在远端做,不必为此开 MR。
权限不够就说出来;该贴的评论、该打的标签照做。推到待评审的那一下标签就走这条,不必另开 MR。
