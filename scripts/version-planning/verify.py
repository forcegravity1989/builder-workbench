"""Filesystem and template checks. Native browser file access is not asserted."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import shutil
import subprocess
from lxml import html
from build_template import PACKAGE, ROOT, application_script

sys.dont_write_bytecode = True
sys.path.insert(0, str(PACKAGE/'scripts'))
import planning

report={'passed':[],'not_verified':['Actual browser input and rendered visual review (user will verify)' ,'Actual internal meeting script and minutes standard','Actual model/subagent minutes quality','Live GitHub PR creation and Leader review','BW WebView2 / Orca integration']}
def passed(name):report['passed'].append(name)
def raises(kind,action):
    try:action()
    except kind:return
    raise AssertionError('Expected '+kind.__name__)
def check_page(path, expected_script):
    page = html.parse(str(path))
    scripts = page.xpath('//script')
    assert [script.get('id') for script in scripts] == ['plan-data','plan-versions','plan-app']
    app = scripts[-1]
    assert app.text.replace('\r','') == expected_script.replace('\r',''), 'Inline JavaScript was truncated or changed'
    assert not (app.tail or '').strip(), 'Source code leaked after script element'
    assert app.getnext() is None and app.getparent().tag == 'body'
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node is required to check the JavaScript extracted from the final HTML')
    checked = subprocess.run([node,'--check'],input=app.text,text=True,encoding='utf-8',capture_output=True)
    assert checked.returncode == 0, checked.stderr
    return page

template=planning.PACKAGE/'assets/version-plan.html'
doc=check_page(template, application_script())
assert planning.digest(doc.getroot().get_element_by_id('se-source-style').text.replace('\r','').encode())=='1eb0cf922df007718a7c2385e8a95844daa74139f8cffcdd946b5a59e70be567'
passed('Final HTML contains the complete compiled JavaScript; extracted script passes Node syntax check and no source leaks after it')
assert len(doc.xpath('//*[@id="plan-data"]'))==1
ids=doc.xpath('//*[@id]/@id');assert len(ids)==len(set(ids))
assert not doc.xpath('//*[@id="review-tools"]')
assert not doc.xpath('//*[@id="open-intro"]|//*[@id="open-folder"]|//*[@id="change-folder"]')
for key in ['results-goals','results-tasks','results-sessions','plan-goals','plan-tasks']:
    assert doc.getroot().get_element_by_id('item-'+key) is not None
assert not doc.xpath('//link[@rel="stylesheet"]|//script[@src]')
assert 'fetch(' in doc.getroot().get_element_by_id('plan-app').text
assert 'showDirectoryPicker' not in doc.getroot().get_element_by_id('plan-app').text
assert not doc.xpath('//*[@id="copy-save-path"]')
assert len(doc.xpath('//*[@data-add]'))==5
assert len(doc.xpath('//*[@data-list="plan.goals"]'))==2
assert not doc.xpath('//*[@data-bind="delta"]|//*[@data-list="summary.preview"]')
first_goal=doc.getroot().get_element_by_id('item-results-goals')
assert first_goal.xpath('.//*[@data-bind]/@data-bind') == ['title','reading','target']
assert len(first_goal.xpath('.//*[@data-progress and @data-show-unknown]')) == 1
assert not first_goal.xpath('.//*[@data-status]|.//label')
assert first_goal.xpath('.//*[@data-goal-status]/option/text()') == ['达成','未达','遗留','无值']
assert not doc.xpath('//*[@id="reload-data"]')
assert 'hidden' in doc.getroot().get_element_by_id('save-now').attrib
assert '已打开 ' not in doc.getroot().get_element_by_id('plan-app').text
fields=doc.getroot().get_element_by_id('item-plan-goals').xpath('.//*[@data-bind]/@data-bind')
assert fields == ['title','target']
for identity in ['item-results-tasks','item-plan-tasks']:
    assert not doc.getroot().get_element_by_id(identity).xpath('.//*[@data-deliverables]|.//*[@data-note]|.//*[@data-status]')
passed('SE source CSS unchanged; first-screen goals show only sentence, progress bar and reading/target and four result tags; service save entry retained, no directory authorization or opened message; review/final goal cards simplified and version deliverables separated')
fixture_issues=[
 {'number':1,'title':'【v0.4|W38|G1】Fix save','html_url':'https://example.invalid/issues/1','labels':[{'name':'bw:plan:v0.4'},{'name':'Bug'}]},
 {'number':2,'title':'No goal','url':'https://example.invalid/issues/2','labels':['bw:plan:v0.4'],'state':'closed'},
 {'number':3,'title':'【v0.3|W37|G2】Carry','url':'https://example.invalid/issues/3','labels':['bw:plan:v0.3','bw:plan:v0.4','Feature']},
 {'number':4,'title':'Other version','url':'https://example.invalid/issues/4','labels':['bw:plan:v0.5']},
 {'number':5,'title':'更新指标 + 制定版本计划 v0.4','url':'https://example.invalid/issues/5','labels':['bw:plan:v0.4']},
 {'number':6,'title':'PR','pull_request':{},'url':'https://example.invalid/pull/6','labels':['bw:plan:v0.4']},
]
collected=planning.issue_tasks(fixture_issues,'v0.4')['tasks']
assert [task['number'] for task in collected]==['1','2','3']
assert collected[0]['kind']=='bug' and collected[0]['goal']=='v0.4/G1'
assert collected[1]['kind']=='feature' and collected[1]['goal']=='' and collected[1]['progress_note']==''
assert collected[2]['goal']=='v0.3/G2'
assert planning.issue_tasks([dict(fixture_issues[0],title='【v0.4|W99|G1】Invalid')],'v0.4')['tasks'][0]['goal']==''
passed('Issue collector includes closed and carried tasks, uses labels for type, keeps original goal identity and rejects invalid goal prefixes; no invented progress')
seed=json.loads((planning.PACKAGE/'assets/data-template.json').read_text(encoding='utf-8'))
assert all(not planning.get(seed,key) for key in ['results.goals','results.tasks','results.sessions','summary.overview','summary.risks','summary.progress','plan.goals','plan.tasks','review.live_notes','review.meeting_url','review.minutes.markdown'])
assert seed['previous_version'] is None and all(v is None for v in seed['confirmation'].values())
passed('Generic data template has empty business content, no project fixtures and no assumed previous version')
for el in doc.xpath('//*[@data-bind]'):
    if el.xpath('ancestor::template'):
        parent=el.xpath('ancestor::template')[0];key=parent.attrib['id'].removeprefix('item-').replace('-','.')
        items=planning.get(seed,key)
        for item in items:planning.get(item,el.attrib['data-bind'])
    else:planning.get(seed,el.attrib['data-bind'])
passed('Every bound field resolves against real first-use seed')

with tempfile.TemporaryDirectory(prefix='bw-plan-verify-') as folder:
    draft_workspace=Path(folder)/'first-project'
    draft=planning.init(draft_workspace)
    fresh,original_etag=draft.read()
    assert fresh['version']=='default' and not fresh['plan']['goals'] and not fresh['sources']
    assert [item['version'] for item in draft.versions()]==['default']
    draft.patch([{'path':'summary.overview','old':'','value':'用户的计划内容'}])
    page=html.parse(str(draft.root/'template/version-plan.html'))
    assert json.loads(page.getroot().get_element_by_id('plan-data').text)['summary']['overview']=='用户的计划内容'
    renamed=draft.set_version('v1.0')
    assert not draft.dir.exists() and renamed.read()[0]['summary']['overview']=='用户的计划内容'
    assert renamed.read()[0]['version']=='v1.0'
    page=html.parse(str(renamed.root/'template/version-plan.html'))
    assert json.loads(page.getroot().get_element_by_id('plan-data').text)['version']=='v1.0'
    assert {record['version'] for record in json.loads(page.getroot().get_element_by_id('plan-versions').text)}=={'v1.0'}
    another=planning.init(draft_workspace)
    before=renamed.file.read_bytes()
    raises(ValueError,lambda:another.set_version('v1.0'))
    assert renamed.file.read_bytes()==before and another.file.exists()
    passed('No-history initialization creates default; save refreshes the same HTML; naming preserves content and refuses an existing version')
    absent=Path(folder)/'no-data-workspace';absent.mkdir()
    raises(FileNotFoundError,lambda:planning.Store(absent,'v0.4').read())
    assert not (absent/'.bw').exists()
    passed('Reading a workspace without data does not create directories or files')
    store=planning.init(folder,'v0.4');data,etag=store.read()
    original=data['summary']['risks']
    store.patch([{'path':'summary.risks','old':original,'value':'真实文件保存检查'}])
    restarted=planning.Store(folder,'v0.4');current,_=restarted.read();assert current['summary']['risks']=='真实文件保存检查'
    planning.init(folder,'v0.4');assert store.read()[0]['summary']['risks']=='真实文件保存检查'
    assert not (store.dir/'index.html').exists()
    passed('Saved edits survive new Store and repeated initialization without resetting data')
    store.patch([{'path':'summary.progress','old':data['summary']['progress'],'value':'独立字段修改'}])
    raises(planning.Conflict,lambda:store.patch([{'path':'summary.risks','old':original,'value':'过期覆盖'}]))
    raises(planning.Conflict,lambda:store.replace(data,etag))
    passed('Independent field merge succeeds; stale field and whole-file updates rejected')
    current,etag=store.read()
    current['plan']['goals']=[{'id':'G1','label':'G1','title':'Fixture result','metric':'Fixture metric','target':'2','baseline':'0','reading':'1','deadline':'v0.4 end','owner':'Fixture owner','progress':50,'status':{'label':'draft','tone':'neutral'},'note':'','sources':[]}]
    current['plan']['tasks']=[{'id':'T1','number':'','title':'Fixture task','kind':'bug','goal':'G1','acceptance':'Fixture check','progress_note':'','deliverables':[{'label':'Fixture report','url':'docs/report.md'}],'status':{'label':'draft','tone':'neutral'},'sources':[]}]
    store.replace(current,etag)
    store.patch([{'path':'plan.goals.0.target','old':'2','value':'3'}])
    current,_=store.read()
    assert current['plan']['goals'][0]['progress'] is None
    assert current['plan']['tasks'][0]['deliverables']==[{'label':'Fixture report','url':'docs/report.md'}]
    checked=subprocess.run([shutil.which('node'),'-e',"const P=require(process.argv[1]);P.parse(require('fs').readFileSync(0,'utf8'),'v0.4');",str(ROOT/'scripts/version-planning/local-data.js')],input=json.dumps(current),text=True,capture_output=True)
    assert checked.returncode==0,checked.stderr
    passed('SMART definitions and Bug task deliverables survive save/read; changing the target clears stale percentage; browser file parser accepts the same data')
    store.confirm('results');store.confirm('review_ready')
    snap=store.local_read('meeting_snapshot');snapfile=Path(folder)/snap['path']/'index.html';frozen=snapfile.read_bytes()
    assert b'data-snapshot="true"' in frozen
    store.patch([{'path':'review.live_notes','old':'','value':'测试输入，不是 BW 会议。保留待确认事项。'}])
    assert snapfile.read_bytes()==frozen
    passed('Meeting snapshot is immutable and marked read-only')
    store.patch([{'path':'review.meeting_url','old':'','value':'https://example.invalid/fixture-meeting'}])
    store.meeting();assert store.fetch_meeting()['state']=='needs_config'
    passed('Unconfigured internal script/standard reports missing setup instead of fabricated minutes')
    fixture=Path(folder)/'fixture.py';fixture.write_text('import pathlib,sys\npathlib.Path(sys.argv[1]).write_text("A: fixture-only transcript",encoding="utf-8")',encoding='utf-8')
    spec=Path(folder)/'fixture-standard.md';spec.write_text('Fixture: distinguish decision and open question.',encoding='utf-8')
    store.local_write('settings',{'transcript_argv':[sys.executable,str(fixture),'{output}'],'minutes_spec':str(spec)})
    store.meeting();job=store.fetch_meeting();assert job['state']=='ready_for_minutes',job
    Path(job['output']).write_text('# Fixture minutes\nOpen question remains open.',encoding='utf-8')
    store.apply_minutes(job['id']);assert store.read()[0]['review']['minutes']['state']=='ready'
    current,_=store.read();store.patch([{'path':'review.live_notes','old':current['review']['live_notes'],'value':'新现场信息'}])
    assert store.read()[0]['review']['minutes']['state']=='stale'
    raises(ValueError,store.prepare_submission)
    store.meeting();job=store.fetch_meeting();assert job['state']=='ready_for_minutes'
    Path(job['output']).write_text('Fixture only',encoding='utf-8')
    spec.write_text('changed standard',encoding='utf-8')
    raises(planning.Conflict,lambda:store.apply_minutes(job['id']))
    passed('Fixture subprocess output ingested; changed meeting inputs and standard invalidate minutes')
    malicious=copy.deepcopy(store.read()[0]);malicious['summary']['overview']='</script><script>alert(1)</script>'
    assert '</script><script>alert(1)' not in store.render(malicious)
    passed('Embedded JSON cannot break out of script element')
    for page in Path(folder).rglob('*.html'):
        check_page(page, application_script())
    assert set(path.name for path in (store.root/'template').iterdir()) == {'version-plan.html','data-template.json'}
    passed('Initialized and refreshed pages and confirmed snapshots preserve the complete executable script; only two template assets are copied')

# A real loopback process exercises the same file protocol used by the page.
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit, parse_qs
with tempfile.TemporaryDirectory(prefix='bw-plan-http-') as folder:
    store=planning.init(folder,'v0.4');planning.init(folder,'v0.5')
    service=planning.start_server(store)
    try:
        parts=urlsplit(service['url']);base=parts.scheme+'://'+parts.netloc
        token=parse_qs(parts.fragment)['token'][0]
        def request(path,method='GET',body=None,auth=True,origin=None):
            headers={'Authorization':'Bearer '+token} if auth else {}
            if origin:headers['Origin']=origin
            raw=None
            if body is not None:raw=json.dumps(body).encode();headers['Content-Type']='application/json'
            with urlopen(Request(base+path,data=raw,headers=headers,method=method),timeout=5) as reply:
                return json.load(reply)
        same=planning.start_server(store);assert same['pid']==service['pid'] and same['reused']
        page=urlopen(base+'/',timeout=5).read().decode()
        assert 'data-planning-service="true"' in page and service['url'].split('#token=')[1] not in page
        assert json.loads(html.fromstring(page).get_element_by_id('plan-data').text)['version']=='default'
        assert {v['version'] for v in request('/api/versions')['versions']}=={'v0.4','v0.5'}
        current=request('/api/data?version=v0.4');original_etag=current['etag']
        current['data']['results']['goals']=[{'id':'G1','title':'HTTP 写入啊啊啊','metric':'','target':'','reading':'','status':{'label':'无值','tone':'neutral'},'progress':None}]
        (Path(folder)/'proof.md').write_text('Fixture delivery',encoding='utf-8')
        current['data']['results']['deliverables']=[{'id':'D1','label':'Proof','goal':'v0.3/G1','url':'proof.md'}]
        saved=request('/api/data?version=v0.4','PUT',current)
        with urlopen(base+'/api/attachment?version=v0.4&path=proof.md&token='+token,timeout=5) as attachment:assert attachment.read()==b'Fixture delivery'
        try:urlopen(base+'/api/attachment?version=v0.4&path=../outside&token='+token,timeout=5)
        except HTTPError as error:assert error.code==403
        else:raise AssertionError('Unlisted attachment accepted')
        assert store.read()[0]['results']['goals'][0]['title']=='HTTP 写入啊啊啊'
        assert not planning.Store(folder,'v0.5').read()[0]['results']['goals']
        client_script="""
