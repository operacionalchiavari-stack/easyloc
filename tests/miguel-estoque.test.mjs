import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { IDENTIDADE_ESTOQUE, NOME_ESTOQUE } from '../supabase/functions/_shared/estoque-identidade.mjs';
import { sistemaSeparacao, validarSeparacao } from '../supabase/functions/_shared/separacao-assistente.mjs';

test('Miguel mantém a mesma identidade ao investigar uma ocorrência',()=>{
 assert.equal(NOME_ESTOQUE,'Miguel');const contexto={item:'Cadeira',quantidade_pedido:2,motivos:[{id:'avaria',nome:'Item danificado'}]};
 const sistema=sistemaSeparacao('Ana',contexto);assert.ok(sistema.includes(IDENTIDADE_ESTOQUE));assert.ok(sistema.includes('Miguel'));assert.ok(sistema.includes('Ana'));assert.ok(sistema.includes(JSON.stringify(contexto)));
 const resumo={motivo_id:'avaria',quantidade:1,problema:'Assento lascado',quando_identificado:'Agora',porque_agora:'Ao retirar a capa',verificacoes:'Inspeção visual',solucao_sugerida:'Avaliar reparo',pendencias:'Confirmar causa',danificado:true,sem_foto_motivo:'',fotos_dano_claras:true,analise_fotos:'A foto mostra uma lasca no acabamento do assento.'};
 assert.equal(validarSeparacao(resumo,contexto,[]),null,'mesmo agente continua exigindo evidência de dano');assert.equal(validarSeparacao({...resumo,fotos_dano_claras:false},contexto,['foto']),null);
 assert.equal(validarSeparacao(resumo,contexto,['foto']).quantidade,1);assert.equal(validarSeparacao({...resumo,quantidade:3},contexto,['foto']),null,'respeita a quantidade do pedido');
});

test('unificação mantém a chave, os limites e as instruções personalizadas das empresas',async()=>{
 const db=new PGlite();try{
  await db.exec(`create table ia_agentes(chave text primary key,nome text,descricao text,comportamento text,coletar text,indispensavel text,limites text);
   create table ia_agentes_config(empresa_id text,agente text references ia_agentes(chave),comportamento text,limites text);
   insert into ia_agentes values('separacao','Auxiliar de estoque','Separação','Investigue','Dano','Foto','Não liberar peças');
   insert into ia_agentes_config values('e1','separacao','Converse com objetividade','Nunca autorizar baixa');`);
  const antes=(await db.query('select * from ia_agentes_config')).rows;
  await db.exec(fs.readFileSync('supabase/migrations/20261121000100_miguel_estoque_unificado.sql','utf8'));
  const agente=(await db.query('select * from ia_agentes')).rows[0];assert.equal(agente.nome,'Miguel · Estoque');assert.equal(agente.chave,'separacao');assert.equal(agente.limites,'Não liberar peças');assert.match(agente.descricao,/acervo e separação/);assert.deepEqual((await db.query('select * from ia_agentes_config')).rows,antes);
 }finally{await db.close();}
});
