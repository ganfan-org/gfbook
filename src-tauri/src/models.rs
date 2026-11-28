use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub created_time: u64,
    #[serde(default)]
    pub updated_time: u64,
    /// 日记条目对应的日期（`YYYY-MM-DD`）。普通书章节为空，不写入元数据。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    pub chapters: Vec<Chapter>,
}

fn default_schema_version() -> u32 {
    1
}

/// 书的形态：普通书按章节树组织，日记本按日期组织。
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum BookKind {
    #[default]
    Book,
    Diary,
}

fn is_book_kind(kind: &BookKind) -> bool {
    *kind == BookKind::Book
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookMeta {
    pub title: String,
    /// 书库格式版本；旧书缺失时按 1 处理，并在下次保存时写回
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    /// 书的形态；旧书缺失时按普通书处理，普通书不写入该字段
    #[serde(default, skip_serializing_if = "is_book_kind")]
    pub kind: BookKind,
    #[serde(default)]
    pub created_time: u64,
    #[serde(default)]
    pub updated_time: u64,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookInfo {
    pub title: String,
    pub path: String,
    #[serde(default)]
    pub kind: BookKind,
    #[serde(default)]
    pub created_time: u64,
    #[serde(default)]
    pub updated_time: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RepoFileStatus {
    pub path: String,
    pub code: String,
    pub staged: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RepoState {
    pub initialized: bool,
    pub branch: Option<String>,
    pub detached: bool,
    pub remote_url: Option<String>,
    pub tracking: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub dirty: Vec<RepoFileStatus>,
    pub conflicted: Vec<String>,
    pub head: Option<CommitInfo>,
    pub recent_commits: Vec<CommitInfo>,
    /// 最近一次 fetch 成功的秒级时间戳（取自 `.git/FETCH_HEAD` 的修改时间）。
    pub last_sync_at: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookIdentity {
    pub local_name: Option<String>,
    pub local_email: Option<String>,
    pub global_name: Option<String>,
    pub global_email: Option<String>,
    pub effective_name: Option<String>,
    pub effective_email: Option<String>,
    /// `book` | `global` | `none`
    pub source: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ActivityItem {
    Commit {
        hash: String,
        short_hash: String,
        message: String,
        author: String,
        email: String,
        timestamp: u64,
    },
    Event {
        timestamp: u64,
        event: String,
        detail: String,
        result: String,
        code: Option<String>,
    },
}

/// 单个文件相对 HEAD 的文本差异。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileDiff {
    pub path: String,
    pub diff: String,
    pub binary: bool,
    pub truncated: bool,
}

/// 书籍内容诊断问题。
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Problem {
    pub kind: String,
    /// `error` | `warning`
    pub severity: String,
    /// 英文兜底文案；界面按 kind 本地化。
    pub message: String,
    pub detail: Option<String>,
    pub chapter_id: Option<String>,
    pub chapter_title: Option<String>,
    /// 相对书籍根目录的文件路径。
    pub file: Option<String>,
    pub line: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookProblems {
    pub book_path: String,
    pub book_title: String,
    pub problems: Vec<Problem>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchLine {
    pub line: usize,
    pub text: String,
}

pub fn flatten_chapters(chapters: &[Chapter]) -> Vec<&Chapter> {
    let mut result = Vec::new();
    for ch in chapters {
        result.push(ch);
        result.extend(flatten_chapters(&ch.chapters));
    }
    result
}
