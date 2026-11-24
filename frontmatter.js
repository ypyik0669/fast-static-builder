// Parse only the header region, leaving Markdown untouched and unsplit.
const keys=new Set(['title','summary','tags','date','draft','layout','slug']);
function fail(error){return {error};}
function readString(raw,k){
 if(raw[0]==='[')return fail('key "'+k+'": a bare string opens on [');
 if(raw[0]!=='"')return {value:raw};
 if(raw.length<2||raw.at(-1)!=='"')return fail('key "'+k+'": a quoted string is not closed');
 let out='',start=1;
 for(let i=1;i<raw.length-1;i++){
  if(raw[i]==='"')return fail('key "'+k+'": a quoted string holds a stray quote');
  if(raw[i]==='\\'){
   const next=raw[i+1];
   if(i+1===raw.length-1||(next!=='"'&&next!=='\\'))return fail('key "'+k+'": a quoted string holds an escape other than \\" or \\\\');
   out+=raw.slice(start,i)+next;start=i+2;i++;
  }
 }
 return {value:out+raw.slice(start,-1)};
}
function parseValue(k,v){
 if(k==='title'||k==='summary')return readString(v,k);
 if(k==='draft')return v==='true'?{value:true}:v==='false'?{value:false}:fail('key "draft": true or false');
 if(k==='layout')return /^[a-z0-9-]+$/.test(v)?{value:v}:fail('key "layout": not a template name');
 if(k==='slug')return v.length<=64&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)?{value:v}:fail('key "slug": not a slug');
 if(k==='tags'){
  if(v[0]!=='['||v.at(-1)!==']')return fail('key "tags": not a list [a, b]');
  const inside=v.slice(1,-1);if(!inside.trim())return {value:[]};
  const items=inside.split(',');for(let i=0;i<items.length;i++){items[i]=items[i].trim();if(!items[i]||/["\[\]]/.test(items[i]))return fail('key "tags": an empty tag, or one holding " [ or ]');}
  return {value:items};
 }
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);let valid=false;
 if(match){const y=+match[1],m=+match[2],d=+match[3];const limit=m===2?((y%4===0&&y%100!==0)||y%400===0?29:28):([4,6,9,11].includes(m)?30:31);valid=y>=1970&&y<=2099&&m>=1&&m<=12&&d>=1&&d<=limit;}
 return valid?{value:v}:fail('key "date": not a date from 1970-01-01 to 2099-12-31 (YYYY-MM-DD)');
}
export function parseFrontMatter(text){
 if(text!=='---'&&!text.startsWith('---\n'))return fail('no front matter');
 // Establish the closing delimiter before validating fields, matching error priority.
 let pos=4,end=-1,after=text.length;const lines=[];
 while(pos<=text.length){let next=text.indexOf('\n',pos);if(next<0)next=text.length;let line=text.slice(pos,next);if(line==='---'){end=pos;after=next<text.length?next+1:next;break;}lines.push(line);if(next===text.length)break;pos=next+1;}
 if(end<0)return fail('the front matter is not closed');
 const data={};
 for(let i=0;i<lines.length;i++){
  const line=lines[i];if(line[0]==='#'||/^[ \t]*$/.test(line))continue;
  const m=/^([a-z_]+):(?: (.*))?$/.exec(line);if(!m)return fail('line '+(i+2)+' is not "key: value"');
  const k=m[1];if(!keys.has(k))return fail('unknown key "'+k+'"');if(Object.hasOwn(data,k))return fail('key "'+k+'" is given twice');
  const v=(m[2]??'').replace(/[ \t]+$/,'');if(!v)return fail('key "'+k+'" has no value');
  const result=parseValue(k,v);if(result.error)return result;data[k]=result.value;
 }
 if(!Object.hasOwn(data,'title'))return fail('no title');
 return {data,body:text.slice(after)};
}
