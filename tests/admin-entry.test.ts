import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {canonicalSiteLocation,ADMIN_ORIGIN,STUDENT_ORIGIN} from '../src/services/siteOrigins';
import {AdminSignInView} from '../src/components/AdminSignInView';
import {AdminPortalHeader} from '../src/components/AdminPortalHeader';

test('admin and student routes use their canonical host without redirect loops',()=>{
 assert.equal(canonicalSiteLocation('admin.ielts.vungocmanhcuong.id.vn','/'),ADMIN_ORIGIN+'/admin');
 assert.equal(canonicalSiteLocation('admin.ielts.vungocmanhcuong.id.vn','/sign-in'),ADMIN_ORIGIN+'/admin');
 for(const path of ['/practice','/vocabulary','/history','/full-exam','/settings'])assert.equal(canonicalSiteLocation('admin.ielts.vungocmanhcuong.id.vn',path,'?a=1'),STUDENT_ORIGIN+path+'?a=1');
 for(const path of ['/admin','/admin/tests','/admin/students/one','/admin/new']){assert.equal(canonicalSiteLocation('ielts.vungocmanhcuong.id.vn',path,'?a=1'),ADMIN_ORIGIN+path+'?a=1');assert.equal(canonicalSiteLocation('admin.ielts.vungocmanhcuong.id.vn',path),undefined);}
 assert.equal(canonicalSiteLocation('ielts.vungocmanhcuong.id.vn','/sign-in'),undefined);
 assert.equal(canonicalSiteLocation('ielts.vungocmanhcuong.id.vn','/administrator'),undefined);
 assert.equal(canonicalSiteLocation('localhost','/admin'),undefined);
});
test('admin sign in is a separate staff page, includes a student exit and does not show catalog navigation',()=>{
 const html=renderToStaticMarkup(React.createElement(AdminSignInView,{}));
 assert.match(html,/Admin sign in/);assert.match(html,/authorised teachers/);assert.match(html,/Continue with Google/);assert.match(html,new RegExp(STUDENT_ORIGIN.replaceAll('.','\\.')));assert.doesNotMatch(html,/Practice Test|portal-navigation|Create your account/);
 const denied=renderToStaticMarkup(React.createElement(AdminSignInView,{signedIn:true}));assert.match(denied,/does not have admin or teacher access/);assert.match(denied,/Use another Google account/);
 const loading=renderToStaticMarkup(React.createElement(AdminSignInView,{ready:false}));assert.match(loading,/Checking your account/);assert.match(loading,/disabled/);
});
test('admin header identifies the workspace and links the student website to its own host',()=>{
 const html=renderToStaticMarkup(React.createElement(AdminPortalHeader,{crumb:'',user:{uid:'owner',displayName:'Owner',providerData:[]} as any,profile:{} as any,role:'admin',onUpdateProfile:()=>{},onOpenProfileModal:()=>{}}));assert.match(html,/href="https:\/\/ielts\.vungocmanhcuong\.id\.vn"/);assert.match(html,/admin-portal-header/);assert.doesNotMatch(html,/Practice Test|portal-navigation/);
});
