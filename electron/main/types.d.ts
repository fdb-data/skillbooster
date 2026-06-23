declare module 'pdf-parse' {
  function parse(data: Buffer | ArrayBuffer | Uint8Array): Promise<{ text: string }>
  export default parse
}
