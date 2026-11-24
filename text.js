// Original implementation of the challenge's documented text primitives.
const entities = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const htmlSpecial = /[&<>"']/g;
export function escapeHtml(s) { return s.replace(htmlSpecial, c => entities[c]); }
let slugCache = new Map();
export function resetTextCache(){slugCache=new Map();}
export function slugify(s) {
  let v=slugCache.get(s); if(v!==undefined)return v;
  const normalized=/[^\x00-\x7f]/.test(s)?s.normalize('NFKD').replace(/\p{M}/gu,''):s;
  v=normalized.replace(/[A-Z]/g,c=>c.toLowerCase()).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64).replace(/-+$/,'')||'untitled';
  slugCache.set(s,v);return v;
}
export function uniqueSlug(s,used){let candidate=s,n=2;while(used.has(candidate))candidate=s+'-'+n++;used.add(candidate);return candidate;}
const months='January February March April May June July August September October November December'.split(' ');
export function longDate(s){return (+s.slice(8))+' '+months[+s.slice(5,7)-1]+' '+s.slice(0,4);}
