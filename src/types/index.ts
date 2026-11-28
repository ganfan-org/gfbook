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
  short_hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
}

export interface RepoFileStatus {
  path: string;
  code: string;
  staged: boolean;
}

export interface RepoState {
  initialized: boolean;
  branch: string | null;
  detached: boolean;
  remote_url: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  dirty: RepoFileStatus[];
  conflicted: string[];
  head: CommitInfo | null;
  recent_commits: CommitInfo[];
  last_sync_at: number | null;
}

export interface BookIdentity {
  local_name: string | null;
  local_email: string | null;
  global_name: string | null;
  global_email: string | null;
  effective_name: string | null;
  effective_email: string | null;
  source: 'book' | 'global' | 'none';
}

export type ActivityItem =
  | {
      kind: 'commit';
      hash: string;
      short_hash: string;
      message: string;
      author: string;
      email: string;
      timestamp: number;
    }
  | {
      kind: 'event';
      timestamp: number;
      event: string;
      detail: string;
      result: string;
      code: string | null;
    };

export type ActivityCategory = 'commit' | 'chapter' | 'git' | 'image' | 'other';

/** 单个文件相对 HEAD 的差异 */
export interface FileDiff {
  path: string;
  diff: string;
  binary: boolean;
  truncated: boolean;
}

export type ProblemSeverity = 'error' | 'warning';

export interface Problem {
  kind: string;
  severity: ProblemSeverity;
  message: string;
  detail: string | null;
  chapter_id: string | null;
  chapter_title: string | null;
  file: string | null;
  line: number | null;
}

export interface BookProblems {
  book_path: string;
  book_title: string;
  problems: Problem[];
}

/** 后端启动时返回的版本信息 */
export interface BackendInfo {
  version: string;
  api_level: number;
  built_at: number;
}
