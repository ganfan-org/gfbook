use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Chapter {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub created_time: u64,
    #[serde(default)]
    pub updated_time: u64,
    pub chapters: Vec<Chapter>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookMeta {
    pub title: String,
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
