import React, { useState } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { gfm } from '@milkdown/preset-gfm';
import { math } from '@milkdown/plugin-math';
import { diagram } from '@milkdown/plugin-diagram';
import { nord } from '@milkdown/theme-nord'; // 一个漂亮的主题


import { MilkdownEditor } from "./editor";

// 1. 编辑器组件
const MarkdownEditor = ({ content }) => {
  const { loading } = useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content); // 加载书籍内容
      })
      .use(nord)
      .use(gfm)
      .use(math)
      .use(diagram)
  );

  return <div className="p-4 border rounded-lg shadow-sm bg-white"><Milkdown /></div>;
};

// 2. 主页面：书架 + 编辑区
export default function BookShelfApp() {
  const [currentContent, setCurrentContent] = useState('# 欢迎阅读你的第一本书\n\n试试输入数学公式: $E=mc^2$\n\n或者思维导图:\n\n```mermaid\nmindmap\n  root\n    第一章\n    第二章\n```');

  // 模拟书架数据
  const books = [
    { id: 1, title: '高等数学笔记', content: '# 高数笔记\n\n$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$' },
    { id: 2, title: 'React 进阶指南', content: '# React 学习\n\n* 组件化\n* Hook' },
    { id: 3, title: '项目思维导图', content: '```mermaid\ngraph TD\n  A-->B\n```' }
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* 侧边栏：书架 */}
      <div className="w-64 bg-slate-800 text-white p-4 shadow-xl">
        <h2 className="text-xl font-bold mb-6">我的书架</h2>
        <ul className="space-y-2">
          {books.map(book => (
            <li 
              key={book.id}
              onClick={() => setCurrentContent(book.content)}
              className="p-2 hover:bg-slate-700 rounded cursor-pointer transition"
            >
              📖 {book.title}
            </li>
          ))}
        </ul>
        <button className="mt-8 w-full border border-dashed border-gray-400 p-2 text-sm">+ 新建书籍</button>
      </div>

      {/* 主编辑区 */}
      <div className="flex-1 p-10 overflow-y-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800">正在编辑...</h1>
          <p className="text-sm text-gray-500">所有更改将实时保存至本地 Markdown 文件夹</p>
        </header>
        
        <MilkdownProvider>
          {/* Key 强制重新挂载编辑器以加载新内容 */}
          <MilkdownEditor key={currentContent.length} content={currentContent} />
        </MilkdownProvider>
      </div>
    </div>
  );
}