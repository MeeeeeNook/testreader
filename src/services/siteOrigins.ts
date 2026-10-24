export const STUDENT_ORIGIN='https://ielts.vungocmanhcuong.id.vn';
export const ADMIN_ORIGIN='https://admin.ielts.vungocmanhcuong.id.vn';
export const isAdminHost=(hostname:string)=>hostname==='admin.ielts.vungocmanhcuong.id.vn';
export function canonicalSiteLocation(hostname:string,pathname:string,search=''):string|undefined{
 const adminPath=/^\/admin(?:\/|$)/.test(pathname);
 if(isAdminHost(hostname)){
  if(pathname==='/'||pathname==='/sign-in')return ADMIN_ORIGIN+'/admin';
  if(!adminPath)return STUDENT_ORIGIN+pathname+search;
 }else if(hostname==='ielts.vungocmanhcuong.id.vn'&&adminPath)return ADMIN_ORIGIN+pathname+search;
}
