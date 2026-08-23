"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatMarkdownProps {
  readonly children: string;
}

export function ChatMarkdown({ children }: ChatMarkdownProps) {
  return (
    <div className="chat-markdown break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          p: (props) => <p {...props} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
