const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript');
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const file={};new Function('exports',compile(require.resolve('../lib/googleDriveFile.ts')))(file);

test('embed metadata strips tokens, clamps heights, rejects arbitrary iframe hosts',()=>{
 const selected=file.normalizeDriveFile({id:'abc_123',name:'Brief',mimeType:'application/vnd.google-apps.document',access_token:'secret',height:9999,resourceKey:'safe-key'});
 assert.equal(selected.access_token,undefined);assert.equal(selected.height,1200);
 assert.deepEqual(file.driveFileUrls(selected),{embed:'https://docs.google.com/document/d/abc_123/preview?resourcekey=safe-key',original:'https://docs.google.com/document/d/abc_123/edit?resourcekey=safe-key'});
 assert.throws(()=>file.normalizeDriveFile({id:'../../evil',mimeType:'application/pdf'}));
 assert.throws(()=>file.normalizeDriveFile({id:'abc',mimeType:'text/html'}));
 for(const mimeType of Object.keys(file.DRIVE_MIME_TYPES))assert.match(file.driveFileUrls({id:'abc',name:'Doc',mimeType}).embed,/^https:\/\/(docs|drive)\.google\.com\//);
});
function pickerFixture({denied=false,popup=false}={}) {
 let config,callback,picked,finished,disposed=false,request,builder={};
 class View {setIncludeFolders(){return this;}setSelectFolderEnabled(){return this;}setMimeTypes(value){builder.mime=value;return this;}}
 class Builder {
  addView(){return this;}setTitle(){return this;}setOAuthToken(token){builder.token=token;return this;}
  setDeveloperKey(){return this;}setAppId(id){builder.app=id;return this;}setOrigin(origin){builder.origin=origin;return this;}
  setCallback(fn){callback=fn;return this;}build(){return {setVisible(){},dispose(){disposed=true;}};}
 }
 const google={accounts:{oauth2:{initTokenClient(c){config=c;return {requestAccessToken(options){request=options;if(popup)c.error_callback({type:'popup_closed'});else c.callback(denied?{error:'access_denied'}:{access_token:'ephemeral',scope:'drive.file'});}};},hasGrantedAllScopes(){return true;}}},picker:{DocsView:View,PickerBuilder:Builder,ViewId:{DOCS:'docs'},Action:{PICKED:'picked',CANCEL:'cancel'}}};
 const exports={};new Function('require','exports','process','google','window',compile(require.resolve('../lib/googleDrivePicker.ts')))(()=>file,exports,{env:{NEXT_PUBLIC_GOOGLE_CLIENT_ID:'client',NEXT_PUBLIC_GOOGLE_PICKER_API_KEY:'key',NEXT_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER:'123'}},google,{location:{origin:'https://app.example'}});
 const cancel=exports.pickDriveFile(value=>picked=value,error=>finished=error||'done');
 return {event:value=>callback(value),cancel,get state(){return {config,picked,finished,disposed,request,builder};}};
}
test('picker uses selected-file scope and passes only file metadata to the block',()=>{
 const fixture=pickerFixture();fixture.event({action:'picked',docs:[{id:'file1',name:'Brief',mimeType:'application/vnd.google-apps.document',resourceKey:'key1'}]});
 const s=fixture.state;assert.equal(s.config.scope,'https://www.googleapis.com/auth/drive.file');assert.equal(s.config.include_granted_scopes,false);
 assert.equal(s.builder.app,'123');assert.equal(s.builder.origin,'https://app.example');assert.equal(s.picked.resourceKey,'key1');assert.equal(s.finished,'done');assert.equal(s.disposed,true);assert.equal(s.picked.access_token,undefined);
});
test('cancel, denied consent, popup close and unmount do not select a document',()=>{
 const cancelled=pickerFixture();cancelled.event({action:'cancel'});assert.equal(cancelled.state.picked,undefined);assert.equal(cancelled.state.finished,'done');
 for(const options of [{denied:true},{popup:true}]){const f=pickerFixture(options);assert.ok(f.state.finished instanceof Error);assert.equal(f.state.picked,undefined);}
 const disposed=pickerFixture();disposed.cancel();disposed.event({action:'picked',docs:[{id:'abc',name:'File',mimeType:'application/pdf'}]});assert.equal(disposed.state.picked,undefined);
});
