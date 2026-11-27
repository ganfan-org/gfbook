export type BookKind = 'book' | 'diary';

export interface Chapter {
  id: string;
  title: string;
  created_time: number;
  updated_time: number;
  /** 日记条目日期（YYYY-MM-DD）；普通书章节为空 */
  date?: string;
  chapters: Chapter[];
}

export interface BookMeta {
  title: string;
  /** 书的形态；旧书缺失时按普通书处理 */
  kind?: BookKind;
  created_time: number;
  updated_time: number;
  chapters: Chapter[];
}

export interface BookInfo {
  title: string;
  path: string;
  kind?: BookKind;
  created_time: number;
  updated_time: number;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}
