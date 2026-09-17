"""Local version-planning workspace. Standard library only; no model simulator."""
import argparse
import contextlib
import copy
import hashlib
import json
import os
import secrets
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
from urllib.parse import urlsplit, parse_qs, urlencode
from urllib.request import Request, urlopen
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PACKAGE=Path(__file__).resolve().parents[1]

def now():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def dump(value):
    return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')

def atomic(path,raw):
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name=tempfile.mkstemp(prefix='.'+path.name+'-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as out:
            out.write(raw);out.flush();os.fsync(out.fileno())
        os.replace(name,path)
    finally:
        if os.path.exists(name): os.unlink(name)

def command(argv,cwd,timeout=120):
    result=subprocess.run(argv,cwd=cwd,stdin=subprocess.DEVNULL,capture_output=True,text=True,
        encoding='utf-8',errors='replace',timeout=timeout,
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:
        raise RuntimeError(f'{argv[0]} {argv[1] if len(argv)>1 else ""} 失败：'+(result.stderr or result.stdout)[-5000:])
    return result.stdout.strip()

def get(obj,path):
    for key in path.split('.'):
        obj=obj[int(key)] if isinstance(obj,list) else obj[key]
    return obj

def set_value(obj,path,value):
    keys=path.split('.');last=keys.pop()
    for key in keys: obj=obj[int(key)] if isinstance(obj,list) else obj[key]
    obj[int(last) if isinstance(obj,list) else last]=value

def validate(data):
    if data.get('schema_version')!=2 or data.get('template_version')!='se-v7-1-pilot-1':
        raise ValueError('数据/模板版本不匹配')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',data.get('version','')):
        raise ValueError('版本名不是安全目录名')
    for path in ['results.goals','results.tasks','results.sessions','plan.goals','plan.tasks']:
        records=get(data,path)
        if not isinstance(records,list) or len(records)>500 or any(not isinstance(x,dict) for x in records):
            raise ValueError('字段必须是对象数组：'+path)
    deliveries=data['results'].get('deliverables',[])
    if not isinstance(deliveries,list) or len(deliveries)>50 or any(not isinstance(item,dict) or not all(isinstance(item.get(field,''),str) for field in ['label','goal','url']) for item in deliveries):
        raise ValueError('版本交付件需要交付内容、所属目标和链接，最多 50 项')
    for path in ['review.live_notes','review.meeting_url','review.minutes.markdown']:
        if not isinstance(get(data,path),str): raise ValueError('字段必须是文字：'+path)
    for section in ['results','plan']:
        for goal in data[section]['goals']:
            for field in ['metric','target','baseline','reading','deadline','owner']:
                if field in goal and not isinstance(goal[field],str): raise ValueError('目标字段必须是文字：'+field)
        for task in data[section]['tasks']:
            if task.get('kind','unknown') not in ['unknown','feature','bug','ops']: raise ValueError('无效任务类型')
            deliveries=task.get('deliverables',[])
            if not isinstance(deliveries,list) or len(deliveries)>50: raise ValueError('交付件必须是数组，最多 50 项')
            if any(not isinstance(item,dict) or not all(isinstance(item.get(field,''),str) for field in ['label','url']) for item in deliveries):
                raise ValueError('交付件名称和链接必须是文字')

def issue_tasks(issues, plan_version):
    """Normalize provider facts; never infer progress, metrics or goal membership."""
    if not isinstance(issues,list): raise ValueError('Issue 输入必须为数组')
    tasks=[];seen=set();warnings=[]
    for issue in issues:
        if 'pull_request' in issue: continue
        labels={str(x.get('name','') if isinstance(x,dict) else x).strip() for x in issue.get('labels',[])}
        if 'bw:plan:'+plan_version not in labels: continue
        number=issue.get('number');title=issue.get('title','');url=issue.get('url','')
        url=issue.get('html_url') or url
        if title.startswith(('更新指标 + 制定版本计划','更新指标与版本计划','资产盘点')): continue
        if not isinstance(number,int) or isinstance(number,bool) or number<=0 or not re.match(r'^https?://',url):
            raise ValueError('Issue 缺真实编号或浏览器链接')
        if number in seen: continue
        seen.add(number)
        match=re.match(r'^【([A-Za-z0-9][A-Za-z0-9._-]*)\|(W(?:0[1-9]|[1-4][0-9]|5[0-3]))\|(G[1-9][0-9]*)】',title)
        goal=match[1]+'/'+match[3] if match else ''
        kind='bug' if 'bug' in {label.lower() for label in labels} else 'feature'
        if {'bug','feature'}.issubset({label.lower() for label in labels}): warnings.append('#'+str(number)+' 同时有 Bug 和 Feature，按 Bug 展示，请核对标签')
        # Progress is a human/model synthesis, not a synonym for the Issue state.
        tasks.append({'id':'issue-'+str(number),'number':str(number),'url':url,'title':title,
            'kind':kind,'goal':goal,'goal_week':match[2] if match else '',
            'progress_note':'','acceptance':'','sources':[url],
            'status':{'label':str(issue.get('state','')),'tone':'neutral'}})
    return {'plan_version':plan_version,'tasks':tasks,'warnings':warnings,'issues':issues}


def collect_issues(workspace, plan_version, input_file=None):
    if input_file:
        issues=json.loads(input_file.read_text(encoding='utf-8-sig'))
    else:
        repo=json.loads(command(['gh','repo','view','--json','nameWithOwner,url'],workspace))
        if urlsplit(repo['url']).hostname!='github.com': raise ValueError('当前直采仅支持 GitHub；其他平台请传规范化 Issue JSON --input')
        route='repos/'+repo['nameWithOwner']+'/issues?'+urlencode({'state':'all','labels':'bw:plan:'+plan_version,'per_page':100})
        pages=json.loads(command(['gh','api','--paginate','--slurp',route],workspace))
        issues=[issue for page in pages for issue in page]
    return issue_tasks(issues,plan_version)


class Conflict(ValueError): pass

class Store:
    def __init__(self,workspace,version):
        self.ws=Path(workspace).resolve()
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',version): raise ValueError('无效版本')
        self.root=self.ws/'.bw/planning';self.dir=self.root/version
        self.local=self.root/'.local'
        self.file=self.dir/'data.json';self.mutex=threading.RLock()
        self.version=version;self.cache_warning=""

    @contextlib.contextmanager
    def lock(self):
        with self.mutex:
            self.local.mkdir(parents=True,exist_ok=True)
            with (self.local/'write.lock').open('a+b') as file:
                file.seek(0,2)
                if not file.tell(): file.write(b'0');file.flush()
                file.seek(0)
                if os.name=='nt':
                    import msvcrt
                    end=time.time()+20
                    while True:
                        try: msvcrt.locking(file.fileno(),msvcrt.LK_NBLCK,1);break
                        except OSError:
                            if time.time()>end: raise TimeoutError('数据文件正在写入，请重试')
                            time.sleep(.05)
                else:
                    import fcntl
                    fcntl.flock(file,fcntl.LOCK_EX)
                try: yield
                finally:
                    file.seek(0)
                    if os.name=='nt': msvcrt.locking(file.fileno(),msvcrt.LK_UNLCK,1)
                    else: fcntl.flock(file,fcntl.LOCK_UN)

    def read(self):
        raw=self.file.read_bytes();data=json.loads(raw);validate(data)
        if data["version"]!=self.version:raise ValueError("版本目录与数据不一致："+self.version)
        return data,digest(raw)

    def local_read(self,name,default=None):
        path=self.local/(name+'.json')
        try:return json.loads(path.read_text(encoding='utf-8'))
        except FileNotFoundError:return default

    def local_write(self,name,value): atomic(self.local/(name+'.json'),dump(value))

    def writable(self):
        if self.local_read('publication',{}).get('state') in ['checking','publishing']:
            raise Conflict('正在提交已确认的快照，请等待提交结果后再修改')

    def save(self,data):
        validate(data)
        if data['version']!=self.version: raise ValueError('不能通过保存改写当前版本路径')
        data['updated_at']=now()
        raw=dump(data)
        atomic(self.file,raw)
        self.refresh_cache()
        return data,digest(raw)

    def render(self,data=None,include_versions=False):
        if data is None: data=self.read()[0]
        template=(PACKAGE/'assets/version-plan.html').read_text(encoding='utf-8')
        payload=json.dumps(data,ensure_ascii=False).replace('<','\\u003c')
        output,count=re.subn(r'(<script id="plan-data" type="application/json">)[\s\S]*?(</script>)',
            lambda m:m[1]+payload+m[2],template)
        if count!=1: raise ValueError('模板必须有唯一的数据槽')
        versions=[]
        if include_versions:
            for record in self.versions():
                if record.get('unavailable'):continue
                try:value=Store(self.ws,record['version']).read()[0]
                except (OSError,ValueError,KeyError,TypeError):continue
                versions.append({'version':record['version'],'data':value})
        contents=json.dumps(versions,ensure_ascii=False).replace('<','\\u003c')
        output,count=re.subn(r'(<script id="plan-versions" type="application/json">)[\s\S]*?(</script>)',
            lambda m:m[1]+contents+m[2],output)
        if count!=1: raise ValueError('模板必须有唯一的版本展示槽')
        return output

    def refresh_cache(self):
        self.cache_warning=''
        try:return self.refresh()
        except (OSError,ValueError,KeyError,TypeError) as error:
            self.cache_warning='JSON 已保存；离线 HTML 未刷新：'+str(error)
            return None

    def refresh(self):
        target=self.root/'template/version-plan.html'
        atomic(target,self.render(include_versions=True).encode('utf-8'))
        return str(target)

    def set_version(self,name):
        target=Store(self.ws,name)
        if self.version!='default': raise ValueError('只给 default 草稿定版号，不改历史版本')
        if target.dir==self.dir: return self
        if not self.dir.resolve().is_relative_to(self.root.resolve()) or not target.dir.resolve().is_relative_to(self.root.resolve()):
            raise ValueError('版本目录超出 planning 范围')
        with self.lock():
            self.writable()
            if target.dir.exists(): raise ValueError('目标版本已存在，未覆盖')
            for record in self.versions():
                if record.get('unavailable'):continue
                previous=Store(self.ws,record['version']).read()[0].get('previous_version')
                if previous and previous.get('version')=='default': raise ValueError('草稿已被其他版本引用，先核对引用')
            data,_=self.read();data['version']=name
            previous=data.get('previous_version')
            data['header']['version_pair']=(previous['version']+' → ' if previous else '')+name
            data['confirmation']={'results':None,'review_ready':None,'plan':None}
            self.dir.rename(target.dir)
            try: atomic(target.file,dump(data))
            except Exception:
                target.dir.rename(self.dir)
                raise
            target.refresh_cache()
        return target

    def versions(self):
        records=[]
        for directory in sorted(self.root.iterdir()):
            file=directory/'data.json'
            if not file.is_file() or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,63}',directory.name): continue
            try:
                data=Store(self.ws,directory.name).read()[0]
                records.append({'version':data['version'],'current':data['version']==self.version,
                    'kind':data.get('provenance',{}).get('kind','unknown')})
            except (OSError,ValueError,KeyError,TypeError) as error:
                records.append({'version':directory.name,'unavailable':True,
                    'error':'.bw/planning/'+directory.name+'/data.json：'+str(error)})
        return records

    def patch(self,changes):
        if not isinstance(changes,list) or len(changes)>150: raise ValueError('无效更改列表')
        allowed=r'(?:(?:results|plan)\.(?:goals|tasks)\.\d+\.(?:title|reading|metric|target|baseline|deadline|owner|progress_note|acceptance|note|goal)|summary\.(?:overview|risks|progress)|review\.(?:live_notes|meeting_url))'
        with self.lock():
            self.writable();data,_=self.read()
            for change in changes:
                path=change['path']
                if not re.fullmatch(allowed,path) or not isinstance(change['value'],str): raise ValueError('不可编辑字段：'+path)
                if get(data,path)!=change['old']: raise Conflict('此字段已被会话或其他窗口修改：'+path)
            for change in changes:
                path=change['path'];set_value(data,path,change['value'])
                if '.goals.' in path and path.rsplit('.',1)[-1] in ['reading','metric','target','baseline']:
                    parent=get(data,path.rsplit('.',1)[0]);parent['progress']=None
                    parent['status']={'label':'待核对','tone':'neutral'}
                if path.startswith('results.'):
                    data['confirmation']['results']=None;data['confirmation']['review_ready']=None
                if path.startswith('summary.'): data['confirmation']['review_ready']=None
                if path.startswith('review.'):
                    data['review']['minutes']['state']='stale' if data['review']['minutes']['markdown'] else 'missing'
                data['confirmation']['plan']=None
            return self.save(data)

    def replace(self,value,etag):
        with self.lock():
            self.writable();old,current=self.read()
            if etag!=current: raise Conflict('数据已更改；先重新读取再整合，不覆盖页面编辑')
            # Model edits cannot invent human confirmations.
            value['confirmation']=copy.deepcopy(old['confirmation'])
            if value['results']!=old['results']:
                value['confirmation']['results']=None;value['confirmation']['review_ready']=None
            if value['summary']!=old['summary']: value['confirmation']['review_ready']=None
            if any(value[x]!=old[x] for x in ['results','summary','plan','review']): value['confirmation']['plan']=None
            if self.meeting_hash(value)!=self.meeting_hash(old):
                value['review']['minutes']['state']='stale' if value['review']['minutes']['markdown'] else 'missing'
            return self.save(value)

    def confirm(self,stage,etag=None):
        if stage not in ['results','review_ready','plan']: raise ValueError('无效确认阶段')
        with self.lock():
            self.writable();data,current=self.read()
            if etag is not None and etag!=current: raise Conflict('材料已更新，请先核对再确认')
            if stage=='review_ready' and not data['confirmation']['results']: raise ValueError('请先核对第一屏结果')
            if stage=='plan' and (not data['confirmation']['review_ready'] or not data['plan']['goals'] or not data['plan']['tasks']):
                raise ValueError('请先确认评审版，并填写最终目标和任务')
            if stage=='plan' and any(not str(task.get('number','')).lstrip('#').isdigit() or not re.match(r'^https?://',task.get('url','')) for task in data['plan']['tasks']):
                raise ValueError('请先创建或关联任务 Issue，并读回编号和链接')
            data['confirmation'][stage]={'at':now(),'actor':'user'}
            saved=self.save(data)
            if stage=='review_ready':
                snapshot=self.freeze(data,'meeting')
                self.local_write('meeting_snapshot',{'path':snapshot})
            if stage=='plan': self.freeze(data,'final')
            return saved

    def freeze(self,data,label):
        revision=digest(dump(data))[:16]
        target=self.dir/'revisions'/(label+'-'+revision)
        if not target.exists():
            target.mkdir(parents=True)
            atomic(target/'data.json',dump(data));atomic(target/'index.html',self.render(data).replace('<html ','<html data-snapshot="true" ',1).encode('utf-8'))
        return str(target.relative_to(self.ws)).replace('\\','/')

    def meeting(self):
        with self.lock():
            self.writable();data,_=self.read();url=data['review']['meeting_url'].strip()
            if urlsplit(url).scheme not in ['http','https']: raise ValueError('请输入有效会议链接')
            job=self.local_read('meeting',{})
            if job.get('state') in ['queued','fetching'] and job.get('url')==url:
                return job
            if job.get('state')=='ready_for_minutes' and job.get('source_hash')==self.meeting_hash(data):
                return job
            job={'id':digest((url+now()).encode())[:16],'url':url,'state':'queued','created_at':now()}
            self.local_write('meeting',job)
            return job

    def fetch_meeting(self):
        config=self.local_read('settings',{})
        with self.lock():
            job=self.local_read('meeting',{})
            if job.get('state')!='queued': return job
            argv=config.get('transcript_argv');spec=config.get('minutes_spec')
            if not isinstance(argv,list) or not argv or not spec or not Path(spec).is_file():
                job.update(state='needs_config',error='请在会话中提供内部转写脚本及纪要规范，链接已保存')
                self.local_write('meeting',job);return job
            job['state']='fetching';self.local_write('meeting',job)
        try:
            output=self.dir/'reviews'/('transcript-'+job['id']+'.md');output.parent.mkdir(parents=True,exist_ok=True)
            args=[str(x).replace('{url}',job['url']).replace('{output}',str(output)).replace('{workspace}',str(self.ws)) for x in argv]
            command(args,self.ws,timeout=600)
            if not output.exists() or not output.read_text(encoding='utf-8-sig').strip(): raise ValueError('内部脚本未输出非空转写 MD')
            with self.lock():
                self.writable()
                data,_=self.read()
                if data['review']['meeting_url'].strip()!=job['url']: raise Conflict('会议链接已修改，请按新链接重新获取')
                raw=output.read_text(encoding='utf-8-sig')
                data['review']['transcript']={'path':str(output.relative_to(self.ws)).replace('\\','/'),'sha256':digest(raw.encode()),'text':raw,'source_url':job['url']}
                data['review']['minutes']['state']='pending'
                data['confirmation']['plan']=None;self.save(data)
                live=self.dir/'reviews'/('live-notes-'+job['id']+'.md');atomic(live,data['review']['live_notes'].encode('utf-8'))
                job.update(state='ready_for_minutes',transcript=str(output),live_notes=str(live),minutes_spec=str(Path(spec).resolve()),
                    output=str(self.dir/'reviews'/('minutes-'+job['id']+'.md')),source_hash=self.meeting_hash(data),spec_hash=digest(Path(spec).read_bytes()))
                self.local_write('meeting',job)
        except Exception as error:
            job.update(state='failed',error=str(error));self.local_write('meeting',job)
        return job

    def meeting_hash(self,data):
        r=data['review']
        return digest(dump({'url':r['meeting_url'],'live_notes':r['live_notes'],'transcript':r['transcript']}))

    def apply_minutes(self,job_id):
        with self.lock():
            self.writable();job=self.local_read('meeting',{});data,_=self.read()
            if job.get('id')!=job_id or job.get('state')!='ready_for_minutes': raise Conflict('没有匹配的纪要任务')
            if job['source_hash']!=self.meeting_hash(data): raise Conflict('转写/现场记录已更改，需要重新整理纪要')
            if digest(Path(job['minutes_spec']).read_bytes())!=job['spec_hash']: raise Conflict('纪要规范已更新，需要重新整理')
            target=Path(job['output']).resolve()
            if not target.is_relative_to(self.dir/'reviews'): raise ValueError('纪要输出超出当前版本')
            markdown=target.read_text(encoding='utf-8-sig')
            if not markdown.strip(): raise ValueError('子 agent 未写出纪要')
            data['review']['minutes']={'state':'ready','markdown':markdown,'source_hash':job['source_hash'],
                'spec_hash':job['spec_hash'],'path':str(target.relative_to(self.ws)).replace('\\','/'),'prepared_at':now()}
            data['confirmation']['plan']=None;self.save(data)
            job.update(state='done',completed_at=now());self.local_write('meeting',job)
            return job

    def prepare_submission(self):
        with self.lock():
            self.writable();data,_=self.read()
            if not data['confirmation']['results'] or not data['confirmation']['review_ready']:
                raise ValueError('第一屏核对和会议评审版确认尚未完成')
            if not data['review']['live_notes'].strip(): raise ValueError('现场核心记录为空')
            minutes=data['review']['minutes']
            if minutes['state']=='stale': raise ValueError('会议材料已变，请先核对纪要')
            if data['review']['meeting_url'] and minutes['state'] not in ['ready','manual']:
                raise ValueError('会议链接对应的纪要尚未整理完成')
            if minutes['state']=='ready' and minutes.get('source_hash')!=self.meeting_hash(data):
                raise ValueError('会议来源已修改，请先核对纪要')
            if not data['plan']['goals'] or not data['plan']['tasks']: raise ValueError('最终目标和任务尚未形成')
            if not data['confirmation']['plan']: raise ValueError('请先由用户确认最终计划')
            if any(not str(task.get('number','')).lstrip('#').isdigit() or not re.match(r'^https?://',task.get('url','')) for task in data['plan']['tasks']):
                raise ValueError('任务必须先关联真实 Issue 编号和链接')
            snapshot=self.freeze(data,'final')
            publication={'state':'checking','snapshot':snapshot,'data_hash':digest(self.file.read_bytes()),'started_at':now()}
            self.local_write('publication',publication)
            return publication

    def preflight(self):
        branch=command(['git','branch','--show-current'],self.ws)
        if not branch or branch in ['main','master']: raise ValueError('只能从独立分支提交归档')
        if command(['git','diff','--cached','--name-only'],self.ws): raise ValueError('已有其他暂存内容；请先在会话中处理')
        origin=command(['git','remote','get-url','origin'],self.ws)
        if not re.fullmatch(r'(?:https://github\.com/|git@github\.com:)[\w.-]+/[\w.-]+(?:\.git)?',origin):
            raise ValueError('本实战包只接 GitHub；不猜其他平台发布方式')
        default=command(['git','symbolic-ref','--short','refs/remotes/origin/HEAD'],self.ws).removeprefix('origin/')
        changed=command(['git','diff','--name-only',f'origin/{default}...HEAD'],self.ws).splitlines()
        if any(not p.startswith('.bw/planning/') for p in changed):
            raise ValueError('分支包含版本材料以外的提交，请先在会话中审查 PR 范围')
        receipt=self.local_read('publication',{})
        if receipt.get('data_hash')!=digest(self.file.read_bytes()): raise Conflict('确认后数据发生更改，请重新确认')
        return {'branch':branch,'base':default,'origin':origin,'paths':['.bw/planning']}

    def publish(self):
        state=self.local_read('publication',{})
        try:
            pre=self.preflight();state.update(pre)
            log=self.local/'publish.log'
            checks=self.local_read('settings',{}).get('validation_argv')
            if checks is None and (self.ws/'.bw/release/verify/verify.mjs').is_file():
                checks=[['node','.bw/release/verify/verify.mjs','--profile','pr']]
            if not isinstance(checks,list) or not checks or any(not isinstance(argv,list) or not argv or any(not isinstance(arg,str) for arg in argv) for argv in checks):
                raise ValueError('请由会话按项目 AGENTS 配置 .local/settings.json 的 validation_argv 后提交')
            for argv in checks:
                with log.open('a',encoding='utf-8') as output: output.write(now()+' '+str(argv)+'\n')
                result=command(argv,self.ws,timeout=7200)
                with log.open('a',encoding='utf-8') as output: output.write(result+'\n')
            with self.lock():
                if state['data_hash']!=digest(self.file.read_bytes()): raise Conflict('检查期间数据更改，请重新确认')
                state['state']='publishing';self.local_write('publication',state)
            paths=[str(self.dir.relative_to(self.ws))]
            # Add shared source materials and the empty template, never another version's draft.
            for relative in ['.bw/planning/.gitignore','.bw/planning/sources','.bw/planning/template/data-template.json']:
                if (self.ws/relative).exists(): paths.append(relative)
            command(['git','add','--',*paths],self.ws)
            staged=command(['git','diff','--cached','--name-only'],self.ws).splitlines()
            if any(not p.startswith('.bw/planning/') or '/.local/' in p for p in staged): raise ValueError('暂存范围超出版本归档')
            if staged: command(['git','commit','-m',f'docs: 归档 {self.version} 版本计划与会议记录'],self.ws,timeout=1800)
            command(['git','push','-u','origin',pre['branch']],self.ws,timeout=180)
            existing=json.loads(command(['gh','pr','list','--head',pre['branch'],'--base',pre['base'],'--state','open','--json','number,url'],self.ws))
            if existing: url=existing[0]['url']
            else:
                body=self.local/'pr-body.md'
                atomic(body,(f'归档 {self.version} 版本目标、任务和会议评审记录。\n\nBuilder 已在版本材料中确认提交，等待 Leader 审核。\n\n材料：`{self.dir.relative_to(self.ws).as_posix()}`\n确认快照：`{state["snapshot"]}`\n\n数据保存和提交检查通过；不表示 Leader 已验收。\n').encode('utf-8'))
                url=command(['gh','pr','create','--base',pre['base'],'--head',pre['branch'],'--title',f'归档 {self.version} 版本计划','--body-file',str(body)],self.ws,timeout=180)
            actual=json.loads(command(['gh','pr','view',url,'--json','url,state,headRefName'],self.ws))
            if actual['headRefName']!=pre['branch']: raise ValueError('PR 读回分支不匹配')
            state.update(state='submitted',url=actual['url'],commit=command(['git','rev-parse','HEAD'],self.ws),completed_at=now())
        except Exception as error: state.update(state='failed',error=str(error),finished_at=now())
        self.local_write('publication',state)
        return state

def ensure_ignores(store):
    ignore=store.root/'.gitignore'
    ignored=ignore.read_text(encoding='utf-8') if ignore.exists() else ''
    for rule in ['.local/','template/version-plan.html']:
        if rule not in ignored.splitlines(): ignored+=('\n' if ignored and not ignored.endswith('\n') else '')+rule+'\n'
    atomic(ignore,ignored.encode('utf-8'))


def init(workspace,version='default'):
    store=Store(workspace,version)
    for target,source in [('template/data-template.json','assets/data-template.json')]:
        out=store.root/target
        if not out.exists(): atomic(out,(PACKAGE/source).read_bytes())
    if not store.file.exists():
        data=json.loads((PACKAGE/'assets/data-template.json').read_text(encoding='utf-8'))
        data['version']=version;data['project']=store.ws.name
        data['header']={'version_pair':version,'context':store.ws.name}
        atomic(store.file,dump(data))
    ensure_ignores(store)
    if not (store.local/'settings.json').exists():
        store.local_write('settings',{'transcript_argv':None,'minutes_spec':None})
    store.read()
    store.refresh_cache()
    return store


class PlanningServer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,store):
        self.store=store;self.token=secrets.token_urlsafe(32)
        self.code_hash=digest(Path(__file__).read_bytes())
        self.write_mutex=threading.RLock()
        super().__init__(('127.0.0.1',0),PlanningHandler)
        self.base_url='http://127.0.0.1:'+str(self.server_port)

