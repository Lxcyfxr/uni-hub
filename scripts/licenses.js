const fs=require('fs'),path=require('path');
const root=process.cwd();
const lock=require(root+'/package-lock.json').packages;
const roots=['antd','@ant-design/icons','react','react-dom','dayjs','zustand','fflate','ts-fsrs','yauzl','node-ical','mammoth','pdfjs-dist'];
function resolve(from,name){ // node resolution in lockfile
  let base=from;
  while(true){const k=(base?base+'/':'')+'node_modules/'+name;if(lock[k])return k;if(!base)return null;const i=base.lastIndexOf('/node_modules/');base=i<0?'':base.slice(0,i);}
}
const seen=new Map();
function walk(key){ if(seen.has(key))return; seen.set(key,1); const p=lock[key];
  for(const d of Object.keys({...p.dependencies,...p.optionalDependencies})){const r=resolve(key,d);if(r)walk(r);}}
roots.forEach(r=>{const k=resolve('',r);k?walk(k):console.error('missing',r)});
const out=[];
for(const key of [...seen.keys()].sort()){
  const dir=path.join(root,key);let j={};try{j=JSON.parse(fs.readFileSync(dir+'/package.json','utf8'))}catch{continue}
  let lic=j.license||(j.licenses?j.licenses.map(l=>l.type).join(' OR '):'?');
  const f=fs.readdirSync(dir).find(f=>/^(licen[sc]e|copying)(\..*)?$/i.test(f));
  let text=f?fs.readFileSync(path.join(dir,f),'utf8').trim():null;
  let repo=typeof j.repository==='string'?j.repository:j.repository?.url||j.homepage||'';
  out.push({name:j.name,version:j.version,lic,text,repo});
}
let md=`# Third-Party Licenses\n\nUni-Hub bundles the following open-source packages (runtime dependencies and everything the app bundles from them).\nGenerated from \`package-lock.json\` / \`node_modules\`. ${out.length} packages.\nElectron/Chromium license files ship with the app (\`LICENSE.electron.txt\`, \`LICENSES.chromium.html\`).\n\n## Overview\n\n| Package | Version | License |\n|---|---|---|\n`;
for(const o of out)md+=`| ${o.name} | ${o.version} | ${o.lic} |\n`;
md+='\n## License texts\n';
for(const o of out){md+=`\n---\n\n### ${o.name}@${o.version} — ${o.lic}\n${o.repo?o.repo+'\n':''}\n`;
 md+=o.text?'```\n'+o.text+'\n```\n':'_No license file in package; license declared in package.json: '+o.lic+'._\n';}
fs.writeFileSync(path.join(root,"THIRD-PARTY-LICENSES.md"),md);
console.log(out.length,'pkgs; without text:',out.filter(o=>!o.text).map(o=>o.name+'('+o.lic+')').join(', '));
console.log([...new Set(out.map(o=>o.lic))].join(' | '));
