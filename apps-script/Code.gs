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
var DEFAULT_SPREADSHEET_ID = '1_m3YR8j_MobxiKh7UXFdjEsIM9pEuuP3ijrZCvP-rvE';

function props(){
  try {
    return PropertiesService.getScriptProperties();
  } catch(_) {
    return {
      getProperty: function() { return null; },
      setProperty: function() {}
    };
  }
}

function book(){
  var active = null;
  try { active = SpreadsheetApp.getActiveSpreadsheet(); } catch(_) {}
  if (active) {
    try {
      var p = props();
      if (!p.getProperty('SPREADSHEET_ID')) {
        p.setProperty('SPREADSHEET_ID', active.getId());
      }
    } catch (_) {}
    return active;
  }
  var id = null;
  try { id = props().getProperty('SPREADSHEET_ID'); } catch(_) {}
  if (!id) id = DEFAULT_SPREADSHEET_ID;
  try {
    return SpreadsheetApp.openById(id);
  } catch(e) {
    fail('Không thể mở Google Sheet (ID: ' + id + '): ' + e.message, 503);
  }
}
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
  var ss = book();
  var sheetPtud = ss.getSheetByName('PTUD (2)') || ss.getSheetByName('PTUD');
  if (!sheetPtud) fail('Không tìm thấy sheet "PTUD (2)" trên file Google Sheets.', 404);

  var sheetBinhXet = ss.getSheetByName('Binh xet') || ss.getSheetByName('Binh_xet') || ss.getSheetByName('Bình xét') || ss.getSheetByName('Bình_xét');
  if (!sheetBinhXet) fail('Không tìm thấy sheet "Binh xet" trên file Google Sheets.', 404);

  var sheetTeam = ss.getSheetByName('TONG HOP TEAM') || ss.getSheetByName('KET QUA TEAM') || ss.getSheetByName('TEAM');
  if (!sheetTeam) fail('Không tìm thấy sheet "TONG HOP TEAM" hoặc "KET QUA TEAM" trên file Google Sheets.', 404);

  var p = sheetPtud.getRange('A1:BG200').getDisplayValues();
  var b = sheetBinhXet.getRange('A1:BG200').getDisplayValues();
  var t = sheetTeam.getRange('A1:G30').getDisplayValues();

  return parseSource(p, b, t);
}
function parseSource(p,b,t){
 var conflicts=[],warnings=[],map={},official={},people=[];
 function personnel(r){return /^\d+$/.test(r[1])&&!!r[2];}
 p.filter(personnel).forEach(function(r){if(map[r[1]])conflicts.push('MNV trùng tại PTUD (2): '+r[1]);map[r[1]]=r;});
  var defaultTeams = [
    { id: 'IPCC', label: 'I', order: 0, size: 13, quota: 6, lead: 'Lý Hoàng Quyền' },
    { id: 'Lite ERP+Số hóa', label: 'II', order: 1, size: 6, quota: 3, lead: 'Hoàng Anh Văn' },
    { id: 'AI', label: 'III', order: 2, size: 7, quota: 3, lead: 'Nguyễn Đình Thịnh' },
    { id: 'QA', label: 'IV', order: 3, size: 2, quota: 1, lead: 'Võ Hoàng Anh' },
    { id: 'vCOC', label: 'V', order: 4, size: 3, quota: 1, lead: 'Nguyễn Văn Minh' },
    { id: 'KnowXHub', label: 'VI', order: 5, size: 4, quota: 2, lead: 'Nguyễn Thế Tùng' },
    { id: 'SP nội bộ', label: 'VII', order: 6, size: 5, quota: 2, lead: 'Lê Nguyên Huy' }
  ];

  var teams = t.filter(function(r){
    return (/^[IVX]+$/i.test(r[0]) || /^\d+$/.test(r[0])) && r[1] && r[1] !== 'Team' && r[0] !== 'Tổng cộng';
  }).map(function(r, i){
    var d = defaultTeams.find(function(item){ return item.id === r[1]; });
    var size = Number(r[2]) || (d ? d.size : 0);
    var quota = Math.floor(size / 2);
    var rawLead = String(r[4] || '').trim();
    var isPctOrEmpty = !rawLead || rawLead.indexOf('%') >= 0 || /^\d+(\.\d+)?$/.test(rawLead);
    var lead = isPctOrEmpty ? (d ? d.lead : '') : rawLead;
    if (r[1] === 'QA' && (!lead || lead === 'Chưa xác định Lead')) lead = 'Võ Hoàng Anh';

    return {
      id: r[1],
      label: /^[IVX]+$/i.test(r[0]) ? r[0] : (d ? d.label : String(i + 1)),
      order: i,
      size: size,
      quota: quota,
      lead: lead
    };
  });

  if (teams.length < 7) {
    teams = defaultTeams;
  }
  b.filter(personnel).forEach(function(r){
  var source=map[r[1]];if(official[r[1]])conflicts.push('MNV trùng ở Binh xet: '+r[1]);official[r[1]]=true;
  if(!source||!/^Đạt/.test(source[45])||!/Đủ chuẩn/.test(source[52]))conflicts.push('Không khớp điều kiện PTUD/Binh xet: '+r[1]);
  if(source&&source[38]!==r[38])conflicts.push('Không khớp team: '+r[1]);
  var score=Number(String(r[43]).replace(',','.'));if(!Number.isFinite(score))conflicts.push('Điểm không hợp lệ: '+r[1]);
  [43,44,45,46,47,49,52,56].forEach(function(i){if(/^#/.test(r[i]||''))conflicts.push('Lỗi trường nghiệp vụ: '+r[1]+' cột '+(i+1));});
  var isLead = (source && (String(source[39]).trim().toLowerCase() === 'lead' || /\(Lead\)/i.test(source[2]))) ||
               String(r[39]).trim().toLowerCase() === 'lead' ||
               /\(Lead\)/i.test(r[2]);
  people.push({id:r[1],name:r[2].replace(/\s*\(Lead\)$/,''),team:r[38],lead:Boolean(isLead),score:score,ki:r[44],initiative:r[47],reward:r[56]||'',tenure:source?source[45]:'',performance:source?source[46]:'',other:source?source[49]:'',basis:source?source[52]:'',cstd:source?source[48]:''});
 });
 Object.keys(map).forEach(function(id){if(/^Đạt/.test(map[id][45])&&/Đủ chuẩn/.test(map[id][52])&&!official[id])conflicts.push('Thiếu ở Binh xet: '+id);});
 people.forEach(function(c){if(!teams.some(function(t){return t.id===c.team;}))conflicts.push('Team chưa có cấu hình: '+c.team);});
 teams.forEach(function(team){var members=people.filter(function(c){return c.team===team.id;}),leads=members.filter(function(c){return c.lead;});if(members.length!==team.size)conflicts.push('Quân số khác cấu hình: '+team.id);if(!Number.isInteger(team.quota)||team.quota!==Math.floor(members.length/2))conflicts.push('Chỉ tiêu khác FLOOR(quân số/2): '+team.id);if(leads.length!==1)warnings.push('Team '+team.id+': '+leads.length+' Lead được xác định.');if(leads.length===1&&team.lead&&team.lead!=='Chưa xác định Lead'&&team.lead.indexOf('%')<0&&team.lead!==leads[0].name)conflicts.push('Lead khác cấu hình: '+team.id);});
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
  if(!p.verified)fail('Mã xác nhận sửa không hợp lệ.',401);
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
  if(old&&Number(s[4])<=Date.now())fail('Phiếu đã nộp. Bạn cần nhập mã xác nhận sửa để chỉnh sửa.',409);
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

// ==============================================================================
// PHẦN 2: HỆ THỐNG ĐỒNG BỘ 2 CHIỀU GOOGLE SHEETS <--> SUPABASE
// ==============================================================================

/**
 * Tự động tạo Menu khi mở Google Spreadsheet
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚡ VCX - Đồng bộ Supabase')
    .addItem('📥 Cập nhật TOÀN BỘ từ Supabase về Sheet', 'syncAllFromSupabase')
    .addItem('📥 Cập nhật Sheet HIỆN TẠI từ Supabase', 'syncCurrentSheetFromSupabase')
    .addSeparator()
    .addItem('📤 Đẩy TOÀN BỘ nhân sự nguồn lên Supabase', 'pushAllToSupabase')
    .addItem('📤 Đẩy Sheet HIỆN TẠI lên Supabase', 'pushCurrentSheetToSupabase')
    .addSeparator()
    .addItem('📊 Xuất bảng CHI TIẾT mã đã chọn cho từng người', 'exportDetailedVoterSheet')
    .addItem('🔍 Kiểm tra kết nối Supabase', 'testSupabaseConnection')
    .addItem('⚙️ Cấu hình Supabase (URL & API Key)', 'configureSupabaseSettings')
    .addToUi();
}

/**
 * Lấy cấu hình Supabase URL & Key từ Script Properties
 */
function getSupabaseConfig(promptIfMissing) {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL') || 'https://kbmkxfkfhtgdgpqujcxv.supabase.co';
  var key = p.getProperty('SUPABASE_KEY') || p.getProperty('SUPABASE_ANON_KEY') || '';

  if (!key && promptIfMissing) {
    var ui = SpreadsheetApp.getUi();
    var res = ui.prompt(
      'Cấu hình Supabase API Key',
      'Vui lòng dán Supabase API Key (Publishable key hoặc Secret key):\n\n' +
      '(Lấy từ Supabase Dashboard > Project Settings > API)',
      ui.ButtonSet.OK_CANCEL
    );
    if (res.getSelectedButton() === ui.Button.OK) {
      key = res.getResponseText().trim();
      if (key) {
        p.setProperty('SUPABASE_KEY', key);
        p.setProperty('SUPABASE_URL', url);
        ui.alert('Đã lưu API Key thành công!');
      }
    }
  }

  if (!key) {
    throw new Error('Chưa cấu hình SUPABASE_KEY. Vui lòng vào menu: ⚡ VCX - Đồng bộ Supabase > ⚙️ Cấu hình Supabase.');
  }

  return { url: url.replace(/\/$/, ''), key: key };
}

/**
 * Gọi REST API tới Supabase (PostgREST)
 */
function callSupabaseApi(endpoint, options) {
  var config = getSupabaseConfig(true);
  var fullUrl = config.url + '/rest/v1/' + endpoint;

  var headers = {
    'apikey': config.key,
    'Authorization': 'Bearer ' + config.key,
    'Content-Type': 'application/json'
  };

  if (options && options.prefer) {
    headers['Prefer'] = options.prefer;
  }

  var fetchOptions = {
    method: (options && options.method) || 'get',
    headers: headers,
    muteHttpExceptions: true
  };

  if (options && options.payload) {
    fetchOptions.payload = JSON.stringify(options.payload);
  }

  var res = UrlFetchApp.fetch(fullUrl, fetchOptions);
  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code >= 400) {
    throw new Error('Lỗi Supabase (' + code + '): ' + text);
  }

  return text ? JSON.parse(text) : null;
}

/**
 * Kiểm tra kết nối Supabase và hiển thị thông tin tổng quan
 */
function testSupabaseConnection() {
  var ui = SpreadsheetApp.getUi();
  try {
    var startTime = Date.now();
    var elections = callSupabaseApi('elections?select=*&id=eq.vcx-2026');
    var candidates = callSupabaseApi('candidates?select=id');
    var ballots = callSupabaseApi('ballots?select=id');
    var creds = callSupabaseApi('voter_credentials?select=code,status');
    var latency = Date.now() - startTime;

    var el = (elections && elections.length > 0) ? elections[0] : null;
    var submittedCount = (ballots && ballots.length) || 0;
    var candidatesCount = (candidates && candidates.length) || 0;
    var credsCount = (creds && creds.length) || 0;

    ui.alert(
      '✅ Kết nối Supabase thành công!',
      '• URL: ' + (getSupabaseConfig().url) + '\n' +
      '• Kỳ bình chọn: ' + (el ? el.id + ' (Năm: ' + el.year + ', Trạng thái: ' + el.status + ')' : 'Chưa khởi tạo') + '\n' +
      '• Số ứng viên (candidates): ' + candidatesCount + '\n' +
      '• Tổng số mã bí mật (credentials): ' + credsCount + '\n' +
      '• Số phiếu đã nộp (ballots): ' + submittedCount + '\n' +
      '• Độ trễ phản hồi (latency): ' + latency + ' ms\n\n' +
      'Hệ thống sẵn sàng đồng bộ 2 chiều.',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('❌ Lỗi kết nối Supabase', e.message, ui.ButtonSet.OK);
  }
}

/**
 * Cấu hình lại Supabase URL & Key từ hộp thoại
 */
function configureSupabaseSettings() {
  var ui = SpreadsheetApp.getUi();
  var p = PropertiesService.getScriptProperties();
  var currentUrl = p.getProperty('SUPABASE_URL') || 'https://kbmkxfkfhtgdgpqujcxv.supabase.co';
  var currentKey = p.getProperty('SUPABASE_KEY') || p.getProperty('SUPABASE_ANON_KEY') || '';

  var resUrl = ui.prompt(
    'Cấu hình Supabase Project URL',
    'Nhập URL Project Supabase (hiện tại: ' + currentUrl + '):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resUrl.getSelectedButton() !== ui.Button.OK) return;
  var newUrl = resUrl.getResponseText().trim() || currentUrl;

  var resKey = ui.prompt(
    'Cấu hình Supabase API Key',
    'Nhập Supabase Publishable / Anon / Secret Key\n(Hiện tại: ' + (currentKey ? currentKey.slice(0, 15) + '...' : 'Chưa có') + '):',
    ui.ButtonSet.OK_CANCEL
  );
  if (resKey.getSelectedButton() !== ui.Button.OK) return;
  var newKey = resKey.getResponseText().trim() || currentKey;

  if (newKey) {
    p.setProperty('SUPABASE_URL', newUrl);
    p.setProperty('SUPABASE_KEY', newKey);
    ui.alert('✅ Đã lưu cấu hình Supabase thành công!');
  }
}

/**
 * Helper định dạng Header cho Sheet
 */
function applyHeaderFormat(sheet, numCols) {
  var range = sheet.getRange(1, 1, 1, numCols);
  range.setBackground('#10233f')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.setRowHeight(1, 36);
  sheet.setFrozenRows(1);
}

/**
 * Helper ghi dữ liệu vào Sheet an toàn
 */
function writeToSheet(sheetName, headers, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  } else {
    sheet.clearContents();
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderFormat(sheet, headers.length);

  if (rows && rows.length > 0) {
    var dataRange = sheet.getRange(2, 1, rows.length, headers.length);
    dataRange.setValues(rows);
    dataRange.setVerticalAlignment('middle');
  }

  SpreadsheetApp.flush();
  return sheet;
}

/**
 * 1. ĐỒNG BỘ: KET QUA LDTT
 */
function syncLdttSheet() {
  var data = callSupabaseApi('view_results_ldtt?select=*&order=votes.desc,score.desc,id.asc');
  if (!data) return;

  var headers = [
    'STT', 'MNV', 'Họ Và Tên', 'Team', 'Số Bình chọn LĐTT',
    'Tỷ lệ chọn (%)', 'Điểm TB 3 quý', 'Xếp loại KI dự kiến',
    'Sáng kiến - Ý Tưởng', 'Khen thưởng ĐV + TĐ'
  ];

  var rows = data.map(function(c, i) {
    return [
      i + 1,
      c.id,
      c.name,
      c.team,
      Number(c.votes) || 0,
      Number(c.rate) || 0,
      Number(c.score) || 0,
      c.ki || '',
      c.initiative || '',
      c.reward || ''
    ];
  });

  var sheet = writeToSheet('KET QUA LDTT', headers, rows);
  if (rows.length > 0) {
    sheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00%');
    sheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.000');
  }
  return rows.length;
}

/**
 * 2. ĐỒNG BỘ: TỔNG HỢP TEAM (view_results_team)
 * Số người được chọn là tổng hợp số người trong team đó nằm trong Top 18 người có số phiếu bầu lớn nhất từ trên xuống
 * và kèm cột tỷ lệ % trên 18.
 */
function syncTeamSheet() {
  var ldttData = callSupabaseApi('view_results_ldtt?select=*&order=votes.desc,score.desc,id.asc') || [];
  var teamsData = callSupabaseApi('teams?select=*&order=order_index.asc') || [];
  if (!teamsData.length) return;

  var top18 = ldttData.slice(0, 18);
  var totalNv = 0;
  var totalTop18 = top18.length;

  var headers = ['STT', 'Team', 'Tổng số NV', 'Số người được chọn', 'Tỷ lệ %'];
  var rows = teamsData.map(function(t, i) {
    var size = Number(t.size) || 0;
    totalNv += size;
    var top18InTeam = top18.filter(function(c) { return c.team === t.id; }).length;
    var pct = top18InTeam / 18;
    return [
      i + 1,
      t.id,
      size,
      top18InTeam,
      pct
    ];
  });
  rows.push(['Tổng cộng', '', totalNv, totalTop18, totalTop18 / 18]);

  var sheet = writeToSheet('TONG HOP TEAM', headers, rows);
  if (rows.length > 0) {
    sheet.getRange(2, 5, rows.length, 1).setNumberFormat('0.0%');
  }
  return rows.length;
}

/**
 * 3. ĐỒNG BỘ: BÌNH CHỌN CSTĐ 2026
 * Lọc ra các nhân viên đảm bảo đủ các tiêu chí:
 * 1) Kết quả xếp loại KI năm 2026: Đạt loại A trở lên
 * 2) Đạt 1 trong các tiêu chuẩn thành tích:
 *    • Là 1 trong 18 người có số phiếu bầu nhiều nhất từ trên xuống (đạt danh hiệu LĐTT)
 *    • Có SÁNG KIẾN - Ý TƯỞNG
 */
function syncCstdSheet() {
  var ldttData = callSupabaseApi('view_results_ldtt?select=*&order=votes.desc,score.desc,id.asc') || [];
  var cstdStatusData = callSupabaseApi('cstd_status?select=*') || [];
  if (!ldttData.length) return;

  var top18 = ldttData.slice(0, 18);
  var top18Map = {};
  top18.forEach(function(c) { top18Map[c.id] = true; });

  var statusMap = {};
  cstdStatusData.forEach(function(s) { statusMap[s.candidate_id] = s.status; });

  var cstdCandidates = ldttData.filter(function(c) {
    // Tiêu chí 1: KI năm 2026 đạt loại A trở lên
    var kiStr = String(c.ki || '').trim().toUpperCase();
    var isKiA = (kiStr === 'A' || kiStr === 'A+' || kiStr.indexOf('A') === 0);
    if (!isKiA) return false;

    // Tiêu chí 2: Top 18 LĐTT HOẶC có Sáng kiến - Ý tưởng
    var isTop18 = !!top18Map[c.id];
    var initStr = String(c.initiative || '').trim();
    var hasInitiative = initStr !== '' && initStr !== '—' && initStr !== 'Không';

    return isTop18 || hasInitiative;
  });

  var headers = [
    'STT', 'MNV', 'Họ Và Tên', 'Team', 'Số Bình chọn LĐTT',
    'Tỷ lệ chọn (%)', 'Điểm TB 3 quý', 'Xếp loại KI dự kiến',
    'Sáng kiến - Ý Tưởng', 'Khen thưởng ĐV + TĐ', 'Bình chọn CSTĐ'
  ];

  var rows = cstdCandidates.map(function(c, i) {
    var isTop18 = !!top18Map[c.id];
    var initStr = String(c.initiative || '').trim();
    var hasInitiative = initStr !== '' && initStr !== '—' && initStr !== 'Không';

    var defaultStatus = 'Đủ chuẩn sơ bộ';
    if (isTop18 && hasInitiative) defaultStatus = 'Top 18 LĐTT + Sáng kiến';
    else if (isTop18) defaultStatus = 'Top 18 LĐTT (KI loại A)';
    else defaultStatus = 'Có Sáng kiến (KI loại A)';

    var st = statusMap[c.id] || defaultStatus;

    return [
      i + 1,
      c.id,
      c.name,
      c.team,
      Number(c.votes) || 0,
      Number(c.rate) || 0,
      Number(c.score) || 0,
      c.ki || '',
      c.initiative || '',
      c.reward || '',
      st
    ];
  });

  var sheet = writeToSheet('Bình chọn CSTĐ 2026', headers, rows);
  if (rows.length > 0) {
    sheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00%');
    sheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.000');
  }
  return rows.length;
}

/**
 * 4. ĐỒNG BỘ: PHIẾU BÌNH CHỌN (ballots)
 */
function syncBallotsSheet() {
  var ballots = callSupabaseApi('ballots?select=*&order=submitted_at.desc');
  if (!ballots) return;

  var headers = [
    'STT', 'Mã phiếu', 'Mã bình chọn', 'Trạng thái',
    'Ngày nộp', 'Ngày sửa cuối', 'Lần sửa (Revision)', 'Số người đã chọn', 'Danh sách MNV chọn'
  ];

  var rows = ballots.map(function(b, i) {
    var choices = Array.isArray(b.choices) ? b.choices : JSON.parse(b.choices || '[]');
    return [
      i + 1,
      b.id,
      b.voter_code,
      b.status || 'submitted',
      b.submitted_at || '',
      b.updated_at || '',
      (Number(b.revision) || 1) - 1,
      choices.length,
      choices.join(', ')
    ];
  });

  writeToSheet('PHIEU BINH CHON', headers, rows);
  return rows.length;
}

/**
 * 5. ĐỒNG BỘ: MÃ BÌNH CHỌN (voter_credentials - ẨN DANH HOÀN TOÀN)
 */
function syncCredentialsSheet() {
  var creds = callSupabaseApi('voter_credentials?select=*&order=code.asc');
  if (!creds) return;

  var headers = ['STT', 'Mã bình chọn', 'Trạng thái', 'Ngày nộp', 'Ngày sửa'];
  var rows = creds.map(function(c, i) {
    return [
      i + 1,
      c.code,
      c.status || 'Chưa sử dụng',
      c.submitted_at || '',
      c.updated_at || ''
    ];
  });

  writeToSheet('MA BINH CHON', headers, rows);
  return rows.length;
}

/**
 * 6. XUẤT CHI TIẾT CÁC MÃ ĐÃ CHỌN CHO TỪNG NHÂN VIÊN
 */
function exportDetailedVoterSheet() {
  var ldttData = callSupabaseApi('view_results_ldtt?select=*&order=votes.desc,score.desc,id.asc');
  if (!ldttData) return;

  var headers = [
    'STT', 'MNV', 'Họ Và Tên', 'Team', 'Số Bình chọn LĐTT',
    'Tỷ lệ chọn (%)', 'Điểm TB 3 quý', 'Xếp loại KI dự kiến',
    'Sáng kiến - Ý Tưởng', 'Khen thưởng ĐV + TĐ', 'Chi tiết các mã đã bình chọn'
  ];

  var rows = ldttData.map(function(c, i) {
    var codes = Array.isArray(c.voter_codes) ? c.voter_codes : [];
    return [
      i + 1,
      c.id,
      c.name,
      c.team,
      Number(c.votes) || 0,
      Number(c.rate) || 0,
      Number(c.score) || 0,
      c.ki || '',
      c.initiative || '',
      c.reward || '',
      codes.join(', ')
    ];
  });

  var sheet = writeToSheet('XUAT CHI TIET', headers, rows);
  if (rows.length > 0) {
    sheet.getRange(2, 6, rows.length, 1).setNumberFormat('0.00%');
    sheet.getRange(2, 7, rows.length, 1).setNumberFormat('0.000');
  }

  SpreadsheetApp.getUi().alert(
    '✅ Xuất chi tiết thành công!',
    'Đã tạo bảng chi tiết các mã bí mật bình chọn cho từng nhân viên tại tab "XUAT CHI TIET".',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  return rows.length;
}

/**
 * ĐỒNG BỘ TOÀN BỘ CÁC SHEET TỪ SUPABASE
 */
function syncAllFromSupabase() {
  var ui = SpreadsheetApp.getUi();
  try {
    syncLdttSheet();
    syncTeamSheet();
    syncCstdSheet();
    syncBallotsSheet();
    syncCredentialsSheet();
    exportDetailedVoterSheet();

    ui.alert(
      '✅ Đồng bộ toàn bộ hoàn tất!',
      'Đã cập nhật dữ liệu mới nhất từ Supabase về 6 sheet:\n' +
      '1. KET QUA LDTT\n' +
      '2. TONG HOP TEAM / KET QUA TEAM\n' +
      '3. Bình chọn CSTĐ 2026\n' +
      '4. PHIEU BINH CHON\n' +
      '5. MA BINH CHON\n' +
      '6. XUAT CHI TIET',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('❌ Lỗi khi đồng bộ từ Supabase', e.message, ui.ButtonSet.OK);
  }
}

/**
 * ĐỒNG BỘ SHEET HIỆN TẠI TỪ SUPABASE
 */
function syncCurrentSheetFromSupabase() {
  var ui = SpreadsheetApp.getUi();
  var activeSheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var name = activeSheet.getName().trim().toUpperCase();

  try {
    if (name.indexOf('LDTT') >= 0 || name.indexOf('LĐTT') >= 0 || name.indexOf('KẾT QUẢ') >= 0) {
      syncLdttSheet();
      ui.alert('✅ Đã cập nhật xong sheet KET QUA LDTT từ Supabase!');
    } else if (name.indexOf('TEAM') >= 0) {
      syncTeamSheet();
      ui.alert('✅ Đã cập nhật xong sheet tổng hợp TEAM từ Supabase!');
    } else if (name.indexOf('CSTĐ') >= 0 || name.indexOf('CSTD') >= 0) {
      syncCstdSheet();
      ui.alert('✅ Đã cập nhật xong sheet Bình chọn CSTĐ 2026 từ Supabase!');
    } else if (name.indexOf('PHIEU') >= 0 || name.indexOf('PHIẾU') >= 0) {
      syncBallotsSheet();
      ui.alert('✅ Đã cập nhật xong sheet PHIEU BINH CHON từ Supabase!');
    } else if (name.indexOf('MA BINH CHON') >= 0 || name.indexOf('MÃ BÌNH CHỌN') >= 0 || name.indexOf('CREDENTIAL') >= 0) {
      syncCredentialsSheet();
      ui.alert('✅ Đã cập nhật xong sheet MA BINH CHON từ Supabase!');
    } else if (name.indexOf('CHI TIET') >= 0 || name.indexOf('CHI TIẾT') >= 0) {
      exportDetailedVoterSheet();
    } else {
      var res = ui.alert(
        'Sheet hiện tại: "' + activeSheet.getName() + '"',
        'Sheet này không phải là sheet kết quả chuẩn. Bạn có muốn đồng bộ toàn bộ các sheet kết quả không?',
        ui.ButtonSet.YES_NO
      );
      if (res === ui.Button.YES) {
        syncAllFromSupabase();
      }
    }
  } catch (e) {
    ui.alert('❌ Lỗi khi đồng bộ sheet hiện tại', e.message, ui.ButtonSet.OK);
  }
}

/**
 * ĐẨY TOÀN BỘ DỮ LIỆU NGUỒN TỪ SHEET LÊN SUPABASE
 */
function pushAllToSupabase() {
  var ui = SpreadsheetApp.getUi();
  var res = ui.alert(
    'Xác nhận đẩy dữ liệu lên Supabase',
    'Hành động này sẽ đọc danh sách nhân sự từ sheet PTUD (2) / Binh xet, cấu hình Team và Mã bình chọn để cập nhật vào cơ sở dữ liệu Supabase.\n\nBạn có chắc chắn muốn thực hiện?',
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  try {
    var source = readSource();
    if (source.conflicts.length > 0) {
      ui.alert('⚠️ Phát hiện xung đột dữ liệu nguồn', source.conflicts.join('\n'), ui.ButtonSet.OK);
      return;
    }

    // 1. Đẩy Teams trước
    var teamsPayload = source.teams.map(function(t) {
      return {
        id: t.id,
        label: t.label,
        order_index: t.order,
        size: t.size,
        quota: t.quota,
        lead: t.lead
      };
    });
    callSupabaseApi('teams', {
      method: 'post',
      prefer: 'resolution=merge-duplicates',
      payload: teamsPayload
    });

    // 2. Đẩy Candidates
    var candidatesPayload = source.candidates.map(function(c) {
      return {
        id: c.id,
        name: c.name,
        team_id: c.team,
        is_lead: c.lead,
        score: c.score,
        ki: c.ki,
        initiative: c.initiative,
        reward: c.reward || '',
        tenure: c.tenure || '',
        performance: c.performance || '',
        basis: c.basis || '',
        cstd: c.cstd || ''
      };
    });
    callSupabaseApi('candidates', {
      method: 'post',
      prefer: 'resolution=merge-duplicates',
      payload: candidatesPayload
    });

    // 3. Đẩy Mã bí mật (nếu tab MA BINH CHON đã có)
    var cs = credentials();
    if (cs && cs.rows && cs.rows.length > 0) {
      var validStatuses = ['Chưa sử dụng', 'Đang thao tác', 'Đã nộp phiếu', 'Được phép sửa', 'Bị khóa', 'Đã thu hồi'];
      var credsPayload = cs.rows.map(function(r) {
        var codeMatch = String(r[1]).match(/\d{4}/);
        if (!codeMatch) return null;
        var rawStatus = (r[2] || '').trim();
        var status = validStatuses.indexOf(rawStatus) >= 0 ? rawStatus : 'Chưa sử dụng';
        var submittedAt = (r[3] && !isNaN(Date.parse(r[3]))) ? new Date(r[3]).toISOString() : null;
        var updatedAt = (r[4] && !isNaN(Date.parse(r[4]))) ? new Date(r[4]).toISOString() : null;
        return {
          code: codeMatch[0],
          status: status,
          submitted_at: submittedAt,
          updated_at: updatedAt
        };
      }).filter(Boolean);

      if (credsPayload.length > 0) {
        callSupabaseApi('voter_credentials', {
          method: 'post',
          prefer: 'resolution=merge-duplicates',
          payload: credsPayload
        });
      }
    }

    // 4. Cập nhật Election
    callSupabaseApi('elections', {
      method: 'post',
      prefer: 'resolution=merge-duplicates',
      payload: [{
        id: 'vcx-2026',
        year: 2026,
        status: 'open',
        version: 1,
        warnings: source.warnings
      }]
    });

    ui.alert(
      '✅ Đẩy dữ liệu lên Supabase thành công!',
      '• Số Team: ' + source.teams.length + '\n' +
      '• Số ứng viên (candidates): ' + source.candidates.length + '\n' +
      '• Trạng thái kỳ bình chọn: open\n' +
      'Dữ liệu Supabase đã sẵn sàng phục vụ bình chọn trực tuyến!',
      ui.ButtonSet.OK
    );
  } catch (e) {
    ui.alert('❌ Lỗi đẩy dữ liệu lên Supabase', e.message, ui.ButtonSet.OK);
  }
}

/**
 * ĐẨY DỮ LIỆU SHEET HIỆN TẠI LÊN SUPABASE
 */
function pushCurrentSheetToSupabase() {
  var ui = SpreadsheetApp.getUi();
  var ss = book();
  var activeSheet = ss.getActiveSheet();
  var name = activeSheet.getName().trim();
  var upperName = name.toUpperCase();

  try {
    if (upperName.indexOf('PTUD') >= 0 || upperName.indexOf('BINH XET') >= 0 || upperName.indexOf('BÌNH XÉT') >= 0) {
      var source = readSource();
      // Đẩy Teams trước để tránh lỗi Foreign Key
      var teamsPayload = source.teams.map(function(t) {
        return {
          id: t.id,
          label: t.label,
          order_index: t.order,
          size: t.size,
          quota: t.quota,
          lead: t.lead
        };
      });
      callSupabaseApi('teams', {
        method: 'post',
        prefer: 'resolution=merge-duplicates',
        payload: teamsPayload
      });

      var candidatesPayload = source.candidates.map(function(c) {
        return {
          id: c.id,
          name: c.name,
          team_id: c.team,
          is_lead: c.lead,
          score: c.score,
          ki: c.ki,
          initiative: c.initiative,
          reward: c.reward || '',
          tenure: c.tenure || '',
          performance: c.performance || '',
          basis: c.basis || '',
          cstd: c.cstd || ''
        };
      });
      callSupabaseApi('candidates', {
        method: 'post',
        prefer: 'resolution=merge-duplicates',
        payload: candidatesPayload
      });
      ui.alert('✅ Đã cập nhật thành công ' + candidatesPayload.length + ' ứng viên lên Supabase!');
    } else if (upperName.indexOf('TEAM') >= 0) {
      var source = readSource();
      var teamsPayload = source.teams.map(function(t) {
        return {
          id: t.id,
          label: t.label,
          order_index: t.order,
          size: t.size,
          quota: t.quota,
          lead: t.lead
        };
      });
      callSupabaseApi('teams', {
        method: 'post',
        prefer: 'resolution=merge-duplicates',
        payload: teamsPayload
      });
      ui.alert('✅ Đã cập nhật thành công ' + teamsPayload.length + ' team lên Supabase!');
    } else if (upperName.indexOf('MA') >= 0 || upperName.indexOf('MÃ') >= 0 || upperName.indexOf('CREDENTIAL') >= 0) {
      var cs = credentials();
      var validStatuses = ['Chưa sử dụng', 'Đang thao tác', 'Đã nộp phiếu', 'Được phép sửa', 'Bị khóa', 'Đã thu hồi'];
      var credsPayload = cs.rows.map(function(r) {
        var codeMatch = String(r[1]).match(/\d{4}/);
        if (!codeMatch) return null;
        var rawStatus = (r[2] || '').trim();
        var status = validStatuses.indexOf(rawStatus) >= 0 ? rawStatus : 'Chưa sử dụng';
        var submittedAt = (r[3] && !isNaN(Date.parse(r[3]))) ? new Date(r[3]).toISOString() : null;
        var updatedAt = (r[4] && !isNaN(Date.parse(r[4]))) ? new Date(r[4]).toISOString() : null;
        return {
          code: codeMatch[0],
          status: status,
          submitted_at: submittedAt,
          updated_at: updatedAt
        };
      }).filter(Boolean);

      if (credsPayload.length === 0) {
        ui.alert('⚠️ Cảnh báo', 'Không tìm thấy mã bình chọn 4 chữ số hợp lệ nào trong sheet ' + name + '.', ui.ButtonSet.OK);
        return;
      }

      callSupabaseApi('voter_credentials', {
        method: 'post',
        prefer: 'resolution=merge-duplicates',
        payload: credsPayload
      });
      ui.alert('✅ Đã cập nhật thành công ' + credsPayload.length + ' mã bí mật lên Supabase!');
    } else {
      ui.alert(
        'Thông báo',
        'Sheet "' + name + '" không phải là sheet nguồn. Hãy chọn tab "PTUD (2)", "Binh xet", "TONG HOP TEAM" hoặc "MA BINH CHON" để đẩy lên Supabase.',
        ui.ButtonSet.OK
      );
    }
  } catch (e) {
    ui.alert('❌ Lỗi khi đẩy sheet lên Supabase', e.message, ui.ButtonSet.OK);
  }
}
