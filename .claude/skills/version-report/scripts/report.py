"""版本报告：把 .bw/planning/<版本>/report.json 回填进固定模板，产出静态 HTML。

只做确定性回填：不缺字段、不编事实、不做模型判断。事实由会话按 SOP 采集：
目标与任务来自本版计划 JSON，任务状态读回 Issue，验收用例与截图复用
verify / e2e 线的运行产物。脚本负责解析来源文件、复制截图、校验数据槽。
标准库实现，不依赖项目代码。
"""
import argparse
import hashlib
import html
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1]
TEMPLATE = PACKAGE / 'assets' / 'report-template.html'
TEMPLATE_DATA = PACKAGE / 'assets' / 'report-template.json'
SCHEMA_VERSION = 3
TEMPLATE_VERSION = 'se-report-4'
KINDS = ('acceptance', 'basic')
SAFE_NAME = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}')
SLOT = re.compile(r'<!--bw:slot:([a-z0-9-]+)-->')
TONES = ('accent', 'success', 'warning', 'danger', 'neutral', 'outline')
IMAGE_SUFFIX = ('.png', '.jpg', '.jpeg', '.webp', '.gif')
RESULT_LABEL = {'passed': '通过', 'passed_with_debt': '通过（有留白）', 'ok': '成功',
                'failed': '失败', 'not_run': '未跑', 'not_applicable': '不适用'}
RESULT_TONE = {'passed': 'success', 'passed_with_debt': 'warning', 'ok': 'success',
               'failed': 'danger', 'not_run': 'neutral', 'not_applicable': 'outline'}
STATE_LABEL = {'passed': '达成', 'passed_with_debt': '部分达成', 'failed': '未达成',
               'not_run': '未验收', 'not_applicable': '不适用'}


def esc(value):
    return html.escape('' if value is None else str(value), quote=True)


def text(value):
    return esc(value).replace('\n', '<br>')


def tag(label, tone='neutral'):
    if not label:
        return ''
    tone = tone if tone in TONES else 'neutral'
    return f'<span class="tag tag-{tone}">{esc(label)}</span>'


def result_tag(value):
    if not value:
        return ''
    return tag(RESULT_LABEL.get(value, str(value)), RESULT_TONE.get(value, 'neutral'))


def link(url, label=''):
    raw = str(url or '')
    shown = esc(label or raw)
    if not raw:
        return '—'
    if re.fullmatch(r'https?://\S+', raw):
        return f'<a href="{esc(raw)}">{shown}</a>'
    return f'<span class="mono">{shown}</span>'


def size_text(size):
    try:
        size = int(size)
    except (TypeError, ValueError):
        return '—'
    if size <= 0:
        return '—'
    for unit in ('B', 'KB', 'MB', 'GB'):
        if size < 1024 or unit == 'GB':
            return f'{size} B' if unit == 'B' else f'{size / 1024:.1f} {unit}'
        size = size / 1024
    return '—'


def absent(why):
    tail = f'<p class="why">{text(why)}</p>' if why else ''
    return f'<div class="absent"><p>暂无材料。</p>{tail}</div>'


def table(headers, rows, cls=''):
    if not rows:
        return ''
    head = ''.join(f'<th>{esc(x)}</th>' for x in headers)
    body = ''.join('<tr>' + ''.join(cells) + '</tr>' for cells in rows)
    return f'<table class="{cls}"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>'


def note(value):
    return f'<p class="src">{text(value)}</p>' if value else ''


def inline(value):
    raw = str(value or '')
    if re.fullmatch(r'https?://\S+', raw):
        return f'<a href="{esc(raw)}">{esc(raw)}</a>'
    return text(raw)


