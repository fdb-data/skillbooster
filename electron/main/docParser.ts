import fs from 'fs'
import path from 'path'
import log from 'electron-log'

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx']
const MAX_FILE_SIZE = 20 * 1024 * 1024

export class DocParseError extends Error {
  code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
    this.name = 'DocParseError'
  }
}

export function validateFile(filePath: string): void {
  const ext = path.extname(filePath).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new DocParseError(`不支持的文件格式: ${ext}，仅支持 ${ALLOWED_EXTENSIONS.join(', ')}`, 'UNSUPPORTED_FORMAT')
  }
  const stats = fs.statSync(filePath)
  if (stats.size > MAX_FILE_SIZE) {
    throw new DocParseError(`文件大小超过 20MB 限制`, 'FILE_TOO_LARGE')
  }
}

export async function parseDocument(filePath: string): Promise<string> {
  validateFile(filePath)
  const ext = path.extname(filePath).toLowerCase()

  try {
    switch (ext) {
      case '.txt':
      case '.md':
        return parseText(filePath)
      case '.pdf':
        return await parsePdf(filePath)
      case '.docx':
        return await parseDocx(filePath)
      default:
        throw new DocParseError(`不支持的文件格式: ${ext}`, 'UNSUPPORTED_FORMAT')
    }
  } catch (err) {
    if (err instanceof DocParseError) throw err
    log.error('Document parse error:', err)
    throw new DocParseError(`文档解析失败，请检查文件是否损坏或加密`, 'PARSE_ERROR')
  }
}

function parseText(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8')
  return cleanText(content)
}

async function parsePdf(filePath: string): Promise<string> {
  const pdfParse = await import('pdf-parse')
  const dataBuffer = fs.readFileSync(filePath)
  const data = await (pdfParse.default || pdfParse)(dataBuffer)
  return cleanText(data.text)
}

async function parseDocx(filePath: string): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ path: filePath })
  return cleanText(result.value)
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
}