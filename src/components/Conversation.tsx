import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import Markdown from './Markdown'
import { Paperclip, Send } from './Icons'
import type { ConversationMessage } from '../contracts/ipc-types'

const Conversation: React.FC<{ sceneId: string; conversation: ConversationMessage[] }> = ({ sceneId, conversation }) => {
  const { t } = useTranslation()
  const runTurn = useSceneStore(s => s.runTurn)
  const isLoading = useSceneStore(s => s.isLoading)
  const proposals = useSceneStore(s => s.proposals)
  const streamingText = useSceneStore(s => s.streamingText)
  const agentStatus = useSceneStore(s => s.agentStatus)
  const activeRunId = useSceneStore(s => s.activeRunId)
  const abortRun = useSceneStore(s => s.abortRun)
  const [input, setInput] = useState('')
  const [customInputOpen, setCustomInputOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conversation, proposals, streamingText, agentStatus])

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return
    setInput('')
    setCustomInputOpen(false)
    setCustomText('')
    await runTurn(sceneId, text.trim())
  }

  const handleSend = () => { sendMessage(input) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {conversation.length === 0 && proposals.length === 0 && (
          <div style={{ margin: '8px 8px 8px', padding: '12px 14px', background: 'var(--ai-bubble)', borderRadius: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{t('conversation.welcomeTitle')}</p>
            <p style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.7, margin: '8px 0 0' }}>
              {t('conversation.welcomeIntro')}<br />
              {t('conversation.welcomeStep1')}<br />
              {t('conversation.welcomeStep2')}<br />
              {t('conversation.welcomeStep3')}
            </p>
            <button onClick={() => runTurn(sceneId, t('conversation.startGuideMessage'))}
              disabled={isLoading}
              className="btn-primary" style={{ marginTop: 12, padding: '9px 20px', fontSize: 12, fontWeight: 700 }}>
              {t('conversation.letAgentAsk')}
            </button>
          </div>
        )}
        {conversation.map((msg, i) => {
          const isLast = i === conversation.length - 1
          const showOptions = msg.role === 'assistant' && isLast && !!msg.options && msg.options.length > 0 && !isLoading
          return (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom: 8, padding: '0 8px'
          }}>
            <div style={{
              maxWidth: '85%', padding: '8px 12px',
              borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
              background: msg.role === 'user' ? 'var(--user-bubble)' : 'var(--ai-bubble)',
              color: 'var(--ink)', fontSize: 13, lineHeight: 1.65,
              whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal'
            }}>
              {msg.role === 'user' ? msg.content : <Markdown text={msg.content} />}
              {showOptions && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
                    {msg.options!.map((opt, j) => (
                      <button key={j} onClick={() => sendMessage(opt)} className="chip-option">{opt}</button>
                    ))}
                    {msg.allowFreeText !== false && (
                      <button onClick={() => setCustomInputOpen(v => !v)} className="chip-option"
                        style={customInputOpen ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                        {t('guide.otherOption')}
                      </button>
                    )}
                  </div>
                  {customInputOpen && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input autoFocus value={customText} onChange={e => setCustomText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendMessage(customText) }}
                        placeholder={t('guide.customPlaceholder')}
                        className="input-pill" style={{ flex: 1, fontSize: 12 }} />
                      <button onClick={() => sendMessage(customText)} disabled={!customText.trim()}
                        className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}>
                        {t('common.send')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )
        })}
        {!!streamingText && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8, padding: '0 8px' }}>
            <div style={{
              maxWidth: '85%', padding: '8px 12px',
              borderRadius: '10px 10px 10px 2px',
              background: 'var(--ai-bubble)',
              color: 'var(--ink)', fontSize: 13, lineHeight: 1.65
            }}>
              <Markdown text={streamingText} />
            </div>
          </div>
        )}
        {activeRunId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 3 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tri)', animation: 'pulse 1.2s ease-in-out infinite' }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tri)', animation: 'pulse 1.2s ease-in-out 0.2s infinite' }} />
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tri)', animation: 'pulse 1.2s ease-in-out 0.4s infinite' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--tri)' }}>{agentStatus || t('conversation.generating')}</span>
            <button onClick={abortRun}
              style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, cursor: 'pointer', fontSize: 11, color: 'var(--tri)', padding: '2px 8px' }}>
              {t('conversation.abort')}
            </button>
          </div>
        )}
        {proposals.length > 0 && (
          <div style={{ margin: '0 8px 8px', padding: '6px 10px', background: 'var(--accent-soft)', borderRadius: 8, fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🧩</span>
            <span>{t('conversation.proposalsHint', { count: proposals.length })}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ padding: '8px 8px', borderTop: '1px solid var(--line)', flexShrink: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)' }}><Paperclip size={15} /></button>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder={isLoading ? t('conversation.thinkingPlaceholder') : t('conversation.inputPlaceholder')}
          disabled={isLoading}
          className="input-pill"
          style={{ flex: 1, fontSize: 13 }} />
        <button onClick={handleSend} disabled={isLoading || !input.trim()}
          className="btn-primary" style={{ padding: '8px 14px', fontSize: 14, display: 'flex', alignItems: 'center' }}><Send size={14} /></button>
      </div>
    </div>
  )
}

export default Conversation
