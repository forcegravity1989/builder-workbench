# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ..\..\tests\e2e\workbench-cycle-smoke.spec.ts >> BW cycle main chain: fixed trees, version material save and independent read-back
- Location: tests\e2e\workbench-cycle-smoke.spec.ts:58:5

# Error details

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '计划', exact: true })
    - locator resolved to <button type="button" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8">…</button>
  - attempting click action
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - generic [ref=e9]:
          - generic [ref=e10]:
            - img [ref=e11]
            - button "应用菜单" [ref=e12] [cursor=pointer]:
              - img [ref=e13]
            - button "切换侧边栏" [ref=e17] [cursor=pointer]:
              - img [ref=e18]
          - generic [ref=e20]:
            - button "返回" [disabled] [ref=e21]:
              - img [ref=e22]
            - button "前进" [disabled] [ref=e24]:
              - img [ref=e25]
        - generic [ref=e28]:
          - generic [ref=e29]:
            - button "W workbench-e2e-repo-aU9Kyx 项目墙" [ref=e30] [cursor=pointer]:
              - generic [ref=e31]: W
              - generic [ref=e32]:
                - generic [ref=e33]: workbench-e2e-repo-aU9Kyx
                - generic [ref=e34]: 项目墙
            - navigation "项目内导航" [ref=e35]:
              - button "总览" [ref=e36] [cursor=pointer]:
                - img [ref=e37]
                - generic [ref=e42]: 总览
              - button "计划" [ref=e43] [cursor=pointer]:
                - img [ref=e44]
                - generic [ref=e46]: 计划
              - button "验收" [ref=e47] [cursor=pointer]:
                - img [ref=e48]
                - generic [ref=e52]: 验收
              - button "任务" [ref=e54] [cursor=pointer]:
                - img [ref=e55]
                - generic [ref=e56]: 任务
              - button "自动化" [ref=e57] [cursor=pointer]:
                - img [ref=e58]
                - generic [ref=e62]: 自动化
              - button "知识库" [ref=e63] [cursor=pointer]:
                - img [ref=e64]
                - generic [ref=e66]: 知识库
          - generic [ref=e67]:
            - generic [ref=e69]: 项目
            - generic [ref=e70]:
              - button "查看活动" [ref=e72] [cursor=pointer]:
                - img
              - generic [ref=e73]:
                - button "工作区选项" [ref=e74] [cursor=pointer]:
                  - img
                - button "添加项目" [ref=e75] [cursor=pointer]:
                  - img
                - button "新工作区" [ref=e76] [cursor=pointer]:
                  - img
          - listbox "工作树" [ref=e78]:
            - button "workbench-e2e-repo-aU9Kyx workbench-e2e-repo-aU9Kyx 的项目操作 为 workbench-e2e-repo-aU9Kyx 创建新工作树" [expanded] [ref=e79] [cursor=pointer]:
              - generic [ref=e80]:
                - img [ref=e83]
                - generic [ref=e87]: workbench-e2e-repo-aU9Kyx
              - generic:
                - generic:
                  - img
                - button "workbench-e2e-repo-aU9Kyx 的项目操作":
                  - img
                - button "为 workbench-e2e-repo-aU9Kyx 创建新工作树":
                  - img
            - option "Mark as unread Active master 主要 master" [ref=e88]:
              - generic [ref=e89]:
                - generic [ref=e91] [cursor=pointer]:
                  - generic [ref=e92]:
                    - button "Mark as unread" [ref=e93]:
                      - img [ref=e96]
                    - generic [ref=e99]: Active
                  - generic [ref=e101]:
                    - generic [ref=e103]:
                      - generic [ref=e104]: master
                      - generic [ref=e105]: 主要
                    - generic [ref=e108]: master
                - button
            - option "Mark as unread Active week-plan bw/week-plan" [ref=e109]:
              - generic [ref=e110]:
                - generic [ref=e112] [cursor=pointer]:
                  - generic [ref=e113]:
                    - button "Mark as unread" [ref=e114]:
                      - img [ref=e117]
                    - generic [ref=e120]: Active
                  - generic [ref=e122]:
                    - generic [ref=e125]: week-plan
                    - generic [ref=e128]: bw/week-plan
                - button
            - option "Mark as unread Inactive workbench-e2e-secondary workbench-e2e-secondary" [ref=e129]:
              - generic [ref=e130]:
                - generic [ref=e132] [cursor=pointer]:
                  - generic [ref=e133]:
                    - button "Mark as unread" [ref=e134]:
                      - img [ref=e137]
                    - generic [ref=e140]: Inactive
                  - generic [ref=e142]:
                    - generic [ref=e145]: workbench-e2e-secondary
                    - generic [ref=e148]: workbench-e2e-secondary
                - button
          - generic [ref=e151]:
            - generic [ref=e153]:
              - button "设置" [ref=e154] [cursor=pointer]:
                - img
              - button "帮助" [ref=e155] [cursor=pointer]:
                - img
            - generic [ref=e156]:
              - button "显示活动工作区" [ref=e157] [cursor=pointer]:
                - img
              - button "工作区板" [ref=e158] [cursor=pointer]:
                - img
      - generic [ref=e162]:
        - generic [ref=e163]:
          - generic [ref=e168]:
            - generic [ref=e174]:
              - generic [ref=e176]:
                - generic [ref=e178]:
                  - button "Terminal 1 关闭选项卡 Terminal 1" [ref=e180] [cursor=pointer]:
                    - img [ref=e182]
                    - generic [ref=e186]: Terminal 1
                    - button "关闭选项卡 Terminal 1" [ref=e187]:
                      - img [ref=e188]
                  - button
                - button "新标签页" [ref=e191] [cursor=pointer]:
                  - img [ref=e192]
              - button "添加快捷命令" [ref=e195] [cursor=pointer]:
                - img [ref=e196]
                - generic [ref=e198]: 命令
            - status [ref=e200]
            - generic [ref=e201]:
              - generic [ref=e203]:
                - textbox "Terminal input" [active] [ref=e208]
                - generic [ref=e211]: ···
              - button
              - button "向右拆分终端" [ref=e213] [cursor=pointer]:
                - img
          - separator "调整左右栏宽度" [ref=e214]
          - generic [ref=e215]:
            - button "收折会话栏" [ref=e217] [cursor=pointer]: 收折会话
            - region "计划材料" [ref=e218]:
              - generic [ref=e220]:
                - generic [ref=e221]:
                  - heading "版本计划" [level=1] [ref=e222]
                  - combobox "计划版本" [ref=e223]:
                    - option "待选择版本"
                    - option "v9.9" [selected]
                  - button "更新代码" [ref=e224] [cursor=pointer]
                  - status [ref=e225]: 已保存
                  - generic "bw/week-plan" [ref=e226]:
                    - img [ref=e227]
                    - generic [ref=e231]: bw/week-plan
                  - button "配置自动化" [ref=e232] [cursor=pointer]:
                    - img [ref=e233]
                    - text: 配置自动化
                - generic [ref=e237]:
                  - navigation "计划流程" [ref=e238]:
                    - button "准备" [ref=e239] [cursor=pointer]:
                      - img [ref=e241]
                      - generic [ref=e244]: 准备
                    - button "目标" [ref=e245] [cursor=pointer]:
                      - img [ref=e247]
                      - generic [ref=e251]: 目标
                    - button "评审" [ref=e252] [cursor=pointer]:
                      - img [ref=e254]
                      - generic [ref=e257]: 评审
                    - button "拆解" [ref=e258] [cursor=pointer]:
                      - img [ref=e260]
                      - generic [ref=e272]: 拆解
                    - button "归档" [ref=e273] [cursor=pointer]:
                      - img [ref=e275]
                      - generic [ref=e279]: 归档
                  - generic [ref=e280]:
                    - region "计划会话入口" [ref=e281]:
                      - generic [ref=e282]:
                        - paragraph [ref=e283]: 与 Agent 一起制定版本计划
                        - button "新建计划" [ref=e284] [cursor=pointer]:
                          - img [ref=e285]
                          - text: 新建计划
                    - generic [ref=e287]:
                      - generic [ref=e288]:
                        - generic [ref=e289]: 版本进展
                        - button "查看验收依据" [ref=e290] [cursor=pointer]
                      - textbox "版本进展" [ref=e291]:
                        - /placeholder: 验收结果与本周计划起点
                        - text: 烟测进展：主链接通
                      - generic [ref=e292]: 风险上报
                      - textbox "风险上报" [ref=e293]:
                        - /placeholder: 有风险时填写；仅由你填写，模型不代填
                    - generic [ref=e294]:
                      - generic [ref=e295]:
                        - heading "当前版本 Top 3 目标" [level=2] [ref=e296]
                        - generic "目标操作" [ref=e297]:
                          - button "全部展开" [ref=e298] [cursor=pointer]:
                            - img [ref=e299]
                          - button "全部收起" [ref=e302] [cursor=pointer]:
                            - img [ref=e303]
                          - button "刷新 Issue" [disabled] [ref=e306] [cursor=pointer]:
                            - img [ref=e307]
                          - button "预览纪要" [ref=e312] [cursor=pointer]:
                            - img [ref=e313]
                            - text: 预览纪要
                      - group [ref=e316]:
                        - article [ref=e317]:
                          - generic [ref=e318]:
                            - generic [ref=e319]:
                              - button "G1 验证计划材料保存" [expanded] [ref=e320] [cursor=pointer]:
                                - img [ref=e321]
                                - generic [ref=e323]: G1
                                - strong [ref=e324]: 验证计划材料保存
                              - generic [ref=e326]: 负责人 未指派
                              - button "删除目标 1" [ref=e327] [cursor=pointer]:
                                - img [ref=e328]
                            - generic [ref=e331]:
                              - textbox "目标 1" [ref=e333]:
                                - /placeholder: 明确本版要达成的结果
                                - text: 验证计划材料保存
                              - generic [ref=e334]:
                                - generic [ref=e335]: 交付件
                                - textbox "G1 交付件" [ref=e336]:
                                  - /placeholder: 交付什么
                                  - text: 文件独立读回
                              - generic [ref=e337]:
                                - generic [ref=e338]: 验收标准
                                - textbox "G1 验收标准" [ref=e339]:
                                  - /placeholder: 可选，补充如何验收交付件
                              - generic [ref=e340]:
                                - generic [ref=e341]:
                                  - generic [ref=e342]: 计划完成
                                  - textbox "G1 计划完成" [ref=e343]:
                                    - /placeholder: 可选日期或版本
                                - generic [ref=e344]:
                                  - generic [ref=e345]: 负责人
                                  - textbox "G1 负责人" [ref=e346]:
                                    - /placeholder: 可选
                            - generic [ref=e348]:
                              - combobox "验证计划材料保存 添加指标承诺（可选）" [ref=e349]:
                                - option "添加指标承诺（可选）" [selected]
                              - button "刷新指标目录" [ref=e350] [cursor=pointer]:
                                - img [ref=e351]
                              - button "配置指标" [ref=e356] [cursor=pointer]:
                                - img [ref=e357]
                                - text: 配置指标
                            - group "验证计划材料保存 关联 Issue" [ref=e359]:
                              - generic "关联 Issue · 0" [ref=e360] [cursor=pointer]
                        - button "添加目标" [ref=e362] [cursor=pointer]:
                          - img [ref=e363]
                          - text: 添加目标
                    - region "归档" [ref=e364]:
                      - img [ref=e365]
                      - paragraph [ref=e369]: 尚未进入归档；在会话中请模型核对材料并提交 PR。
        - button "显示浮动工作区" [ref=e371]:
          - img
        - button
    - generic [ref=e373]:
      - button "切换右侧边栏" [ref=e376] [cursor=pointer]:
        - img [ref=e377]
      - generic [ref=e380]:
        - button "Explorer (Ctrl+Shift+E)" [ref=e381] [cursor=pointer]:
          - img [ref=e382]
        - button "Agents" [ref=e387] [cursor=pointer]:
          - img [ref=e388]
        - button "Source Control (Ctrl+Shift+G)" [ref=e394] [cursor=pointer]:
          - img [ref=e395]
        - button "Checks" [ref=e399] [cursor=pointer]:
          - img [ref=e400]
      - generic [ref=e404]:
        - generic [ref=e405]:
          - generic [ref=e406]:
            - generic "workbench-e2e-repo-aU9Kyx" [ref=e407]
            - button "全部折叠" [disabled] [ref=e408]:
              - img
            - button "刷新文件管理器" [ref=e409] [cursor=pointer]:
              - img
            - button "更多文件管理器操作" [ref=e410] [cursor=pointer]:
              - img
          - generic [ref=e412]:
            - generic [ref=e415]:
              - img [ref=e416]
              - textbox "查找文件" [ref=e417]
            - radiogroup "资源管理器搜索模式" [ref=e418]:
              - radio "按名称筛选文件" [checked] [ref=e419] [cursor=pointer]: 名称
              - radio "搜索文件内容" [ref=e420] [cursor=pointer]: 内容
          - generic [ref=e425]:
            - button ".bw U" [ref=e427] [cursor=pointer]:
              - img [ref=e428]
              - img [ref=e430]
              - generic [ref=e432]: .bw
              - generic [ref=e433]: U
            - button "src" [ref=e435] [cursor=pointer]:
              - img [ref=e436]
              - img [ref=e438]
              - generic [ref=e440]: src
            - button ".gitignore" [ref=e442] [cursor=pointer]:
              - img [ref=e444]
              - generic [ref=e447]: .gitignore
            - button "CLAUDE.md" [ref=e449] [cursor=pointer]:
              - img [ref=e451]
              - generic [ref=e454]: CLAUDE.md
            - button "package.json" [ref=e456] [cursor=pointer]:
              - img [ref=e458]
              - generic [ref=e463]: package.json
            - button "README.md" [ref=e465] [cursor=pointer]:
              - img [ref=e467]
              - generic [ref=e470]: README.md
        - button
  - generic [ref=e472]:
    - button "刷新速率限制" [ref=e474] [cursor=pointer]:
      - img [ref=e475]
    - generic [ref=e480]:
      - button "防止电脑休眠，关闭 · 未生效" [ref=e481] [cursor=pointer]:
        - img [ref=e482]
        - generic [ref=e484]: 关闭
      - button "资源管理器，2 个终端会话" [ref=e486] [cursor=pointer]:
        - img [ref=e487]
        - generic [ref=e489]: 1.25 GB
        - generic [ref=e490]: ·
        - img [ref=e491]
        - generic [ref=e493]: "2"
      - button "端口，0 工作区 ports" [ref=e494] [cursor=pointer]:
        - img [ref=e495]
        - generic [ref=e497]: "0"
    - button
  - region "Notifications alt+T"
  - generic [ref=e498]:
    - button "最小化" [ref=e499] [cursor=pointer]:
      - img [ref=e500]
    - button "最大化" [ref=e502] [cursor=pointer]:
      - img [ref=e503]
    - button "关闭" [ref=e505] [cursor=pointer]:
      - img [ref=e506]
