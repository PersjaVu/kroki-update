import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const fenceEngines = {
  uml:'plantuml', puml:'plantuml', plantuml:'plantuml', c4plantuml:'c4plantuml',
  mermaid:'mermaid', mmd:'mermaid', dot:'graphviz', graphviz:'graphviz', gv:'graphviz', d2:'d2',
  dbml:'dbml', ditaa:'ditaa', blockdiag:'blockdiag', seqdiag:'seqdiag', actdiag:'actdiag',
  nwdiag:'nwdiag', packetdiag:'packetdiag', rackdiag:'rackdiag', umlet:'umlet', erd:'erd',
  svgbob:'svgbob', symbolator:'symbolator', nomnoml:'nomnoml', vega:'vega', vegalite:'vegalite',
  wavedrom:'wavedrom', bpmn:'bpmn', bytefield:'bytefield', excalidraw:'excalidraw', pikchr:'pikchr',
  structurizr:'structurizr', diagramsnet:'diagramsnet', tikz:'tikz', wireviz:'wireviz', goat:'goat'
}

const START='<!-- code-to-uml:generated:start -->'
const END='<!-- code-to-uml:generated:end -->'
const managedPattern=/<!-- code-to-uml:generated:start -->\r?\n[\s\S]*?<!-- code-to-uml:source:start -->\r?\n([\s\S]*?)\r?\n<!-- code-to-uml:source:end -->[\s\S]*?<!-- code-to-uml:generated:end -->/g
const fencePattern=/^([ \t]{0,3})(`{3,}|~{3,})[ \t]*([^\s\r\n]+)([^\r\n]*)\r?\n([\s\S]*?)^\1\2[ \t]*$/gm

const normalize=value=>String(value).replace(/\\/g,'/')
const cleanLanguage=value=>String(value).toLowerCase().replace(/^\{\.?/,'').replace(/\}$/,'')
const escapeAlt=value=>String(value).replace(/[\[\]\\]/g,'\\$&')
const markdownUrl=value=>normalize(value).split('/').map(encodeURIComponent).join('/')
const slug=value=>String(value||'diagram').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'diagram'

function unwrapManaged(markdown){return markdown.replace(managedPattern,(_whole,source)=>source)}

function precedingHeading(markdown,index){
  let heading=''
  for(const match of markdown.slice(0,index).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm))heading=match[1].trim()
  return heading
}

function blockTitle(markdown,index,metadata,engine,ordinal){
  const explicit=metadata.match(/\btitle\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i)
  return (explicit&&(explicit[1]||explicit[2]||explicit[3]))||precedingHeading(markdown,index)||`${engine} diagram ${ordinal}`
}

function outputPath(outputRoot,relativeFile,engine,title,ordinal){
  const key=createHash('sha256').update(`${relativeFile}\0${engine}\0${title}\0${ordinal}`).digest('hex').slice(0,10)
  const document=relativeFile.replace(/\.(?:md|markdown)$/i,'')
  return normalize(path.join(outputRoot,document,`${String(ordinal).padStart(2,'0')}-${slug(title)}-${key}.svg`))
}

function managedBlock({rawFence,title,engine,imagePath}){
  return `${START}\n![${escapeAlt(title)}](${markdownUrl(imagePath)})\n\n<details>\n<summary>View ${engine} source</summary>\n\n${START.replace('generated','source')}\n${rawFence}\n${END.replace('generated','source')}\n\n</details>\n${END}`
}

export async function transformMarkdown({markdown,relativeFile,outputRoot='.code-to-uml/rendered',render}){
  const sourceMarkdown=unwrapManaged(markdown)
  const replacements=[],images=[],failures=[]
  let ordinal=0
  for(const match of sourceMarkdown.matchAll(fencePattern)){
    const language=cleanLanguage(match[3]),engine=fenceEngines[language]
    if(!engine)continue
    ordinal+=1
    const title=blockTitle(sourceMarkdown,match.index,match[4],engine,ordinal)
    const generatedPath=outputPath(outputRoot,relativeFile,engine,title,ordinal)
    try{
      const content=await render(engine,match[5].replace(/\r\n/g,'\n').replace(/\s+$/,''))
      const imagePath=normalize(path.relative(path.dirname(relativeFile),generatedPath))||path.basename(generatedPath)
      replacements.push({start:match.index,end:match.index+match[0].length,value:managedBlock({rawFence:match[0],title,engine,imagePath})})
      images.push({path:generatedPath,content,title,engine,sourceFile:relativeFile})
    }catch(error){failures.push({sourceFile:relativeFile,title,engine,error:error.message})}
  }
  let output=sourceMarkdown
  for(const replacement of replacements.reverse())output=output.slice(0,replacement.start)+replacement.value+output.slice(replacement.end)
  return {markdown:output,images,failures,detected:ordinal}
}

async function renderSvg(server,apiKey,engine,source){
  const headers={'Content-Type':'text/plain',Accept:'image/svg+xml'}
  if(apiKey)headers.Authorization=`Bearer ${apiKey}`
  let response
  for(let attempt=0;attempt<3;attempt++){
    response=await fetch(`${server.replace(/\/$/,'')}/${engine}/svg?background=white`,{method:'POST',headers,body:source})
    if(response.status!==429)break
    if(attempt===2)break
    const waitMs=60_500-(Date.now()%60_000)
    console.warn(`Rate limit reached while rendering ${engine}; retrying in ${Math.ceil(waitMs/1000)}s.`)
    await new Promise(resolve=>setTimeout(resolve,waitMs))
  }
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,240)}`)
  const content=Buffer.from(await response.arrayBuffer())
  if(!content.toString('utf8',0,300).includes('<svg'))throw new Error('renderer did not return SVG')
  return content
}