def render_head(data):
    head = data.get('head') or {}
    items = []
    if data.get('project'):
        items.append(('项目', data['project']))
    if head.get('version_pair'):
        items.append(('版本对', head['version_pair']))
    if head.get('source_commit'):
        items.append(('源码修订', str(head['source_commit'])[:12]))
    if head.get('packaged_at'):
        items.append(('出包时间', head['packaged_at']))
    if head.get('release_tag'):
        items.append(('发布标识', head['release_tag']))
    if head.get('released_issue'):
        items.append(('发布入口', head['released_issue']))
    sep = '<span class="sep">·</span>'
    return sep.join(f'<span class="mi"><b>{esc(k)}</b>{inline(v)}</span>' for k, v in items)


def chip(label, value):
    return f'<span class="chip"><span class="k">{esc(label)}</span>{value}</span>'


def render_health(data):
    """状态栏右段：构建/打包/两档用例计数 chip + 整行备注。备注不做卡片，避免撑高首屏。"""
    health = data.get('health') or {}
    chips = [
        chip('编译', result_tag(health.get('build')) or tag('未跑', 'neutral')),
        chip('打包', result_tag(health.get('pack')) or tag('未跑', 'neutral')),
    ]
    for label, key in (('验收用例', 'acceptance'), ('基础用例', 'basic')):
        cases = health.get(key)
        if cases and cases.get('total') is not None:
            value = f'<b class="mono">{esc(cases.get("passed"))} / {esc(cases.get("total"))}</b>'
        else:
            value = tag('未跑', 'neutral')
        chips.append(chip(label, value))
    artifact = str(health.get('artifact_dir') or '')
    if artifact:
        chips.append(chip('安装包', f'<b class="mono">{esc(artifact)}</b>'))
    tail = ''
    if health.get('note'):
        tail = '<span class="statusnote"><b>备注</b>' + text(health['note']) + '</span>'
    return ''.join(chips) + tail


def render_overview(data):
    """状态栏左段：目标状态 chip（只留状态与读数，标题不重复，正文在 01 节）+ 任务 Issue 计数 chip。"""
    goals = data.get('goals') or []
    tasks = data.get('tasks') or []
    chips = []
    for goal in goals:
        state = goal.get('state')
        inner = tag(STATE_LABEL.get(state, '未知'), RESULT_TONE.get(state, 'neutral'))
        reading = str(goal.get('reading') or '')
        if reading:
            read = '读数 ' + reading
            if goal.get('target'):
                read += '（目标 ' + str(goal['target']) + '）'
            inner += '<span class="k">' + text(read) + '</span>'
        chips.append('<a class="chip" href="#sec-goals"><span class="k mono">'
                     + esc(goal.get('label') or '') + '</span>' + inner + '</a>')
    if tasks:
        labels = []
        for task in tasks:
            label = (task.get('status') or {}).get('label') or '未知'
            if label not in labels:
                labels.append(label)
        counts = []
        for label in labels:
            count = sum(1 for task in tasks
                        if ((task.get('status') or {}).get('label') or '未知') == label)
            counts.append(f'{esc(label)} {count}')
        chips.append('<a class="chip" href="#sec-tasks"><span class="k">任务 Issue 共 '
                     + str(len(tasks)) + ' 个</span><b>' + ' · '.join(counts) + '</b></a>')
    if not chips:
        return absent('本版总览为空：目标与任务都未登记。先补本版计划，不在报告里编事实。')
    return ''.join(chips)


def render_goals(data):
    goals = data.get('goals') or []
    if not goals:
        return absent('本版目标未登记。报告引用本版计划 plan.goals，不另写一份承诺；'
                      '缺计划数据时先补计划，不在报告里编目标。')
    out = []
    for goal in goals:
        head = ['<div class="goal-head"><span class="g">' + esc(goal.get('label') or '') + '</span>']
        state = goal.get('state')
        head.append(tag(STATE_LABEL.get(state, '未知'), RESULT_TONE.get(state, 'neutral')))
        head.append('</div>')
        cells = []
        for key, label in (('metric', '指标'), ('target', '目标值'),
                           ('baseline', '基线'), ('reading', '实际读数')):
            value = goal.get(key) or '—'
            cells.append(f'<div><dt>{label}</dt><dd>{text(value)}</dd></div>')
        why = f'<p class="why">{text(goal.get("note", ""))}</p>' if goal.get('note') else ''
        out.append('<article class="goal">' + ''.join(head)
                   + '<h3>' + text(goal.get('title', '')) + '</h3>'
                   + '<dl class="kv">' + ''.join(cells) + '</dl>' + why + '</article>')
    return ''.join(out)


