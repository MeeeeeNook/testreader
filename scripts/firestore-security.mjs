import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {cert} from 'firebase-admin/app';

export function securityTestSuite(database){
 const base=`/databases/${database}/documents`,student={uid:'audit-student',token:{email:'student@example.test',email_verified:true}},owner={uid:'audit-owner',token:{email:'manhcuong2006ht@gmail.com',email_verified:true}};
 const tests=[];
 const add=(expectation,method,path,auth=null,extras={})=>tests.push({expectation,request:{method,path:base+path,auth,...extras.request},...Object.fromEntries(Object.entries(extras).filter(([key])=>key!=='request'))});
 const parent=(data)=>[{function:'get',args:[{exactValue:base+'/tests/audit-test'}],result:{value:{data}}}];
 for(const method of ['get','list']){
  add('ALLOW',method,'/tests/audit-test/sections/p1',null,{functionMocks:parent({status:'published'})});
  add('DENY',method,'/tests/audit-test/sections/p1',null,{functionMocks:parent({status:'draft'})});
  add('DENY',method,'/tests/audit-test/sections/p1',student,{functionMocks:parent({status:'published',deletedAt:123})});
  add('ALLOW',method,'/tests/audit-test/sections/p1',owner,{functionMocks:parent({status:'draft'})});
 }
 add('DENY','get','/tests/missing/sections/p1');
 add('DENY','get','/users/another-student',student);
 add('DENY','list','/users',student);
 add('ALLOW','get','/users/audit-student',student);
 add('DENY','create','/reports/spam',student,{request:{resource:{data:{owner:'audit-student',testId:'audit-test',message:'Spam',status:'open'}}}});
 add('DENY','get','/test_keys/audit-test',student);
 add('ALLOW','get','/test_keys/audit-test',owner);
 for(const auth of [null,student,owner])for(const method of ['create','update'])add('DENY',method,'/users/audit-student/attempts/forged',auth,{request:{resource:{data:{owner:'audit-student',result:{correct:40},band:9,serverVerified:true}}}});
 add('DENY','create','/teachers/audit-student',student,{request:{resource:{data:{active:true}}}});
 const profile={id:'audit-student',email:'student@example.test',name:'Learner',status:'active'};
 add('ALLOW','create','/users/audit-student',student,{request:{resource:{data:profile}}});
 for(const patch of [{role:'admin'},{name:12},{name:'x'.repeat(201)},{status:'suspended'},{email:'owner@example.test'}])add('DENY','create','/users/audit-student',student,{request:{resource:{data:{...profile,...patch}}}});
 add('DENY','update','/users/audit-student',student,{resource:{data:profile},request:{resource:{data:{...profile,role:'admin'}}}});
 add('ALLOW','update','/users/audit-student',student,{resource:{data:profile},request:{resource:{data:{...profile,name:'New name'}}}});
 return {testCases:tests};
}
export async function runSecurityRules({env=process.env,fetcher=fetch,log=console.log}={}){
 if(!env.VERCEL_ENV){log('Security rules: local build, no remote changes.');return;}
 const config=JSON.parse(await readFile(new URL('../firebase-applet-config.json',import.meta.url),'utf8'));
 const project=config.projectId,database=config.firestoreDatabaseId||'(default)';
 let raw=env.FIREBASE_SERVICE_ACCOUNT_JSON||env.FIREBASE_SERVICE_ACCOUNT||env.FIREBASE_SERVICE_ACCOUNT_BASE64;
 if(!raw)throw Error('FIREBASE_RULES_CREDENTIALS_MISSING: this deployment cannot validate or release security rules.');
 raw=raw.trim();if((raw.startsWith('"')&&raw.endsWith('"'))||(raw.startsWith("'")&&raw.endsWith("'")))raw=raw.slice(1,-1);
 if(!raw.startsWith('{'))raw=Buffer.from(raw,'base64').toString('utf8');
 const account=JSON.parse(raw);account.private_key=account.private_key?.replace(/\\n/g,'\n');
 if(account.project_id!==project)throw Error('FIREBASE_RULES_PROJECT_MISMATCH');
 const {access_token}=await cert(account).getAccessToken();
 const permissionHint=`Firebase Rules were NOT deployed. Grant roles/firebaserules.admin to ${account.client_email} in project ${project}, then redeploy production.`;
 const request=async(path,method='GET',body)=>{
  const response=await fetcher('https://firebaserules.googleapis.com/v1/'+path,{method,headers:{Authorization:'Bearer '+access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok){const error=new Error(`FIREBASE_RULES_HTTP_${response.status}: ${data.error?.message||'Rules management request failed.'}`);error.status=response.status;throw error;}return data;
 };
 const content=await readFile(new URL('../firestore.rules',import.meta.url),'utf8'),source={files:[{name:'firestore.rules',content}]};
 const suite=securityTestSuite(database);let validation;
 try{validation=await request(`projects/${project}:test`,'POST',{source,testSuite:suite});}
 catch(error){if(error.status===403){log(permissionHint);return {blocked:true,serviceAccount:account.client_email};}throw error;}
 const errors=(validation.issues||[]).filter(issue=>issue.severity==='ERROR');
 if(errors.length)throw Error('FIREBASE_RULES_INVALID: '+JSON.stringify(errors));
 const failed=(validation.testResults||[]).map((test,index)=>({index,state:test.state,errors:test.errorPosition||test.debugMessages})).filter(test=>test.state!=='SUCCESS');
 if(validation.testResults?.length!==suite.testCases.length||failed.length)throw Error('FIREBASE_RULES_TEST_FAILED: '+JSON.stringify(failed));
 log(`Security rules: ${suite.testCases.length} Firebase evaluation tests passed for ${database}.`);
 const releaseName=`projects/${project}/releases/cloud.firestore/${database}`;
 let current;try{current=await request(releaseName);}catch(e){if(e.status!==404)throw e;}
 if(env.VERCEL_ENV!=='production'){log('Security rules: preview validation only; production release unchanged.');return;}
 if(current?.rulesetName){const previous=await request(current.rulesetName);if(previous.source?.files?.[0]?.content===content){log('Security rules: production already matches the checked source.');return;}}
 const created=await request(`projects/${project}/rulesets`,'POST',{source,attachment_point:`firestore.googleapis.com/databases/${database}`});
 const release={name:releaseName,rulesetName:created.name};
 if(current)await request(releaseName,'PATCH',{release,updateMask:'rulesetName'});else await request(`projects/${project}/releases`,'POST',release);
 const verified=await request(releaseName);if(verified.rulesetName!==created.name)throw Error('FIREBASE_RULES_RELEASE_VERIFICATION_FAILED');
 log(JSON.stringify({securityRules:'released',database,ruleset:created.name,previousRuleset:current?.rulesetName||null,sha256:createHash('sha256').update(content).digest('hex')}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)runSecurityRules().catch(error=>{console.error(error.message);process.exitCode=1;});
