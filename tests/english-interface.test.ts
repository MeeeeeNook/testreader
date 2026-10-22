import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {HomeView} from '../src/components/HomeView.tsx';
import {PracticeCatalog} from '../src/components/PracticeCatalog.tsx';
import {SettingsView} from '../src/components/SettingsView.tsx';
import type {UserProfile} from '../src/types.ts';
const profile:UserProfile={id:'guest',name:'Learner',email:'',target:7,language:'vi',theme:'dark',fontSize:18,favorites:[],status:'active'};
test('legacy Vietnamese/dark profiles still receive English home, catalog and preferences without language/theme controls',()=>{
 const home=renderToStaticMarkup(React.createElement(HomeView,{tests:[],attempts:[],profile,onNavigate:()=>{},onUpdateProfile:async()=>{}}));
 assert.match(home,/Every test is free/);assert.doesNotMatch(home,/Luyện|Đăng nhập/);
 const catalog=renderToStaticMarkup(React.createElement(PracticeCatalog,{tests:[],attempts:[],profile,location:'/practice',onNavigate:()=>{}}));
 assert.match(catalog,/Filters/);assert.doesNotMatch(catalog,/Bộ lọc|Tất cả/);
 const settings=renderToStaticMarkup(React.createElement(SettingsView,{profile,attempts:[],vocabulary:[],isAdmin:false,onViewStudents:()=>{},onUpdateProfile:async()=>{},onExportTestBank:()=>{},onOpenUpload:()=>{},onNotify:()=>{}}));
 assert.match(settings,/Passage Font Size/);assert.doesNotMatch(settings,/Interface Language|Dark Room|Tiếng Việt/);
});

