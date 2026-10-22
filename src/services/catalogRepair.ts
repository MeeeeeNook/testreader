import type {TestMeta} from '../types';
import {isGenericPassageTitle} from './passageTitle';
export function needsCatalogRepair(test: TestMeta) {
 return !test.sectionSummaries || test.sectionSummaries.length !== test.passages || test.sectionSummaries.some(p => isGenericPassageTitle(p.title));
}
