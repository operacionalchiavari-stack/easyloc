// Máscaras de CPF/CNPJ/telefone/CEP/PIS (js/core/mascaras.js): mostra pontuado, o JS lê só números.
const { chromium } = require('playwright');const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const base='http://localhost:5599/';
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.route('**/*',r=>{const u=r.request().url();if(u===base)return r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><select id="tp"><option>Pessoa Física</option><option>Pessoa Jurídica</option></select>
<input id="doc" data-mascara="cpfcnpj" data-mascara-pj="#tp"><input id="auto" data-mascara="cpfcnpj"><input id="tel" data-mascara="telefone"><input id="cep" data-mascara="cep"><input id="pis" data-mascara="pis"><input id="cpf" data-mascara="cpf" value="16883928740">
<script src="js/core/mascaras.js"></script>`});
 const f=path.join(process.cwd(),new URL(u).pathname);r.fulfill({body:fs.readFileSync(f),contentType:'text/javascript'});});
await p.goto(base);await p.waitForFunction(()=>window.EasyLocMascara);
const tela=id=>p.evaluate(id=>Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').get.call(document.getElementById(id)),id);
const js=id=>p.evaluate(id=>document.getElementById(id).value,id);
await p.type('#doc','16883928740999');assert.equal(await tela('doc'),'168.839.287-40');assert.equal(await js('doc'),'16883928740');
await p.selectOption('#tp','Pessoa Jurídica');await p.fill('#doc','');await p.type('#doc','12345678000195');assert.equal(await tela('doc'),'12.345.678/0001-95');
await p.type('#auto','12345678000195');assert.equal(await tela('auto'),'12.345.678/0001-95');
await p.type('#tel','24992842746');assert.equal(await tela('tel'),'(24) 99284-2746');assert.equal(await js('tel'),'24992842746');
await p.fill('#tel','');await p.type('#tel','2422421234');assert.equal(await tela('tel'),'(24) 2242-1234');
await p.type('#cep','25600000');assert.equal(await tela('cep'),'25600-000');
await p.type('#pis','12345678901');assert.equal(await tela('pis'),'123.45678.90-1');
assert.equal(await tela('cpf'),'168.839.287-40','valor do HTML já aparece pontuado');
// valor colocado pelo JS (cadastro carregado)
await p.evaluate(()=>{document.getElementById('tel').value='5524992842746'});assert.equal(await tela('tel'),'(24) 99284-2746');
// editar no meio: cursor fica no lugar
await p.evaluate(()=>{const e=document.getElementById('tel');e.focus();e.setSelectionRange(6,6);});await p.keyboard.press('Backspace');
assert.equal(await tela('tel'),'(24) 9284-2746');assert.equal(await p.evaluate(()=>document.getElementById('tel').selectionStart),5);
// apagar logo depois do traço apaga o número antes dele
await p.evaluate(()=>{const e=document.getElementById('tel');e.setSelectionRange(10,10);});await p.keyboard.press('Backspace');assert.equal(await tela('tel'),'(24) 9282-746');
// campo criado depois
await p.evaluate(()=>{const i=document.createElement('input');i.id='novo';i.dataset.mascara='telefone';i.value='24992842746';document.body.appendChild(i);});
await p.waitForTimeout(50);assert.equal(await tela('novo'),'(24) 99284-2746');
assert.deepEqual(errs,[]);console.log('ok - mascaras');await b.close();})().catch(e=>{console.error(e);process.exit(1)});