def render_tasks(data):
    tasks = data.get('tasks') or []
    if not tasks:
        return absent('本版任务未登记。任务清单来自本版计划 plan.tasks，'
                      '状态用 gh 读回每个 Issue 的当前值。')
    rows = []
    for task in tasks:
        number = task.get('number')
        label = f'#{number}' if number else (task.get('id') or '—')
        status = task.get('status') or {}
        rows.append([
            f'<td class="mono">{link(task.get("url"), label) if task.get("url") else esc(label)}</td>',
            f'<td>{text(task.get("title", ""))}</td>',
            f'<td class="mono">{esc(task.get("goal") or "—")}</td>',
            f'<td>{tag(status.get("label", ""), status.get("tone")) or tag("未知", "neutral")}</td>',
            f'<td>{text(task.get("note", ""))}</td>',
        ])
    return table(['编号', '任务', '目标', '状态', '备注'], rows, 'tight')


def render_case(case):
    head = ['<div class="case-head"><span class="id">' + esc(case.get('id', '')) + '</span>']
    head.append(result_tag(case.get('status')) or tag('未跑', 'neutral'))
    head.append('<h3>' + text(case.get('title', '')) + '</h3></div>')
    flow = []
    if case.get('path'):
        flow.append('<p class="flow"><b>路径</b> ' + text(case['path']) + '</p>')
    if case.get('expect'):
        flow.append('<p class="flow"><b>期望</b> ' + text(case['expect']) + '</p>')
    if case.get('message'):
        flow.append('<p class="msg">' + text(case['message']) + '</p>')
    shots = []
    files = []
    for item in case.get('evidence') or []:
        if not isinstance(item, dict):
            item = {'file': str(item)}
        name = str(item.get('file', ''))
        url = str(item.get('url', ''))
        if not name:
            continue
        if url and name.lower().endswith(IMAGE_SUFFIX):
            shots.append(f'<figure><img src="{esc(url)}" alt="{esc(name)}" loading="lazy">'
                         f'<figcaption>{esc(name)}</figcaption></figure>')
        else:
            files.append(esc(name))
    parts = ['<article class="case">' + ''.join(head) + ''.join(flow)]
    if shots:
        parts.append('<div class="shots">' + ''.join(shots) + '</div>')
    if files:
        parts.append('<p class="files">其他证据：' + '、'.join(files) + '</p>')
    if case.get('note'):
        parts.append(note(case['note']))
    parts.append('</article>')
    return ''.join(parts)


def render_case_list(data, kind):
    cases = [x for x in (data.get('cases') or []) if (x.get('kind') or 'basic') == kind]
    if not cases:
        if kind == 'acceptance':
            return absent('本版没有验收用例记录。验收用例复用 verify / e2e 线的运行产物，'
                          '报告只读回，不自己跑用例。')
        return absent('本版没有基础用例记录。')
    # 按 suite 分组渲染：组名取 suite_label（收尾会话标注）或 suite（verify 步骤 id）；
    # 组顺序 = 数据数组里首次出现顺序，排序由回填方决定，不在渲染器里硬编码。
    groups, index = [], {}
    for case in cases:
        key = case.get('suite_label') or case.get('suite') or ''
        if key not in index:
            index[key] = len(groups)
            groups.append((key, []))
        groups[index[key]][1].append(case)
    out = []
    for label, items in groups:
        if label:
            out.append('<h3 class="suitehead">' + text(label)
                       + '<span class="count">' + str(len(items)) + ' 例</span></h3>')
        out.extend(render_case(x) for x in items)
    return ''.join(out)


