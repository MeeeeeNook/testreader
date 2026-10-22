import type {TestMeta} from '../types';
import {slugify,catalogSections} from './portal';
// Stable suffix survives title edits. It identifies a route, never an import duplicate.
export function routeToken(value:string){let a=2166136261,b=5381;for(const c of value){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return (a>>>0).toString(36)+(b>>>0).toString(36);}
export function testLink(test:Pick<TestMeta,'id'|'title'>,section?:{id:string;title:string}|null,solution=false){return `/${solution?'solutions':'reading'}/${slugify(section?.title||test.title)}-${routeToken(test.id+':'+(section?.id||'all'))}`;}
export function resolveTestLink(value:string,tests:TestMeta[]){const token=value.split('-').pop();for(const test of tests){if(token===routeToken(test.id+':all'))return {test,section:undefined};for(const section of catalogSections(test))if(token===routeToken(test.id+':'+section.id))return {test,section};}return null;}