```

# Test source

```ts
  50  |     return store
  51  |       .getState()
  52  |       .allWorktrees()
  53  |       .find((item: { branch: string }) => item.branch?.replace('refs/heads/', '') === target)
  54  |       ?.path as string
  55  |   }, branch)
  56  | }
  57  | 
  58  | test('BW cycle main chain: fixed trees, version material save and independent read-back', async ({
  59  |   workbenchPage,
  60  |   testRepoPath
  61  | }, testInfo) => {
  62  |   test.setTimeout(900_000)
  63  |   void testRepoPath
  64  | 
  65  |   // The workbench chrome is the readiness signal for the BW shell; the helper
  66  |   // already seeded the project repo and its worktrees.
  67  |   await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
  68  | 
  69  |   // ---- 计划屏：固定树正式选择 + 选择真实文件材料 + 自动保存 + 磁盘独立读回 ----
  70  |   await workbenchPage.getByRole('button', { name: '计划', exact: true }).click()
  71  |   await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
  72  |     timeout: 60_000
  73  |   })
  74  |   const planTreePath = await waitForFixedWorktree(workbenchPage, 'bw/week-plan')
  75  |   await expect
  76  |     .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
  77  |     .toBe('terminal')
  78  |   await expect(
  79  |     workbenchPage.getByRole('button', { name: '新建计划', exact: true }).first()
  80  |   ).toBeVisible()
  81  |   await expect(workbenchPage.locator('.vc-chat')).toHaveCount(0)
  82  |   await expect
  83  |     .poll(
  84  |       () =>
  85  |         workbenchPage.evaluate(() => {
  86  |           const store = window.__store
  87  |           return store ? store.getState().activeWorktreeId : null
  88  |         }),
  89  |       {
  90  |         timeout: 60_000,
  91  |         message: 'plan fixed tree was never formally selected'
  92  |       }
  93  |     )
  94  |     .not.toBeNull()
  95  | 
  96  |   // The conversation/CLI creates materials in product use. Seed only this test
  97  |   // version on the real fixed tree; listing, selection and editing remain UI work.
  98  |   const materialDirectory = path.join(planTreePath, '.bw', 'planning', 'v9.9')
  99  |   mkdirSync(materialDirectory, { recursive: true })
  100 |   writeFileSync(
  101 |     path.join(materialDirectory, 'data.json'),
  102 |     JSON.stringify({
  103 |       schema_version: 3,
  104 |       version: 'v9.9',
  105 |       cycleId: 'smoke-plan',
  106 |       summary: { progress: '', risks: '' },
  107 |       goals: [
  108 |         {
  109 |           goalId: 'smoke-goal',
  110 |           title: '验证计划材料保存',
  111 |           deliverable: '文件独立读回',
  112 |           metricTargets: []
  113 |         }
  114 |       ],
  115 |       tasks: []
  116 |     }),
  117 |     'utf8'
  118 |   )
  119 |   const versionSelect = workbenchPage.getByLabel('计划版本')
  120 |   await expect(versionSelect.locator('option[value="v9.9"]')).toBeAttached({ timeout: 30_000 })
  121 |   await versionSelect.selectOption('v9.9')
  122 | 
  123 |   const progress = workbenchPage.locator('.vp-preparation textarea').first()
  124 |   await expect(progress).toBeEnabled({ timeout: 60_000 })
  125 |   await progress.fill('烟测进展：主链接通')
  126 |   await expect(workbenchPage.getByRole('button', { name: '保存草稿', exact: true })).toHaveCount(0)
  127 | 
  128 |   // Iron-law read-back: the material exists on the fixed worktree's own disk path.
  129 |   await expect
  130 |     .poll(
  131 |       () => {
  132 |         const file = path.join(planTreePath, '.bw', 'planning', 'v9.9', 'data.json')
  133 |         if (!existsSync(file)) {
  134 |           return null
  135 |         }
  136 |         const parsed = JSON.parse(readFileSync(file, 'utf8')) as {
  137 |           version: string
  138 |           summary: { progress: string }
  139 |         }
  140 |         return `${parsed.version}:${parsed.summary.progress}`
  141 |       },
  142 |       { timeout: 30_000, message: 'plan material never landed on disk' }
  143 |     )
  144 |     .toBe('v9.9:烟测进展：主链接通')
  145 |   await workbenchPage.screenshot({ path: testInfo.outputPath('bw-plan-saved.png') })
  146 | 
  147 |   // ---- 重载读回：流程选版偏好与材料都从宿主恢复 ----
  148 |   await workbenchPage.reload()
  149 |   await expect(workbenchPage.locator('[data-workbench-nav]')).toBeVisible({ timeout: 180_000 })