def render_foot(data):
    parts = []
    if data.get('generated_at'):
        parts.append('生成于 ' + esc(data['generated_at']))
    if data.get('foot'):
        parts.append(text(data['foot']))
    if not parts:
        return '固定模板渲染；脚本只做回填，未核对的事实一律留空。'
    return ' · '.join(parts)


def validate(data, version):
    if data.get('schema_version') != SCHEMA_VERSION:
        raise ValueError('数据 schema_version 不是 ' + str(SCHEMA_VERSION))
    if data.get('template_version') != TEMPLATE_VERSION:
        raise ValueError('数据 template_version 不是 ' + TEMPLATE_VERSION)
    if not SAFE_NAME.fullmatch(str(data.get('version', ''))):
        raise ValueError('version 不是安全目录名')
    if data['version'] != version:
        raise ValueError('数据里的版本与命令参数不一致：' + str(data['version']))
    for key in ('goals', 'tasks', 'cases'):
        if not isinstance(data.get(key), list):
            raise ValueError('字段必须是数组：' + key)
    if data.get('health') is not None and not isinstance(data['health'], dict):
        raise ValueError('health 必须是对象或 null')
    health = data.get('health') or {}
    for key in ('acceptance', 'basic'):
        value = health.get(key)
        if value is None or isinstance(value, dict):
            continue
        raise ValueError('health.' + key + ' 必须是 {passed, total} 或 null')
    for goal in data.get('goals') or []:
        if goal.get('state') and goal['state'] not in RESULT_TONE:
            raise ValueError('goal.state 不是合法值：' + str(goal['state']))
    for task in data.get('tasks') or []:
        status = task.get('status')
        if status is not None and not isinstance(status, dict):
            raise ValueError('task.status 必须是对象 {label, tone}')
        if isinstance(status, dict) and status.get('tone') not in TONES:
            raise ValueError('task.status.tone 不是合法值：' + str(status.get('tone')))
    for case in data.get('cases') or []:
        if case.get('status') and case['status'] not in RESULT_TONE:
            raise ValueError('case.status 不是合法值：' + str(case['status']))
        if case.get('kind') and case['kind'] not in KINDS:
            raise ValueError('case.kind 不是合法值：' + str(case['kind']))


def render(data, version):
    validate(data, version)
    template = TEMPLATE.read_text(encoding='utf-8')
    slots = {
        'version': esc(version),
        'head-meta': render_head(data),
        'health': render_health(data),
        'overview': render_overview(data),
        'goals': render_goals(data),
        'tasks': render_tasks(data),
        'cases': render_case_list(data, 'acceptance'),
        'appendix': render_case_list(data, 'basic'),
        'foot': render_foot(data),
    }
    seen = set()

    def swap(match):
        key = match.group(1)
        if key not in slots:
            raise ValueError('模板存在未实现的数据槽：' + key)
        if key in seen:
            raise ValueError('模板数据槽重复：' + key)
        seen.add(key)
        return slots[key]

    output = SLOT.sub(swap, template)
    missing = [key for key in slots if key not in seen]
    if missing:
        raise ValueError('模板缺少数据槽：' + ', '.join(missing))
    if SLOT.search(output):
        raise ValueError('渲染结果仍残留数据槽')
    return output