class PlanningHandler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def reply(self,status,value,content_type='application/json; charset=utf-8'):
        payload=dump(value) if isinstance(value,(dict,list)) else value
        self.send_response(status)
        self.send_header('Content-Type',content_type)
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Referrer-Policy','no-referrer')
        self.end_headers()
        self.wfile.write(payload)
    def route(self):
        server=self.server
        if self.headers.get('Host')!=urlsplit(server.base_url).netloc:
            self.reply(403,{'error':'无效服务地址'});return
        parsed=urlsplit(self.path);query=parse_qs(parsed.query)
        if self.command=='GET' and parsed.path=='/':
            # The shell contains no project data; API requests require the launch token.
            page=(PACKAGE/'assets/version-plan.html').read_text(encoding='utf-8')
            page=page.replace('<html ','<html data-planning-service="true" ',1)
            self.reply(200,page.encode('utf-8'),'text/html; charset=utf-8');return
        attachment_access=parsed.path=='/api/attachment' and query.get('token',[''])[0]==server.token
        if self.headers.get('Authorization')!='Bearer '+server.token and not attachment_access:
            self.reply(401,{'error':'服务连接已失效，请让会话重新打开规划地址'});return
        origin=self.headers.get('Origin')
        if origin and origin!=server.base_url:
            self.reply(403,{'error':'请求不是来自当前规划页面'});return
        if parsed.path=='/api/health' and self.command=='GET':
            self.reply(200,{'workspace':str(server.store.ws),'pid':os.getpid(),'code_hash':server.code_hash});return
        if parsed.path=='/api/versions' and self.command=='GET':
            self.reply(200,{'versions':server.store.versions(),'default_version':server.store.version,'planning_dir':str(server.store.root)});return
        if parsed.path=='/api/stop' and self.command=='POST':
            self.reply(200,{'stopped':True})
            threading.Thread(target=server.shutdown,daemon=True).start();return
        if parsed.path not in ['/api/data','/api/confirm','/api/attachment']:
            self.reply(404,{'error':'未知接口'});return
        version=query.get('version',[server.store.version])[0]
        store=Store(server.store.ws,version)
        if not store.dir.resolve().is_relative_to(server.store.root.resolve()) or not store.file.resolve().is_relative_to(server.store.root.resolve()):
            raise ValueError('版本目录超出规划工作树')
        if parsed.path=='/api/attachment' and self.command=='GET':
            data,_=store.read();path=query.get('path',[''])[0]
            allowed={item.get('url','') for item in data['results'].get('deliverables',[])}
            target=(store.ws/path).resolve()
            if path not in allowed or not target.is_relative_to(store.ws) or any(part in ['.git','.local'] for part in target.relative_to(store.ws).parts):
                self.reply(403,{'error':'只能读取当前版本关联的项目内交付件'});return
            kind={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.pdf':'application/pdf','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8'}.get(target.suffix.lower(),'application/octet-stream')
            self.reply(200,target.read_bytes(),kind);return
        if parsed.path=='/api/data' and self.command=='GET':
            data,etag=store.read();self.reply(200,{'data':data,'etag':etag,'warning':store.cache_warning});return
        if self.command not in ['PUT','POST']:
            self.reply(405,{'error':'不支持此操作'});return
        if self.headers.get_content_type()!='application/json':
            raise ValueError('请求必须为 JSON')
        size=int(self.headers.get('Content-Length','0'))
        if size<=0 or size>4*1024*1024: raise ValueError('请求内容大小无效')
        body=json.loads(self.rfile.read(size))
        if not isinstance(body.get('etag'),str): raise ValueError('缺少材料修订号')
        with server.write_mutex:
            if parsed.path=='/api/data' and self.command=='PUT':
                data,etag=store.replace(body['data'],body['etag'])
            elif parsed.path=='/api/confirm' and self.command=='POST':
                data,etag=store.confirm(body['stage'],body['etag'])
            else:
                self.reply(405,{'error':'不支持此操作'});return
        self.reply(200,{'data':data,'etag':etag,'warning':store.cache_warning})
    def handle_request(self):
        try:self.route()
        except Conflict as error:self.reply(409,{'error':str(error)})
        except FileNotFoundError:self.reply(404,{'error':'版本文件不存在，请让会话核对规划工作树'})
        except (ValueError,KeyError,TypeError) as error:self.reply(400,{'error':str(error)})
        except (BrokenPipeError,ConnectionResetError):pass
        except Exception as error:self.reply(500,{'error':'保存服务失败：'+str(error)})
    do_GET=handle_request
    do_PUT=handle_request
    do_POST=handle_request

def server_request(record,path,method='GET'):
    url=record.get('base_url','');parts=urlsplit(url)
    if parts.scheme!='http' or parts.hostname!='127.0.0.1' or not parts.port:
        raise ValueError('本地服务记录无效')
    request=Request(url+path,method=method,headers={'Authorization':'Bearer '+record['token']})
    with urlopen(request,timeout=2) as response:return json.load(response)

def running_server(store):
    try:
        record=store.local_read('server',{})
        health=server_request(record,'/api/health')
        if Path(health['workspace']).resolve()!=store.ws:return None
        return {**record,'code_hash':health['code_hash']}
    except (OSError,ValueError,KeyError):return None

def serve(store):
    store.read()
    if not store.root.resolve().is_relative_to(store.ws):raise ValueError('规划目录超出项目')
    server=PlanningServer(store)
    record={'base_url':server.base_url,'token':server.token,'pid':os.getpid(),'workspace':str(store.ws),'code_hash':server.code_hash}
    store.local_write('server',record)
    try:server.serve_forever(poll_interval=.2)
    finally:
        server.server_close()
        if store.local_read('server',{}).get('token')==server.token:
            (store.local/'server.json').unlink(missing_ok=True)

def start_server(store):
    store.read();ensure_ignores(store);store.refresh_cache()
    # Serialize launches in this workspace, without holding the data-file lock.
    launch_store=Store(store.ws,store.version);launch_store.local=store.local/'service-launch'
    with launch_store.lock():
        record=running_server(store)
        if record and record['code_hash']!=digest(Path(__file__).read_bytes()):
            stop_server(store)
            record=None
        reused=record is not None
        if not record:
            args=[sys.executable,'-B','-X','utf8',str(Path(__file__).resolve()),'--workspace',str(store.ws),'--version',store.version,'serve']
            flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
            with (store.local/'server.log').open('ab') as log:
                proc=subprocess.Popen(args,cwd=store.ws,stdin=subprocess.DEVNULL,stdout=log,stderr=log,
                    creationflags=flags,start_new_session=os.name!='nt')
            end=time.monotonic()+10
            while time.monotonic()<end:
                record=running_server(store)
                if record:break
                if proc.poll() is not None:raise RuntimeError('服务启动失败，请查看 .bw/planning/.local/server.log')
                time.sleep(.1)
            if not record:
                proc.terminate();raise RuntimeError('服务启动超时')
    return {'url':record['base_url']+'/?'+urlencode({'version':store.version})+'#token='+record['token'],
        'pid':record['pid'],'reused':reused,'data':str(store.file)}

def wait_server_exit(record):
    if os.name!='nt':return
    # A closed HTTP socket does not mean the process has released server.log.
    import ctypes
    from ctypes import wintypes
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
    kernel.OpenProcess.restype=wintypes.HANDLE
    kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD]
    kernel.WaitForSingleObject.restype=wintypes.DWORD
    kernel.CloseHandle.argtypes=[wintypes.HANDLE]
    handle=kernel.OpenProcess(0x00100000,False,record['pid'])
    if not handle:
        if ctypes.get_last_error()==87:return  # The process already exited.
        raise OSError(ctypes.get_last_error(),'无法确认保存服务已退出')
    try:
        if kernel.WaitForSingleObject(handle,5000)!=0:
            raise RuntimeError('保存服务仍在退出，请稍后重试')
    finally:kernel.CloseHandle(handle)


