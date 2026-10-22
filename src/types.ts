export interface ScoreRow {
  number: number;
  response: string;
  answer: string;
  status: 'correct' | 'incorrect' | 'blank' | 'ungraded';
}

export interface ScoreResult {
  rows: ScoreRow[];
  total: number;
  correct: number;
  incorrect: number;
  blank: number;
  ungraded: number;
  gradable: number;
}

export interface TestSlot {
  id: string;
  numbers: number[];
  type: 'text' | 'select' | 'radio' | 'multi';
  label: string;
  options: { value: string; label: string }[];
}

export interface TestQuestion {
  number: number;
  kind: string;
  answer: string;
  explanationHtml?: string;
  referenceQuote?: string;
  missing?: boolean;
}

export interface EditablePart {
  id: string;
  position?: number;
  title: string;
  passageHtml: string;
  questionHtml: string;
  slots: Record<string, TestSlot>;
  questions: TestQuestion[];
  audio?: string;
}

export interface EditableTest {
  folderId?: string|null;
  folderPath?: string;
  contentHash?: string;
  schemaVersion: 1;
  id: string;
  title: string;
  skill: 'reading' | 'listening';
  source: string;
  access: 'free' | 'premium';
  status: 'published' | 'draft' | 'archived';
  duration: number;
  parts: EditablePart[];
  createdAt: number;
  updatedAt: number;
  authorId?: string;
  sourceTestId?: string;
  sectionIds?: string[];
  sourceSections?: { testId: string; sectionId: string }[];
}

export interface TestMeta {
  fullTestMenuFolders?: import('./services/folders').MenuFolder[];
  originSource?:string;
  folderId?: string|null;
  folderPath?: string;
  contentHash?: string;
  id: string;
  title: string;
  skill: 'reading' | 'listening';
  source: string;
  access: 'free' | 'premium';
  status: 'published' | 'draft' | 'archived';
  duration: number;
  passages: number;
  passageTitles?: string[];
  sectionSummaries?: {id:string;index:number;title:string;questions:number;kinds:string[]}[];
  questions: number;
  updatedAt: number;
  createdAt?: number;
  custom?: boolean;
  deletedAt?: number | null;
  restoreStatus?: 'draft' | 'published' | 'archived';
}

export interface UserProfile {
  weeklyGoal?:number;
  libraryFolders?: import("./services/folders").LibraryFolder[];
  libraryFolderVersion?: number;
  id: string;
  email: string;
  name: string;
  target: number;
  examDate?: string;
  language: 'en' | 'vi';
  theme: 'light' | 'dark';
  fontSize: number;
  favorites: string[];
  status: 'active' | 'suspended';
  createdAt?: number;
  updatedAt?: number;
}

export interface AttemptRecord {
  id: string;
  owner: string;
  testId: string;
  testTitle: string;
  skill: 'reading' | 'listening';
  mode: 'practice' | 'exam';
  createdAt: number;
  responses: Record<string | number, string>;
  result: {
    rows: {
      number: number;
      response: string;
      answer: string;
      status: 'correct' | 'incorrect' | 'blank' | 'ungraded';
    }[];
    total: number;
    correct: number;
    incorrect: number;
    blank: number;
    ungraded: number;
    gradable: number;
  };
  band?: number | null;
  definition?: EditableTest;
  syncedAt?: number;
  sectionIds?: string[];
  sourceSections?: { testId: string; sectionId: string }[];
}

export interface VocabularyItem {
  id: string;
  owner: string;
  word: string;
  meaning: string;
  example: string;
  partOfSpeech: string;
  archived?: boolean;
  createdAt: number;
  updatedAt?: number;
}

export interface StudyNote {
  id: string;
  text: string;
  part: number;
  quote?: string;
  createdAt?: number;
}

export interface StudyHighlight {
  start?: number;
  end?: number;
  id: string;
  text: string;
  context?: string;
  pane: 'passage' | 'questions';
  part: number;
  occurrence?: number;
}

export interface ContentReport {
  id: string;
  owner: string;
  testId: string;
  testTitle: string;
  question: number;
  category: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: number;
}



