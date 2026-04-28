export interface Chapter {
  id: string;
  title: string;
  created_time: number;
  updated_time: number;
  chapters: Chapter[];
}

export interface BookMeta {
  title: string;
  created_time: number;
  updated_time: number;
  chapters: Chapter[];
}

export interface BookInfo {
  title: string;
  path: string;
  created_time: number;
  updated_time: number;
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}
