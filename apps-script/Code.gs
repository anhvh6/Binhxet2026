/* VCX 2026: Google Sheets is the authoritative store. Never edit runtime tabs while voting is open. */
var TABS = {
 config:['CAU HINH BINH CHON',['Khóa','Giá trị']],
 credentials:['MA BINH CHON',['STT','Mã bình chọn','Trạng thái','Ngày nộp','Ngày sửa']],
 ballots:['PHIEU BINH CHON',['Ballot ID','Election ID','Mã bình chọn','Trạng thái','Ngày nộp','Ngày sửa','Revision','Version','Lựa chọn JSON']],
 revisions:['PHIEN BAN PHIEU',['Ballot ID','Revision','Lựa chọn JSON','Thời gian']],
 details:['CHI TIET PHIEU',['Ballot ID','Mã bình chọn','Candidate MNV','Team','Ngày cập nhật']],
 results:['KET QUA LDTT',['MNV','Họ và tên','Team','Số bình chọn LĐTT','Tỷ lệ','Điểm TB 3 quý','KI','Sáng kiến','Khen thưởng']],
 teams:['KET QUA TEAM',['Team','Tổng số NV','Số người được chọn']],
 cstd:['KET QUA CSTĐ',['MNV','Họ và tên','Team','Điều kiện nguồn','Trạng thái CSTĐ']],
 audit:['NHAT KY HE THONG',['Thời gian','Actor','Sự kiện','Chi tiết']],
 sessions:['PHIEN DANG NHAP',['Token hash','Vai trò','Mã bình chọn','Hết hạn','Cho sửa đến','Dấu mã']],
 requests:['YEU CAU DA XU LY',['Mã bình chọn','Idempotency key','Digest','Response JSON']],
 limits:['GIOI HAN TRUY CAP',['Khóa','Số lần','Hết hạn']]
};
function props(){return PropertiesService.getScriptProperties();}
function book(){var id=props().getProperty('SPREADSHEET_ID');if(!id)fail('Chưa cấu hình SPREADSHEET_ID.',503);return SpreadsheetApp.openById(id);}
function fail(message,status){var e=new Error(message);e.status=status||400;throw e;}
function sha(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(value),Utilities.Charset.UTF_8).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function hmac(value){var s=props().getProperty('BRIDGE_SECRET');if(!s||s.length<32)fail('Chưa cấu hình BRIDGE_SECRET.',503);return Utilities.computeHmacSha256Signature(value,s).map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');}
function equal(a,b){a=String(a);b=String(b);var n=a.length^b.length;for(var i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
function doGet(){return ContentService.createTextOutput('VCX voting backend: POST signed requests only.');}
function doPost(e){
 var lock=LockService.getScriptLock();
 try{
  if(!e.postData||e.postData.contents.length>150000)fail('Yêu cầu không hợp lệ.',400);
  var req=JSON.parse(e.postData.contents);
  if(typeof req.payload!=='string'||!equal(hmac(req.payload),req.signature))fail('Không được phép.',401);
  var p=JSON.parse(req.payload);
  if(!Number.isFinite(p.timestamp)||Math.abs(Date.now()-p.timestamp)>120000)fail('Yêu cầu hết hạn.',401);
  if(!lock.tryLock(20000))fail('Hệ thống đang bận. Vui lòng thử lại.',503);
  var cache=CacheService.getScriptCache();if(cache.get('nonce:'+p.nonce))fail('Yêu cầu đã được xử lý.',409);
  cache.put('nonce:'+p.nonce,'1',180);
  return output({ok:true,data:dispatch(p.action,p.data||{})});
 }catch(error){return output({ok:false,error:error.status?error.message:'Không thể xử lý Google Sheets. Vui lòng thử lại.',status:error.status||503});}
 finally{if(lock.hasLock())lock.releaseLock();}
}
function output(value){return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function setup(){
 var ss=book(),lock=LockService.getScriptLock();lock.waitLock(20000);
 try{Object.keys(TABS).forEach(function(k){var spec=TABS[k],s=ss.getSheetByName(spec[0]);if(!s){s=ss.insertSheet(spec[0]);s.getRange(1,1,1,spec[1].length).setValues([spec[1]]);s.setFrozenRows(1);s.getRange(1,1,1,spec[1].length).setBackground('#10233f').setFontColor('#ffffff').setFontWeight('bold').setWrap(true);s.setColumnWidths(1,spec[1].length,180);s.setHiddenGridlines(true);}});SpreadsheetApp.flush();}
 finally{lock.releaseLock();}
}
function table(key){var s=book().getSheetByName(TABS[key][0]);if(!s)fail('Cần chạy hàm setup trong Apps Script.',503);return {sheet:s,rows:s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,TABS[key][1].length).getDisplayValues():[]};}
function credentials(){
 var s=book().getSheetByName(TABS.credentials[0]);if(!s)fail('Chưa có tab MA BINH CHON.',503);
 return {sheet:s,rows:s.getLastRow()>1?s.getRange(2,1,s.getLastRow()-1,5).getDisplayValues().filter(function(r){return r[1];}):[]};
}
function cells(rows){return rows.map(function(row){return {values:row.map(function(v){return {userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:String(v==null?'':v)}};})};});}
function replace(key,rows){var t=table(key),width=TABS[key][1].length,n=Math.max(rows.length,t.rows.length,1);return {updateCells:{range:{sheetId:t.sheet.getSheetId(),startRowIndex:1,endRowIndex:n+1,startColumnIndex:0,endColumnIndex:width},rows:cells(Array.from({length:n},function(_,i){return rows[i]||Array(width).fill('');})),fields:'userEnteredValue'}};}
function append(key,rows){return {appendCells:{sheetId:table(key).sheet.getSheetId(),rows:cells(rows),fields:'userEnteredValue'}};}
function writeRow(sheet,index,row){return {updateCells:{range:{sheetId:sheet.getSheetId(),startRowIndex:index+1,endRowIndex:index+2,startColumnIndex:0,endColumnIndex:row.length},rows:cells([row]),fields:'userEnteredValue'}};}
function commit(requests){
 var response=UrlFetchApp.fetch('https://sheets.googleapis.com/v4/spreadsheets/'+book().getId()+':batchUpdate',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},payload:JSON.stringify({requests:requests}),muteHttpExceptions:true});
 if(response.getResponseCode()>=300)fail('Không ghi được dữ liệu. Hãy thử lại với cùng yêu cầu.',503);
 SpreadsheetApp.flush();
}
function log(actor,event,details){return append('audit',[[new Date().toISOString(),actor,event,JSON.stringify(details||{})]]);}
function readSource(){
 var ss=book(),p=ss.getSheetByName('PTUD (2)').getRange('A1:BG200').getDisplayValues(),b=ss.getSheetByName('Binh xet').getRange('A1:BG200').getDisplayValues(),t=ss.getSheetByName('TONG HOP TEAM').getRange('A1:G30').getDisplayValues();
 return parseSource(p,b,t);
}
function parseSource(p,b,t){
 var conflicts=[],warnings=[],map={},official={},people=[];
 function personnel(r){return /^\d+$/.test(r[1])&&!!r[2];}
 p.filter(personnel).forEach(function(r){if(map[r[1]])conflicts.push('MNV trùng tại PTUD (2): '+r[1]);map[r[1]]=r;});
 var teams=t.filter(function(r){return /^[IVX]+$/.test(r[0])&&r[1];}).map(function(r,i){return {id:r[1],label:r[0],order:i,size:Number(r[2]),quota:Number(r[3]),lead:r[4]};});
 b.filter(personnel).forEach(function(r){
  var source=map[r[1]];if(official[r[1]])conflicts.push('MNV trùng ở Binh xet: '+r[1]);official[r[1]]=true;
  if(!source||!/^Đạt/.test(source[45])||!/Đủ chuẩn/.test(source[52]))conflicts.push('Không khớp điều kiện PTUD/Binh xet: '+r[1]);
  if(source&&source[38]!==r[38])conflicts.push('Không khớp team: '+r[1]);
  var score=Number(String(r[43]).replace(',','.'));if(!Number.isFinite(score))conflicts.push('Điểm không hợp lệ: '+r[1]);
  [43,44,45,46,47,49,52,56].forEach(function(i){if(/^#/.test(r[i]||''))conflicts.push('Lỗi trường nghiệp vụ: '+r[1]+' cột '+(i+1));});
  people.push({id:r[1],name:r[2].replace(/\s*\(Lead\)$/,''),team:r[38],lead:r[39]==='Lead'||/\(Lead\)$/.test(r[2]),score:score,ki:r[44],initiative:r[47],reward:r[56]||'',tenure:source?source[45]:'',performance:source?source[46]:'',other:source?source[49]:'',basis:source?source[52]:'',cstd:source?source[48]:''});
 });
 Object.keys(map).forEach(function(id){if(/^Đạt/.test(map[id][45])&&/Đủ chuẩn/.test(map[id][52])&&!official[id])conflicts.push('Thiếu ở Binh xet: '+id);});
 people.forEach(function(c){if(!teams.some(function(t){return t.id===c.team;}))conflicts.push('Team chưa có cấu hình: '+c.team);});
 teams.forEach(function(team){var members=people.filter(function(c){return c.team===team.id;}),leads=members.filter(function(c){return c.lead;});if(members.length!==team.size)conflicts.push('Quân số khác cấu hình: '+team.id);if(!Number.isInteger(team.quota)||team.quota!==Math.floor(members.length/2))conflicts.push('Chỉ tiêu khác FLOOR(quân số/2): '+team.id);if(leads.length!==1)warnings.push('Team '+team.id+': '+leads.length+' Lead được xác định.');if(leads.length===1&&team.lead!==leads[0].name)conflicts.push('Lead khác cấu hình: '+team.id);});
 var errors=0;p.forEach(function(r){r.forEach(function(v){if(/^#(ERROR|N\/A|REF|VALUE)/.test(v))errors++;});});if(errors)warnings.push('PTUD (2) có '+errors+' ô lỗi công thức ở dữ liệu nguồn; chưa sửa nguồn.');
 people.sort(function(a,b){return teams.findIndex(function(t){return t.id===a.team;})-teams.findIndex(function(t){return t.id===b.team;})||Number(b.lead)-Number(a.lead)||b.score-a.score||a.id.localeCompare(b.id);});
 return {candidates:people,teams:teams,warnings:warnings,conflicts:conflicts,fetchedAt:new Date().toISOString()};
}
function election(){
 var rows=table('config').rows,meta=rows.find(function(r){return r[0]==='election';});if(!meta)return null;
 var e=JSON.parse(meta[1]);
 e.snapshot={candidates:rows.filter(function(r){return r[0].indexOf('candidate:')===0;}).map(function(r){return JSON.parse(r[1]);}),teams:JSON.parse(rows.find(function(r){return r[0]==='teams';})[1]),warnings:e.warnings,conflicts:[],fetchedAt:e.fetchedAt};
 return e;
}
function ballotRows(){return table('ballots').rows.filter(function(r){return r[0];});}
function ballots(){return ballotRows().map(function(r){return {id:r[0],electionId:r[1],voterId:r[2],status:r[3],submittedAt:r[4],updatedAt:r[5],revision:Number(r[6]),version:Number(r[7]),choices:JSON.parse(r[8])};});}
function validate(snapshot,choices){
 if(!Array.isArray(choices)||choices.some(function(c){return typeof c!=='string';})||new Set(choices).size!==choices.length)fail('Danh sách lựa chọn không hợp lệ.');
 var map={};snapshot.candidates.forEach(function(c){map[c.id]=c;});choices.forEach(function(id){if(!map[id])fail('Ứng viên không thuộc phiên dữ liệu đã chốt.');});
 snapshot.teams.forEach(function(t){var count=choices.filter(function(id){return map[id].team===t.id;}).length;if(count!==t.quota)fail('Team '+t.id+': đã chọn '+count+'/'+t.quota+' người.');});return true;
}
function aggregate(snapshot,bs){
 var counts={};bs.forEach(function(b){b.choices.forEach(function(id){counts[id]=(counts[id]||0)+1;});});
 var results=snapshot.candidates.map(function(c){return Object.assign({},c,{votes:counts[c.id]||0,rate:bs.length?(counts[c.id]||0)/bs.length:0});}).sort(function(a,b){return b.votes-a.votes||b.rate-a.rate||b.score-a.score||a.id.localeCompare(b.id);});
 return {results:results,teams:snapshot.teams.map(function(t){return Object.assign({},t,{votes:results.filter(function(c){return c.team===t.id;}).reduce(function(n,c){return n+c.votes;},0)});}),submitted:bs.length,totalChoices:results.reduce(function(n,c){return n+c.votes;},0)};
}
function limited(key,max){var t=table('limits'),now=Date.now(),rows=t.rows.filter(function(r){return Number(r[2])>now;}),r=rows.find(function(r){return r[0]===key;});if(!r){r=[key,0,now+900000];rows.push(r);}r[1]=Number(r[1])+1;commit([replace('limits',rows)]);if(r[1]>max)fail('Không thể xác thực. Vui lòng thử lại sau.',429);}
function session(token,role){
 var rows=table('sessions').rows,s=rows.find(function(r){return equal(r[0],token||'')&&Number(r[3])>Date.now()&&r[1]===role;});
 if(!s)fail('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',401);
 if(role==='voter'){
  var c=credentials().rows.find(function(r){return r[1]===s[2];});
  if(!c||['Bị khóa','Đã thu hồi'].indexOf(c[2])>=0||!equal(sha(c[1]),s[5]))fail('Không thể xác thực. Vui lòng thử lại sau.',401);
 }
 return s;
}
function issueSession(p,role,code){
 var t=table('sessions'),rows=t.rows.filter(function(r){return Number(r[3])>Date.now();});
 rows.push([p.newTokenHash,role,code||'',Date.now()+(role==='admin'?1800000:3600000),'',code?sha(code):'']);
 return replace('sessions',rows);
}
function generateCodes(count){
 var set=new Set(),codes=[];
 while(codes.length<count){
  var num=Math.floor(Math.random()*10000);
  var str=('0000'+num).slice(-4);
  if(!set.has(str)){set.add(str);codes.push(str);}
 }
 return codes;
}
function resetSystem(forceGenerateCodes){
 setup();
 var source=readSource();
 if(source.conflicts.length)fail(source.conflicts.join('\n'),409);
 var cs=credentials(),codes=[];
 if(!forceGenerateCodes && cs.rows.length>=source.candidates.length){
  codes=cs.rows.slice(0,source.candidates.length).map(function(r,i){
   return [i+1,String(r[1]).padStart(4,'0'),'Chưa sử dụng','',''];
  });
 }else{
  var generated=generateCodes(source.candidates.length);
  codes=generated.map(function(c,i){
   return [i+1,c,'Chưa sử dụng','',''];
  });
 }
 var e={id:'vcx-2026',year:2026,status:'open',version:1,warnings:source.warnings,fetchedAt:source.fetchedAt,frozenAt:new Date().toISOString()};
 var configRows=[['election',JSON.stringify(e)],['teams',JSON.stringify(source.teams)]].concat(source.candidates.map(function(c){return ['candidate:'+c.id,JSON.stringify(c)];}));
 var emptyResults=source.candidates.map(function(c){return [c.id,c.name,c.team,0,0,c.score,c.ki,c.initiative,c.reward];});
 var emptyTeams=source.teams.map(function(t){return [t.id,t.size,0];});
 var emptyCstd=source.candidates.filter(function(c){return /CSTĐ/.test(c.basis);}).map(function(c){return [c.id,c.name,c.team,c.basis,'Chờ bỏ phiếu CSTĐ'];});
 commit([
  replace('config',configRows),
  replace('credentials',codes),
  replace('ballots',[]),
  replace('revisions',[]),
  replace('details',[]),
  replace('results',emptyResults),
  replace('teams',emptyTeams),
  replace('cstd',emptyCstd),
  replace('sessions',[]),
  replace('requests',[]),
  replace('limits',[]),
  log('admin','SYSTEM_RESET',{codesCount:codes.length,candidatesCount:source.candidates.length})
 ]);
 return {ok:true,message:'Đã khôi phục hoàn toàn dữ liệu về mặc định.',totalCodes:codes.length};
}
function requireElection(){
 var e=election();
 if(!e){
  // Tự động khởi tạo nếu chưa có cấu hình để tránh chặn người dùng
  resetSystem(false);
  e=election();
  if(!e)fail('Đợt bình chọn chưa được chốt dữ liệu.',409);
 }
 return e;
}
function mirrors(e,bs){
 var a=aggregate(e.snapshot,bs),candidateMap={};
 e.snapshot.candidates.forEach(function(c){candidateMap[c.id]=c;});
 return [
  replace('details',bs.flatMap(function(b){return b.choices.map(function(id){return [b.id,b.voterId,id,candidateMap[id].team,b.updatedAt];});})),
  replace('results',a.results.map(function(c){return [c.id,c.name,c.team,c.votes,c.rate,c.score,c.ki,c.initiative,c.reward];})),
  replace('teams',a.teams.map(function(t){return [t.id,t.size,t.votes];}))
 ];
}
function dispatch(action,p){
 if(action==='progress'){
  var e=election();
  if(!e){
   try{resetSystem(false);e=election();}catch(_){}
  }
  var total=e?e.snapshot.candidates.length:0,submitted=e?ballots().length:0;
  return {ready:!!e,status:e?e.status:'setup',total:total,submitted:submitted,quota:e?e.snapshot.teams.reduce(function(n,t){return n+t.quota;},0):0};
 }
 if(action==='login'){
  limited('ip:'+p.ipHash,30);limited('code:'+hmac(p.code||''),12);
  if(!/^\d{4}$/.test(p.code||''))fail('Mã bí mật phải gồm đúng 4 chữ số.',401);
  var e=requireElection(),cs=credentials(),matches=cs.rows.filter(function(r){return equal(r[1],p.code);});
  if(matches.length!==1||['Bị khóa','Đã thu hồi'].indexOf(matches[0][2])>=0) {
   commit([log('anonymous','VOTER_LOGIN_FAILED')]);
   fail('Không thể xác thực mã bí mật. Vui lòng kiểm tra lại.',401);
  }
  var c=matches[0];
  var b=ballots().find(function(b){return b.voterId===p.code;});
  var changes=[issueSession(p,'voter',p.code),log(p.code,'VOTER_LOGIN')];
  if(!b&&c[2]==='Chưa sử dụng'){
   c[2]='Đang thao tác';
   changes.push(writeRow(cs.sheet,cs.rows.indexOf(c),c));
  }
  commit(changes);
  return {voterId:p.code,code:p.code,ballot:b||null,election:e};
 }
 if(action==='reviewCode'){
  if(!/^\d{4}$/.test(p.code||''))fail('Mã bí mật phải gồm đúng 4 chữ số.',401);
  var e=requireElection(),cs=credentials(),matches=cs.rows.filter(function(r){return equal(r[1],p.code);});
  if(matches.length!==1)fail('Mã bí mật không tồn tại trong hệ thống.',404);
  var b=ballots().find(function(b){return b.voterId===p.code;});
  if(!b)fail('Mã '+p.code+' chưa nộp phiếu bình chọn.',404);
  return {code:p.code,ballot:b,election:e};
 }
 if(action==='adminLogin'){
  limited('admin:'+p.ipHash,20);
  if(!p.verified)fail('Không thể xác thực mã quản trị.',401);
  commit([issueSession(p,'admin'),log('admin','ADMIN_LOGIN')]);
  return {ok:true};
 }
 if(action==='logout'){
  var sessions=table('sessions').rows.filter(function(r){return r[0]!==p.tokenHash&&Number(r[3])>Date.now();});
  commit([replace('sessions',sessions)]);
  return {ok:true};
 }
 if(action==='me'){
  var s=session(p.tokenHash,'voter'),e=requireElection();
  return {voterId:s[2],code:s[2],ballot:ballots().find(function(b){return b.voterId===s[2];})||null,election:e,canEdit:Number(s[4])>Date.now()};
 }
 if(action==='unlock'){
  var s=session(p.tokenHash,'voter');
  limited('edit:'+s[2],10);
  if(!p.verified)fail('Mã xác nhận sửa không hợp lệ (mã là 2405).',401);
  var t=table('sessions'),index=t.rows.findIndex(function(r){return r[0]===s[0];});
  s[4]=Date.now()+900000; // 15 phút
  var cs=credentials(),c=cs.rows.find(function(r){return r[1]===s[2];});
  if(c)c[2]='Được phép sửa';
  commit([writeRow(t.sheet,index,s),c?writeRow(cs.sheet,cs.rows.indexOf(c),c):null,log(s[2],'EDIT_UNLOCK')].filter(Boolean));
  return {ok:true};
 }
 if(action==='validate'||action==='submit'){
  var s=session(p.tokenHash,'voter'),e=requireElection(),bs=ballots(),old=bs.find(function(b){return b.voterId===s[2];});
  var digest=sha(JSON.stringify({choices:p.choices,revision:p.revision})),prior=table('requests').rows.find(function(r){return r[0]===s[2]&&r[1]===p.idempotencyKey;});
  if(action==='submit'&&prior){if(prior[2]!==digest)fail('Khóa yêu cầu đã được dùng cho phiếu khác.',409);return JSON.parse(prior[3]);}
  if(e.status!=='open')fail('Kỳ bình chọn đã đóng.',409);
  if(old&&Number(s[4])<=Date.now())fail('Phiếu đã nộp. Bạn cần nhập mã xác nhận sửa (2405) để chỉnh sửa.',409);
  if((old?old.revision:0)!==p.revision)fail('Phiếu đã thay đổi ở phiên khác. Hãy tải lại.',409);
  validate(e.snapshot,p.choices);
  if(action==='validate')return {ok:true};
  if(!/^[0-9a-f-]{36}$/i.test(p.idempotencyKey||''))fail('Thiếu khóa yêu cầu.');
  var now=new Date().toISOString(),b={id:old?old.id:Utilities.getUuid(),electionId:e.id,voterId:s[2],status:'submitted',submittedAt:old?old.submittedAt:now,updatedAt:now,revision:(old?old.revision:0)+1,version:e.version,choices:p.choices};
  var all=bs.filter(function(b){return b.voterId!==s[2];});all.push(b);
  var row=[b.id,b.electionId,b.voterId,b.status,b.submittedAt,b.updatedAt,b.revision,b.version,JSON.stringify(b.choices)],t=table('ballots');
  var requests=[old?writeRow(t.sheet,t.rows.findIndex(function(r){return r[0]===old.id;}),row):append('ballots',[row]),append('revisions',[[b.id,b.revision,JSON.stringify(b.choices),now]]),append('requests',[[s[2],p.idempotencyKey,digest,JSON.stringify(b)]]),log(s[2],old?'BALLOT_REVISED':'BALLOT_SUBMITTED',{ballotId:b.id,revision:b.revision})];
  var cs=credentials(),c=cs.rows.find(function(r){return r[1]===s[2];});
  if(c){c[2]='Đã nộp phiếu';c[3]=b.submittedAt;c[4]=now;requests.push(writeRow(cs.sheet,cs.rows.indexOf(c),c));}
  var sessions=table('sessions');sessions.rows.forEach(function(r,i){if(r[2]===s[2]&&r[4]){r[4]='';requests.push(writeRow(sessions.sheet,i,r));}});
  commit(requests.concat(mirrors(e,all)));return b;
 }
 if(action==='reset')return resetSystem(true);
 session(p.tokenHash,'admin');
 if(action==='source')return readSource();
 if(action==='freeze'){
  var old=election();if(old)fail('Đã có snapshot. Không thay đổi danh sách giữa kỳ; hãy tạo kỳ mới.',409);
  var snapshot=readSource();if(snapshot.conflicts.length)fail(snapshot.conflicts.join('\n'),409);
  if(snapshot.warnings.length&&!p.acknowledgeWarnings)fail('Cần xác nhận cảnh báo nguồn và Lead trước khi chốt.',409);
  var cs=credentials().rows;
  if(cs.length!==snapshot.candidates.length)fail('Số lượng mã ('+cs.length+') chưa khớp số lượng nhân sự ('+snapshot.candidates.length+').',409);
  var e={id:'vcx-2026',year:2026,status:'open',version:1,warnings:snapshot.warnings,fetchedAt:snapshot.fetchedAt,frozenAt:new Date().toISOString()},rows=[['election',JSON.stringify(e)],['teams',JSON.stringify(snapshot.teams)]].concat(snapshot.candidates.map(function(c){return ['candidate:'+c.id,JSON.stringify(c)];}));
  commit([replace('config',rows),log('admin','ELECTION_FROZEN',{version:1,warnings:snapshot.warnings})].concat(mirrors({snapshot:snapshot},[])));return {ok:true};
 }
 if(action==='close'){var e=requireElection(),t=table('config'),i=t.rows.findIndex(function(r){return r[0]==='election';}),meta=JSON.parse(t.rows[i][1]);meta.status='closed';commit([writeRow(t.sheet,i,['election',JSON.stringify(meta)]),log('admin','ELECTION_CLOSED')]);return {ok:true};}
 if(action==='sync'){var e=requireElection();commit(mirrors(e,ballots()).concat([log('admin','RESULTS_REBUILT')]));return {ok:true};}
 if(action==='cstd'){var e=requireElection();if(!e.snapshot.candidates.some(function(c){return c.id===p.candidateId;}))fail('Ứng viên không hợp lệ.');if(['Cần xác minh','Chờ bỏ phiếu CSTĐ','Đủ tiêu chuẩn sơ bộ','Chưa đủ điều kiện','Đạt CSTĐ','Không đạt CSTĐ'].indexOf(p.status)<0)fail('Trạng thái không hợp lệ.');var rows=table('cstd').rows.filter(function(r){return r[0]!==p.candidateId;}),c=e.snapshot.candidates.find(function(c){return c.id===p.candidateId;});rows.push([c.id,c.name,c.team,c.basis,p.status]);commit([replace('cstd',rows),log('admin','CSTD_UPDATED',{candidateId:c.id,status:p.status})]);return {ok:true};}
 if(action==='credentialStatus'||action==='credentialState'){var cs=credentials();if(action==='credentialState'){if(['Bị khóa','Đã thu hồi','Chưa sử dụng'].indexOf(p.status)<0)fail('Trạng thái không hợp lệ.');var c=cs.rows.find(function(r){return r[1]===p.code;});if(!c)fail('Không tìm thấy mã bí mật.');if(ballots().some(function(b){return b.voterId===p.code;})&&p.status==='Chưa sử dụng')fail('Phiếu đã nộp, không thể đặt lại mã.');c[2]=p.status;commit([writeRow(cs.sheet,cs.rows.indexOf(c),c),log('admin','CREDENTIAL_STATE',{code:p.code,status:p.status})]);}return cs.rows.map(function(c){return {code:c[1],status:c[2],submittedAt:c[3],updatedAt:c[4]};});}
 if(action==='dashboard'||action==='export'){
  var e=election();if(!e){try{resetSystem(false);e=election();}catch(_){}}
  if(!e)return {election:null,source:readSource()};
  var bs=ballots(),result=aggregate(e.snapshot,bs);result.election=e;result.updatedAt=new Date().toISOString();result.cstd=table('cstd').rows.filter(function(r){return r[0];}).map(function(r){return {id:r[0],status:r[4]};});result.audit=table('audit').rows.slice(-100);
  if(action==='export'){commit([log('admin','EXCEL_EXPORT')]);result.ballots=bs;result.credentials=credentials().rows.map(function(c){return {code:c[1]};});}return result;
 }
 fail('Chức năng không tồn tại.',404);
}
