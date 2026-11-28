use std::fmt;

use serde::Serialize;

/// 统一的后端错误类型。
///
/// `code` 供前端做分支判断，`message` 面向用户，`detail` 放底层实现细节。
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        let detail = detail.into();
        if !detail.is_empty() {
            self.detail = Some(detail);
        }
        self
    }

    /// 兼容现有以 String 为错误类型的命令：只暴露用户可读部分。
    pub fn user_message(&self) -> String {
        match &self.detail {
            Some(detail) => format!("{}: {}", self.message, detail),
            None => self.message.clone(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.user_message())
    }
}

impl std::error::Error for AppError {}

impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.user_message()
    }
}

pub fn io_error(context: &str, error: std::io::Error) -> AppError {
    AppError::new("E_IO", context).with_detail(error.to_string())
}
