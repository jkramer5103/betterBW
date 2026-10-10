const {test} = require('node:test');
const assert = require('node:assert/strict');
const {Vault} = require('../lib/vault.cjs');
const path = require('node:path');
const make = () => new Vault(path.join(__dirname,'fake-bw.cjs'));
test('unlock passes password through env, list withholds secrets, lock revokes access',async()=>{
 const v=make(); assert.equal((await v.status()).status,'locked');
 await assert.rejects(v.unlock({password:'incorrect'}),/Invalid master/);
 await v.unlock({password:'test-password'});
 const {items}=await v.list(); assert.equal(items.length,4); assert.equal(items[0].password,undefined); assert.equal(items[0].login,undefined);
 assert.equal((await v.item(items[0].id)).login.password,'example-password');
 await v.lock(); await assert.rejects(v.list(),/Unlock/); assert.equal(v.session,'');
});
test('protected items require verified master password and forget authorization on lock',async()=>{
 const v=make(),id='22222222-2222-2222-2222-222222222222'; await v.unlock({password:'test-password'});
 await assert.rejects(v.item(id),/requires your master/);
 await assert.rejects(v.item(id,'wrong'),/verification failed/);
 assert.equal((await v.item(id,'test-password')).login.password,'protected-secret');
 assert.equal((await v.item(id)).name,'Protected account');
 await v.lock(); await v.unlock({password:'test-password'}); await assert.rejects(v.item(id),/requires your master/);
});
test('rejects invalid item IDs and missing password',async()=>{const v=make();await assert.rejects(v.unlock({password:''}),/Enter/);await v.unlock({password:'test-password'});await assert.rejects(v.item('--help'),/Invalid item/);});
test('lock during unlock cannot reopen vault',async()=>{const v=make();const pending=v.unlock({password:'test-password'});await v.lock();await assert.rejects(pending,/cancelled/);assert.equal(v.session,'');});