function trackedMarkdown(root){
  return execFileSync('git',['ls-files','-z','*.md','*.markdown','**/*.md','**/*.markdown'],{cwd:root,encoding:'buffer',maxBuffer:30*1024*1024}).toString('utf8').split('\0').filter(Boolean).map(normalize)
}

function safeGeneratedRoot(root,outputRoot){
  const absolute=path.resolve(root,outputRoot),relative=path.relative(root,absolute)
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`Generated output must stay inside repository: ${absolute}`)
  return absolute
}

export async function preRenderRepository(options={}){
  const root=path.resolve(options.root||process.cwd())
  const outputRoot=normalize(options.outputRoot||process.env.CTU_MARKDOWN_OUTPUT||'.code-to-uml/rendered')
  const generatedRoot=safeGeneratedRoot(root,outputRoot)
  const files=(options.files||trackedMarkdown(root)).filter(file=>!file.startsWith(`${outputRoot}/`))
  const render=options.render||((engine,source)=>renderSvg(options.server||process.env.CTU_SERVER||'http://localhost:8000',options.apiKey??process.env.CTU_API_KEY,engine,source))
  const expected=new Set(),failures=[]
  let rendered=0,changedFiles=0
  for(const relativeFile of files){
    const absolute=path.join(root,relativeFile),original=fs.readFileSync(absolute,'utf8')
    const result=await transformMarkdown({markdown:original,relativeFile,outputRoot,render})
    if(result.markdown!==original){fs.writeFileSync(absolute,result.markdown);changedFiles+=1}
    for(const image of result.images){const target=path.join(root,image.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,image.content);expected.add(normalize(image.path));rendered+=1}
    failures.push(...result.failures)
  }
  if(fs.existsSync(generatedRoot))for(const entry of fs.readdirSync(generatedRoot,{recursive:true,withFileTypes:true})){
    if(!entry.isFile())continue
    const absolute=path.join(entry.parentPath,entry.name),relative=normalize(path.relative(root,absolute))
    if(!expected.has(relative))fs.rmSync(absolute)
  }
  return {rendered,failed:failures.length,failures,changedFiles,outputRoot}
}

function setOutput(name,value){if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`${name}=${value}\n`)}

async function main(){
  const result=await preRenderRepository()
  setOutput('rendered',result.rendered);setOutput('failed',result.failed);setOutput('changed-files',result.changedFiles);setOutput('output-directory',result.outputRoot)
  console.log(`Pre-rendered ${result.rendered} Markdown diagram(s) in ${result.changedFiles} file(s); skipped ${result.failed}.`)
  for(const item of result.failures)console.warn(`Skipped ${item.sourceFile} · ${item.title} (${item.engine}): ${item.error}`)
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## Code To UML · Markdown pre-render\n\n- Rendered: **${result.rendered}**\n- Invalid/skipped: **${result.failed}**\n- Updated Markdown files: **${result.changedFiles}**\n- Image directory: \`${result.outputRoot}\`\n`)
}

if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error);process.exit(1)})
