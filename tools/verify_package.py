"""Offline package checks. Not an application test suite or full OpenAPI validator."""
from pathlib import Path
import json,re,csv,hashlib,math
from decimal import Decimal,ROUND_HALF_UP
R=Path(__file__).resolve().parents[1]
checks=[]
def check(name,condition):
 checks.append({'check':name,'passed':bool(condition)})
 if not condition:raise AssertionError(name)
schema=json.loads((R/'schemas/domain.schema.json').read_text())
def resolve(ref):
 assert ref.startswith('#/')
 cur=schema
 for part in ref[2:].split('/'):cur=cur[part.replace('~1','/').replace('~0','~')]
 return cur
# Implements only the keywords actually used by this package, not a general JSON Schema implementation.
def validate(value,s,path='$'):
 if '$ref' in s:return validate(value,resolve(s['$ref']),path)
 if 'anyOf' in s:
  for choice in s['anyOf']:
   try:validate(value,choice,path);return
   except (AssertionError,TypeError):pass
  raise AssertionError(path+' anyOf')
 t=s.get('type')
 ok={'object':isinstance(value,dict),'array':isinstance(value,list),'string':isinstance(value,str),'integer':isinstance(value,int) and not isinstance(value,bool),'number':isinstance(value,(int,float)) and not isinstance(value,bool),'boolean':isinstance(value,bool),'null':value is None}
 if t:assert ok[t],path+' type '+t
 if 'enum'in s:assert value in s['enum'],path+' enum'
 if isinstance(value,dict):
  for k in s.get('required',[]):assert k in value,path+' missing '+k
  if s.get('additionalProperties') is False:assert not set(value)-set(s.get('properties',{})),path+' additional property'
  for k,v in value.items():
   if k in s.get('properties',{}):validate(v,s['properties'][k],path+'.'+k)
 if isinstance(value,list):
  assert len(value)>=s.get('minItems',0),path+' minItems'
  for i,v in enumerate(value):validate(v,s['items'],path+f'[{i}]')
 if isinstance(value,str):
  assert len(value)>=s.get('minLength',0),path+' minLength'
  if s.get('format')=='uri':assert re.match(r'^https?://[^ /]+',value),path+' uri'
  if s.get('format')=='date-time':
   from datetime import datetime
   datetime.fromisoformat(value.replace('Z','+00:00'))
 if isinstance(value,(int,float)) and not isinstance(value,bool):
  assert math.isfinite(value),path+' finite'
  if 'minimum'in s:assert value>=s['minimum'],path+' minimum'
  if 'maximum'in s:assert value<=s['maximum'],path+' maximum'
  if 'exclusiveMinimum'in s:assert value>s['exclusiveMinimum'],path+' exclusiveMinimum'
for p in R.rglob('*.json'):json.loads(p.read_text())
check('all JSON parse',True)
for p in R.rglob('*.jsonl'):
 for line in p.read_text().splitlines():json.loads(line)
check('all JSONL parse',True)
example_map={'roles.json':'Role','skills.json':'Skill','source.json':'Source','criterion.json':'Criterion','profile.json':'Profile','job.json':'Job','match.json':'Match','public_question.json':'PublicQuestion','assessment.json':'Assessment','assessment_result.json':'AssessmentResult','grade_profile.json':'GradeProfile','grade_result.json':'GradeResult','explanation.json':'Explanation','salary_stats.json':'SalaryStats','market.json':'Market'}
for fn,typ in example_map.items():
 data=json.loads((R/'examples'/fn).read_text())
 for v in (data if isinstance(data,list) else [data]):validate(v,schema['$defs'][typ])
check('examples match used schema subset',True)
# Negative case proves PublicQuestion rejects leaked answer keys.
q=json.loads((R/'examples/public_question.json').read_text());q['answer_key']='a'
try:validate(q,schema['$defs']['PublicQuestion']);negative=False
except AssertionError:negative=True
check('public question rejects answer_key',negative)
fx=json.loads((R/'examples/match_calculation.json').read_text())
w=list(map(Decimal,map(str,fx['weights'])));s=list(map(Decimal,map(str,fx['self_credit'])));v=list(map(Decimal,map(str,fx['verified_credit'])));r=list(map(Decimal,map(str,fx['expected_credit'])))
p=sum(a*min(Decimal(1),max(b,c)/d) for a,b,c,d in zip(w,s,v,r))/sum(w)*100
c=sum(a*min(Decimal(1),b/d) for a,b,d in zip(w,v,r))/sum(w)*100
check('score raw 62.5 and 45',p==Decimal('62.5') and c==45)
check('score display 63 and 45',int(p.quantize(Decimal('1'),rounding=ROUND_HALF_UP))==63 and int(c)==45)
check('score invariant',0<=c<=p<=100)
# Local Markdown links are checked; external URLs are not fetched here.
broken=[]
for md in R.rglob('*.md'):
 for target in re.findall(r'\]\(([^)]+)\)',md.read_text()):
  if target.startswith(('http:','https:','#','mailto:')):continue
  target=target.split('#')[0]
  if target and not (md.parent/target).exists():broken.append(str(md.relative_to(R))+': '+target)
check('local Markdown links resolve',not broken)
with (R/'quality/traceability.csv').open(encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
check('FR01-FR16 traceability',set(f'FR{i:02d}'for i in range(1,17))<=set(x['requirement_id']for x in rows))
check('all FR rows have features and tests',all(x['feature'] and x['tests'] for x in rows if x['requirement_id'].startswith('FR')))
for feature in (R/'specs').iterdir():
 if feature.is_dir():
  for fn in ['spec.md','plan.md','tasks.md']:check(str(feature.relative_to(R))+'/'+fn,(feature/fn).stat().st_size>100)
check('all seven screen files',len(list((R/'design/screens').glob('*.png')))==7)
for p in (R/'design/screens').glob('*.png'):
 data=p.read_bytes();check(p.name+' signature',data[:8]==b'\x89PNG\r\n\x1a\n')
 width=int.from_bytes(data[16:20],'big');height=int.from_bytes(data[20:24],'big');check(p.name+' dimensions',width==1536 and height==1024)
report={'checked_at':'2026-10-16','scope':'Documentation, fixtures and PNG package only','checks':checks,'limits':['JSON Schema validation implements only keywords used here, not a certified full validator','OpenAPI is structurally checked separately; no running API tests','No application was built, deployed or load-tested','No RAG retrieval or model quality benchmark was executed','External data corpora were not fully imported'],'status':'passed'}
(R/'quality/validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'checks':len(checks),'status':'passed'},ensure_ascii=False))