> 150 |   await workbenchPage.getByRole('button', { name: '计划', exact: true }).click()
      |                                                                        ^ TimeoutError: locator.click: Timeout 30000ms exceeded.
  151 |   await expect(workbenchPage.getByRole('heading', { name: '版本计划' })).toBeVisible({
  152 |     timeout: 60_000
  153 |   })
  154 |   await expect
  155 |     .poll(
  156 |       () =>
  157 |         workbenchPage
  158 |           .getByLabel('计划版本')
  159 |           .inputValue()
  160 |           .catch(() => ''),
  161 |       { timeout: 120_000, message: 'version preference did not survive reload' }
  162 |     )
  163 |     .toBe('v9.9')
  164 |   await expect(workbenchPage.locator('.vp-preparation textarea').first()).toHaveValue(
  165 |     '烟测进展：主链接通',
  166 |     { timeout: 60_000 }
  167 |   )
  168 | 
  169 |   // ---- 验收屏：独立固定树挂载 ----
  170 |   await workbenchPage.getByRole('button', { name: '验收', exact: true }).click()
  171 |   await expect(workbenchPage.getByRole('heading', { name: '版本验收' })).toBeVisible({
  172 |     timeout: 60_000
  173 |   })
  174 |   await waitForFixedWorktree(workbenchPage, 'bw/week-acceptance')
  175 |   await expect
  176 |     .poll(() => workbenchPage.evaluate(() => window.__store?.getState().activeView))
  177 |     .toBe('terminal')
  178 |   await expect(
  179 |     workbenchPage.getByRole('button', { name: '新建验收', exact: true }).first()
  180 |   ).toBeVisible()
  181 |   await workbenchPage.screenshot({ path: testInfo.outputPath('bw-acceptance-mounted.png') })
  182 | 
  183 |   // ---- 总览：真实数据，未配置保持 Unknown，无演示值 ----
  184 |   await workbenchPage.getByRole('button', { name: '总览', exact: true }).click()
  185 |   await expect(workbenchPage.getByRole('heading', { name: '总览', exact: true })).toBeVisible({
  186 |     timeout: 60_000
  187 |   })
  188 |   await expect(workbenchPage.getByText('未配置北极星指标')).toBeVisible({
  189 |     timeout: 60_000
  190 |   })
  191 |   await workbenchPage.screenshot({ path: testInfo.outputPath('bw-overview-real.png') })
  192 | })
  193 | 
```