const [url,modulePath]=process.argv.slice(1);const base=new URL(url);
global.location={hash:base.hash};const nativeFetch=global.fetch;
global.fetch=(path,options)=>nativeFetch(new URL(path,base),options);
const Client=require(modulePath);
(async()=>{const client=new Client(true);const records=await client.list();let data=await client.open(records.find(r=>r.version==='v0.4'));data.results.goals[0].title='HTTP 客户端啊啊啊';await client.save(data);const other=await client.open(records.find(r=>r.version==='v0.5'));if(other.results.goals.length)throw Error('Version isolation failed');})().catch(error=>{console.error(error);process.exitCode=1;});
"""
        client=subprocess.run([shutil.which('node'),'-e',client_script,service['url'],str(ROOT/'scripts/version-planning/local-data.js')],capture_output=True,text=True,encoding='utf-8')
        assert client.returncode==0,client.stderr
        assert store.read()[0]['results']['goals'][0]['title']=='HTTP 客户端啊啊啊'
        store.patch([{'path':'results.goals.0.title','old':'HTTP 客户端啊啊啊','value':'模型修改后页面读取'}])
        readback=request('/api/data?version=v0.4')
        assert readback['data']['results']['goals'][0]['title']=='模型修改后页面读取'
        try:request('/api/data?version=v0.4','PUT',saved)
        except HTTPError as error:assert error.code==409
        else:raise AssertionError('Stale page overwrote model edit')
        for auth,origin,expected in [(False,None,401),(True,'https://example.invalid',403)]:
            try:request('/api/data?version=v0.4',auth=auth,origin=origin)
            except HTTPError as error:assert error.code==expected
            else:raise AssertionError('Unauthenticated/cross-origin request accepted')
        confirmed=request('/api/confirm?version=v0.4','POST',{'stage':'results','etag':readback['etag']})
        assert confirmed['data']['confirmation']['results']['actor']=='user'
        planning.stop_server(store);assert planning.running_server(store) is None
        service=planning.start_server(store)
        parts=urlsplit(service['url']);base=parts.scheme+'://'+parts.netloc;token=parse_qs(parts.fragment)['token'][0]
        assert request('/api/data?version=v0.4')['data']['results']['goals'][0]['title']=='模型修改后页面读取'
        passed('Actual page HTTP client writes reach JSON; model edit is read back; stale save rejected; versions isolated; process reused, stopped and restarted without data loss; token and origin enforced')
    finally:planning.stop_server(store)

(ROOT/'.bw/release/out/planning-checks').mkdir(parents=True,exist_ok=True)
(ROOT/'.bw/release/out/planning-checks/report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
