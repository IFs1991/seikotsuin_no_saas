import React, { useState, useEffect } from 'react';
import { useChat } from '../../hooks/useChat';

const ChatInterface: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  const {
    messages,
    sendMessage,
    isLoading,
  } = useChat();

  const quickQuestions = [
    '本日の売上状況を教えて',
    '患者の満足度分析を見せて',
    '改善が必要な項目は？',
    '明日の予約状況は？'
  ];

  const handleSend = () => {
    if (message.trim()) {
      sendMessage(message);
      setMessage('');
    }
  };

  const handleQuickQuestion = (question: string) => {
    sendMessage(question);
  };

  const toggleVoiceRecording = () => {
    if (!isRecording) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          setIsRecording(true);
          // 音声認識処理を実装
        })
        .catch((error) => console.error('音声入力エラー:', error));
    } else {
      setIsRecording(false);
      // 音声認識停止処理
    }
  };

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-[#1e3a8a] dark:text-white">AIアシスタント</h3>
        <Button
          onClick={() => setIsOpen(!isOpen)}
          variant="ghost"
          className="hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {isOpen ? '閉じる' : '開く'}
        </Button>
      </div>

      {isOpen && (
        <div className="p-4">
          <div className="mb-4 space-x-2 flex flex-wrap gap-2">
            {quickQuestions.map((question, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handleQuickQuestion(question)}
                className="text-sm"
              >
                {question}
              </Button>
            ))}
          </div>

          <div className="h-96 overflow-y-auto mb-4 space-y-4">
            {messages.map((msg, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg ${
                  msg.isUser
                    ? 'bg-[#1e3a8a] text-white ml-8'
                    : 'bg-gray-100 dark:bg-gray-700 mr-8'
                }`}
              >
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg mr-8 animate-pulse">
                応答を生成中...
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="メッセージを入力..."
              className="flex-1"
            />
            <Button
              onClick={toggleVoiceRecording}
              variant="outline"
              className={isRecording ? 'bg-red-500 text-white' : ''}
            >
              🎤
            </Button>
            <Button onClick={handleSend}>送信</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;