def atomic(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(handle, 'wb') as out:
            out.write(raw)
            out.flush()
            os.fsync(out.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def data_file(workspace, version):
    return Path(workspace).resolve() / '.bw' / 'planning' / version / 'report.json'


def load(workspace, version):
    path = data_file(workspace, version)
    if not path.is_file():
        raise FileNotFoundError('没有报告数据：' + str(path) + '；先运行 init')
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    validate(data, version)
    return data


def command_init(workspace, version):
    path = data_file(workspace, version)
    if path.exists():
        return {'created': False, 'data': str(path)}
    data = json.loads(TEMPLATE_DATA.read_text(encoding='utf-8'))
    data['version'] = version
    data['project'] = Path(workspace).resolve().name
    validate(data, version)
    atomic(path, (json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))
    return {'created': True, 'data': str(path)}


def command_render(workspace, version, out=None):
    data = load(workspace, version)
    page = render(data, version)
    target = Path(out).resolve() if out else data_file(workspace, version).with_name('report.html')
    atomic(target, page.encode('utf-8'))
    return {'html': str(target), 'bytes': len(page.encode('utf-8'))}


def inside_dir(root, value):
    path = Path(value)
    if not path.is_absolute():
        path = root / path
    path = path.resolve()
    if not path.is_relative_to(root):
        raise ValueError('路径超出工作目录：' + str(path))
    return path


def copy_shots(evidence_list, case_key, shots_to):
    """把 evidence 里的图片复制进报告证据目录，返回可回填的 evidence 项。"""
    out = []
    for item in evidence_list:
        if not isinstance(item, dict):
            item = {'file': str(item)}
        name = str(item.get('file', ''))
        if not name:
            continue
        url = str(item.get('url', ''))
        if url or not name.lower().endswith(IMAGE_SUFFIX):
            out.append({'file': name, 'url': url})
            continue
        source = item.get('_source')
        if not source:
            out.append({'file': name, 'url': ''})
            continue
        safe = re.sub(r'[^A-Za-z0-9._-]+', '_', f'{case_key}__{name}')
        target = shots_to / safe
        if not target.is_file():
            shutil.copyfile(source, target)
        out.append({'file': safe, 'url': (shots_to.name + '/' + safe)})
    return out


def collect_verify(ws, run, shots_to=None):
    root = ws / '.bw' / 'release' / 'out' / 'verify'
    run_dir = inside_dir(root, run)
    file = run_dir / 'result.json'
    if not file.is_file():
        raise FileNotFoundError('没有验证结果：' + str(file))
    report = json.loads(file.read_text(encoding='utf-8-sig'))
    if report.get('v') != 1 or not isinstance(report.get('steps'), list):
        raise ValueError('result.json 格式不对：' + str(file))
    cases = []
    for step in report['steps']:
        for item in step.get('cases') or []:
            evidence = []
            for name in item.get('evidence') or []:
                source = run_dir / str(step.get('id', '')) / str(name)
                evidence.append({'file': str(name), 'url': '', '_source': str(source)})
            if shots_to is not None:
                evidence = copy_shots(evidence, f'{step.get("id", "")}-{item.get("id", "")}', shots_to)
            else:
                evidence = [{k: v for k, v in x.items() if k != '_source'} for x in evidence]
            cases.append({'id': item.get('id'), 'title': item.get('title'),
                          'path': item.get('path'), 'expect': item.get('expect'),
                          'status': item.get('status'), 'message': item.get('message'),
                          'suite': step.get('id'),
                          'evidence': evidence})
    passed = sum(1 for x in cases if x['status'] == 'passed')
    return {
        'run_id': report.get('runId'),
        'profile': report.get('profile'),
        'result': report.get('status'),
        'source_commit': (report.get('source') or {}).get('commit'),
        'seconds': report.get('seconds'),
        'cases': {'passed': passed, 'total': len(cases)},
        'case_list': cases,
    }


def collect_e2e(ws, log, root=None, shots_to=None):
    log = inside_dir(ws, log)
    if not log.is_file():
        raise FileNotFoundError('没有 E2E 运行记录：' + str(log))
    final = None
    for line in log.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        if record.get('type') == 'result':
            final = record
    if final is None:
        raise ValueError('运行记录里没有 type=result 行：' + str(log))
    e2e_root = inside_dir(ws, root) if root else log.parent
    cases = []
    for item in final.get('cases') or []:
        evidence = []
        for name in item.get('evidence') or []:
            source = e2e_root / str(name)
            evidence.append({'file': str(name), 'url': '', '_source': str(source)})
        if shots_to is not None:
            evidence = copy_shots(evidence, str(item.get('id', '')), shots_to)
        else:
            evidence = [{k: v for k, v in x.items() if k != '_source'} for x in evidence]
        cases.append({'id': item.get('id'), 'title': item.get('title'),
                      'path': item.get('path'), 'expect': item.get('expect'),
                      'status': 'passed' if item.get('status') == 'passed' else 'failed',
                      'message': item.get('message') or item.get('title'),
                      'evidence': evidence})
    return {'ok': final.get('ok'), 'cases': {'passed': final.get('passed'), 'total': final.get('total')},
            'case_list': cases}


def collect_artifacts(ws, artifact_dir):
    root = inside_dir(ws, artifact_dir)
    if not root.is_dir():
        raise FileNotFoundError('产物目录不存在：' + str(root))
    packages = []
    for path in sorted(root.rglob('*')):
        if not path.is_file():
            continue
        raw = path.read_bytes()
        packages.append({'name': path.relative_to(root).as_posix(), 'size': len(raw),
                         'sha256': hashlib.sha256(raw).hexdigest()})
    return {'artifact_dir': str(root.relative_to(ws)).replace('\\', '/'), 'packages': packages}


def collect_readings(ws, since=None):
    file = ws / '.bw/metrics/readings.jsonl'
    if not file.is_file():
        raise FileNotFoundError('没有指标台账：' + str(file)
                                + '；读数在 bw/ledger 分支的 .bw/metrics/readings.jsonl')
    rows = []
    for line in file.read_text(encoding='utf-8-sig').splitlines():
        line = line.strip()
        if not line:
            continue
        record = json.loads(line)
        day = str(record.get('day', ''))
        if since and day and day < since:
            continue
        rows.append({'day': day, 'name': record.get('name', ''), 'value': record.get('value', ''),
                     'source': record.get('source', ''), 'collected_at': record.get('collected_at', '')})
    rows.sort(key=lambda x: (x['day'], x['name']))
    return rows


def command_collect(workspace, version, artifact_dir=None, verify_run=None,
                    e2e_log=None, e2e_root=None, readings=False, since=None, shots_to=None):
    ws = Path(workspace).resolve()
    result = {}
    shots_dir = None
    if shots_to:
        shots_dir = inside_dir(ws, shots_to)
        shots_dir.mkdir(parents=True, exist_ok=True)
    if artifact_dir is not None:
        result.update(collect_artifacts(ws, artifact_dir))
    if verify_run is not None:
        result['verify'] = collect_verify(ws, verify_run, shots_dir)
    if e2e_log is not None:
        result['e2e'] = collect_e2e(ws, e2e_log, e2e_root, shots_dir)
    if readings:
        result['readings'] = collect_readings(ws, since)
    if shots_dir is not None:
        result['shots_dir'] = str(shots_dir.relative_to(ws)).replace('\\', '/')
    if not result:
        raise ValueError('没有指定要采集的内容；用 --artifact-dir、--verify-run、'
                         '--e2e-log 或 --readings')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', required=True)
    parser.add_argument('--version', default='default')
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('init')
    render_parser = sub.add_parser('render')
    render_parser.add_argument('--out')
    collect = sub.add_parser('collect')
    collect.add_argument('--artifact-dir')
    collect.add_argument('--verify-run')
    collect.add_argument('--e2e-log')
    collect.add_argument('--e2e-root')
    collect.add_argument('--readings', action='store_true')
    collect.add_argument('--since')
    collect.add_argument('--shots-to')
    args = parser.parse_args()
    if not SAFE_NAME.fullmatch(args.version):
        raise ValueError('无效版本名：' + args.version)
    if args.cmd == 'init':
        result = command_init(args.workspace, args.version)
    elif args.cmd == 'render':
        result = command_render(args.workspace, args.version, args.out)
    elif args.cmd == 'collect':
        result = command_collect(args.workspace, args.version, args.artifact_dir,
                                 args.verify_run, args.e2e_log, args.e2e_root,
                                 args.readings, args.since, args.shots_to)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
