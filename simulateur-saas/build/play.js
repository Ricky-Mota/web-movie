const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1400,height:1000}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/cdnjs.cloudflare.com/**',r=>r.abort());
await p.goto('file://'+process.cwd()+'/simulateur-saas.html');await p.waitForTimeout(600);
const lessons=await p.evaluate(()=>window.COURSE.map(c=>({id:c.id,lecon:c.lecon,module:c.module,steps:c.steps.map(s=>({a:s.action,e:s.expect,x:s.x,y:s.y,w:s.w,h:s.h}))})));
const bad=[];
for(const L of lessons){
  await p.click(`#modtabs [data-mod="${L.module}"]`);
  await p.click(`#library [data-sc="${L.id}"]`);
  await p.waitForTimeout(250);
  await p.click('#iGo');
  for(let i=0;i<L.steps.length;i++){
    const s=L.steps[i];
    await p.waitForFunction(i=>document.getElementById('stepLabel').textContent.startsWith('Étape '+(i+1)+' '),i,{timeout:4000}).catch(()=>{});
    await p.waitForTimeout(80);
    const r=await p.$eval('#shotImg',el=>{const b=el.getBoundingClientRect();return {x:b.left,y:b.top,w:b.width,h:b.height}});
    const cx=r.x+(s.x+s.w/2)/100*r.w, cy=r.y+(s.y+s.h/2)/100*r.h;
    await p.mouse.click(cx,cy);
    if(s.a==='saisie'){ await p.focus('#typebox'); await p.keyboard.type(s.e,{delay:2}); }
  }
  await p.waitForTimeout(500);
  const res=await p.evaluate(()=>({score:document.getElementById('rScore')?.textContent, err:document.getElementById('sErr').textContent, vis:!document.querySelector('.result')?.hidden}));
  if(!res.vis || res.score!=='100 / 100' || res.err!=='0') bad.push({lecon:L.lecon,...res});
}
console.log('lessons',lessons.length,'bad',JSON.stringify(bad));
console.log('errors',errs.slice(0,5));
await b.close();})();
