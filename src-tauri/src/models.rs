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
    pub message: String,
    pub author: String,
    pub timestamp: u64,
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