def stop_server(store):
    record=running_server(store)
    if not record:return {'stopped':True,'already_stopped':True}
    server_request(record,'/api/stop','POST')
    end=time.monotonic()+5
    while time.monotonic()<end:
        try:server_request(record,'/api/health')
        except (OSError,ValueError,KeyError):break
        time.sleep(.1)
    else:raise RuntimeError('服务尚未停止，请稍后重试')
    wait_server_exit(record)
    return {'stopped':True}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace',required=True);parser.add_argument('--version',default='default')
    sub=parser.add_subparsers(dest='cmd',required=True)
    sub.add_parser('init')
    sub.add_parser('refresh')
    collect=sub.add_parser('collect-issues');collect.add_argument('--plan-version',required=True);collect.add_argument('--input',type=Path)
    for action in ['start','serve','stop','status']:sub.add_parser(action)
    rename=sub.add_parser('set-version');rename.add_argument('--name',required=True)
    confirmation=sub.add_parser('confirm');confirmation.add_argument('--stage',choices=['results','review_ready','plan'],required=True)
    sub.add_parser('read');edit=sub.add_parser('update');edit.add_argument('--file',type=Path,required=True);edit.add_argument('--if-match',required=True)
    jobs=sub.add_parser('jobs');jobs.add_argument('--wait',type=int,default=0)
    apply=sub.add_parser('apply-minutes');apply.add_argument('--job',required=True)
    sub.add_parser('fetch-meeting');sub.add_parser('preflight');sub.add_parser('submit-confirmed')
    args=parser.parse_args();store=Store(args.workspace,args.version)
    if args.cmd=='serve':serve(store);return
    elif args.cmd=='start':result=start_server(store)
    elif args.cmd=='stop':result=stop_server(store)
    elif args.cmd=='status':
        record=running_server(store);result={'running':bool(record),'base_url':record['base_url'] if record else None}
    elif args.cmd=='init':init(args.workspace,args.version);result={'initialized':str(store.dir)}
    elif args.cmd=='collect-issues':result=collect_issues(store.ws,args.plan_version,args.input)
    elif args.cmd=='refresh':result={'html':store.refresh()}
    elif args.cmd=='set-version':target=store.set_version(args.name);result={'version':target.version,'data':str(target.file),'html':str(target.root/'template/version-plan.html')}
    elif args.cmd=='confirm':data,etag=store.confirm(args.stage);result={'etag':etag,'saved':str(store.file)}
    elif args.cmd=='read':data,etag=store.read();result={'etag':etag,'data':data}
    elif args.cmd=='update':data,etag=store.replace(json.loads(args.file.read_text(encoding='utf-8-sig')),args.if_match);result={'etag':etag,'saved':str(store.file)}
    elif args.cmd=='jobs':
        end=time.time()+min(max(args.wait,0),30)
        while True:
            result=store.local_read('meeting',{})
            if result.get('state') in ['ready_for_minutes','needs_config','failed'] or time.time()>=end:break
            time.sleep(.5)
    elif args.cmd=='apply-minutes':result=store.apply_minutes(args.job)
    elif args.cmd=='fetch-meeting':store.meeting();result=store.fetch_meeting()
    elif args.cmd=='preflight':result=store.preflight()
    elif args.cmd=='submit-confirmed':store.prepare_submission();result=store.publish()
    if store.cache_warning:result['warning']=store.cache_warning
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':
    try:main()
    except Exception as error: print(str(error),file=sys.stderr);sys.exit(1)
