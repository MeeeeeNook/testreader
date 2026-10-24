import React from 'react';
import {ShieldCheck,ArrowUpRight} from 'lucide-react';
import {TopHeader} from './TopHeader';
import {STUDENT_ORIGIN} from '../services/siteOrigins';
export function AdminPortalHeader(props:React.ComponentProps<typeof TopHeader>){
 return <header className="admin-portal-header"><a className="admin-portal-brand" href="/admin"><ShieldCheck size={23}/><span>IELTS Studio <strong>Admin</strong></span></a><div><a className="admin-student-site" href={STUDENT_ORIGIN}>Student website <ArrowUpRight size={15}/></a><TopHeader {...props}/></div></header>;
}
