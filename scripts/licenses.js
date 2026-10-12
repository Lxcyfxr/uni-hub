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
// Platform binaries (optional deps) are only installed for the host OS, so everything is read from the
// lockfile and falls back to the base package (same repo/license file) when a package is not installed.
const PLATFORMS=['win32','linux','darwin'];
const keys=[...seen.keys()].filter(k=>{const o=lock[k].os;return !o||o.some(x=>PLATFORMS.includes(x));}).sort();
const nameOf=k=>k.slice(k.lastIndexOf('node_modules/')+13);
const readPkg=k=>{try{return JSON.parse(fs.readFileSync(path.join(root,k,'package.json'),'utf8'))}catch{return null}};
const readLic=dir=>{try{const f=fs.readdirSync(dir).find(f=>/^(licen[sc]e|copying)(\..*)?$/i.test(f));return f?fs.readFileSync(path.join(dir,f),'utf8').trim():null}catch{return null}};
const repoOf=j=>typeof j.repository==='string'?j.repository:j.repository?.url||j.homepage||'';
const out=[];
for(const key of keys){
  const name=nameOf(key);let j=readPkg(key),dir=path.join(root,key);
  let base=null;
  if(!j){ // not installed on this host: use the closest installed package whose name is a prefix
    const bk=keys.filter(k=>k!==key&&name.startsWith(nameOf(k)+'-')&&readPkg(k)).sort((x,y)=>y.length-x.length)[0];
    base=bk?readPkg(bk):null;
    if(bk)dir=path.join(root,bk);
    j={name,version:lock[key].version,license:lock[key].license,repository:base&&base.repository};
  }
  const lic=j.license||(j.licenses?j.licenses.map(l=>l.type).join(' OR '):'?');
  let text=readLic(dir);
  if(!text&&lock[key].optional){const bk=keys.filter(k=>k!==key&&name.startsWith(nameOf(k)+'-')&&readLic(path.join(root,k))).sort((x,y)=>y.length-x.length)[0];if(bk)text=readLic(path.join(root,bk));}
  if(!text&&repoOf(j)){const rk=keys.find(k=>k!==key&&readPkg(k)&&repoOf(readPkg(k))===repoOf(j)&&readLic(path.join(root,k)));if(rk)text=readLic(path.join(root,rk));} // same repo, e.g. ant-design-icons monorepo
  const author=j.author&&(j.author.name||j.author);
  out.push({name:j.name||name,version:j.version,lic,text,repo:repoOf(j),author});
}
let md=`# Third-Party Licenses\n\nUni-Hub bundles the following open-source packages (runtime dependencies and everything the app bundles from them).\nGenerated from \`package-lock.json\` / \`node_modules\`. ${out.length} packages.\nElectron/Chromium license files ship with the app (\`LICENSE.electron.txt\`, \`LICENSES.chromium.html\`).\n\n## Overview\n\n| Package | Version | License |\n|---|---|---|\n`;
for(const o of out)md+=`| ${o.name} | ${o.version} | ${o.lic} |\n`;
md+='\n## License texts\n';
for(const o of out){md+=`\n---\n\n### ${o.name}@${o.version} — ${o.lic}\n${o.repo?o.repo+'\n':''}\n`;
 md+=o.text?'```\n'+o.text+'\n```\n':'_No license file in package; license declared in package.json: '+o.lic+(o.author?' (author: '+o.author+')':'')+'._\n';}
fs.writeFileSync(path.join(root,"THIRD-PARTY-LICENSES.md"),md);
console.log(out.length,'pkgs; without text:',out.filter(o=>!o.text).map(o=>o.name+'('+o.lic+')').join(', '));
console.log([...new Set(out.map(o=>o.lic))].join(' | '));
