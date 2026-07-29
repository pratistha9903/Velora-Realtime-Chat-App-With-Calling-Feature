import { useState, useRef, useEffect } from 'react';
import { Send, Smile, ImagePlus, Paperclip, Mic, Square, X } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

export default function MessageInput({
  onSend,
  onTypingStart,
  onTypingStop,
  disabled,
  replyTo,
  onCancelReply,
  blocked = false,
  blockedMessage = 'You cannot send messages in this chat',
}) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const typingRef = useRef(null);
  const isTyping = useRef(false);
  const imageRef = useRef(null);
  const fileRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const { addToast } = useToast();

  const handleTyping = () => {
    if (!isTyping.current) {
      isTyping.current = true;
      onTypingStart?.();
    }
    clearTimeout(typingRef.current);
    typingRef.current = setTimeout(() => {
      isTyping.current = false;
      onTypingStop?.();
    }, 1500);
  };

  const submit = (payload) => {
    onSend(payload);
    setText('');
    isTyping.current = false;
    clearTimeout(typingRef.current);
    onTypingStop?.();
    onCancelReply?.();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    submit({ content: trimmed, replyTo: replyTo?.id });
  };

  const uploadAndSend = async (file) => {
    if (file.size > 10 * 1024 * 1024) {
      addToast('File must be under 10MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const data = await api.uploadFile(file);
      submit({
        content: text.trim(),
        type: data.type,
        imageUrl: data.imageUrl,
        fileUrl: data.fileUrl || data.url,
        fileName: data.fileName,
        fileSize: data.fileSize,
        replyTo: replyTo?.id,
      });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0];
    if (file) await uploadAndSend(file);
    if (imageRef.current) imageRef.current.value = '';
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) await uploadAndSend(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
        await uploadAndSend(file);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      addToast('Microphone access denied', 'error');
    }
  };

  useEffect(() => () => {
    clearTimeout(typingRef.current);
    mediaRecorderRef.current?.stop();
  }, []);

  return (
    <div className="msg-input-area">
      {blocked ? (
        <div className="msg-blocked-banner">
          <p>{blockedMessage}</p>
        </div>
      ) : (
        <>
      {replyTo && (
        <div className="reply-bar">
          <div>
            <span>Replying to {replyTo.displayName || replyTo.username}</span>
            <p>{replyTo.content}</p>
          </div>
          <button className="icon-btn" onClick={onCancelReply}>
            <X size={16} />
          </button>
        </div>
      )}

      <form className="msg-input-form" onSubmit={handleSubmit}>
        <input ref={imageRef} type="file" accept="image/*" hidden onChange={handleImage} />
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip"
          hidden
          onChange={handleFile}
        />

        <button
          type="button"
          className="icon-btn"
          onClick={() => imageRef.current?.click()}
          disabled={disabled || uploading}
          title="Upload image"
        >
          <ImagePlus size={20} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading}
          title="Upload document"
        >
          <Paperclip size={20} />
        </button>
        <button
          type="button"
          className={`icon-btn ${recording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={disabled || uploading}
          title={recording ? 'Stop recording' : 'Voice note'}
        >
          {recording ? <Square size={18} /> : <Mic size={20} />}
        </button>

        <div className="msg-input-wrap">
          <input
            type="text"
            placeholder={
              recording ? 'Recording…'
                : uploading ? 'Uploading...'
                  : 'Type a message...'
            }
            value={text}
            onChange={(e) => { setText(e.target.value); handleTyping(); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
            }}
            disabled={disabled || uploading || recording}
            maxLength={2000}
          />

          <div className="emoji-wrap">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowEmoji(!showEmoji)}
            >
              <Smile size={20} />
            </button>
            {showEmoji && (
              <EmojiPicker
                onSelect={(emoji) => setText((t) => t + emoji)}
                onClose={() => setShowEmoji(false)}
              />
            )}
          </div>
        </div>

        <button
          type="submit"
          className="send-btn"
          disabled={!text.trim() || disabled || uploading || recording}
        >
          <Send size={18} />
        </button>
      </form>
        </>
      )}
    </div>
  );
}
