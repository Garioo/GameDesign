const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const out=ts.transpileModule(fs.readFileSync(require.resolve('../lib/documentLinks.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const result={exports:{}};new Function('exports',out)(result.exports);
const {documentUrl,documentProvider,validateDocumentLinks}=result.exports;
test('shared Google document URLs preserve access parameters and identify providers',()=>{
 const url='https://docs.google.com/document/d/abc/edit?resourcekey=key#heading=h1';
 assert.equal(documentUrl(' '+url+' '),url);
 assert.equal(documentProvider(url),'Google Docs');
 assert.equal(documentProvider('https://docs.google.com/spreadsheets/d/abc/edit'),'Google Sheets');
 assert.equal(documentProvider('https://docs.google.com/presentation/d/abc/edit'),'Google Slides');
 assert.equal(documentProvider('https://drive.google.com/file/d/abc/view'),'Google Drive');
 assert.equal(documentProvider('https://docs.google.com.evil.example/document/d/abc'),'docs.google.com.evil.example');
});
test('unsafe protocols, credential-bearing URLs and oversized URLs are rejected',()=>{
 for(const url of ['javascript:alert(1)','data:text/html,test','file:///tmp/file','http://example.com','https://user:pass@example.com','not a URL','https://example.com/'+ 'a'.repeat(2050)])assert.throws(()=>documentUrl(url));
});
test('names are bounded and unnamed links receive a useful provider label',()=>{
 assert.equal(validateDocumentLinks([{id:'a',title:'',url:'https://docs.google.com/document/d/abc'}])[0].title,'Google Docs');
 assert.equal(validateDocumentLinks([{id:'a',title:'a'.repeat(200),url:'https://example.com'}])[0].title.length,160);
});
