#!/usr/bin/env node
const id = '11111111-1111-1111-1111-111111111111';
const protectedId = '22222222-2222-2222-2222-222222222222';
const data = [
 {id,name:'GitHub',type:1,favorite:true,folderId:'work',login:{username:'hello@example.com',password:'example-password',uris:[{uri:'https://github.com'}]},notes:'A synthetic account for interface testing.',revisionDate:'2026-10-10T12:00:00Z'},
 {id:protectedId,name:'Protected account',type:1,reprompt:1,login:{username:'private@example.com',password:'protected-secret'},revisionDate:'2026-10-09T12:00:00Z'},
 {id:'33333333-3333-3333-3333-333333333333',name:'Travel card',type:3,card:{cardholderName:'Alex Morgan',number:'4242424242424242',code:'123',expMonth:'12',expYear:'2030'},revisionDate:'2026-09-10T12:00:00Z'},
 {id:'44444444-4444-4444-4444-444444444444',name:'Home network',type:2,notes:'Guest network details\nAn example secure note.',revisionDate:'2026-08-10T12:00:00Z'}
];
const args = process.argv.slice(2);
if (['unlock','login'].includes(args[0])) {
 if (!args.includes('--passwordenv') || args.includes('test-password') || process.env.BETTERBW_PASSWORD !== 'test-password') {process.stderr.write('Invalid master password.');process.exit(1);}
 process.stdout.write('synthetic-session');
} else if(args[0]==='status') console.log(JSON.stringify({status:process.env.BW_SESSION?'unlocked':'locked',userEmail:'hello@example.com',serverUrl:'https://vault.bitwarden.com'}));
else if(!process.env.BW_SESSION){process.stderr.write('Vault is locked.');process.exit(1);}
else if(args[0]==='list') console.log(JSON.stringify(args[1]==='items'?data:[{id:'work',name:'Work'}]));
else if(args[0]==='get') console.log(args[1]==='totp'?'123456':JSON.stringify(data.find(i=>i.id===args[2])));
else if(args[0]==='sync') console.log('Synced');
else process.exit(1);
