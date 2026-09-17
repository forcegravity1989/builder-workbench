/* The local service owns file access; offline pages are read-only. */
class PlanningFiles {
  constructor(service=false) {
    this.service=service;this.version='';this.etag='';this.planningDir='';
    this.token=service?new URLSearchParams(location.hash.slice(1)).get('token')||'':'';
  }
  static parse(raw, version) {
    const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
    if (data.schema_version !== 2 || data.template_version !== 'se-v7-1-pilot-1') throw new Error('数据文件与模板不匹配');
    if (version && data.version !== version) throw new Error('版本目录与文件内容不一致');
    for (const [section, keys] of Object.entries({results:['goals','tasks','sessions'],plan:['goals','tasks']})) {
      for (const key of keys) if (!Array.isArray(data[section]?.[key])) throw new Error('数据缺少 '+section+'.'+key);
    }
    const versionDeliveries=data.results.deliverables||[];
    if(!Array.isArray(versionDeliveries)||versionDeliveries.length>50||versionDeliveries.some(item=>!item||typeof item!=='object'||!['label','goal','url'].every(field=>typeof(item[field]??'')==='string')))throw new Error('版本交付件需要交付内容、所属目标和链接');
    if (!data.review || !data.confirmation) throw new Error('数据缺少评审或确认记录');
    for(const section of ['results','plan']){
      for(const goal of data[section].goals)for(const field of ['metric','target','baseline','reading','deadline','owner'])if(field in goal&&typeof goal[field]!=='string')throw new Error('目标字段必须是文字：'+field);
      for(const task of data[section].tasks){
        if(!['unknown','feature','bug','ops'].includes(task.kind||'unknown'))throw new Error('无效任务类型');
        const deliveries=task.deliverables||[];
        if(!Array.isArray(deliveries)||deliveries.length>50||deliveries.some(item=>!item||typeof item!=='object'||!['label','url'].every(field=>typeof(item[field]??'')==='string')))throw new Error('交付件需要名称和链接文字');
      }
    }
    return data;
  }

  async request(path,method='GET',body=null) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetch(path,{method,signal:controller.signal,cache:'no-store',headers:{
        Authorization:'Bearer '+this.token,...(body?{'Content-Type':'application/json'}:{})
      },...(body?{body:JSON.stringify(body)}:{})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'保存服务返回错误');
      return result;
    } catch(error) {
      if(error.name==='AbortError'||error instanceof TypeError)throw new Error('本地服务未连接，修改尚未保存；请让会话启动服务后重试。');
      throw error;
    } finally {clearTimeout(timer);}
  }
  async list() {
    const result=await this.request('/api/versions');this.planningDir=result.planning_dir;this.defaultVersion=result.default_version;
    return result.versions;
  }
  adopt(result) {
    const data=PlanningFiles.parse(JSON.stringify(result.data),this.version);
    this.etag=result.etag;this.warning=result.warning||'';return data;
  }
  async open(record) {
    if(!this.service){this.version=record.version;return structuredClone(record.data);}
    if(record.unavailable)throw new Error(record.error);
    const result=await this.request('/api/data?version='+encodeURIComponent(record.version));
    PlanningFiles.parse(JSON.stringify(result.data),record.version);
    this.version=record.version;return this.adopt(result);
  }
  async save(data) {
    const result=await this.request('/api/data?version='+encodeURIComponent(this.version),'PUT',{data,etag:this.etag});
    return this.adopt(result);
  }
  async confirm(stage) {
    return this.adopt(await this.request('/api/confirm?version='+encodeURIComponent(this.version),'POST',{stage,etag:this.etag}));
  }
  async changed() {
    const result=await this.request('/api/data?version='+encodeURIComponent(this.version));
    return result.etag===this.etag?null:result;
  }
}
if (typeof module !== 'undefined') module.exports = PlanningFiles;
