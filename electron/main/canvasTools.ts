import type { ExperienceCard, KnowledgeEntry, KnowledgeType, KnowledgeKey, CanvasUpdate, Proposal } from '../../src/contracts/ipc-types'
import { EventType } from '../../src/contracts/agent-events'
import type { AgentTool } from './agentLoop'
import { emitAgentEvent } from './agentEvents'
import { saveCanvas } from './store'
import { generateId } from '../../src/utils/uuid'

// 当前版本启用的知识类型（concept/relation 为企业级特性，个人萃取暂不开放）
const ACTIVE_TYPES: KnowledgeType[] = ['flow', 'rule', 'insight']
// 全部类型：findEntry 仍需检索旧数据中的 concept/relation 条目
const ALL_TYPES: KnowledgeType[] = ['flow', 'rule', 'insight', 'concept', 'relation']
const EVIDENCE_LEVELS = ['institutional', 'validated', 'sample', 'exploratory']

export interface CanvasToolCollector {
  updates: CanvasUpdate[]
  proposals: Proposal[]
}

function typeKey(type: KnowledgeType): KnowledgeKey {
  return `${type}s` as KnowledgeKey
}

function findEntry(canvas: ExperienceCard, id: string): { type: KnowledgeType; entry: KnowledgeEntry } | null {
  for (const type of ALL_TYPES) {
    const entry = canvas[typeKey(type)].find(e => e.id === id)
    if (entry) return { type, entry }
  }
  return null
}

function normalizeEvidence(level: unknown): KnowledgeEntry['evidenceLevel'] {
  return EVIDENCE_LEVELS.includes(level as string) ? (level as KnowledgeEntry['evidenceLevel']) : 'exploratory'
}

const TYPE_PARAM = {
  type: 'string',
  enum: ACTIVE_TYPES,
  description: 'Knowledge type: flow=process steps, rule=rules/constraints, insight=insight/signal'
}

const EVIDENCE_PARAM = {
  type: 'string',
  enum: EVIDENCE_LEVELS,
  description: 'Evidence level: institutional=regulatory/standard level, validated=proven practice, sample=sample-based experience, exploratory=exploratory hypothesis (default)'
}

/**
 * 创建画布操作工具集，绑定到一次 agent run。
 * 每次操作：改内存画布 → 落盘 → 推 CUSTOM canvas_update 事件 → 记入 collector（随 IPC 结果返回）。
 */
export function createCanvasTools(
  sceneId: string,
  runId: string,
  canvas: ExperienceCard,
  collector: CanvasToolCollector
): AgentTool[] {
  function applyUpdate(update: CanvasUpdate): void {
    saveCanvas(sceneId, canvas)
    collector.updates.push(update)
    emitAgentEvent({ type: EventType.CUSTOM, runId, name: 'canvas_update', value: update })
  }

  return [
    {
      def: {
        name: 'canvas_add',
        description: 'Add a knowledge entry the user has explicitly confirmed to the experience canvas. Only for content the user stated in their own words; for content you infer or generalize, use propose.',
        parameters: {
          type: 'object',
          properties: {
            type: TYPE_PARAM,
            title: { type: 'string', description: 'Entry title (keep it short)' },
            content: { type: 'string', description: 'Entry content, complete and self-contained' },
            evidenceLevel: EVIDENCE_PARAM,
            provenance: { type: 'string', description: 'Source note, e.g. "user said", "document section 2"' }
          },
          required: ['type', 'title', 'content']
        }
      },
      execute: (args) => {
        const type = args.type as KnowledgeType
        if (!ACTIVE_TYPES.includes(type)) return `Error: invalid knowledge type ${String(args.type)}`
        const now = new Date().toISOString()
        const entry: KnowledgeEntry = {
          id: generateId(),
          title: String(args.title || ''),
          content: String(args.content || ''),
          verified: false,
          source: 'ai',
          evidenceLevel: normalizeEvidence(args.evidenceLevel),
          provenance: args.provenance ? String(args.provenance) : undefined,
          createdAt: now,
          updatedAt: now
        }
        if (!entry.title || !entry.content) return 'Error: title and content must not be empty'
        canvas[typeKey(type)].push(entry)
        applyUpdate({ type, action: 'add', entry })
        return `Added ${type} "${entry.title}" (id: ${entry.id})`
      }
    },
    {
      def: {
        name: 'canvas_update',
        description: 'Modify an existing knowledge entry on the canvas (located by id; only pass the fields you want to change).',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'id of the entry to modify' },
            title: { type: 'string' },
            content: { type: 'string' },
            evidenceLevel: EVIDENCE_PARAM,
            provenance: { type: 'string' }
          },
          required: ['id']
        }
      },
      execute: (args) => {
        const found = findEntry(canvas, String(args.id || ''))
        if (!found) return `Error: entry not found id=${String(args.id)}`
        const { type, entry } = found
        if (args.title !== undefined) entry.title = String(args.title)
        if (args.content !== undefined) entry.content = String(args.content)
        if (args.evidenceLevel !== undefined) entry.evidenceLevel = normalizeEvidence(args.evidenceLevel)
        if (args.provenance !== undefined) entry.provenance = String(args.provenance)
        entry.updatedAt = new Date().toISOString()
        applyUpdate({ type, action: 'update', entry })
        return `Updated "${entry.title}" (id: ${entry.id})`
      }
    },
    {
      def: {
        name: 'canvas_delete',
        description: 'Delete a knowledge entry from the canvas (by id). Use only when the user explicitly rejects that content.',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'id of the entry to delete' }
          },
          required: ['id']
        }
      },
      execute: (args) => {
        const found = findEntry(canvas, String(args.id || ''))
        if (!found) return `Error: entry not found id=${String(args.id)}`
        const { type, entry } = found
        const key = typeKey(type)
        const idx = canvas[key].findIndex(e => e.id === entry.id)
        canvas[key].splice(idx, 1)
        applyUpdate({ type, action: 'delete', entry })
        return `Deleted "${entry.title}"`
      }
    },
    {
      def: {
        name: 'propose',
        description: 'Propose a knowledge entry awaiting user confirmation (not added directly to the canvas). Use for content you inferred or generalized from the conversation but the user did not confirm verbatim.',
        parameters: {
          type: 'object',
          properties: {
            type: TYPE_PARAM,
            title: { type: 'string', description: 'Proposal title (keep it short)' },
            content: { type: 'string', description: 'Proposal content' }
          },
          required: ['type', 'title', 'content']
        }
      },
      execute: (args) => {
        const type = args.type as KnowledgeType
        if (!ACTIVE_TYPES.includes(type)) return `Error: invalid knowledge type ${String(args.type)}`
        const proposal: Proposal = {
          id: generateId(),
          type,
          title: String(args.title || ''),
          content: String(args.content || '')
        }
        if (!proposal.title || !proposal.content) return 'Error: title and content must not be empty'
        collector.proposals.push(proposal)
        emitAgentEvent({ type: EventType.CUSTOM, runId, name: 'proposal', value: proposal })
        return `Proposed "${proposal.title}", awaiting user accept/reject`
      }
    }
  ]
}
