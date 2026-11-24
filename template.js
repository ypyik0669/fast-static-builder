import {escapeHtml} from './text.js';

const ident = '[A-Za-z_][A-Za-z_0-9]*';
const pathPattern = new RegExp('^'+ident+'(?:\\.'+ident+')*$');
const loopPattern = new RegExp('^for ('+ident+') in (\\S+)$');
const opening = /\{\{\{|\{\{|\{%/g;

function syntaxTree(name, source) {
  const fail = reason => { throw new SyntaxError('template "'+name+'": '+reason); };
  const path = text => pathPattern.test(text) ? text.split('.') : fail(JSON.stringify(text)+' is not a path');
  const tokens = [];
  let pos = 0;
  opening.lastIndex = 0;
  for (let found; (found = opening.exec(source));) {
    const kind = found[0], start = found.index;
    const close = kind === '{%' ? '%}' : kind === '{{{' ? '}}}' : '}}';
    const end = source.indexOf(close, start + kind.length);
    if (end < 0) fail('a '+kind+' is not closed');
    const after = end + close.length;
    let left = start, right = after;
    if (kind === '{%') {
      const line = source.lastIndexOf('\n', start - 1) + 1;
      const next = source.indexOf('\n', after);
      const lineEnd = next < 0 ? source.length : next;
      if (/^[ \t]*$/.test(source.slice(line, start)) && /^[ \t]*$/.test(source.slice(after, lineEnd))) {
        left = line;
        right = Math.min(source.length, lineEnd + 1);
      }
    }
    if (left > pos) tokens.push(['literal', source.slice(pos, left)]);
    const value = source.slice(start + kind.length, end).trim();
    tokens.push(kind === '{%' ? ['tag', value] : [kind === '{{{' ? 'raw' : 'escaped', path(value)]);
    opening.lastIndex = pos = right;
  }
  if (pos < source.length) tokens.push(['literal', source.slice(pos)]);
  const root = [];
  const stack = [];
  let body = root;
  for (const token of tokens) {
    if (token[0] !== 'tag') { body.push(token); continue; }
    const tag = token[1], top = stack.at(-1);
    const loop = loopPattern.exec(tag);
    if (loop) {
      const node = ['for', loop[1], path(loop[2]), []];
      body.push(node); stack.push({kind:'for', node, parent:body}); body = node[3];
      continue;
    }
    const cond = /^if (not )?(\S+)$/.exec(tag);
    if (cond) {
      const node = ['if', !!cond[1], path(cond[2]), [], null];
      body.push(node); stack.push({kind:'if', node, parent:body}); body = node[3];
      continue;
    }
    if (tag === 'else') {
      if (top?.kind !== 'if' || top.node[4] !== null) fail('an else outside an if');
      body = top.node[4] = [];
      continue;
    }
    if (tag === 'endfor' || tag === 'endif') {
      if (top?.kind !== tag.slice(3)) fail('an '+tag+' with no open '+tag.slice(3));
      body = stack.pop().parent;
      continue;
    }
    const inc = /^include "([a-z0-9-]+)"$/.exec(tag);
    if (!inc) fail('{% '+tag+' %} is not a tag');
    body.push(['include', inc[1]]);
  }
  if (stack.length) fail('a '+stack.at(-1).kind+' is not closed');
  return root;
}

function string(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return ''+v;
  return Array.isArray(v) ? v.map(string).join(', ') : '';
}
function truth(v) { return typeof v === 'object' && v !== null ? !Array.isArray(v) || v.length !== 0 : v !== undefined && v !== null && v !== false && v !== '' && v !== 0; }
function own(v, key) { return v !== null && typeof v === 'object' && Object.hasOwn(v,key) ? v[key] : undefined; }

export function compileTemplates(inputTemplates) {
  const trees = new Map(), errors = [], programs = new Map(), specialized = new WeakMap();
  const escaped = new Map();
  function escape(v) {
    const hit = escaped.get(v);
    if (hit !== undefined) return hit;
    const output = escapeHtml(v);
    if(v.length <= 256 && escaped.size < 8192) escaped.set(v,output);
    return output;
  }
  for (const name of Object.keys(inputTemplates).sort()) {
    try { trees.set(name, syntaxTree(name,inputTemplates[name])); }
    catch (e) { if (!(e instanceof SyntaxError)) throw e; errors.push(e.message); }
  }
  // Each stable snapshot is explicit opt-in: these root values must be unchanged
  // for this snapshot's lifetime and must match the corresponding rendered roots.
  function dependencies(node, locals, depth, roots) {
    const [kind,a,b,yes,no] = node;
    if (kind === 'literal') return true;
    if (kind === 'include') {
      if (depth >= 8 || !trees.has(a)) return true;
      return trees.get(a).every(x=>dependencies(x,locals,depth+1,roots));
    }
    const first = (kind === 'escaped' || kind === 'raw' ? a : b)[0];
    if (locals.get(first) === false) return false;
    if (!locals.has(first)) roots.add(first);
    if (kind === 'for') {
      const nested = new Map(locals);
      nested.set(a,true); nested.set('loop',true);
      return yes.every(x=>dependencies(x,nested,depth,roots));
    }
    return kind !== 'if' || (yes.every(x=>dependencies(x,locals,depth,roots)) && (!no || no.every(x=>dependencies(x,locals,depth,roots))));
  }
  function build(tree, snapshot, startDepth=0) {
    let serial = 0;
    const code = ['let out="";'], constants=[];
    const quote = JSON.stringify;
    const read = (segments, bindings) => {
      const root = bindings.get(segments[0]);
      if (root && typeof root === 'object' && segments.length > 1 && Object.hasOwn(root.fields, segments[1])) {
        return segments.length === 2 ? root.fields[segments[1]] : 'undefined';
      }
      let exp = typeof root === 'object' ? root.value : root ?? 'own(vars,'+quote(segments[0])+')';
      for(let i=1;i<segments.length;i++) exp = 'own('+exp+','+quote(segments[i])+')';
      return exp;
    };
    function emit(nodes, bindings, depth) {
      const locals = snapshot ? new Map(Array.from(bindings.keys(), name=>[name,false])) : null;
      for (const node of nodes) {
        const [kind, a, b, yes, no] = node;
        if (snapshot && (kind === 'include' || kind === 'for' || kind === 'if')) {
          const roots = new Set();
          if (dependencies(node,locals,depth,roots) && [...roots].every(name=>Object.hasOwn(snapshot.globals,name))) {
            // Includes are compiled once for a given remaining depth, regardless
            // of their caller's binding names, after the free-root proof above.
            const key = kind === 'include' ? trees.get(a) : node;
            const fragmentDepth = kind === 'include' ? depth+1 : depth;
            if (!key || fragmentDepth>8) continue;
            let memo = snapshot.fragments.get(key);
            if (!memo) {memo = []; snapshot.fragments.set(key,memo);}
            let value = memo[fragmentDepth];
            if (value === undefined) {
              value = build(kind==='include'?key:[node],null,fragmentDepth)(snapshot.globals);
              memo[fragmentDepth] = value;
            }
            if (value !== '') {
              code.push('out+=constants[',String(constants.length),'];');
              constants.push(value);
            }
            continue;
          }
        }
        if (kind === 'literal') code.push('out+=',quote(a),';');
        else if (kind === 'raw' || kind === 'escaped') {
          const val=read(a,bindings);
          code.push(kind === 'escaped' ? 'out+=esc(string('+val+'));' : 'out+=string('+val+');');
        } else if (kind === 'if') {
          code.push('if(',a?'!':'','truth(',read(b,bindings),')){');
          emit(yes,bindings,depth);
          code.push('}');
          if(no!==null){code.push('else{');emit(no,bindings,depth);code.push('}');}
        } else if (kind === 'for') {
          const id=serial++, arr='a'+id, idx='i'+id, len='n'+id, item='x'+id;
          code.push('{const ',arr,'=',read(b,bindings),';if(Array.isArray(',arr,')){const ',len,'=',arr,'.length;for(let ',idx,'=0;',idx,'<',len,';',idx,'++){const ',item,'=',arr,'[',idx,'];');
          const nested=new Map(bindings);
          nested.set(a,item); nested.set('loop',{value:'l'+id,fields:{index:'('+idx+'+1)',first:'('+idx+'===0)',last:'('+idx+'==='+len+'-1)',length:len}});
          const fragment=code.length;
          emit(yes,nested,depth);
          // Allocate loop metadata only when a descendant uses the enclosing loop.
          const reg = new RegExp('\\bl'+id+'\\b');
          if(code.slice(fragment).some(part => reg.test(part))) {
            code.splice(fragment,0,'const l'+id+'={index:'+idx+'+1,first:'+idx+'===0,last:'+idx+'==='+len+'-1,length:'+len+'};');
          }
          code.push('}}}');
        } else if (depth<8 && trees.has(a)) emit(trees.get(a),bindings,depth+1);
      }
    }
    emit(tree,new Map(),startDepth);
    code.push('return out;');
    return new Function('own','truth','string','esc','constants','return function(vars){'+code.join('')+'}')(own,truth,string,escape,constants);
  }
  return {
    errors,
    has(name){return trees.has(name);},
    render(name,vars,stableGlobals) {
      const tree = trees.get(name);
      if (!tree) return null;
      let cache=programs, snapshot;
      if (stableGlobals) {
        snapshot = specialized.get(stableGlobals);
        if (!snapshot) {
          snapshot={globals:stableGlobals, programs:new Map(), fragments:new WeakMap()};
          specialized.set(stableGlobals,snapshot);
        }
        cache=snapshot.programs;
      }
      let fn=cache.get(name);
      if(!fn){fn=build(tree,snapshot);cache.set(name,fn);}
      return fn(vars);
    }
  };
}
