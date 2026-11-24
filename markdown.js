import { escapeHtml, slugify, uniqueSlug } from './text.js';

const special = /[\\`*[&<>"']/g;
const escapable = "\\`*_[]()#+-.!>";
const htmlEntities = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const trimHorizontal = /^[ \t]+|[ \t]+$/g;
const empty = /^[ \t]*$/;
const fence = /^```([\w+-]*)[ \t]*$/;
const fenceEnd = /^```[ \t]*$/;
const heading = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const rule = /^(?:---|\*\*\*)[ \t]*$/;
const bullet = /^[-*] (.*)$/;
const numbered = /^(\d{1,9})\. (.*)$/;
const continuation = /^ {2,}\S/;
const whitespace = /\s/;

function seek(text, start, wanted) {
  for (let p = start; p < text.length; p++) {
    const c = text[p];
    if (c === '\\' && text[p+1] && escapable.includes(text[p+1])) {
      ++p;
    } else if (wanted === ']') {
      if (c === ']') return p;
    } else if (c === '*') {
      if (wanted === '**') {
        if (text[p+1] === '*') return p;
      } else if (text[p+1] === '*') {
        ++p;
      } else return p;
    }
  }
  return -1;
}

export function inline(text, env) {
  let out = '', from = 0, pos = 0;
  for (;;) {
    special.lastIndex = pos;
    const match = special.exec(text);
    if (!match) return out + text.slice(from);
    const i = match.index, c = match[0];
    let p = -1, result, length = 1;
    if (c === '\\') {
      const escaped = text[i+1];
      if (escaped && escapable.includes(escaped)) {
        result = htmlEntities[escaped] ?? escaped;
        length = 2;
      }
    } else if (c === '`') {
      p = text.indexOf('`', i+1);
      if (p > i+1) {
        result = '<code>' + escapeHtml(text.slice(i+1,p)) + '</code>';
        length = p+1-i;
      }
    } else if (c === '*') {
      const strong = text[i+1] === '*';
      const width = strong ? 2 : 1;
      p = seek(text,i+width,strong ? '**' : '*');
      if (p > i+width) {
        const tag = strong ? 'strong' : 'em';
        result = '<'+tag+'>'+inline(text.slice(i+width,p),env)+'</'+tag+'>';
        length = p+width-i;
      } else length = width;
    } else if (c === '[') {
      const endLabel = seek(text,i+1,']');
      if (endLabel >= 0 && text[endLabel+1] === '(') {
        p = text.indexOf(')',endLabel+2);
        if (p > endLabel+2) {
          const target = text.slice(endLabel+2,p);
          if (!whitespace.test(target)) {
            result = '<a href="'+escapeHtml(env.link(target))+'">'+inline(text.slice(i+1,endLabel),env)+'</a>';
            length = p+1-i;
          }
        }
      }
    } else result = htmlEntities[c];
    pos = i+length;
    if (result !== undefined) {
      out += text.slice(from,i)+result;
      from = pos;
    }
  }
}

function headingParts(line) {
  if (line[0] !== '#') return null;
  const parts = heading.exec(line);
  return parts?.[2] ? parts : null;
}

function trim(line) {
  if (!line) return line;
  const a = line[0], b = line[line.length-1];
  return a === ' ' || a === '\t' || b === ' ' || b === '\t' ? line.replace(trimHorizontal,'') : line;
}

function paragraphBreak(line) {
  switch (line[0]) {
    case undefined: return true;
    case ' ': case '\t': return empty.test(line);
    case '`': return fence.test(line);
    case '#': return headingParts(line) !== null;
    case '-': case '*': return rule.test(line);
    default: return false;
  }
}

export function renderMarkdown(text, env) {
  const lines = text.split('\n'), n = lines.length, toc = [];
  let ids, html = '', excerpt;
  for (let i = 0; i < n;) {
    const line = lines[i++], first = line[0];
    if (first === undefined || ((first === ' ' || first === '\t') && empty.test(line))) continue;
    let parts;
    if (first === '`' && (parts = fence.exec(line))) {
      const lang = parts[1], start = i;
      while (i < n && !fenceEnd.test(lines[i])) ++i;
      const body = i === start ? '' : escapeHtml(lines.slice(start,i).join('\n'))+'\n';
      html += '<pre><code'+(lang ? ' class="language-'+lang+'"' : '')+'>'+body+'</code></pre>\n';
      ++i;
    } else if (first === '#' && (parts = headingParts(line))) {
      const level = parts[1].length, content = parts[2];
      const id = uniqueSlug(slugify(content),ids ??= new Set());
      const body = inline(content,env);
      html += '<h'+level+' id="'+id+'">'+body+'</h'+level+'>\n';
      if (level === 2 || level === 3) toc.push({level,id,html:body});
    } else if ((first === '-' || first === '*') && rule.test(line)) {
      html += '<hr>\n';
    } else if (first === '>') {
      let body = '', current = line;
      for (;;) {
        const fragment = trim(current.slice(current[1] === ' ' ? 2 : 1));
        if (fragment !== '') body += (body ? '\n' : '') + fragment;
        if (lines[i]?.[0] !== '>') break;
        current = lines[i++];
      }
      html += '<blockquote>\n'+(body ? '<p>'+inline(body,env)+'</p>\n' : '')+'</blockquote>\n';
    } else {
      const list = first === '-' || first === '*' ? bullet : first >= '0' && first <= '9' ? numbered : null;
      if (list && (parts = list.exec(line))) {
        const order = list === numbered;
        const tag = order ? 'ol' : 'ul';
        const start = order ? +parts[1] : 1;
        const key = order ? 2 : 1;
        html += '<'+tag+(start === 1 ? '' : ' start="'+start+'"')+'>\n';
        let item = trim(parts[key]);
        while (i < n) {
          const line = lines[i];
          const next = list.exec(line);
          if (next) {
            html += '<li>'+inline(item,env)+'</li>\n';
            item = trim(next[key]);
          } else if (line[0] === ' ' && continuation.test(line)) {
            item += '\n'+trim(line);
          } else break;
          ++i;
        }
        html += '<li>'+inline(item,env)+'</li>\n</'+tag+'>\n';
      } else {
        let paragraph = trim(line);
        while (i < n && !paragraphBreak(lines[i])) paragraph += '\n'+trim(lines[i++]);
        const body = inline(paragraph,env);
        excerpt ??= body;
        html += '<p>'+body+'</p>\n';
      }
    }
  }
  return {html,toc,excerpt:excerpt ?? ''};
}
