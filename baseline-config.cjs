const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const configDir=path.resolve('config');
function load(name,source,override){const filename=path.join(configDir,name),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(configDir);if(override){const normal=Module.createRequire(filename);m.require=(id)=>id==='./packaged-runtime-node-modules.size-baseline.cjs'?override:normal(id)}m._compile(fs.readFileSync(path.join(__dirname,source),'utf8'),filename);return m.exports}
const runtime=load('packaged-runtime-node-modules.cjs','runtime-before.txt');
module.exports=load('electron-builder.config.cjs','builder-before.txt',runtime);
