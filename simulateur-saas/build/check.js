const fs=require('fs');const h=fs.readFileSync(process.argv[2],'utf8');
const scripts=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
global.window=global;const warns=[];console.warn=(...a)=>warns.push(a.join(' '));
eval(scripts[0]);eval(scripts[1]);
const C=window.COURSE;console.log('lessons',C.length,'steps',C.reduce((a,c)=>a+c.steps.length,0));
C.forEach(c=>console.log(c.lecon,c.module,c.steps.length,c.images.length,c.titre.slice(0,50)));
console.log('warns',warns);
// syntax check main script
new Function(scripts[2]);console.log('main ok');
