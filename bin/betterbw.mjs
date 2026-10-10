#!/usr/bin/env node
import { password, input, select, search } from '@inquirer/prompts';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { Vault } from '../lib/vault.cjs';
const exec = promisify(execFile);
const vault = new Vault();
const clean = value => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
const color = (code, text) => `\x1b[${code}m${text}\x1b[0m`;
const green = text => color('32', text);
const muted = text => color('90', text);
const kind = type => ({1:'Login',2:'Secure note',3:'Card',4:'Identity',5:'SSH key'}[type] || 'Item');
let account, items = [], folders = [], clipboard = null, clipboardTimer, copied = '', statusMessage = '', idleExpired = false;
function screen(subtitle = '') {
 process.stdout.write('\x1b[2J\x1b[H');
 console.log(`\n  ${green('◆ BetterBW')} ${muted(' / '+(subtitle || 'your vault, simplified'))}\n`);
 if(account?.userEmail) console.log(`  ${muted(clean(account.userEmail))}\n`);
 if(statusMessage){console.log(`  ${statusMessage}\n`);statusMessage='';}
}
async function ask(prompt, options, { escapeBack = false } = {}) {
 const controller = new AbortController();
 let escaped = false;
 const onKey = (_text, key) => {
  if (escapeBack && key?.name === 'escape') { escaped = true; controller.abort(); }
 };
 const timer = setTimeout(() => { idleExpired = true; controller.abort(); }, 5 * 60 * 1000);
 process.stdin.on('keypress', onKey);
 try { return await prompt(options, {signal:controller.signal}); }
 catch (error) { if (escaped && error.name === 'AbortPromptError') return null; throw error; }
 finally { clearTimeout(timer); process.stdin.removeListener('keypress', onKey); }
}
async function findClipboard() {
 const candidates = process.env.WAYLAND_DISPLAY ? [['wl-copy',[], 'wl-paste',['--no-newline']], ['xclip',['-selection','clipboard'],'xclip',['-selection','clipboard','-o']]] : [['xclip',['-selection','clipboard'],'xclip',['-selection','clipboard','-o']],['wl-copy',[],'wl-paste',['--no-newline']]];
 for (const [write,args,read,readArgs] of candidates) { try {await exec('which',[write]);await exec('which',[read]);return {write,args,read,readArgs};}catch{ /* Try next available clipboard provider. */ } }
 return null;
}
async function writeClipboard(value) {
 if(!clipboard) throw Error('Install xclip (X11) or wl-clipboard (Wayland) to copy credentials.');
 await new Promise((resolve,reject)=>{
  const child=spawn(clipboard.write,clipboard.args,{stdio:['pipe','ignore','ignore']});
  const timer=setTimeout(()=>{child.kill();reject(Error('Clipboard command timed out.'));},5000);
  child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Clipboard is unavailable in this terminal.'));});child.stdin.on('error',()=>{});child.stdin.end(value);
 });
}
async function clearClipboard() {
 clearTimeout(clipboardTimer);
 if(!copied || !clipboard)return;
 const old = copied;copied='';
 try {const {stdout}=await exec(clipboard.read,clipboard.readArgs,{timeout:3000});if(stdout===old)await writeClipboard('');}catch{/* Clipboard may have changed or the display may be unavailable. */}
}
async function copy(value) {
 await clearClipboard();await writeClipboard(value);copied=value;
 clipboardTimer=setTimeout(()=>clearClipboard(),30000);clipboardTimer.unref();
 statusMessage=green('Copied. Clipboard clears in 30 seconds.');
}
async function pause(message = 'Press Enter to continue') {await ask(input,{message});}
async function unlock() {
 account=await vault.status();screen(account.status==='unauthenticated'?'sign in':'unlock');
 const payload={};
 if(account.status==='unauthenticated') {
  console.log(`  ${muted('Server: '+clean(account.serverUrl))}\n`);
  payload.email=await ask(input,{message:'Email address',validate:s=>s.includes('@') || 'Enter your email address.'});
  const method=await ask(select,{message:'Two-step login',choices:[{name:'Not enabled',value:''},{name:'Authenticator',value:'0'},{name:'Email',value:'1'},{name:'YubiKey',value:'3'}]});
  if(method){payload.method=method;payload.code=await ask(input,{message:'Two-step code'});}
 }
 payload.password=await ask(password,{message:'Master password',mask:'•',validate:s=>Boolean(s)||'Enter your master password.'});
 try {account=await vault.unlock(payload);} finally {payload.password='';}
 await refresh();statusMessage=green(`Unlocked · ${items.length} items`);
}
async function refresh() {const data=await vault.list();items=data.items;folders=data.folders;}
function entries(item) {
 const fields=[];
 const add=(label,value,secret=false)=>{if(value!==undefined && value!==null && value!=='')fields.push({label,value:String(value),secret});};
 if(item.login){add('Username',item.login.username);add('Password',item.login.password,true);for(const uri of item.login.uris || [])add('Website',uri.uri);}
 if(item.card){add('Cardholder',item.card.cardholderName);add('Card number',item.card.number,true);add('Security code',item.card.code,true);add('Expiry',[item.card.expMonth,item.card.expYear].filter(Boolean).join('/'));add('Brand',item.card.brand);}
 if(item.identity)for(const [key,value]of Object.entries(item.identity))add(key.replace(/([A-Z])/g,' $1'),value,['ssn','passportNumber','licenseNumber'].includes(key));
 if(item.sshKey){add('Public key',item.sshKey.publicKey);add('Private key',item.sshKey.privateKey,true);add('Fingerprint',item.sshKey.keyFingerprint);}
 add('Notes',item.notes);
 for(const f of item.fields || [])add(f.name || 'Custom field',f.value,f.type===1);
 for(const a of item.attachments || [])add('Attachment',`${a.fileName} (${a.sizeName})`);
 return fields;
}
async function showItem(id) {
 let summary=items.find(i=>i.id===id), master='';
 if(summary.reprompt){screen(clean(summary.name));master=await ask(password,{message:'Master password to open protected item',mask:'•'});}
 let item;
 try{item=await vault.item(id,master);}finally{master='';}
 const fields=entries(item);
 while(vault.session) {
  screen(clean(item.name));console.log(`  ${muted(kind(item.type)+(item.favorite?' · ★ Favorite':''))}\n`);
  for(const f of fields)console.log(`  ${muted(clean(f.label).padEnd(18))} ${f.secret?muted('••••••••••••'):clean(f.value)}`);
  console.log('');
  const choices=[...fields.map((f,n)=>({name:`${f.secret?'Reveal':'View'} ${clean(f.label)}`,value:`view:${n}`})),...fields.map((f,n)=>({name:`Copy ${clean(f.label)}`,value:`copy:${n}`}))];
  if(item.login?.totp)choices.push({name:'Copy verification code (TOTP)',value:'totp'});
  choices.push({name:'← Back to vault',value:'back'},{name:'Lock vault',value:'lock'});
  const action=await ask(select,{message:'Choose an action',choices,pageSize:12,loop:false});
  if(action==='back')return;
  if(action==='lock'){await vault.lock();await clearClipboard();return;}
  if(action==='totp'){await copy(await vault.run(['get','totp',id]));continue;}
  const [mode,index]=action.split(':');const field=fields[+index];
  if(mode==='copy'){await copy(field.value);continue;}
  screen(`${clean(item.name)} / ${clean(field.label)}`);
  // Strip terminal control characters while preserving intentional line breaks.
  console.log(field.value.split('\n').map(line=>'  '+clean(line)).join('\n'));
  console.log('');await pause('Press Enter to hide and return');
 }
}
async function browse(predicate=()=>true, title='all items') {
 screen(title);
 const candidates=items.filter(predicate);
 if(!candidates.length){console.log(`  ${muted('No items in this category.')}\n`);await pause();return;}
 const id=await ask(search,{
  message:'Search accounts (type to filter, ↑/↓ to select, Esc to go back)',pageSize:12,
  source:term=>[
   ...candidates.filter(i=>[i.name,i.username,...i.uris.map(u=>u.uri)].join(' ').toLowerCase().includes((term || '').toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name)).map(i=>({name:`${i.favorite?'★ ':'  '}${clean(i.name)} ${muted(' · '+clean(i.username || kind(i.type)))}`,value:i.id,description:clean(i.uris[0]?.uri || kind(i.type))})),
   {name:'← Back',value:null}
  ]
 }, { escapeBack: true });
 if(id)await showItem(id);
}
async function main() {
 if(process.argv.includes('--help')||process.argv.includes('-h')){console.log('BetterBW — interactive Bitwarden CLI wrapper\n\nUsage: betterbw\n       npm start\n\nType to search; arrow keys to choose; Enter to confirm; Ctrl+C to exit.\nRequires bw on PATH. Override with BETTERBW_CLI=/path/to/bw.');return;}
 if(!process.stdin.isTTY || !process.stdout.isTTY)throw Error('Run BetterBW in an interactive terminal. Use --help for usage.');
 process.stdout.write('\x1b[?1049h');clipboard=await findClipboard();
 while(true){
  try {
   if(!vault.session){await unlock();}
   screen();
   const action=await ask(select,{message:'Your vault',pageSize:10,choices:[{name:`Search all items ${muted('('+items.length+')')}`,value:'all'},{name:'★ Favorites',value:'favorites'},{name:'Browse by category',value:'types'},{name:'Browse folders',value:'folders'},{name:'↻ Sync vault',value:'sync'},{name:'Lock vault',value:'lock'},{name:'Exit',value:'exit'}]});
   if(action==='exit')return;
   if(action==='lock'){await vault.lock();items=[];await clearClipboard();continue;}
   if(action==='sync'){await vault.run(['sync']);await refresh();statusMessage=green('Vault synced.');continue;}
   if(action==='all')await browse();
   if(action==='favorites')await browse(i=>i.favorite,'favorites');
   if(action==='types'){const type=await ask(select,{message:'Category',choices:[1,2,3,4,5].map(t=>({name:kind(t),value:t})).concat([{name:'← Back',value:0}])});if(type)await browse(i=>i.type===type,kind(type));}
   if(action==='folders'){const folder=await ask(select,{message:'Folder',choices:folders.map(f=>({name:clean(f.name),value:f.id || 'none'})).concat([{name:'No folder',value:'none'},{name:'← Back',value:'back'}])});if(folder!=='back')await browse(i=>(i.folderId || 'none')===folder,'folder');}
  }catch(error){
   if(error.name==='ExitPromptError')return;
   if(idleExpired){idleExpired=false;await vault.lock();items=[];await clearClipboard();statusMessage=muted('Locked after 5 minutes without input.');continue;}
   screen();console.log(`  ${color('31',clean(error.message))}\n`);await pause();
  }
 }
}
try{await main();}catch(e){if(e.name!=='ExitPromptError'){console.error(clean(e.message));process.exitCode=1;}}
finally{await vault.lock();await clearClipboard();if(process.stdout.isTTY)process.stdout.write('\x1b[2J\x1b[H\x1b[?1049l');}
