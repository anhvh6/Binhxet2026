// Compare against the incoming Host header: NextURL normalizes loopback IPs to localhost.
export function sameOrigin(origin:string|null,host:string|null){
 if(!origin||!host)return false;
 try{const url=new URL(origin);return url.host.toLowerCase()===host.toLowerCase()&&(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname));}catch{return false;}
}
