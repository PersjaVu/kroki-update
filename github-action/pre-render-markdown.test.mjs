import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { transformMarkdown, preRenderRepository } from './pre-render-markdown.mjs'

const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>')

test('pre-render inserts a relative SVG image and keeps source collapsible',async()=>{
  const markdown='# Architecture\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```\n'
  const result=await transformMarkdown({markdown,relativeFile:'docs/README.md',outputRoot:'.code-to-uml/rendered',render:async()=>svg})
  assert.equal(result.images.length,1)
  assert.match(result.markdown,/!\[Architecture\]\(\.\.\/\.code-to-uml\/rendered\/docs\/README\//)
  assert.match(result.markdown,/<details>/)
  assert.match(result.markdown,/@startuml/)
})

test('pre-render is idempotent',async()=>{
  const input='## Flow\n\n```mermaid\nflowchart LR\nA --> B\n```'
  const first=await transformMarkdown({markdown:input,relativeFile:'README.md',render:async()=>svg})
  const second=await transformMarkdown({markdown:first.markdown,relativeFile:'README.md',render:async()=>svg})
  assert.equal(second.markdown,first.markdown)
  assert.equal((second.markdown.match(/code-to-uml:generated:start/g)||[]).length,1)
})

test('one invalid diagram is skipped without blocking valid diagrams',async()=>{
  const input='## Good\n```mermaid\nA --> B\n```\n\n## Bad\n```plantuml\ninvalid\n```'
  const result=await transformMarkdown({markdown:input,relativeFile:'README.md',render:async engine=>{if(engine==='plantuml')throw new Error('invalid syntax');return svg}})
  assert.equal(result.images.length,1)
  assert.equal(result.failures.length,1)
  assert.match(result.markdown,/!\[Good\]/)
  assert.match(result.markdown,/```plantuml\ninvalid\n```/)
})

test('repository pre-render writes committed-path SVGs and stays stable',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'code-to-uml-action-'))
  try{
    fs.mkdirSync(path.join(root,'docs'))
    fs.writeFileSync(path.join(root,'docs','README.md'),'# Flow\n\n```mermaid\nflowchart LR\nA --> B\n```\n')
    const options={root,files:['docs/README.md'],render:async()=>svg}
    const first=await preRenderRepository(options)
    const markdown=fs.readFileSync(path.join(root,'docs','README.md'),'utf8')
    assert.equal(first.rendered,1)
    assert.match(markdown,/!\[Flow\]\(\.\.\/\.code-to-uml\/rendered\/docs\/README\//)
    assert.equal(fs.readdirSync(path.join(root,'.code-to-uml','rendered','docs','README')).length,1)
    const second=await preRenderRepository(options)
    assert.equal(second.changedFiles,0)
  }finally{fs.rmSync(root,{recursive:true,force:true})}
})

test('Windows CRLF source is normalized before calling a renderer',async()=>{
  let received=''
  await transformMarkdown({markdown:'## Diagram\r\n```nomnoml\r\n[A] -> [B]\r\n```\r\n',relativeFile:'README.md',render:async(_engine,source)=>{received=source;return svg}})
  assert.equal(received,'[A] -> [B]')
})
