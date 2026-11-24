import {parseFrontMatter} from './frontmatter.js';
import {renderMarkdown} from './markdown.js';
import {compileTemplates} from './template.js';
import {slugify,uniqueSlug,longDate,resetTextCache} from './text.js';
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const folder=p=>p.slice(0,Math.max(0,p.lastIndexOf('/')));
export function run(input){
 resetTextCache();
 const engine=compileTemplates(input.templates),report=engine.errors.slice(),base=input.site.base_url.replace(/\/+$/,''),sources=[],statics=[],byPath=new Map(),directories=new Map();
 const ordered=input.files.slice().sort((a,b)=>cmp(a.path,b.path));
 for(const f of ordered){
  if(!f.path.endsWith('.md')){statics.push(f);continue;}
  const parsed=parseFrontMatter(f.content.replace(/\r\n?/g,'\n'));
  let reason=parsed.error;const data=parsed.data,post=f.path.startsWith('posts/');let layout;
  if(!reason){
   if(f.path.startsWith('tags/'))reason="tags/ is the generator's own";
   else if(f.path.startsWith('page/'))reason="page/ is the generator's own";
   else if(post&&!Object.hasOwn(data,'date'))reason='a post needs a date';
   else {layout=data.layout??(post?'post':'page');if(!engine.has(layout))reason='layout "'+layout+'" is no template that parses';}
  }
  if(reason){report.push('refused '+f.path+': '+reason);continue;}
  if(data.draft===true){report.push('draft '+f.path);continue;}
  const dir=post?'posts':folder(f.path);let taken=directories.get(dir);
  if(!taken){taken=new Set(dir===''?['posts','tags','page']:[]);directories.set(dir,taken);}
  const slug=uniqueSlug(data.slug??slugify(data.title),taken),outDir=dir?dir+'/'+slug:slug;
  const s={path:f.path,data,post,layout,body:parsed.body,slug,outDir,url:base+'/'+outDir+'/',tagRefs:null,card:null};
  sources.push(s);byPath.set(f.path,s);
 }
 const staticPaths=new Set(statics.map(f=>f.path)),broken=new Set(),linkCaches=new Map();
 for(const s of sources){
  const dir=folder(s.path);let cache=linkCaches.get(dir);if(!cache){cache=new Map();linkCaches.set(dir,cache);}
  const env={link(target){
   if(/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)||target[0]==='/'||target[0]==='#')return target;
   let found=cache.get(target);
   if(!found){
    const hash=target.indexOf('#'),rel=hash<0?target:target.slice(0,hash),frag=hash<0?'':target.slice(hash);let path=null;
    if(rel){const segments=dir?dir.split('/'):[];let valid=true;for(const part of rel.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!segments.length){valid=false;break;}segments.pop();}else segments.push(part);}if(valid)path=segments.join('/');}
    const source=path===null?undefined:byPath.get(path);
    found=source?[source.url+frag,false]:path!==null&&staticPaths.has(path)?[base+'/'+path+frag,false]:[target,true];cache.set(target,found);
   }
   if(found[1])broken.add('broken-link '+s.path+' -> '+target);return found[0];
  }};
  s.md=renderMarkdown(s.body,env);
 }
 const posts=sources.filter(s=>s.post).sort((a,b)=>cmp(b.data.date,a.data.date)||cmp(a.slug,b.slug));
 const tagMap=new Map();
 function attachTags(s,isPost){
  const refs=[],seen=new Set();for(const name of s.data.tags??[]){const slug=slugify(name);if(seen.has(slug))continue;seen.add(slug);let tag=tagMap.get(slug);if(!tag){tag={name,slug,url:isPost?base+'/tags/'+slug+'/':'',posts:[]};if(isPost)tagMap.set(slug,tag);}if(isPost)tag.posts.push(s);refs.push(tag);}s.tagRefs=refs;
 }
 for(const p of posts)attachTags(p,true);
 for(const s of sources)if(!s.post)attachTags(s,false);
 const tags=Array.from(tagMap.values()).sort((a,b)=>b.posts.length-a.posts.length||cmp(a.slug,b.slug));
 const dates=new Map();function dateText(d){if(d===undefined)return '';let v=dates.get(d);if(v===undefined){v=longDate(d);dates.set(d,v);}return v;}
 for(const s of sources){s.card={title:s.data.title,url:s.url,date:s.data.date??'',date_long:dateText(s.data.date),summary:s.data.summary??'',excerpt:s.md.excerpt,reading_minutes:Math.max(1,Math.ceil((s.body.match(/\S+/g)?.length??0)/200)),tags:s.tagRefs.map(t=>({name:t.name,slug:t.slug,url:t.url}))};}
 const short=s=>s?{title:s.card.title,url:s.url,date:s.card.date,date_long:s.card.date_long}:null;
 for(let i=0;i<posts.length;i++){posts[i].newer=short(posts[i-1]);posts[i].older=short(posts[i+1]);}
 const shared={site:{title:input.site.title,base_url:base},tags:tags.map(t=>({name:t.name,slug:t.slug,url:t.url,count:t.posts.length})),recent:posts.slice(0,input.site.recent).map(p=>p.card)};
 const output={};
 for(const s of sources){const page={...s.card,slug:s.slug,content:s.md.html,toc:s.md.toc.map(h=>({level:h.level,id:h.id,html:h.html})),newer:s.newer??null,older:s.older??null,is_post:s.post};output[s.outDir+'/index.html']=engine.render(s.layout,{...shared,page},shared);}
 const per=input.site.per_page,count=Math.max(1,Math.ceil(posts.length/per));
 const indexUrl=k=>k===1?base+'/':base+'/page/'+k+'/';
 for(let i=1;i<=count;i++){
  const vars={...shared,posts:posts.slice((i-1)*per,i*per).map(p=>p.card),pager:{number:i,total:count,url:indexUrl(i),newer_url:i===1?'':indexUrl(i-1),older_url:i===count?'':indexUrl(i+1)}};
  const value=engine.render('index',vars,shared);if(value!==null)output[i===1?'index.html':'page/'+i+'/index.html']=value;
 }
 for(const t of tags){const tag={name:t.name,slug:t.slug,url:t.url,count:t.posts.length,posts:t.posts.map(p=>p.card)};const html=engine.render('tag',{...shared,tag},shared);if(html!==null)output['tags/'+t.slug+'/index.html']=html;}
 const all=engine.render('tags',shared,shared);if(all!==null)output['tags/index.html']=all;
 for(const f of statics){if(Object.hasOwn(output,f.path))report.push('shadowed '+f.path+': a built page has its path');else output[f.path]=f.content;}
 for(const line of broken)report.push(line);report.sort(cmp);
 report.push('built '+(sources.length-posts.length)+' pages, '+posts.length+' posts, '+tags.length+' tags and '+statics.length+' static files');output['build-report.txt']=report.join('\n')+'\n';
 return output;
}
