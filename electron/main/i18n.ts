import { getPreference } from './store'

export type Lang = 'en' | 'zh'

/** 当前语言（界面 + AI 输出共用同一开关），默认英文 */
export function getLanguage(): Lang {
  return getPreference('language') === 'zh' ? 'zh' : 'en'
}

/**
 * 注入到 system prompt 末尾的输出语言指令。
 * 提示词本身统一英文书写，靠这段指令控制 AI 对用户输出的语言。
 */
export function languageDirective(lang: Lang = getLanguage()): string {
  if (lang === 'zh') {
    return '\n\n## 输出语言\n无论本提示词用何种语言书写，你都必须始终用【简体中文】与用户交流：回复正文、向用户提的问题与候选选项、画布条目的标题与内容、提议、验证总评等所有面向用户的文本，一律使用简体中文。工具参数里的枚举值（如 type、evidenceLevel）保持英文原样不变。'
  }
  return '\n\n## Output language\nAlways communicate with the user in English: your reply text, the questions and option chips you present, canvas entry titles and content, proposals, and the validation summary — every user-facing piece of text must be in English. Keep enum values in tool arguments (e.g. type, evidenceLevel) unchanged.'
}

type MsgKey =
  | 'sceneNotFound'
  | 'configureLLMFirst'
  | 'uploadDocsFirst'
  | 'emptyDocs'
  | 'exportDialogTitle'
  | 'exportCanceled'
  | 'diffAnalysisFailed'
  | 'noCasesToReplay'
  | 'attachmentNotFound'
  | 'attachmentFileMissing'
  | 'skillMdNotFound'
  | 'invalidSkillSource'
  | 'importDialogTitle'
  | 'updateReadyTitle'
  | 'updateReadyBody'
  | 'updateRestartNow'
  | 'updateLater'

const MESSAGES: Record<MsgKey, Record<Lang, string>> = {
  sceneNotFound: { en: 'Scene not found', zh: '场景不存在' },
  configureLLMFirst: { en: 'Please configure the LLM first', zh: '请先配置 LLM' },
  uploadDocsFirst: { en: 'Please upload reference documents first', zh: '请先上传参考文档' },
  emptyDocs: { en: 'Document content is empty, cannot draft', zh: '文档内容为空，无法起草' },
  exportDialogTitle: { en: 'Export Skill package', zh: '导出 Skills 包' },
  exportCanceled: { en: 'Export canceled by user', zh: '用户取消导出' },
  diffAnalysisFailed: { en: 'Diff analysis failed', zh: '差异分析失败' },
  noCasesToReplay: { en: 'No cases available for replay in this scene', zh: '当前场景没有可用于验证回放的案例' },
  attachmentNotFound: { en: 'Attachment not found', zh: '附件不存在' },
  attachmentFileMissing: { en: 'Attachment file no longer exists on disk', zh: '附件文件已不在磁盘上' },
  skillMdNotFound: { en: 'SKILL.md not found in the selected skill', zh: '所选技能里找不到 SKILL.md' },
  invalidSkillSource: { en: 'Unsupported import source: please pick a SKILL.md file, a skill folder or a .zip package', zh: '不支持的导入来源：请选择 SKILL.md 文件、技能文件夹或 .zip 包' },
  importDialogTitle: { en: 'Import an existing Skill', zh: '导入已有 Skill' },
  updateReadyTitle: { en: 'Update ready', zh: '更新已就绪' },
  updateReadyBody: { en: 'Version {version} has been downloaded. Restart now to install?', zh: '新版本 {version} 已下载完成，是否立即重启安装？' },
  updateRestartNow: { en: 'Restart now', zh: '立即重启' },
  updateLater: { en: 'Later', zh: '稍后' }
}

/** 主进程面向用户的固定文案（错误、对话框标题等），跟随语言开关 */
export function mt(key: MsgKey, lang: Lang = getLanguage()): string {
  return MESSAGES[key][lang]
}
