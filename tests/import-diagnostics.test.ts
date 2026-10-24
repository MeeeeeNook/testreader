import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listeningImportIssues} from '../src/services/listening';
import {importTestLabel} from '../src/services/importProgress';
const testFile:any={id:'test-id',title:'Cambridge 19 Test 2',skill:'listening',status:'published',folderPath:'Cambridge / 19',source:'Cambridge',parts:[{id:'p0',title:'Interview',audio:'https://media/audio.mp3',audioName:'part1.mp3'},{id:'p1',title:'Museum tour',audio:''},{id:'p2',title:'Student discussion',audio:'https://media/two.mp3',audioName:'part3.mp3',audioStart:120,audioEnd:60}]};
test('Listening validation names the exact missing/invalid parts and recording with an actionable fix',()=>{
 const issues=listeningImportIssues(testFile);assert.equal(issues.length,2);assert.match(issues[0],/Part 2 \(Museum tour\).*no recording assigned.*preview/);assert.match(issues[1],/Part 3 \(Student discussion\).*part3.mp3.*60s.*120s/);
 assert.equal(listeningImportIssues({...testFile,status:'draft'}).length,0);assert.equal(listeningImportIssues({...testFile,skill:'reading'}).length,0);
});
test('error context preserves the human test title, destination, archive path and test ID',()=>{
 const label=importTestLabel({name:'random-zip.zip/page.html',test:testFile});assert.match(label,/Test: Cambridge 19 Test 2/);assert.match(label,/Folder: Cambridge \/ 19/);assert.match(label,/Source file: random-zip.zip\/page.html/);assert.match(label,/Test ID: test-id/);
});
